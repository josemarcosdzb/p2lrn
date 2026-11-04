// Configure the Host's authenticate(), authorize() and checkCsrf()
// callbacks below. Until then, the generated route returns HTTP 503;
// it never accepts an unauthenticated or cross-course file upload.
import {handleP2LRNStudioReader,authorizeP2LRNStudioRequest} from '@p2lrn/studio/server';

export async function POST(request:Request){
  const denied=await authorizeP2LRNStudioRequest(request,{operation:'read',coursePath:'__COURSE_PATH__'});
  if(denied)return denied;
  return handleP2LRNStudioReader(request);
}
