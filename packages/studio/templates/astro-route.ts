import type {APIRoute} from 'astro';
import {handleP2LRNStudioSave} from '@p2lrn/studio/server';

export const POST: APIRoute = ({request}) =>
  handleP2LRNStudioSave(request,{coursePath:'__COURSE_PATH__'});
