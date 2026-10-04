<?php
namespace App\Http\Controllers;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
class P2LRNStudioController extends Controller {
  public function save(Request $request){
    $dir=base_path('__COURSE_PATH__');
    File::ensureDirectoryExists($dir);
    $name=basename($request->header('X-P2LRN-Filename','course.p2lrn'));
    file_put_contents($dir.DIRECTORY_SEPARATOR.$name,$request->getContent());
    return response()->json(['ok'=>true,'filename'=>$name]);
  }
}
