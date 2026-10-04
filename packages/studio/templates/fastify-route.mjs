import {saveP2LRNStudioPackage} from '@p2lrn/studio/server';

export async function installP2LRNStudio(app){
  app.addContentTypeParser('application/vnd.p2lrn+zip',{parseAs:'buffer'},(req,body,done)=>done(null,body));
  app.post('__ENDPOINT__',async(req)=>saveP2LRNStudioPackage(req.body,{coursePath:'__COURSE_PATH__',filename:req.headers['x-p2lrn-filename']||'course.p2lrn'}));
}
