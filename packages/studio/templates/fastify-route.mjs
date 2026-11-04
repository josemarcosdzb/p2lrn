import {
  saveP2LRNStudioPackage,readP2LRNStudioDocument,
  convertP2LRNStudioExternalPackage,
} from '@p2lrn/studio/server';
const filename=(req,fallback)=>{
  const value=req.headers['x-p2lrn-filename']||fallback;
  try{return decodeURIComponent(String(value));}catch{return String(value);}
};
// Fastify's onRequest executes before body parsing. Require authenticated,
// course-scoped Host permission and CSRF before allocating any upload buffer.
export async function installP2LRNStudio(app,{authenticate,authorize,checkCsrf}={}){
  if([authenticate,authorize,checkCsrf].some(fn=>typeof fn!=='function'))
    throw new TypeError('Studio Host must configure authenticate, authorize and checkCsrf.');
  const guard=operation=>async(req,reply)=>{
    const error=(code,message)=>reply.code(code).send({ok:false,error:message});
    try{
      const principal=await authenticate(req);
      if(!principal)return error(401,'AUTHENTICATION_REQUIRED');
      if((await authorize({principal,operation,coursePath:'__COURSE_PATH__',request:req}))!==true)
        return error(403,'COURSE_ACCESS_DENIED');
      if((await checkCsrf(req,principal))!==true)return error(403,'CSRF_DENIED');
    }catch{return error(403,'AUTHORIZATION_FAILED');}
  };
  await app.register(async(instance)=>{
    instance.removeContentTypeParser('application/json');
    instance.removeContentTypeParser('text/plain');
    instance.addContentTypeParser('*',{parseAs:'buffer',bodyLimit:512*1024*1024},(req,body,done)=>done(null,body));
    instance.post('__ENDPOINT__',{bodyLimit:512*1024*1024,onRequest:guard('save')},
      async req=>saveP2LRNStudioPackage(req.body,{
        coursePath:'__COURSE_PATH__',filename:filename(req,'course.p2lrn'),
      }));
    instance.post('__READER_ENDPOINT__',{bodyLimit:128*1024*1024,onRequest:guard('read')},
      async req=>readP2LRNStudioDocument(req.body,{
        filename:filename(req,'document.bin'),mediaType:req.headers['content-type'],
      }));
    instance.post('__IMPORT_ENDPOINT__',{bodyLimit:512*1024*1024,onRequest:guard('import')},
      async(req,reply)=>{
        const result=await convertP2LRNStudioExternalPackage(req.body,{filename:filename(req,'package.zip')});
        reply.type('application/vnd.p2lrn+zip');
        return Buffer.from(result.bytes);
      });
  });
}
