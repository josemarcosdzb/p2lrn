use axum::{body::Bytes,http::HeaderMap,Json};
use serde_json::{json,Value};
use std::path::PathBuf;
pub async fn save(headers:HeaderMap,body:Bytes)->Json<Value>{
 let dir=PathBuf::from("__COURSE_PATH__"); tokio::fs::create_dir_all(&dir).await.unwrap();
 let raw=headers.get("x-p2lrn-filename").and_then(|v|v.to_str().ok()).unwrap_or("course.p2lrn");
 let name=std::path::Path::new(raw).file_name().unwrap().to_string_lossy().to_string();
 tokio::fs::write(dir.join(&name),body).await.unwrap();
 Json(json!({"ok":true,"filename":name}))
}
