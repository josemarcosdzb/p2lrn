package main

import (
	"archive/zip"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"time"
)

// Appended P2LRN envelope: executable | ZIP | 16-byte magic | uint64 ZIP size | SHA256(ZIP).
// This SHA256 checks corruption, NOT publisher authentication. For external
// distribution the complete per-course executable requires Authenticode.
const envelopeMagic = "P2LRN-EXE-V1\x00\x00\x00\x00"
const envelopeBytes = 16 + 8 + sha256.Size
const maxZipBytes = 512 << 20
const maxExpandedBytes = 768 << 20
const maxMemberBytes = 256 << 20
const maxZipMembers = 12000
const idleTimeout = 25 * time.Minute
const maxSession = 12 * time.Hour

var errBundle = errors.New("no se ha encontrado una entrega P2LRN valida en el ejecutable")

type payload struct {
	reader *os.File
	offset int64
	length int64
	hash   [sha256.Size]byte
}

type assignmentPolicy struct {
	ExpiresAfterFirstOpenDays int `json:"expiresAfterFirstOpenDays"`
}
type assignmentDocument struct {
	AssignmentID string           `json:"assignmentId"`
	Policy       assignmentPolicy `json:"policy"`
}
type launchRecord struct {
	ID       string `json:"id"`
	OpenedAt string `json:"openedAt"`
	Source   string `json:"source"`
}
type launchState struct {
	Schema          string         `json:"schema"`
	AssignmentID    string         `json:"assignmentId"`
	PayloadDigest   string         `json:"payloadDigest"`
	DeviceBindingID string         `json:"deviceBindingId"`
	FirstOpenedAt   string         `json:"firstOpenedAt"`
	LastOpenedAt    string         `json:"lastOpenedAt"`
	OpenCount       int            `json:"openCount"`
	ExpiresAt       string         `json:"expiresAt,omitempty"`
	Launches        []launchRecord `json:"launches"`
}

func randomBindingID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil { return "", err }
	return hex.EncodeToString(b), nil
}
func readAssignment(root string) (assignmentDocument, error) {
	var out assignmentDocument
	data, err := os.ReadFile(filepath.Join(root, "www", "assignment.json"))
	if err != nil { return out, err }
	if len(data) == 0 || len(data) > 1<<20 { return out, errors.New("assignment.json no tiene un tamaño válido") }
	if err := json.Unmarshal(data, &out); err != nil { return out, errors.New("assignment.json no contiene JSON válido") }
	if strings.TrimSpace(out.AssignmentID) == "" { return out, errors.New("assignment.json no contiene assignmentId") }
	if out.Policy.ExpiresAfterFirstOpenDays < 0 || out.Policy.ExpiresAfterFirstOpenDays > 3650 {
		return out, errors.New("la caducidad de la entrega no es válida")
	}
	return out, nil
}
func launchStateFile(hash [sha256.Size]byte) (string, error) {
	base, err := os.UserConfigDir()
	if err != nil { return "", err }
	dir := filepath.Join(base, "P2LRN", "OfflineState")
	if err := os.MkdirAll(dir, 0700); err != nil { return "", err }
	return filepath.Join(dir, hex.EncodeToString(hash[:])+".json"), nil
}
func registerLaunch(root string, p payload) (launchState, error) {
	assignment, err := readAssignment(root)
	if err != nil { return launchState{}, err }
	statePath, err := launchStateFile(p.hash)
	if err != nil { return launchState{}, err }
	now := time.Now().UTC()
	state := launchState{
		Schema:"https://p2lrn.org/schema/offline-launch-state/1",
		AssignmentID:assignment.AssignmentID,
		PayloadDigest:"sha256:"+hex.EncodeToString(p.hash[:]),
		Launches:[]launchRecord{},
	}
	if data, readErr := os.ReadFile(statePath); readErr == nil {
		if len(data) > 1<<20 || json.Unmarshal(data, &state) != nil {
			return launchState{}, errors.New("el historial local de aperturas está dañado")
		}
	} else if !errors.Is(readErr, os.ErrNotExist) {
		return launchState{}, readErr
	}
	if state.AssignmentID != assignment.AssignmentID || state.PayloadDigest != "sha256:"+hex.EncodeToString(p.hash[:]) {
		return launchState{}, errors.New("el historial local no corresponde a esta entrega")
	}
	if state.DeviceBindingID == "" {
		state.DeviceBindingID, err = randomBindingID()
		if err != nil { return launchState{}, err }
	}
	if state.FirstOpenedAt == "" {
		state.FirstOpenedAt = now.Format(time.RFC3339Nano)
	}
	if assignment.Policy.ExpiresAfterFirstOpenDays > 0 && state.ExpiresAt == "" {
		first, parseErr := time.Parse(time.RFC3339Nano, state.FirstOpenedAt)
		if parseErr != nil { return launchState{}, errors.New("la primera apertura registrada no es válida") }
		state.ExpiresAt = first.Add(time.Duration(assignment.Policy.ExpiresAfterFirstOpenDays)*24*time.Hour).Format(time.RFC3339Nano)
	}
	if state.ExpiresAt != "" {
		expires, parseErr := time.Parse(time.RFC3339Nano, state.ExpiresAt)
		if parseErr != nil { return launchState{}, errors.New("la fecha de caducidad local no es válida") }
		if !now.Before(expires) {
			return launchState{}, fmt.Errorf("esta entrega caducó el %s y ya no puede abrirse en este equipo", expires.Local().Format("02/01/2006 15:04"))
		}
	}
	sessionID, err := randomBindingID()
	if err != nil { return launchState{}, err }
	state.OpenCount++
	state.LastOpenedAt = now.Format(time.RFC3339Nano)
	state.Launches = append(state.Launches, launchRecord{ID:sessionID, OpenedAt:state.LastOpenedAt, Source:"windows-native"})
	if len(state.Launches) > 256 { state.Launches = state.Launches[len(state.Launches)-256:] }
	encoded, err := json.MarshalIndent(state, "", "  ")
	if err != nil { return launchState{}, err }
	if err := os.WriteFile(statePath, append(encoded, '\n'), 0600); err != nil { return launchState{}, err }
	return state, nil
}

