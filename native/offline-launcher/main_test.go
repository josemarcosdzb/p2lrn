package main

import (
  "archive/zip"
  "bytes"
  "crypto/sha256"
  "encoding/binary"
  "encoding/json"
  "io"
  "net/http/httptest"
  "os"
  "path/filepath"
  "strings"
  "testing"
  "time"
)
func testZip(t *testing.T, extra map[string][]byte) []byte {
  t.Helper()
  members:=map[string][]byte{
    "www/index.html":[]byte("<!doctype html><title>P2LRN</title>"),
    "www/app.js":[]byte("console.log('offline')"),
    "www/assignment.json":[]byte("{}"),
    "www/course.p2lrn":[]byte("course"),
    "www/player/release.json":[]byte("{}"),
  }
  for n,b:=range extra{members[n]=b}
  var buf bytes.Buffer
  zw:=zip.NewWriter(&buf)
  for n,b:=range members{w,err:=zw.Create(n);if err!=nil{t.Fatal(err)};if _,err=w.Write(b);err!=nil{t.Fatal(err)}}
  if err:=zw.Close();err!=nil{t.Fatal(err)};return buf.Bytes()
}
func testExe(t *testing.T, b []byte)string{
  t.Helper()
  f,err:=os.CreateTemp(t.TempDir(),"p2lrn-*.bin");if err!=nil{t.Fatal(err)}
  f.Write([]byte("MZFAKEWINEXE"));f.Write(b)
  footer:=make([]byte,envelopeBytes);copy(footer,envelopeMagic)
  binary.LittleEndian.PutUint64(footer[16:24],uint64(len(b)))
  sum:=sha256.Sum256(b);copy(footer[24:],sum[:]);f.Write(footer);f.Close();return f.Name()
}
func TestValidBundle(t *testing.T){
  f:=testExe(t,testZip(t,nil));p,err:=readPayload(f);if err!=nil{t.Fatal(err)};defer p.reader.Close()
  root,err:=extract(p,t.TempDir());if err!=nil{t.Fatal(err)};defer os.RemoveAll(root)
  if _,err=os.Stat(filepath.Join(root,"www","index.html"));err!=nil{t.Fatal(err)}
}
func TestTamperedOrMissingEnvelope(t *testing.T){
  f:=testExe(t,testZip(t,nil));data,_:=os.ReadFile(f);data[25]^=1;os.WriteFile(f,data,0600)
  if p,err:=readPayload(f);err==nil{p.reader.Close();t.Fatal("Tampered package accepted")}
  bare:=filepath.Join(t.TempDir(),"bare.exe");os.WriteFile(bare,[]byte("MZ"),0600)
  if p,err:=readPayload(bare);err==nil{p.reader.Close();t.Fatal("Missing envelope accepted")}
}
func TestNoTraversal(t *testing.T){
 for _,name:=range []string{"../escape","www/../escape","/absolute","www\\evil","C:/Windows","www/./index.html","www//index.html"}{
  if _,err:=safeName(name);err==nil{t.Errorf("Unsafe ZIP name accepted %q",name)}
 }
 f:=testExe(t,testZip(t,map[string][]byte{"../escape":[]byte("payload")}))
 p,err:=readPayload(f);if err!=nil{t.Fatal(err)};defer p.reader.Close()
 root:=t.TempDir();if _,err:=extract(p,root);err==nil{t.Fatal("Zip traversal accepted")}
 if _,err:=os.Stat(filepath.Join(root,"escape"));!os.IsNotExist(err){t.Fatal("Extracted outside temporary folder")}
}
func TestServerRestrictions(t *testing.T){
 root:=t.TempDir();os.WriteFile(filepath.Join(root,"index.html"),[]byte("P2LRN offline"),0600)
 os.WriteFile(filepath.Join(root,"course.p2lrn"),[]byte("PK"),0600)
 h:=&localHandler{webRoot:root,host:"127.0.0.1:8769"}
 cases:=[]struct{url,method,host string;status int}{
 {"http://127.0.0.1:8769/index.html","GET","127.0.0.1:8769",200},
 {"http://127.0.0.1:8769/","GET","127.0.0.1:8769",200},
 {"http://127.0.0.1:8769/course.p2lrn","HEAD","127.0.0.1:8769",200},
 {"http://127.0.0.1:8769/index.html","GET","evil.test",403},
 {"http://127.0.0.1:8769/%2e%2e/%2e%2e/secret","GET","127.0.0.1:8769",404},
 {"http://127.0.0.1:8769/index.html","POST","127.0.0.1:8769",405},
 }
 for _,tc:=range cases{r:=httptest.NewRequest(tc.method,tc.url,nil);r.Host=tc.host;w:=httptest.NewRecorder();h.ServeHTTP(w,r);if w.Code!=tc.status{t.Errorf("%s/%s got %d expected %d",tc.method,tc.host,w.Code,tc.status)}}
 r:=httptest.NewRequest("GET","http://127.0.0.1:8769/index.html",nil);w:=httptest.NewRecorder();h.ServeHTTP(w,r)
 b,_:=io.ReadAll(w.Body);if !strings.Contains(string(b),"P2LRN offline"){t.Fatal("Wrong response")}
 if w.Header().Get("X-Content-Type-Options")!="nosniff"{t.Fatal("Missing nosniff header")}
}

func TestSignerCertificateAppendedAfterZipTrailer(t *testing.T){
  archive:=testZip(t,nil)
  exe:=make([]byte,512)
  exe[0],exe[1]='M','Z'
  binary.LittleEndian.PutUint32(exe[0x3c:0x40],0x80)
  copy(exe[0x80:],[]byte{'P','E',0,0})
  binary.LittleEndian.PutUint16(exe[0x80+20:0x80+22],240)
  optional:=0x80+24
  binary.LittleEndian.PutUint16(exe[optional:optional+2],0x20b)
  footer:=make([]byte,envelopeBytes)
  copy(footer,envelopeMagic)
  binary.LittleEndian.PutUint64(footer[16:24],uint64(len(archive)))
  digest:=sha256.Sum256(archive)
  copy(footer[24:],digest[:])
  pad:=make([]byte,3)
  cert:=make([]byte,32)
  offset:=len(exe)+len(archive)+len(footer)+len(pad)
  binary.LittleEndian.PutUint32(exe[optional+144:optional+148],uint32(offset))
  binary.LittleEndian.PutUint32(exe[optional+148:optional+152],uint32(len(cert)))
  file,err:=os.CreateTemp(t.TempDir(),"authenticode-example-*.exe");if err!=nil{t.Fatal(err)}
  file.Write(exe);file.Write(archive);file.Write(footer);file.Write(pad);file.Write(cert);file.Close()
  payload,err:=readPayload(file.Name())
  if err!=nil{t.Fatalf("A signed final EXE must retain ZIP support: %v",err)}
  defer payload.reader.Close()
  root,err:=extract(payload,t.TempDir());if err!=nil{t.Fatal(err)}
  defer os.RemoveAll(root)
  if _,err:=os.Stat(filepath.Join(root,"www","index.html"));err!=nil{t.Fatal(err)}
}

func TestLaunchStatePersistsOpeningsAndExpiry(t *testing.T) {
  config := t.TempDir()
  t.Setenv("APPDATA", config)
  t.Setenv("XDG_CONFIG_HOME", config)

  root := t.TempDir()
  if err := os.MkdirAll(filepath.Join(root, "www"), 0700); err != nil { t.Fatal(err) }
  assignment := []byte(`{"assignmentId":"urn:uuid:test-assignment","policy":{"expiresAfterFirstOpenDays":30}}`)
  if err := os.WriteFile(filepath.Join(root, "www", "assignment.json"), assignment, 0600); err != nil { t.Fatal(err) }

  p := payload{hash: sha256.Sum256([]byte("stable-delivery"))}
  first, err := registerLaunch(root, p)
  if err != nil { t.Fatal(err) }
  if first.OpenCount != 1 || first.FirstOpenedAt == "" || first.LastOpenedAt == "" || first.ExpiresAt == "" {
    t.Fatalf("unexpected first launch state: %+v", first)
  }
  if first.DeviceBindingID == "" || len(first.Launches) != 1 { t.Fatalf("missing device/session identity: %+v", first) }

  second, err := registerLaunch(root, p)
  if err != nil { t.Fatal(err) }
  if second.OpenCount != 2 { t.Fatalf("open count=%d, want 2", second.OpenCount) }
  if second.DeviceBindingID != first.DeviceBindingID { t.Fatal("device binding changed between openings") }
  if len(second.Launches) != 2 { t.Fatalf("sessions=%d, want 2", len(second.Launches)) }

  statePath, err := launchStateFile(p.hash)
  if err != nil { t.Fatal(err) }
  rollback := second
  rollback.LastOpenedAt = time.Now().UTC().Add(2 * time.Hour).Format(time.RFC3339Nano)
  rollbackData, err := json.Marshal(rollback)
  if err != nil { t.Fatal(err) }
  if err := os.WriteFile(statePath, rollbackData, 0600); err != nil { t.Fatal(err) }
  if _, err := registerLaunch(root, p); err == nil || !strings.Contains(strings.ToLower(err.Error()), "reloj") {
    t.Fatalf("clock rollback was not blocked: %v", err)
  }

  expired := second
  expired.FirstOpenedAt = time.Now().UTC().Add(-48 * time.Hour).Format(time.RFC3339Nano)
  expired.ExpiresAt = time.Now().UTC().Add(-24 * time.Hour).Format(time.RFC3339Nano)
  data, err := json.Marshal(expired)
  if err != nil { t.Fatal(err) }
  if err := os.WriteFile(statePath, data, 0600); err != nil { t.Fatal(err) }
  if _, err := registerLaunch(root, p); err == nil || !strings.Contains(strings.ToLower(err.Error()), "caduc") {
    t.Fatalf("expired delivery was not blocked: %v", err)
  }
}

func TestLaunchStateEndpoint(t *testing.T) {
  root := t.TempDir()
  if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("offline"), 0600); err != nil { t.Fatal(err) }
  h := &localHandler{
    webRoot: root,
    host: "127.0.0.1:8769",
    launchState: launchState{Schema:"https://p2lrn.org/schema/offline-launch-state/1", AssignmentID:"a", OpenCount:3},
  }
  r := httptest.NewRequest("GET", "http://127.0.0.1:8769/__p2lrn/launch-state", nil)
  r.Host = "127.0.0.1:8769"
  w := httptest.NewRecorder()
  h.ServeHTTP(w, r)
  if w.Code != 200 { t.Fatalf("status=%d", w.Code) }
  var got launchState
  if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil { t.Fatal(err) }
  if got.OpenCount != 3 || got.AssignmentID != "a" { t.Fatalf("unexpected launch state: %+v", got) }
}
