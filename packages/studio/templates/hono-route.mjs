import {saveP2LRNStudioPackage} from '@p2lrn/studio/server';

export function installP2LRNStudio(app){
  app.post('__ENDPOINT__',async(c)=>{
    const body=new Uint8Array(await c.req.arrayBuffer());
    return c.json(await saveP2LRNStudioPackage(body,{coursePath:'__COURSE_PATH__',filename:c.req.header('x-p2lrn-filename')||'course.p2lrn'}));
  });
}