// Authenticode appends WIN_CERTIFICATE after the regular executable contents.
// IMAGE_DIRECTORY_ENTRY_SECURITY stores its file offset (not an RVA). A
// signer may insert 0-7 alignment bytes before the certificate table.
// Reading the P2LRN trailer before this table lets us sign the FINAL EXE
// without breaking embedded ZIP verification.
func envelopeOffsets(file *os.File, size int64) []int64 {
	fallback := []int64{size - envelopeBytes}
	if size < 256 { return fallback }
	header := make([]byte, 64)
	if _, err := file.ReadAt(header, 0); err != nil || string(header[:2]) != "MZ" { return fallback }
	pe := int64(binary.LittleEndian.Uint32(header[60:64]))
	if pe < 64 || pe+24+152 > size { return fallback }
	coff := make([]byte, 24)
	if _, err := file.ReadAt(coff, pe); err != nil || string(coff[:4]) != "PE\x00\x00" { return fallback }
	optionSize := int64(binary.LittleEndian.Uint16(coff[20:22]))
	opt := pe + 24
	if optionSize < 152 || opt+optionSize > size { return fallback }
	magic := make([]byte, 2)
	if _, err := file.ReadAt(magic, opt); err != nil || binary.LittleEndian.Uint16(magic) != 0x20b { return fallback }
	sec := make([]byte, 8)
	if _, err := file.ReadAt(sec, opt+144); err != nil { return fallback }
	offset := int64(binary.LittleEndian.Uint32(sec[:4]))
	length := int64(binary.LittleEndian.Uint32(sec[4:]))
	if offset == 0 || length == 0 { return fallback }
	if offset < envelopeBytes+22 || offset+length > size { return fallback }
	positions := make([]int64, 0, 8)
	for pad := int64(0); pad < 8; pad++ { positions = append(positions, offset-envelopeBytes-pad) }
	return positions
}

