import type {ActionFunctionArgs} from '@remix-run/node';
// Configure the Host's authenticate(), authorize() and checkCsrf()
// callbacks below. Until then, the generated route returns HTTP 503;
// it never accepts an unauthenticated or cross-course file upload.
import {handleP2LRNStudioExternalImport,authorizeP2LRNStudioRequest} from '@p2lrn/studio/server';

export async function action({request}:ActionFunctionArgs){
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405});
  const denied=await authorizeP2LRNStudioRequest(request,{operation:'import',coursePath:'__COURSE_PATH__'});
  if(denied)return denied;
  return handleP2LRNStudioExternalImport(request);
}
