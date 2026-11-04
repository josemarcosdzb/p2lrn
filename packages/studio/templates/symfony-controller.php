<?php
namespace App\Controller;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class P2LRNStudioController {
  private const MAX_COURSE_BYTES=536870912;
  private const MAX_READER_BYTES=134217728;

  // Authenticated Host middleware sets these server-only Request attributes.
  // Until it supplies all three checks, every operation fails closed.
  private function guard(Request $request,string $operation): ?JsonResponse {
    if($request->attributes->get('p2lrn_studio_principal')===null)
      return new JsonResponse(['ok'=>false,'error'=>'AUTHENTICATION_REQUIRED'],401);
    if($request->attributes->get('p2lrn_studio_operation')!==$operation ||
       $request->attributes->get('p2lrn_studio_course')!=='__COURSE_PATH__' ||
       $request->attributes->get('p2lrn_studio_csrf_ok')!==true)
      return new JsonResponse(['ok'=>false,'error'=>'COURSE_ACCESS_DENIED'],403);
    return null;
  }
  private function name(Request $request,string $default,?string $suffix=null):string {
    $name=$request->headers->get('X-P2LRN-Filename',$default);
    if(!is_string($name)||strlen($name)>180||
       !preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$/D',$name)||
       preg_match('/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i',$name)||
       preg_match('/\.(?:php[0-9]*|phtml|phar|cgi|asp|aspx|jsp|shtml)\./i',$name)||
       ($suffix!==null&&!str_ends_with(strtolower($name),$suffix)))
      throw new \InvalidArgumentException('INVALID_FILENAME');
    return $name;
  }
  private function bytes(Request $request,int $limit): string {
    $length=$request->headers->get('Content-Length');
    if($length!==null&&(!ctype_digit((string)$length)||(float)$length>$limit))
      throw new \LengthException('UPLOAD_TOO_LARGE');
    $stream=$request->getContent(true);
    if(!is_resource($stream))throw new \RuntimeException('INPUT_UNAVAILABLE');
    $body='';
    while(!feof($stream)){
      $chunk=fread($stream,65536);
      if($chunk===false)throw new \RuntimeException('INPUT_UNAVAILABLE');
      if(strlen($body)+strlen($chunk)>$limit)
        throw new \LengthException('UPLOAD_TOO_LARGE');
      $body.=$chunk;
    }
    return $body;
  }
  private function bridge(string $action,Request $request,string $fallback,int $limit):string {
    $name=$this->name($request,$fallback);
    $data=$this->bytes($request,$limit);
    $project=getcwd();
    $script=$project.DIRECTORY_SEPARATOR.'p2lrn-setup'.DIRECTORY_SEPARATOR.'p2lrn-studio-bridge.mjs';
    $process=proc_open(['node',$script,$action,$name,$request->headers->get('Content-Type','application/octet-stream')],
      [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,$project);
    if(!is_resource($process))throw new \RuntimeException('BRIDGE_UNAVAILABLE');
    try{
      $position=0;
      while($position<strlen($data)){
        $n=fwrite($pipes[0],substr($data,$position,65536));
        if($n===false||$n===0)throw new \RuntimeException('BRIDGE_FAILED');
        $position+=$n;
      }
      fclose($pipes[0]);
      $output=stream_get_contents($pipes[1],$limit+1);fclose($pipes[1]);
      stream_get_contents($pipes[2],4096);fclose($pipes[2]);
      if(proc_close($process)!==0||$output===false||strlen($output)>$limit)
        throw new \RuntimeException('BRIDGE_FAILED');
      return $output;
    }catch(\Throwable $e){
      foreach($pipes as $pipe)if(is_resource($pipe))fclose($pipe);
      if(is_resource($process))@proc_terminate($process);
      throw $e;
    }
  }
  #[Route('__ENDPOINT__',methods:['POST'])]
  public function save(Request $request): JsonResponse {
    if($denied=$this->guard($request,'save'))return $denied;
    try{
      $name=$this->name($request,'course.p2lrn','.p2lrn');
      $data=$this->bytes($request,self::MAX_COURSE_BYTES);
      $root=realpath(getcwd());$dir=getcwd().DIRECTORY_SEPARATOR.'__COURSE_PATH__';
      if(!is_dir($dir)&&!@mkdir($dir,0700,true)&&!is_dir($dir))
        throw new \RuntimeException('STORAGE_UNAVAILABLE');
      $canonical=realpath($dir);
      if($root===false||$canonical===false||
         ($canonical!==$root&&!str_starts_with($canonical,$root.DIRECTORY_SEPARATOR)))
        return new JsonResponse(['ok'=>false,'error'=>'UNSAFE_STORAGE_PATH'],403);
      $target=$canonical.DIRECTORY_SEPARATOR.$name;
      if(is_link($target)||is_dir($target))
        return new JsonResponse(['ok'=>false,'error'=>'UNSAFE_DESTINATION'],403);
      $tmp=tempnam($canonical,'.p2lrn-');
      if($tmp===false)throw new \RuntimeException('STORAGE_UNAVAILABLE');
      try{
        @chmod($tmp,0600);
        if(file_put_contents($tmp,$data,LOCK_EX)!==strlen($data))
          throw new \RuntimeException('STORAGE_UNAVAILABLE');
        if(is_link($target)||!@rename($tmp,$target))
          throw new \RuntimeException('STORAGE_UNAVAILABLE');
        $tmp=null;
      }finally{if($tmp!==null&&is_file($tmp))@unlink($tmp);}
      return new JsonResponse(['ok'=>true,'filename'=>$name,'bytes'=>strlen($data)]);
    }catch(\InvalidArgumentException $e){
      return new JsonResponse(['ok'=>false,'error'=>'INVALID_FILENAME'],400);
    }catch(\LengthException $e){
      return new JsonResponse(['ok'=>false,'error'=>'UPLOAD_TOO_LARGE'],413);
    }catch(\Throwable $e){
      return new JsonResponse(['ok'=>false,'error'=>'STORAGE_UNAVAILABLE'],507);
    }
  }
  #[Route('__READER_ENDPOINT__',methods:['POST'])]
  public function read(Request $request): Response {
    if($denied=$this->guard($request,'read'))return $denied;
    try{return new Response($this->bridge('read',$request,'document.bin',self::MAX_READER_BYTES),200,
      ['Content-Type'=>'application/json; charset=utf-8']);}
    catch(\InvalidArgumentException $e){return new JsonResponse(['ok'=>false,'error'=>'INVALID_FILENAME'],400);}
    catch(\LengthException $e){return new JsonResponse(['ok'=>false,'error'=>'UPLOAD_TOO_LARGE'],413);}
    catch(\Throwable $e){return new JsonResponse(['ok'=>false,'error'=>'READER_FAILED'],422);}
  }
  #[Route('__IMPORT_ENDPOINT__',methods:['POST'])]
  public function importPackage(Request $request): Response {
    if($denied=$this->guard($request,'import'))return $denied;
    try{return new Response($this->bridge('import',$request,'package.zip',self::MAX_COURSE_BYTES),200,
      ['Content-Type'=>'application/vnd.p2lrn+zip']);}
    catch(\InvalidArgumentException $e){return new JsonResponse(['ok'=>false,'error'=>'INVALID_FILENAME'],400);}
    catch(\LengthException $e){return new JsonResponse(['ok'=>false,'error'=>'UPLOAD_TOO_LARGE'],413);}
    catch(\Throwable $e){return new JsonResponse(['ok'=>false,'error'=>'IMPORT_FAILED'],422);}
  }
}