func readPayload(exePath string) (_ payload, err error) {
	file, err := os.Open(exePath)
	if err != nil {
		return payload{}, err
	}
	defer func() {
		if err != nil {
			file.Close()
		}
	}()
	st, err := file.Stat()
	if err != nil {
		return payload{}, err
	}
	if st.Size() < envelopeBytes+22 {
		return payload{}, errBundle
	}
	footer := make([]byte, envelopeBytes)
	footerOffset := int64(-1)
	for _, candidate := range envelopeOffsets(file, st.Size()) {
		if candidate < 0 { continue }
		if _, err = file.ReadAt(footer, candidate); err != nil { continue }
		if string(footer[:16]) == envelopeMagic {
			footerOffset = candidate
			break
		}
	}
	if footerOffset < 0 { return payload{}, errBundle }
	size := binary.LittleEndian.Uint64(footer[16:24])
	if size < 22 || size > maxZipBytes || size > uint64(footerOffset) {
		return payload{}, errBundle
	}
	off := footerOffset - int64(size)
	hash := sha256.Sum256(nil)
	copy(hash[:], footer[24:])
	read := io.NewSectionReader(file, off, int64(size))
	h := sha256.New()
	if _, err = io.Copy(h, read); err != nil {
		return payload{}, err
	}
	if !equalHash(h.Sum(nil), hash[:]) {
		return payload{}, errors.New("los datos de la entrega no coinciden con su SHA-256")
	}
	return payload{reader: file, offset: off, length: int64(size), hash: hash}, nil
}
func equalHash(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	var mismatch byte
	for i := range a {
		mismatch |= a[i] ^ b[i]
	}
	return mismatch == 0
}

func safeName(raw string) (string, error) {
	if raw == "" || strings.ContainsAny(raw, "\\\x00:") || strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "//") {
		return "", errBundle
	}
	// ZIP paths are always slash-delimited. No directory jumps, dot segments or aliases.
	trimmed := strings.TrimSuffix(raw, "/")
	if trimmed == "" || trimmed == "." || path.Clean(trimmed) != trimmed {
		return "", errBundle
	}
	for _, p := range strings.Split(trimmed, "/") {
		if p == "" || p == "." || p == ".." {
			return "", errBundle
		}
	}
	return trimmed, nil
}

func extract(p payload, base string) (string, error) {
	zr, err := zip.NewReader(io.NewSectionReader(p.reader, p.offset, p.length), p.length)
	if err != nil {
		return "", fmt.Errorf("ZIP de entrega no valido: %w", err)
	}
	if len(zr.File) == 0 || len(zr.File) > maxZipMembers {
		return "", errBundle
	}
	root, err := os.MkdirTemp(base, "p2lrn-offline-")
	if err != nil {
		return "", err
	}
	fail := func(e error) (string, error) { os.RemoveAll(root); return "", e }
	seen := make(map[string]bool, len(zr.File))
	var total uint64
	for _, entry := range zr.File {
		name, e := safeName(entry.Name)
		if e != nil {
			return fail(fmt.Errorf("ruta insegura en la entrega: %q", entry.Name))
		}
		key := strings.ToLower(name)
		if seen[key] {
			return fail(fmt.Errorf("nombre duplicado: %q", entry.Name))
		}
		seen[key] = true
		mode := entry.Mode()
		if mode&os.ModeSymlink != 0 || mode&os.ModeDevice != 0 || mode&os.ModeNamedPipe != 0 {
			return fail(fmt.Errorf("entrada no permitida: %q", name))
		}
		if !entry.FileInfo().IsDir() && !mode.IsRegular() {
			return fail(fmt.Errorf("entrada no regular: %q", name))
		}
		if !entry.FileInfo().IsDir() {
			if entry.UncompressedSize64 > maxMemberBytes {
				return fail(errors.New("archivo demasiado grande"))
			}
			total += entry.UncompressedSize64
			if total > maxExpandedBytes {
				return fail(errors.New("contenido descomprimido excede el limite"))
			}
		}
		dest := filepath.Join(root, filepath.FromSlash(name))
		if entry.FileInfo().IsDir() {
			if e = os.MkdirAll(dest, 0700); e != nil {
				return fail(e)
			}
			continue
		}
		if e = os.MkdirAll(filepath.Dir(dest), 0700); e != nil {
			return fail(e)
		}
		rf, e := entry.Open()
		if e != nil {
			return fail(e)
		}
		wf, e := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if e != nil {
			rf.Close()
			return fail(e)
		}
		n, copyErr := io.Copy(wf, io.LimitReader(rf, int64(entry.UncompressedSize64)+1))
		closeErr := wf.Close()
		rf.Close()
		if copyErr != nil {
			return fail(copyErr)
		}
		if closeErr != nil {
			return fail(closeErr)
		}
		if n != int64(entry.UncompressedSize64) {
			return fail(errors.New("tamano ZIP incoherente"))
		}
	}
	for _, name := range []string{"www/index.html", "www/app.js", "www/assignment.json", "www/course.p2lrn", "www/player/release.json"} {
		if info, e := os.Stat(filepath.Join(root, filepath.FromSlash(name))); e != nil || !info.Mode().IsRegular() {
			return fail(fmt.Errorf("falta un archivo imprescindible: %s", name))
		}
	}
	return root, nil
}

