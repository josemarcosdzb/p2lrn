import {handleP2LRNStudioReader} from '@p2lrn/studio/server';

export const POST = ({request}: {request: Request}) =>
  handleP2LRNStudioReader(request);
