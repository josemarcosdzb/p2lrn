import {handleP2LRNStudioReader} from '@p2lrn/studio/server';

export async function POST(request: Request) {
  return handleP2LRNStudioReader(request);
}