type localHandler struct {
	webRoot     string
	host        string
	launchState launchState
	lastActive  atomic.Int64
}

func (h *localHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	if r.Host != h.host {
		http.Error(w, "Forbidden Host", http.StatusForbidden)
		return
	}
	if r.Method != "GET" && r.Method != "HEAD" {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	if r.URL.Path == "/__p2lrn/launch-state" {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if r.Method == "HEAD" { w.WriteHeader(http.StatusOK); return }
		_ = json.NewEncoder(w).Encode(h.launchState)
		return
	}
	raw := r.URL.EscapedPath()
	decoded, e := url.PathUnescape(raw)
	if e != nil || !strings.HasPrefix(decoded, "/") || strings.ContainsAny(decoded, "\\\x00:") {
		http.NotFound(w, r)
		return
	}
	if decoded == "/" {
		decoded = "/index.html"
	}
	rel, e := safeName(strings.TrimPrefix(decoded, "/"))
	if e != nil {
		http.NotFound(w, r)
		return
	}
	target := filepath.Join(h.webRoot, filepath.FromSlash(rel))
	stat, e := os.Stat(target)
	if e != nil || !stat.Mode().IsRegular() {
		http.NotFound(w, r)
		return
	}
	// Extracted package has no links and paths are resolved from a unique, private temp directory.
	h.lastActive.Store(time.Now().Unix())
	ext := strings.ToLower(filepath.Ext(target))
	switch ext {
	case ".p2lrn":
		w.Header().Set("Content-Type", "application/vnd.p2lrn+zip")
	case ".wasm":
		w.Header().Set("Content-Type", "application/wasm")
	case ".js", ".mjs":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	case ".json":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
	case ".html":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case ".css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
	default:
		if typ := mime.TypeByExtension(ext); typ != "" {
			w.Header().Set("Content-Type", typ)
		} else {
			w.Header().Set("Content-Type", "application/octet-stream")
		}
	}
	fh, err := os.Open(target)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer fh.Close()
	http.ServeContent(w, r, rel, stat.ModTime(), fh)
}

func openBrowser(link string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", link)
	case "darwin":
		cmd = exec.Command("open", link)
	default:
		cmd = exec.Command("xdg-open", link)
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

func run() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	p, err := readPayload(exe)
	if err != nil {
		return err
	}
	defer p.reader.Close()
	root, err := extract(p, os.TempDir())
	if err != nil {
		return err
	}
	defer os.RemoveAll(root)
	launch, err := registerLaunch(root, p)
	if err != nil {
		return err
	}
	// Stable loopback origin is required for browser localStorage-based resume.
	// The same offline assignment always reuses the same local port.
	port := 20000 + int(binary.BigEndian.Uint16(p.hash[:2]))%30000
	listener, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return fmt.Errorf("no se puede abrir el servidor local: %w", err)
	}
	defer listener.Close()
	h := &localHandler{webRoot: filepath.Join(root, "www"), host: listener.Addr().String(), launchState: launch}
	h.lastActive.Store(time.Now().Unix())
	srv := &http.Server{Handler: h, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 2 * time.Minute, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 8192}
	errCh := make(chan error, 1)
	go func() { errCh <- srv.Serve(listener) }()
	link := "http://" + listener.Addr().String() + "/index.html"
	if os.Getenv("P2LRN_OFFLINE_LAUNCH_TEST") == "1" {
		fmt.Println("P2LRN_TEST_URL=" + link)
	} else if err := openBrowser(link); err != nil {
		return fmt.Errorf("no se pudo abrir el navegador: %w", err)
	}
	start := time.Now()
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for {
		select {
		case err := <-errCh:
			if errors.Is(err, http.ErrServerClosed) {
				return nil
			}
			return err
		case <-tick.C:
			if time.Since(start) > maxSession || time.Since(time.Unix(h.lastActive.Load(), 0)) > idleTimeout {
				return nil
			}
		}
	}
}
func main() {
	if err := run(); err != nil {
		log.Print(err)
		if os.Getenv("P2LRN_OFFLINE_LAUNCH_TEST") != "1" {
			showError("P2LRN · Entrega offline", err.Error())
		}
		os.Exit(1)
	}
}

// Exposed for test fixture generation and integrity checks in go test only.
func zipDigest(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }
