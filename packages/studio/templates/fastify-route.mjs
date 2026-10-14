import {saveP2LRNStudioPackage,readP2LRNStudioDocument,convertP2LRNStudioExternalPackage} from '@p2lrn/studio/server';

const filename=(req,fallback)=>{const value=req.headers['x-p2lrn-filename']||fallback;try{return decodeURIComponent(String(value))}catch{return String(value)}};

export async function installP2LRNStudio(app){
  await app.register(async(instance)=>{
    instance.removeContentTypeParser('application/json');
    instance.removeContentTypeParser('text/plain');
    instance.addContentTypeParser('*',{parseAs:'buffer',bodyLimit:512*1024*1024},(req,body,done)=>done(null,body));
    instance.post('__ENDPOINT__',{bodyLimit:512*1024*1024},async(req)=>saveP2LRNStudioPackage(req.body,{coursePath:'__COURSE_PATH__',filename:filename(req,'course.p2lrn')}));
    instance.post('__READER_ENDPOINT__',{bodyLimit:128*1024*1024},async(req)=>readP2LRNStudioDocument(req.body,{filename:filename(req,'document.bin'),mediaType:req.headers['content-type']}));
    instance.post('__IMPORT_ENDPOINT__',{bodyLimit:512*1024*1024},async(req,reply)=>{const result=await convertP2LRNStudioExternalPackage(req.body,{filename:filename(req,'package.zip')});reply.type('application/vnd.p2lrn+zip');return Buffer.from(result.bytes)});
  });
}
