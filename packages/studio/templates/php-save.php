<?php
if($_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);exit;}
$dir=__DIR__.DIRECTORY_SEPARATOR.'__COURSE_PATH__';
if(!is_dir($dir))mkdir($dir,0775,true);
$name=basename($_SERVER['HTTP_X_P2LRN_FILENAME']??'course.p2lrn');
file_put_contents($dir.DIRECTORY_SEPARATOR.$name,file_get_contents('php://input'));
header('Content-Type: application/json');
echo json_encode(['ok'=>true,'filename'=>$name]);
