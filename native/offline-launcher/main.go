package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
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
	if _, err = file.ReadAt(footer, st.Size()-envelopeBytes); err != nil {
		return payload{}, err
	}
	if string(footer[:16]) != envelopeMagic {
		return payload{}, errBundle
	}
	size := binary.LittleEndian.Uint64(footer[16:24])
	if size < 22 || size > maxZipBytes || size > uint64(st.Size()-envelopeBytes) {
		return payload{}, errBundle
	}
	off := st.Size() - envelopeBytes - int64(size)
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
	webRoot    string
	host       string
	lastActive atomic.Int64
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
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("no se puede abrir el servidor local: %w", err)
	}
	defer listener.Close()
	h := &localHandler{webRoot: filepath.Join(root, "www"), host: listener.Addr().String()}
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
		showError("P2LRN · Entrega offline", err.Error())
		os.Exit(1)
	}
}

// Exposed for test fixture generation and integrity checks in go test only.
func zipDigest(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }
