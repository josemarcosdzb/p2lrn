package main

import (
  "archive/zip"
  "bytes"
  "crypto/sha256"
  "encoding/binary"
  "io"
  "net/http/httptest"
  "os"
  "path/filepath"
  "strings"
  "testing"
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
