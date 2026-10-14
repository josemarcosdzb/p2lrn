import {handleP2LRNStudioExternalImport} from '@p2lrn/studio/server';

export const POST = ({request}: {request: Request}) =>
  handleP2LRNStudioExternalImport(request);
