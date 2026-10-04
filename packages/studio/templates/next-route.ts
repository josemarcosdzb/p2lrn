import {handleP2LRNStudioSave} from '@p2lrn/studio/server';

export async function POST(request: Request) {
  return handleP2LRNStudioSave(request, {coursePath: '__COURSE_PATH__'});
}
