import {readP2LRNStudioDocument} from '@p2lrn/studio/server';

export default defineEventHandler(async (event) => {
  const raw=await readRawBody(event,false);
  const body=new Uint8Array(Buffer.from(raw||''));
  const encoded=getHeader(event,'x-p2lrn-filename')||'document.bin';
  let filename=encoded; try{filename=decodeURIComponent(encoded)}catch{}
  return readP2LRNStudioDocument(body,{filename,mediaType:getHeader(event,'content-type')||undefined});
});
