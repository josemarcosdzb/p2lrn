import {handleP2LRNStudioSave} from '@p2lrn/studio/server';

export const POST = ({request}: {request: Request}) =>
  handleP2LRNStudioSave(request,{coursePath:'__COURSE_PATH__'});
