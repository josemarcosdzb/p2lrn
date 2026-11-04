<?php
if(($_SERVER['REQUEST_METHOD']??'')!=='POST'){http_response_code(405);header('Allow: POST');exit;}
$project=dirname(__DIR__,4);
$auth=$project.DIRECTORY_SEPARATOR.'p2lrn-setup'.DIRECTORY_SEPARATOR.'studio-auth.php';
if(!is_file($auth)){http_response_code(503);exit;}
require_once $auth;
p2lrn_studio_require_authorization('read','__COURSE_PATH__');
require_once $project.DIRECTORY_SEPARATOR.'p2lrn-setup'.DIRECTORY_SEPARATOR.'studio-php-bridge.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try{
    $out=p2lrn_studio_bridge('read','document.bin',128*1024*1024);
    header('Content-Type: application/json; charset=utf-8');
    echo $out;
}catch(Throwable $error){
    $status=(int)$error->getCode()===413?413:((int)$error->getCode()===400?400:422);
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok'=>false,'error'=>$status===413?'UPLOAD_TOO_LARGE':($status===400?'INVALID_FILENAME':'READER_FAILED')]);
}
