package p2lrnstudio
import("encoding/json";"io";"net/http";"os";"path/filepath")
func Handler(w http.ResponseWriter,r *http.Request){
 if r.Method!="POST"{w.WriteHeader(http.StatusMethodNotAllowed);return}
 dir:="__COURSE_PATH__"; _=os.MkdirAll(dir,0755)
 name:=filepath.Base(r.Header.Get("X-P2LRN-Filename")); if name=="."||name==""{name="course.p2lrn"}
 b,err:=io.ReadAll(io.LimitReader(r.Body,512<<20)); if err!=nil{http.Error(w,err.Error(),400);return}
 if err=os.WriteFile(filepath.Join(dir,name),b,0644);err!=nil{http.Error(w,err.Error(),500);return}
 w.Header().Set("Content-Type","application/json"); json.NewEncoder(w).Encode(map[string]any{"ok":true,"filename":name})
}
