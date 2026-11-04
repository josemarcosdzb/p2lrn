import express from 'express';
import {
  handleP2LRNStudioSave,
  handleP2LRNStudioReader,
  handleP2LRNStudioExternalImport,
} from '@p2lrn/studio/server';

// The Host must authorize users, courses and origins before these routes.
// Express only adapts the HTTP surface; validation and status codes belong to
// the same shared P2LRN handlers used by other frameworks.
const raw=(limit)=>express.raw({type:'*/*',limit});

function asWebRequest(req){
  const headers=new Headers();
  for(const name of ['content-type','x-p2lrn-filename','x-p2lrn-path']){
    const value=req.get(name);
    if(value!==undefined&&value!==null)headers.set(name,value);
  }
  const bytes=req.body instanceof Uint8Array?req.body:new Uint8Array();
  return new Request('http://p2lrn.internal'+req.path,{method:'POST',headers,body:bytes});
}

async function delegate(req,res,next,handler,options){
  try{
    const response=await handler(asWebRequest(req),options);
    res.status(response.status);
    response.headers.forEach((value,name)=>res.set(name,value));
    res.send(Buffer.from(await response.arrayBuffer()));
  }catch(error){next(error)}
}

// Secure by default: the Host MUST supply real session, course permissions
// and CSRF verification before P2LRN ever receives or parses an upload.
export function installP2LRNStudio(app,{authenticate,authorize,verifyCsrf}={}){
  if([authenticate,authorize,verifyCsrf].some(callback=>typeof callback!=='function'))
    throw new TypeError('P2LRN Studio requires authenticate, authorize and verifyCsrf Host callbacks.');
  const protect=(operation)=>async(req,res,next)=>{
    try{
      const principal=await authenticate(req);
      if(!principal){res.status(401).json({ok:false,error:'Authentication required'});return;}
      if((await authorize({principal,operation,coursePath:'__COURSE_PATH__',req}))!==true){
        res.status(403).json({ok:false,error:'Course access denied'});return;
      }
      if((await verifyCsrf(req,principal))!==true){
        res.status(403).json({ok:false,error:'CSRF denied'});return;
      }
      next();
    }catch(error){next(error);}
  };
  app.post('__ENDPOINT__',protect('save'),raw('512mb'),(req,res,next)=>{
    void delegate(req,res,next,handleP2LRNStudioSave,{
      root:process.cwd(),coursePath:'__COURSE_PATH__',allowClientPath:false,
    });
  });
  app.post('__READER_ENDPOINT__',protect('read'),raw('128mb'),(req,res,next)=>{
    void delegate(req,res,next,handleP2LRNStudioReader);
  });
  app.post('__IMPORT_ENDPOINT__',protect('import'),raw('512mb'),(req,res,next)=>{
    void delegate(req,res,next,handleP2LRNStudioExternalImport);
  });
}
