<?php
function p2lrn_bridge($action,$fallback,$contentType=''){
  $raw=$_SERVER['HTTP_X_P2LRN_FILENAME']??$fallback;
  $name=rawurldecode($raw);
  $bridge=__DIR__.DIRECTORY_SEPARATOR.'p2lrn-setup'.DIRECTORY_SEPARATOR.'p2lrn-studio-bridge.mjs';
  $spec=[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']];
  $process=proc_open(['node',$bridge,$action,$name,$contentType],$spec,$pipes,__DIR__);
  if(!is_resource($process))throw new RuntimeException('Unable to start P2LRN Studio bridge');
  fwrite($pipes[0],file_get_contents('php://input')); fclose($pipes[0]);
  $out=stream_get_contents($pipes[1]); fclose($pipes[1]);
  $err=stream_get_contents($pipes[2]); fclose($pipes[2]);
  $code=proc_close($process);
  if($code!==0)throw new RuntimeException(trim($err)?:'P2LRN Studio Reader failed');
  return $out;
}
if($_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);header('Allow: POST');exit;}
try{
  $out=p2lrn_bridge('read','document.bin',$_SERVER['CONTENT_TYPE']??'application/octet-stream');
  header('Content-Type: application/json; charset=utf-8');
  echo $out;
}catch(Throwable $error){
  http_response_code(422);header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok'=>false,'error'=>$error->getMessage()]);
}
