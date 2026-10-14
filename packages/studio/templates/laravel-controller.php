<?php
namespace App\Http\Controllers;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
class P2LRNStudioController extends Controller {
  private function bridge(string $action,Request $request,string $fallback):string {
    $raw=$request->header('X-P2LRN-Filename',$fallback);
    $name=rawurldecode($raw);
    $bridge=base_path('p2lrn-setup/p2lrn-studio-bridge.mjs');
    $spec=[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']];
    $process=proc_open(['node',$bridge,$action,$name,$request->header('Content-Type','application/octet-stream')],$spec,$pipes,base_path());
    if(!is_resource($process))throw new \RuntimeException('Unable to start P2LRN Studio bridge');
    fwrite($pipes[0],$request->getContent()); fclose($pipes[0]);
    $out=stream_get_contents($pipes[1]); fclose($pipes[1]);
    $err=stream_get_contents($pipes[2]); fclose($pipes[2]);
    $code=proc_close($process);
    if($code!==0)throw new \RuntimeException(trim($err)?:'P2LRN Studio bridge failed');
    return $out;
  }
  public function save(Request $request){
    $dir=base_path('__COURSE_PATH__'); File::ensureDirectoryExists($dir);
    $name=basename($request->header('X-P2LRN-Filename','course.p2lrn'));
    file_put_contents($dir.DIRECTORY_SEPARATOR.$name,$request->getContent());
    return response()->json(['ok'=>true,'filename'=>$name]);
  }
  public function read(Request $request){
    try{return response($this->bridge('read',$request,'document.bin'),200)->header('Content-Type','application/json; charset=utf-8');}
    catch(\Throwable $e){return response()->json(['ok'=>false,'error'=>$e->getMessage()],422);}
  }
  public function importPackage(Request $request){
    try{return response($this->bridge('import',$request,'package.zip'),200)->header('Content-Type','application/vnd.p2lrn+zip');}
    catch(\Throwable $e){return response()->json(['ok'=>false,'error'=>$e->getMessage()],422);}
  }
}
