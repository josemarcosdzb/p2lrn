import {handleP2LRNStudioSave,handleP2LRNStudioReader,handleP2LRNStudioExternalImport,saveP2LRNStudioPackage,readP2LRNStudioDocument,convertP2LRNStudioExternalPackage} from '@p2lrn/studio/server';

export {handleP2LRNStudioSave,handleP2LRNStudioReader,handleP2LRNStudioExternalImport,saveP2LRNStudioPackage,readP2LRNStudioDocument,convertP2LRNStudioExternalPackage};

export async function handleP2LRNStudioRequest(request){
  const pathname=new URL(request.url).pathname;
  if(pathname==='__ENDPOINT__')return handleP2LRNStudioSave(request,{coursePath:'__COURSE_PATH__'});
  if(pathname==='__READER_ENDPOINT__')return handleP2LRNStudioReader(request);
  if(pathname==='__IMPORT_ENDPOINT__')return handleP2LRNStudioExternalImport(request);
  return new Response('Not Found',{status:404});
}
