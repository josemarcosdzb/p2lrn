use axum::{
 body::{to_bytes,Body},http::{header,Request,StatusCode},response::{IntoResponse,Response},Json
};
use serde_json::json;
use std::{fs::{self,OpenOptions},io::Write,path::Path,process::{Command,Stdio},
 time::{SystemTime,UNIX_EPOCH}};

const COURSE_PATH:&str="__COURSE_PATH__";
const MAX_COURSE:usize=512*1024*1024;
const MAX_READER:usize=128*1024*1024;

// Host middleware inserts this server-side Extension only after verifying
// the principal, operation-specific course permission and CSRF token.
// Client-supplied headers cannot create an Extension. Missing => deny.
#[derive(Clone)]
pub struct StudioHostAccess {
 pub principal:Option<String>,
 pub operation:String,
 pub course_path:String,
 pub csrf_verified:bool,
}
fn denied(status:StatusCode,code:&str)->Response {
 (status,Json(json!({"ok":false,"error":code}))).into_response()
}
fn guard(req:&Request<Body>,operation:&str)->Result<(),Response>{
 let Some(auth)=req.extensions().get::<StudioHostAccess>() else{
  return Err(denied(StatusCode::SERVICE_UNAVAILABLE,"HOST_AUTHORIZATION_NOT_CONFIGURED"));
 };
 if auth.principal.as_ref().is_none_or(|s|s.is_empty()){
  return Err(denied(StatusCode::UNAUTHORIZED,"AUTHENTICATION_REQUIRED"));
 }
 if auth.operation!=operation||auth.course_path!=COURSE_PATH||!auth.csrf_verified{
  return Err(denied(StatusCode::FORBIDDEN,"COURSE_ACCESS_DENIED"));
 }
 Ok(())
}
fn safe_name(req:&Request<Body>,fallback:&str,suffix:Option<&str>)->Result<String,Response>{
 let raw=req.headers().get("x-p2lrn-filename").map(|v|v.to_str()).transpose()
  .map_err(|_|denied(StatusCode::BAD_REQUEST,"INVALID_FILENAME"))?;
 let name=raw.unwrap_or(fallback);
 let safe=name.len()<=180 && name.len()<=161 &&
  name.bytes().next().is_some_and(|b|b.is_ascii_alphanumeric()) &&
  name.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'.'||b==b'_'||b==b'-');
 let lower=name.to_ascii_lowercase();
 let blocked=lower.split('.').any(|part|{
  matches!(part,"php"|"phtml"|"phar"|"cgi"|"asp"|"aspx"|"jsp"|"shtml") ||
  (part.starts_with("php")&&part[3..].bytes().all(|b|b.is_ascii_digit()))
 });
 let reserved=lower.split('.').next().is_some_and(|part|
  matches!(part,"con"|"prn"|"aux"|"nul"|"com1"|"com2"|"com3"|"com4"|"com5"|
  "com6"|"com7"|"com8"|"com9"|"lpt1"|"lpt2"|"lpt3"|"lpt4"|"lpt5"|
  "lpt6"|"lpt7"|"lpt8"|"lpt9"));
 if !safe || reserved || (blocked && lower.ends_with(".p2lrn")) ||
    suffix.is_some_and(|s|!lower.ends_with(s)) {
  return Err(denied(StatusCode::BAD_REQUEST,"INVALID_FILENAME"));
 }
 Ok(name.to_string())
}
async fn bounded(req:Request<Body>,max:usize)->Result<axum::body::Bytes,Response>{
 to_bytes(req.into_body(),max+1).await
  .map_err(|_|denied(StatusCode::PAYLOAD_TOO_LARGE,"UPLOAD_TOO_LARGE"))
}
fn bridge(action:&str,filename:&str,bytes:&[u8],media:&str,max:usize)->Result<Vec<u8>,Response>{
 let mut child=Command::new("node")
  .arg("p2lrn-setup/p2lrn-studio-bridge.mjs")
  .arg(action).arg(filename).arg(media)
  .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
  .spawn().map_err(|_|denied(StatusCode::UNPROCESSABLE_ENTITY,"BRIDGE_FAILED"))?;
 if child.stdin.take().ok_or_else(||denied(StatusCode::UNPROCESSABLE_ENTITY,"BRIDGE_FAILED"))?
  .write_all(bytes).is_err(){return Err(denied(StatusCode::UNPROCESSABLE_ENTITY,"BRIDGE_FAILED"));}
 let output=child.wait_with_output()
  .map_err(|_|denied(StatusCode::UNPROCESSABLE_ENTITY,"BRIDGE_FAILED"))?;
 if !output.status.success()||output.stdout.len()>max{
  return Err(denied(StatusCode::UNPROCESSABLE_ENTITY,"BRIDGE_FAILED"));
 }
 Ok(output.stdout)
}
pub async fn save(req:Request<Body>)->Response{
 if let Err(error)=guard(&req,"save"){return error;}
 let name=match safe_name(&req,"course.p2lrn",Some(".p2lrn")){Ok(v)=>v,Err(e)=>return e};
 let bytes=match bounded(req,MAX_COURSE).await{Ok(v)=>v,Err(e)=>return e};
 let result=(||->Result<(),std::io::Error>{
  let base=fs::canonicalize(".")?;
  let folder=base.join(COURSE_PATH);
  fs::create_dir_all(&folder)?;
  let folder=fs::canonicalize(folder)?;
  if !folder.starts_with(&base){return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"UNSAFE_STORAGE_PATH"));}
  let dest=folder.join(&name);
  if fs::symlink_metadata(&dest).is_ok_and(|m|m.file_type().is_symlink()||m.is_dir()){
   return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"UNSAFE_DESTINATION"));
  }
  let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
  let temp=folder.join(format!(".p2lrn-{}-{}.tmp",std::process::id(),now));
  let write_result=(||{
   let mut f=OpenOptions::new().create_new(true).write(true).open(&temp)?;
   f.write_all(&bytes)?;f.sync_all()?;drop(f);
   if fs::symlink_metadata(&dest).is_ok_and(|m|m.file_type().is_symlink()){
    return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"UNSAFE_DESTINATION"));
   }
   fs::rename(&temp,&dest)
  })();
  if write_result.is_err(){let _=fs::remove_file(&temp);}
  write_result
 })();
 match result{
  Ok(())=>Json(json!({"ok":true,"filename":name,"bytes":bytes.len()})).into_response(),
  Err(e) if e.kind()==std::io::ErrorKind::PermissionDenied=>denied(StatusCode::FORBIDDEN,"UNSAFE_STORAGE_PATH"),
  Err(_)=>denied(StatusCode::INSUFFICIENT_STORAGE,"STORAGE_UNAVAILABLE"),
 }
}
async fn run(req:Request<Body>,operation:&str,default:&str,limit:usize,media:&str)->Response{
 if let Err(error)=guard(&req,operation){return error;}
 let filename=match safe_name(&req,default,None){Ok(v)=>v,Err(e)=>return e};
 let mime=req.headers().get(header::CONTENT_TYPE).and_then(|x|x.to_str().ok())
  .unwrap_or("application/octet-stream").to_string();
 let bytes=match bounded(req,limit).await{Ok(v)=>v,Err(e)=>return e};
 match bridge(operation,&filename,&bytes,&mime,limit){
  Ok(output)=>([(header::CONTENT_TYPE,media)],Body::from(output)).into_response(),
  Err(error)=>error,
 }
}
pub async fn read(req:Request<Body>)->Response{
 run(req,"read","document.bin",MAX_READER,"application/json").await
}
pub async fn import_package(req:Request<Body>)->Response{
 run(req,"import","package.zip",MAX_COURSE,"application/vnd.p2lrn+zip").await
}
