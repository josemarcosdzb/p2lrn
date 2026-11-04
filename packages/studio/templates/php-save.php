<?php
if(($_SERVER['REQUEST_METHOD']??'')!=='POST'){http_response_code(405);header('Allow: POST');exit;}
$project=dirname(__DIR__,4);
$auth=$project.DIRECTORY_SEPARATOR.'p2lrn-setup'.DIRECTORY_SEPARATOR.'studio-auth.php';
if(!is_file($auth)){http_response_code(503);exit;}
require_once $auth;
p2lrn_studio_require_authorization('save','__COURSE_PATH__');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
$limit=512*1024*1024;
$length=$_SERVER['CONTENT_LENGTH']??null;
if($length!==null){
    if(!ctype_digit((string)$length)){http_response_code(400);echo json_encode(['ok'=>false,'error'=>'INVALID_LENGTH']);exit;}
    if((float)$length>$limit){http_response_code(413);echo json_encode(['ok'=>false,'error'=>'UPLOAD_TOO_LARGE']);exit;}
}
$name=$_SERVER['HTTP_X_P2LRN_FILENAME']??'course.p2lrn';
if(!is_string($name)||strlen($name)>180||!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,160}\.p2lrn$/iD',$name)||
    preg_match('/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i',$name)||
    preg_match('/\.(?:php[0-9]*|phtml|phar|cgi|asp|aspx|jsp|shtml)\./i',$name)){
    http_response_code(400);echo json_encode(['ok'=>false,'error'=>'INVALID_FILENAME']);exit;
}
$base=realpath($project);
$dir=$project.DIRECTORY_SEPARATOR.'__COURSE_PATH__';
if(!is_dir($dir)&&!@mkdir($dir,0700,true)&&!is_dir($dir)){
    http_response_code(507);echo json_encode(['ok'=>false,'error'=>'STORAGE_UNAVAILABLE']);exit;
}
$actual=realpath($dir);
if($base===false||$actual===false||
    ($actual!==$base&&!str_starts_with($actual,$base.DIRECTORY_SEPARATOR))){
    http_response_code(403);echo json_encode(['ok'=>false,'error'=>'UNSAFE_STORAGE_PATH']);exit;
}
$target=$actual.DIRECTORY_SEPARATOR.$name;
if(is_link($target)||is_dir($target)){
    http_response_code(403);echo json_encode(['ok'=>false,'error'=>'UNSAFE_DESTINATION']);exit;
}
$tmp=tempnam($actual,'.p2lrn-write-');
if($tmp===false){http_response_code(507);echo json_encode(['ok'=>false,'error'=>'STORAGE_UNAVAILABLE']);exit;}
$input=null;$output=null;
try{
    @chmod($tmp,0600);
    $input=fopen('php://input','rb');$output=fopen($tmp,'wb');
    if($input===false||$output===false)throw new RuntimeException('IO_ERROR');
    $total=0;
    while(!feof($input)){
        $chunk=fread($input,1024*1024);
        if($chunk===false)throw new RuntimeException('IO_ERROR');
        if($chunk==='')continue;
        $total+=strlen($chunk);
        if($total>$limit)throw new RuntimeException('UPLOAD_TOO_LARGE',413);
        if(fwrite($output,$chunk)!==strlen($chunk))throw new RuntimeException('IO_ERROR');
    }
    fflush($output);fclose($output);$output=null;
    if(is_link($target)||!@rename($tmp,$target))throw new RuntimeException('IO_ERROR');
    $tmp=null;
    echo json_encode(['ok'=>true,'filename'=>$name,'bytes'=>$total]);
}catch(Throwable $error){
    http_response_code((int)$error->getCode()===413?413:507);
    echo json_encode(['ok'=>false,'error'=>(int)$error->getCode()===413?'UPLOAD_TOO_LARGE':'STORAGE_UNAVAILABLE']);
}finally{
    if(is_resource($input))fclose($input);
    if(is_resource($output))fclose($output);
    if($tmp!==null&&is_file($tmp))@unlink($tmp);
}
