package p2lrnstudio

import (
 "bytes"
 "context"
 "encoding/json"
 "errors"
 "io"
 "net/http"
 "os"
 "os/exec"
 "path/filepath"
 "regexp"
 "strings"
 "time"
)

const coursePath = "__COURSE_PATH__"
const maxCourseBytes int64 = 512 * 1024 * 1024
const maxReaderBytes int64 = 128 * 1024 * 1024

// Mandatory Host callbacks: authenticate the actual session, authorize this
// operation and course, and verify CSRF/origin. Never use client headers as
// proof of authorization. Without callbacks Register refuses to expose routes.
type HostAccess struct {
 Authenticate func(*http.Request) bool
 Authorize func(*http.Request, string, string) bool
 VerifyCSRF func(*http.Request) bool
}
var safeName=regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$`)
var unsafeExec=regexp.MustCompile(`(?i).(php[0-9]*|phtml|phar|cgi|asp|aspx|jsp|shtml).`)
var reservedName=regexp.MustCompile(`(?i)^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]).`)

func filename(r *http.Request, fallback string, suffix string)(string,error){
 name:=r.Header.Get("X-P2LRN-Filename")
 if name=="" {name=fallback}
 if len(name)>180 || !safeName.MatchString(name) || unsafeExec.MatchString(name) || reservedName.MatchString(name) ||
    (suffix!="" && !strings.HasSuffix(strings.ToLower(name),suffix)) {
  return "",errors.New("INVALID_FILENAME")
 }
 return name,nil
}
func readBounded(r *http.Request, limit int64)([]byte,error){
 if r.ContentLength>limit{return nil,errors.New("UPLOAD_TOO_LARGE")}
 body,err:=io.ReadAll(io.LimitReader(r.Body,limit+1))
 if err!=nil{return nil,err}
 if int64(len(body))>limit{return nil,errors.New("UPLOAD_TOO_LARGE")}
 return body,nil
}
func fail(w http.ResponseWriter,status int,reason string){
 w.Header().Set("Content-Type","application/json")
 w.Header().Set("Cache-Control","no-store")
 w.Header().Set("X-Content-Type-Options","nosniff")
 w.WriteHeader(status)
 _=json.NewEncoder(w).Encode(map[string]any{"ok":false,"error":reason})
}
func guard(w http.ResponseWriter,r *http.Request,operation string,host HostAccess)bool{
 if r.Method!=http.MethodPost {w.Header().Set("Allow","POST");fail(w,405,"METHOD_NOT_ALLOWED");return false}
 if !host.Authenticate(r){fail(w,401,"AUTHENTICATION_REQUIRED");return false}
 if !host.Authorize(r,operation,coursePath) || !host.VerifyCSRF(r){
  fail(w,403,"COURSE_ACCESS_DENIED");return false
 }
 return true
}
func save(w http.ResponseWriter,r *http.Request){
 name,err:=filename(r,"course.p2lrn",".p2lrn")
 if err!=nil{fail(w,400,"INVALID_FILENAME");return}
 data,err:=readBounded(r,maxCourseBytes)
 if err!=nil{fail(w,413,"UPLOAD_TOO_LARGE");return}
 root,err:=os.Getwd()
 if err!=nil{fail(w,507,"STORAGE_UNAVAILABLE");return}
 dir:=filepath.Join(root,coursePath)
 if err=os.MkdirAll(dir,0700);err!=nil{fail(w,507,"STORAGE_UNAVAILABLE");return}
 base,err:=filepath.EvalSymlinks(root)
 if err!=nil{fail(w,507,"STORAGE_UNAVAILABLE");return}
 resolved,err:=filepath.EvalSymlinks(dir)
 if err!=nil{fail(w,507,"STORAGE_UNAVAILABLE");return}
 relative,err:=filepath.Rel(base,resolved)
 if err!=nil || relative==".." || strings.HasPrefix(relative,".."+string(os.PathSeparator)){
  fail(w,403,"UNSAFE_STORAGE_PATH");return
 }
 target:=filepath.Join(resolved,name)
 if info,e:=os.Lstat(target);e==nil {
  if info.Mode()&os.ModeSymlink!=0 || info.IsDir(){fail(w,403,"UNSAFE_DESTINATION");return}
 }else if !os.IsNotExist(e){fail(w,507,"STORAGE_UNAVAILABLE");return}
 temp,err:=os.CreateTemp(resolved,".p2lrn-*.tmp")
 if err!=nil{fail(w,507,"STORAGE_UNAVAILABLE");return}
 defer os.Remove(temp.Name())
 if _,err=temp.Write(data);err!=nil{temp.Close();fail(w,507,"STORAGE_UNAVAILABLE");return}
 if err=temp.Sync();err!=nil{temp.Close();fail(w,507,"STORAGE_UNAVAILABLE");return}
 if err=temp.Close();err!=nil{fail(w,507,"STORAGE_UNAVAILABLE");return}
 if info,e:=os.Lstat(target);e==nil && info.Mode()&os.ModeSymlink!=0 {
  fail(w,403,"UNSAFE_DESTINATION");return
 }
 if err=os.Rename(temp.Name(),target);err!=nil{fail(w,507,"STORAGE_UNAVAILABLE");return}
 w.Header().Set("Content-Type","application/json")
 w.Header().Set("Cache-Control","no-store")
 _=json.NewEncoder(w).Encode(map[string]any{"ok":true,"filename":name,"bytes":len(data)})
}
func bridge(w http.ResponseWriter,r *http.Request,action,fallback string,limit int64,media string){
 name,err:=filename(r,fallback,"")
 if err!=nil{fail(w,400,"INVALID_FILENAME");return}
 body,err:=readBounded(r,limit)
 if err!=nil{fail(w,413,"UPLOAD_TOO_LARGE");return}
 ctx,cancel:=context.WithTimeout(r.Context(),120*time.Second)
 defer cancel()
 cmd:=exec.CommandContext(ctx,"node",filepath.Join("p2lrn-setup","p2lrn-studio-bridge.mjs"),
   action,name,r.Header.Get("Content-Type"))
 cmd.Stdin=bytes.NewReader(body)
 out,err:=cmd.Output()
 if err!=nil || int64(len(out))>limit{fail(w,422,"BRIDGE_FAILED");return}
 w.Header().Set("Content-Type",media)
 w.Header().Set("Cache-Control","no-store")
 _,_=w.Write(out)
}
func registerRoute(mux *http.ServeMux,path,operation string,host HostAccess,handler http.HandlerFunc){
 mux.HandleFunc(path,func(w http.ResponseWriter,r *http.Request){
  if !guard(w,r,operation,host){return}
  handler(w,r)
 })
}
// Registration must provide all three callbacks. Without them the handlers
// are not exposed and Register returns an error, not an open endpoint.
func Register(mux *http.ServeMux, host HostAccess) error {
 if mux==nil || host.Authenticate==nil || host.Authorize==nil || host.VerifyCSRF==nil{
  return errors.New("P2LRN Studio requires Host authentication, authorization and CSRF callbacks")
 }
 registerRoute(mux,"__ENDPOINT__","save",host,save)
 registerRoute(mux,"__READER_ENDPOINT__","read",host,
  func(w http.ResponseWriter,r *http.Request){bridge(w,r,"read","document.bin",maxReaderBytes,"application/json")})
 registerRoute(mux,"__IMPORT_ENDPOINT__","import",host,
  func(w http.ResponseWriter,r *http.Request){bridge(w,r,"import","package.zip",maxCourseBytes,"application/vnd.p2lrn+zip")})
 return nil
}
// Legacy direct handler is deliberately not an authorization bypass.
func Handler(w http.ResponseWriter,r *http.Request){fail(w,503,"HOST_AUTHORIZATION_NOT_CONFIGURED")}
