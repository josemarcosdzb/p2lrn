import type {ActionFunctionArgs} from '@remix-run/node';
import {handleP2LRNStudioSave} from '@p2lrn/studio/server';

export async function action({request}:ActionFunctionArgs){
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405});
  return handleP2LRNStudioSave(request,{coursePath:'__COURSE_PATH__'});
}
