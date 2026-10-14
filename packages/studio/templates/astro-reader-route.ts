import type {APIRoute} from 'astro';
import {handleP2LRNStudioReader} from '@p2lrn/studio/server';

export const POST: APIRoute = ({request}) => handleP2LRNStudioReader(request);
