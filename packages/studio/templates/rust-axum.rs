use axum::{body::{Body,Bytes},http::{HeaderMap,StatusCode,header},response::{IntoResponse,Response},Json};
use serde_json::{json,Value};
use std::{io::Write,path::PathBuf,process::{Command,Stdio}};

fn name(headers:&HeaderMap,fallback:&str)->String{headers.get("x-p2lrn-filename").and_then(|v|v.to_str().ok()).and_then(|v|urlencoding::decode(v).ok()).map(|v|v.into_owned()).unwrap_or_else(||fallback.to_string())}
fn bridge(action:&str,headers:&HeaderMap,body:&Bytes,fallback:&str)->Result<Vec<u8>,String>{
 let mut child=Command::new("node").arg("p2lrn-setup/p2lrn-studio-bridge.mjs").arg(action).arg(name(headers,fallback)).arg(headers.get("content-type").and_then(|v|v.to_str().ok()).unwrap_or("application/octet-stream")).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e|e.to_string())?;
 child.stdin.as_mut().ok_or("bridge stdin unavailable")?.write_all(body).map_err(|e|e.to_string())?;
 let output=child.wait_with_output().map_err(|e|e.to_string())?;if !output.status.success(){return Err(String::from_utf8_lossy(&output.stderr).trim().to_string())}Ok(output.stdout)
}
pub async fn save(headers:HeaderMap,body:Bytes)->Json<Value>{
 let dir=PathBuf::from("__COURSE_PATH__"); tokio::fs::create_dir_all(&dir).await.unwrap();
 let raw=headers.get("x-p2lrn-filename").and_then(|v|v.to_str().ok()).unwrap_or("course.p2lrn");
 let filename=std::path::Path::new(raw).file_name().unwrap().to_string_lossy().to_string();
 tokio::fs::write(dir.join(&filename),body).await.unwrap(); Json(json!({"ok":true,"filename":filename}))
}
pub async fn read(headers:HeaderMap,body:Bytes)->Response{match bridge("read",&headers,&body,"document.bin"){Ok(out)=>([(header::CONTENT_TYPE,"application/json")],out).into_response(),Err(error)=>(StatusCode::UNPROCESSABLE_ENTITY,error).into_response()}}
pub async fn import_package(headers:HeaderMap,body:Bytes)->Response{match bridge("import",&headers,&body,"package.zip"){Ok(out)=>([(header::CONTENT_TYPE,"application/vnd.p2lrn+zip")],Body::from(out)).into_response(),Err(error)=>(StatusCode::UNPROCESSABLE_ENTITY,error).into_response()}}
