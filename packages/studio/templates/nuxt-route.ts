import {saveP2LRNStudioPackage} from '@p2lrn/studio/server';

export default defineEventHandler(async (event) => {
  const raw=await readRawBody(event,false);
  const body=new Uint8Array(Buffer.from(raw||''));
  return saveP2LRNStudioPackage(body,{coursePath:'__COURSE_PATH__',filename:getHeader(event,'x-p2lrn-filename')||'course.p2lrn'});
});
