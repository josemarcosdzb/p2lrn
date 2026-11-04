<?php
function p2lrn_studio_bridge(string $action,string $defaultName,int $limit): string {
    $project=dirname(__DIR__);
    $length=$_SERVER['CONTENT_LENGTH']??null;
    if($length!==null&&(!ctype_digit((string)$length)||(float)$length>$limit))
        throw new RuntimeException('UPLOAD_TOO_LARGE',413);
    $raw=$_SERVER['HTTP_X_P2LRN_FILENAME']??$defaultName;
    if(!is_string($raw)||strlen($raw)>180||str_contains($raw,"\0"))
        throw new RuntimeException('INVALID_FILENAME',400);
    $name=rawurldecode($raw);
    if(str_contains($name,'/')||str_contains($name,'\\')||!preg_match('/^[A-Za-z0-9._-]{1,180}$/D',$name))
        throw new RuntimeException('INVALID_FILENAME',400);
    $bytes=file_get_contents('php://input',false,null,0,$limit+1);
    if($bytes===false)throw new RuntimeException('INPUT_ERROR');
    if(strlen($bytes)>$limit)throw new RuntimeException('UPLOAD_TOO_LARGE',413);
    $script=$project.DIRECTORY_SEPARATOR.'p2lrn-setup'.DIRECTORY_SEPARATOR.'p2lrn-studio-bridge.mjs';
    $spec=[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']];
    $process=proc_open(['node',$script,$action,$name,$_SERVER['CONTENT_TYPE']??'application/octet-stream'],
        $spec,$pipes,$project);
    if(!is_resource($process))throw new RuntimeException('BRIDGE_ERROR');
    $out='';
    try{
        $size=strlen($bytes);$written=0;
        while($written<$size){
            $n=fwrite($pipes[0],substr($bytes,$written,65536));
            if($n===false||$n===0)throw new RuntimeException('BRIDGE_ERROR');
            $written+=$n;
        }
        fclose($pipes[0]);
        $out=stream_get_contents($pipes[1],$limit+1);
        fclose($pipes[1]);
        stream_get_contents($pipes[2],4096);
        fclose($pipes[2]);
        if(proc_close($process)!==0)throw new RuntimeException('BRIDGE_ERROR');
    }catch(Throwable $error){
        foreach($pipes as $pipe)if(is_resource($pipe))fclose($pipe);
        if(is_resource($process))@proc_terminate($process);
        throw $error;
    }
    if($out===false||strlen($out)>$limit)throw new RuntimeException('OUTPUT_TOO_LARGE',413);
    return $out;
}
