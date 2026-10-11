import {handleP2LRNStudioExternalImport} from '@p2lrn/studio/server';

export async function POST(request: Request) {
  return handleP2LRNStudioExternalImport(request);
}
