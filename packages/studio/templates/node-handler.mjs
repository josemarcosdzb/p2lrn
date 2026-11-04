import {
  handleP2LRNStudioSave,handleP2LRNStudioReader,
  handleP2LRNStudioExternalImport,authorizeP2LRNStudioRequest,
  saveP2LRNStudioPackage,readP2LRNStudioDocument,convertP2LRNStudioExternalPackage,
} from '@p2lrn/studio/server';

export {
  handleP2LRNStudioSave,handleP2LRNStudioReader,handleP2LRNStudioExternalImport,
  saveP2LRNStudioPackage,readP2LRNStudioDocument,convertP2LRNStudioExternalPackage,
};

// The Host must provide real session, course permission and CSRF callbacks.
// Missing callbacks fail closed rather than exposing unauthenticated uploads.
export async function handleP2LRNStudioRequest(request,{authenticate,authorize,checkCsrf}={}){
  const pathname=new URL(request.url).pathname;
  const operation=pathname==='__ENDPOINT__'?'save':
    pathname==='__READER_ENDPOINT__'?'read':
    pathname==='__IMPORT_ENDPOINT__'?'import':null;
  if(!operation)return new Response('Not Found',{status:404});
  const denied=await authorizeP2LRNStudioRequest(request,{
    operation,coursePath:'__COURSE_PATH__',authenticate,authorize,checkCsrf,
  });
  if(denied)return denied;
  if(operation==='save')return handleP2LRNStudioSave(request,{
    coursePath:'__COURSE_PATH__',allowClientPath:false,
  });
  if(operation==='read')return handleP2LRNStudioReader(request);
  return handleP2LRNStudioExternalImport(request);
}
