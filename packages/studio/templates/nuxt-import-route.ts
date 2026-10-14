import {convertP2LRNStudioExternalPackage} from '@p2lrn/studio/server';

export default defineEventHandler(async (event) => {
  const raw=await readRawBody(event,false);
  const body=new Uint8Array(Buffer.from(raw||''));
  const encoded=getHeader(event,'x-p2lrn-filename')||'package.zip';
  let filename=encoded; try{filename=decodeURIComponent(encoded)}catch{}
  const result=await convertP2LRNStudioExternalPackage(body,{filename});
  setResponseHeader(event,'content-type','application/vnd.p2lrn+zip');
  return Buffer.from(result.bytes);
});
