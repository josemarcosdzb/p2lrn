<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class P2LRNStudioController extends Controller {
  private const MAX_COURSE_BYTES = 536870912;
  private const MAX_READER_BYTES = 134217728;

  // Host middleware must set these *server-only* request attributes after
  // verifying an authenticated user, permission for this specific operation
  // and course, and a valid anti-CSRF token. Client headers are never trusted.
  private function guard(Request $request,string $operation): ?JsonResponse {
    if (!$request->user())
      return response()->json(['ok'=>false,'error'=>'AUTHENTICATION_REQUIRED'],401);
    if ($request->attributes->get('p2lrn_studio_operation') !== $operation ||
        $request->attributes->get('p2lrn_studio_course') !== '__COURSE_PATH__' ||
        $request->attributes->get('p2lrn_studio_csrf_ok') !== true)
      return response()->json(['ok'=>false,'error'=>'COURSE_ACCESS_DENIED'],403);
    return null;
  }

  private function name(Request $request,string $fallback,?string $suffix=null): string {
    $name=$request->header('X-P2LRN-Filename',$fallback);
    if (!is_string($name) || strlen($name)>180 ||
        !preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$/D',$name) ||
        preg_match('/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i',$name) ||
        preg_match('/\.(?:php[0-9]*|phtml|phar|cgi|asp|aspx|jsp|shtml)\./i',$name) ||
        ($suffix!==null && !str_ends_with(strtolower($name),$suffix)))
      throw new \InvalidArgumentException('INVALID_FILENAME');
    return $name;
  }

  private function bytes(Request $request,int $limit): string {
    $length=$request->header('Content-Length');
    if ($length!==null && (!ctype_digit((string)$length) || (float)$length>$limit))
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

  private function bridge(string $action,Request $request,string $fallback,int $limit): string {
    $name=$this->name($request,$fallback);
    $data=$this->bytes($request,$limit);
    $script=base_path('p2lrn-setup/p2lrn-studio-bridge.mjs');
    $process=proc_open(
      ['node',$script,$action,$name,$request->header('Content-Type','application/octet-stream')],
      [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,base_path()
    );
    if (!is_resource($process))throw new \RuntimeException('BRIDGE_UNAVAILABLE');
    try {
      $offset=0;
      while($offset<strlen($data)){
        $written=fwrite($pipes[0],substr($data,$offset,65536));
        if ($written===false || $written===0)throw new \RuntimeException('BRIDGE_FAILED');
        $offset+=$written;
      }
      fclose($pipes[0]);
      $result=stream_get_contents($pipes[1],$limit+1);
      fclose($pipes[1]);
      stream_get_contents($pipes[2],4096);fclose($pipes[2]);
      if (proc_close($process)!==0 || $result===false || strlen($result)>$limit)
        throw new \RuntimeException('BRIDGE_FAILED');
      return $result;
    } catch(\Throwable $e) {
      foreach($pipes as $pipe)if(is_resource($pipe))fclose($pipe);
      if(is_resource($process))@proc_terminate($process);
      throw $e;
    }
  }

  public function save(Request $request): JsonResponse {
    if($denied=$this->guard($request,'save'))return $denied;
    try {
      $name=$this->name($request,'course.p2lrn','.p2lrn');
      $data=$this->bytes($request,self::MAX_COURSE_BYTES);
      $root=realpath(base_path());
      $dir=base_path('__COURSE_PATH__');
      if(!is_dir($dir) && !@mkdir($dir,0700,true) && !is_dir($dir))
        throw new \RuntimeException('STORAGE_UNAVAILABLE');
      $canonical=realpath($dir);
      if($root===false || $canonical===false ||
         ($canonical!==$root && !str_starts_with($canonical,$root.DIRECTORY_SEPARATOR)))
        return response()->json(['ok'=>false,'error'=>'UNSAFE_STORAGE_PATH'],403);
      $target=$canonical.DIRECTORY_SEPARATOR.$name;
      if(is_link($target)||is_dir($target))
        return response()->json(['ok'=>false,'error'=>'UNSAFE_DESTINATION'],403);
      $tmp=tempnam($canonical,'.p2lrn-');
      if($tmp===false)throw new \RuntimeException('STORAGE_UNAVAILABLE');
      try {
        @chmod($tmp,0600);
        if(file_put_contents($tmp,$data,LOCK_EX)!==strlen($data))
          throw new \RuntimeException('STORAGE_UNAVAILABLE');
        if(is_link($target)||!@rename($tmp,$target))
          throw new \RuntimeException('STORAGE_UNAVAILABLE');
        $tmp=null;
      } finally {if($tmp!==null && is_file($tmp))@unlink($tmp);}
      return response()->json(['ok'=>true,'filename'=>$name,'bytes'=>strlen($data)]);
    } catch(\InvalidArgumentException $e) {
      return response()->json(['ok'=>false,'error'=>'INVALID_FILENAME'],400);
    } catch(\LengthException $e) {
      return response()->json(['ok'=>false,'error'=>'UPLOAD_TOO_LARGE'],413);
    } catch(\Throwable $e) {
      return response()->json(['ok'=>false,'error'=>'STORAGE_UNAVAILABLE'],507);
    }
  }
  public function read(Request $request) {
    if($denied=$this->guard($request,'read'))return $denied;
    try {
      return response($this->bridge('read',$request,'document.bin',self::MAX_READER_BYTES),200)
        ->header('Content-Type','application/json; charset=utf-8');
    } catch(\InvalidArgumentException $e) {
      return response()->json(['ok'=>false,'error'=>'INVALID_FILENAME'],400);
    } catch(\LengthException $e) {
      return response()->json(['ok'=>false,'error'=>'UPLOAD_TOO_LARGE'],413);
    } catch(\Throwable $e) {
      return response()->json(['ok'=>false,'error'=>'READER_FAILED'],422);
    }
  }
  public function importPackage(Request $request) {
    if($denied=$this->guard($request,'import'))return $denied;
    try {
      return response($this->bridge('import',$request,'package.zip',self::MAX_COURSE_BYTES),200)
        ->header('Content-Type','application/vnd.p2lrn+zip');
    } catch(\InvalidArgumentException $e) {
      return response()->json(['ok'=>false,'error'=>'INVALID_FILENAME'],400);
    } catch(\LengthException $e) {
      return response()->json(['ok'=>false,'error'=>'UPLOAD_TOO_LARGE'],413);
    } catch(\Throwable $e) {
      return response()->json(['ok'=>false,'error'=>'IMPORT_FAILED'],422);
    }
  }
}
