import {saveP2LRNStudioPackage,readP2LRNStudioDocument,convertP2LRNStudioExternalPackage} from '@p2lrn/studio/server';

const name=(c,fallback)=>{const value=c.req.header('x-p2lrn-filename')||fallback;try{return decodeURIComponent(value)}catch{return value}};
const bytes=async(c)=>new Uint8Array(await c.req.arrayBuffer());

export function installP2LRNStudio(app){
  app.post('__ENDPOINT__',async(c)=>c.json(await saveP2LRNStudioPackage(await bytes(c),{coursePath:'__COURSE_PATH__',filename:name(c,'course.p2lrn')})));
  app.post('__READER_ENDPOINT__',async(c)=>c.json(await readP2LRNStudioDocument(await bytes(c),{filename:name(c,'document.bin'),mediaType:c.req.header('content-type')})));
  app.post('__IMPORT_ENDPOINT__',async(c)=>{const result=await convertP2LRNStudioExternalPackage(await bytes(c),{filename:name(c,'package.zip')});return new Response(result.bytes,{headers:{'content-type':'application/vnd.p2lrn+zip'}})});
}
