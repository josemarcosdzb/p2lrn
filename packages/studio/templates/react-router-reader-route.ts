import {handleP2LRNStudioReader} from '@p2lrn/studio/server';

export async function action({request}:{request:Request}){
  return handleP2LRNStudioReader(request);
}
