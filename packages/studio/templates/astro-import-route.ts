import type {APIRoute} from 'astro';
import {handleP2LRNStudioExternalImport} from '@p2lrn/studio/server';

export const POST: APIRoute = ({request}) => handleP2LRNStudioExternalImport(request);
