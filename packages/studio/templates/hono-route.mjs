import {
  handleP2LRNStudioSave,handleP2LRNStudioReader,
  handleP2LRNStudioExternalImport,authorizeP2LRNStudioRequest,
} from '@p2lrn/studio/server';

// Hono Fetch Requests use the shared bounded Upload handlers. Reading
// c.req.arrayBuffer() directly allowed unbounded allocations.
export function installP2LRNStudio(app,{authenticate,authorize,checkCsrf}={}){
  if([authenticate,authorize,checkCsrf].some(fn=>typeof fn!=='function'))
    throw new TypeError('Studio Host must configure authenticate, authorize and checkCsrf.');
  const guard=(operation,handler,options)=>async(c)=>{
    const request=c.req.raw;
    const denied=await authorizeP2LRNStudioRequest(request,{
      operation,coursePath:'__COURSE_PATH__',authenticate,authorize,checkCsrf,
    });
    if(denied)return denied;
    return handler(request,options);
  };
  app.post('__ENDPOINT__',guard('save',handleP2LRNStudioSave,{
    coursePath:'__COURSE_PATH__',allowClientPath:false,
  }));
  app.post('__READER_ENDPOINT__',guard('read',handleP2LRNStudioReader));
  app.post('__IMPORT_ENDPOINT__',guard('import',handleP2LRNStudioExternalImport));
}
