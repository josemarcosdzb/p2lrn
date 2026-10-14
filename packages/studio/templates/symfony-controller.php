<?php
namespace App\Controller;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
final class P2LRNStudioController {
  private function bridge(string $action,Request $request,string $fallback):string {
    $raw=$request->headers->get('X-P2LRN-Filename',$fallback);
    $name=rawurldecode($raw);
    $bridge=getcwd().DIRECTORY_SEPARATOR.'p2lrn-setup'.DIRECTORY_SEPARATOR.'p2lrn-studio-bridge.mjs';
    $spec=[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']];
    $process=proc_open(['node',$bridge,$action,$name,$request->headers->get('Content-Type','application/octet-stream')],$spec,$pipes,getcwd());
    if(!is_resource($process))throw new \RuntimeException('Unable to start P2LRN Studio bridge');
    fwrite($pipes[0],$request->getContent()); fclose($pipes[0]);
    $out=stream_get_contents($pipes[1]); fclose($pipes[1]);
    $err=stream_get_contents($pipes[2]); fclose($pipes[2]);
    $code=proc_close($process);
    if($code!==0)throw new \RuntimeException(trim($err)?:'P2LRN Studio bridge failed');
    return $out;
  }
  #[Route('__ENDPOINT__',methods:['POST'])]
  public function save(Request $request):JsonResponse {
    $dir=getcwd().DIRECTORY_SEPARATOR.'__COURSE_PATH__';
    if(!is_dir($dir))mkdir($dir,0775,true);
    $name=basename($request->headers->get('X-P2LRN-Filename','course.p2lrn'));
    file_put_contents($dir.DIRECTORY_SEPARATOR.$name,$request->getContent());
    return new JsonResponse(['ok'=>true,'filename'=>$name]);
  }
  #[Route('__READER_ENDPOINT__',methods:['POST'])]
  public function read(Request $request):Response {
    try{return new Response($this->bridge('read',$request,'document.bin'),200,['Content-Type'=>'application/json; charset=utf-8']);}
    catch(\Throwable $e){return new JsonResponse(['ok'=>false,'error'=>$e->getMessage()],422);}
  }
  #[Route('__IMPORT_ENDPOINT__',methods:['POST'])]
  public function importPackage(Request $request):Response {
    try{return new Response($this->bridge('import',$request,'package.zip'),200,['Content-Type'=>'application/vnd.p2lrn+zip']);}
    catch(\Throwable $e){return new JsonResponse(['ok'=>false,'error'=>$e->getMessage()],422);}
  }
}
