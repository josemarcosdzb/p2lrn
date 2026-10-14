package p2lrnstudio
import("bytes";"encoding/json";"fmt";"io";"net/http";"os";"os/exec";"path/filepath";"net/url")

func requestName(r *http.Request,fallback string) string {raw:=r.Header.Get("X-P2LRN-Filename");if raw==""{return fallback};if name,err:=url.QueryUnescape(raw);err==nil{return name};return raw}
func runBridge(action string,r *http.Request,fallback string,max int64)([]byte,error){
 body,err:=io.ReadAll(io.LimitReader(r.Body,max+1));if err!=nil{return nil,err};if int64(len(body))>max{return nil,fmt.Errorf("request too large")}
 cmd:=exec.Command("node",filepath.Join("p2lrn-setup","p2lrn-studio-bridge.mjs"),action,requestName(r,fallback),r.Header.Get("Content-Type"));cmd.Stdin=bytes.NewReader(body);var stderr bytes.Buffer;cmd.Stderr=&stderr
 out,err:=cmd.Output();if err!=nil{if stderr.Len()>0{return nil,fmt.Errorf("%s",stderr.String())};return nil,err};return out,nil
}
func SaveHandler(w http.ResponseWriter,r *http.Request){
 if r.Method!="POST"{w.WriteHeader(http.StatusMethodNotAllowed);return}
 dir:="__COURSE_PATH__"; _=os.MkdirAll(dir,0755)
 name:=filepath.Base(r.Header.Get("X-P2LRN-Filename")); if name=="."||name==""{name="course.p2lrn"}
 b,err:=io.ReadAll(io.LimitReader(r.Body,(512<<20)+1)); if err!=nil||len(b)>512<<20{http.Error(w,"Package too large",http.StatusRequestEntityTooLarge);return}
 if err=os.WriteFile(filepath.Join(dir,name),b,0644);err!=nil{http.Error(w,err.Error(),500);return}
 w.Header().Set("Content-Type","application/json"); json.NewEncoder(w).Encode(map[string]any{"ok":true,"filename":name})
}
func Handler(w http.ResponseWriter,r *http.Request){SaveHandler(w,r)}
func ReadHandler(w http.ResponseWriter,r *http.Request){
 if r.Method!="POST"{w.WriteHeader(http.StatusMethodNotAllowed);return};out,err:=runBridge("read",r,"document.bin",128<<20);if err!=nil{http.Error(w,err.Error(),422);return};w.Header().Set("Content-Type","application/json");w.Write(out)
}
func ImportHandler(w http.ResponseWriter,r *http.Request){
 if r.Method!="POST"{w.WriteHeader(http.StatusMethodNotAllowed);return};out,err:=runBridge("import",r,"package.zip",512<<20);if err!=nil{http.Error(w,err.Error(),422);return};w.Header().Set("Content-Type","application/vnd.p2lrn+zip");w.Write(out)
}
func Register(mux *http.ServeMux){mux.HandleFunc("__ENDPOINT__",SaveHandler);mux.HandleFunc("__READER_ENDPOINT__",ReadHandler);mux.HandleFunc("__IMPORT_ENDPOINT__",ImportHandler)}
