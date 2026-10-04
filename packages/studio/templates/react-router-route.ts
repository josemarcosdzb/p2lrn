import {handleP2LRNStudioSave} from '@p2lrn/studio/server';

export async function action({request}:{request:Request}){
  return handleP2LRNStudioSave(request,{coursePath:'__COURSE_PATH__'});
}
