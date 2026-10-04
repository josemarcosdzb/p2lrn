<?php
namespace App\Controller;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
final class P2LRNStudioController {
  #[Route('__ENDPOINT__',methods:['POST'])]
  public function save(Request $request):JsonResponse {
    $dir=getcwd().DIRECTORY_SEPARATOR.'__COURSE_PATH__';
    if(!is_dir($dir))mkdir($dir,0775,true);
    $name=basename($request->headers->get('X-P2LRN-Filename','course.p2lrn'));
    file_put_contents($dir.DIRECTORY_SEPARATOR.$name,$request->getContent());
    return new JsonResponse(['ok'=>true,'filename'=>$name]);
  }
}
