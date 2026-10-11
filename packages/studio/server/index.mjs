import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {basename,join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';

const DEFAULT_MAX_BYTES=512*1024*1024;

function safeSegment(value,label){
  const text=String(value??'').trim();
  if(!text||text==='.'||text==='..'||text.includes('\\')||text.includes('\0'))throw new Error('Invalid '+label+'.');
  if(text.split('/').some((part)=>!part||part==='.'||part==='..'))throw new Error('Unsafe '+label+'.');
  return text.replace(/^\/+|\/+$/g,'');
}
function safeFilename(value){
  const name=basename(String(value||'course.p2lrn')).replace(/[^A-Za-z0-9._-]+/g,'-');
  return name.toLowerCase().endsWith('.p2lrn')?name:name+'.p2lrn';
}
function destination(root,coursePath,filename){
  const base=resolve(root);
  const dir=resolve(base,...safeSegment(coursePath||'course','course path').split('/'));
  if(dir!==base&&!dir.startsWith(base+sep))throw new Error('Course path escapes storage root.');
  return {dir,file:resolve(dir,safeFilename(filename))};
}

export async function saveP2LRNStudioPackage(bytes,{root=process.cwd(),coursePath='course',filename='course.p2lrn'}={}){
  const body=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const target=destination(root,coursePath,filename);
  await mkdir(target.dir,{recursive:true});
  await writeFile(target.file,body,{flag:'w'});
  return {ok:true,path:target.file,coursePath:safeSegment(coursePath||'course','course path'),filename:safeFilename(filename),bytes:body.byteLength};
}

export async function handleP2LRNStudioSave(request,{root=process.cwd(),coursePath='course',allowClientPath=false,maxBytes=DEFAULT_MAX_BYTES}={}){
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{Allow:'POST'}});
  const length=Number(request.headers.get('content-length')||0);
  if(length>maxBytes)return new Response('Package too large',{status:413});
  const body=new Uint8Array(await request.arrayBuffer());
  if(body.byteLength>maxBytes)return new Response('Package too large',{status:413});
  const result=await saveP2LRNStudioPackage(body,{
    root,
    coursePath:allowClientPath?(request.headers.get('x-p2lrn-path')||coursePath):coursePath,
    filename:request.headers.get('x-p2lrn-filename')||'course.p2lrn',
  });
  return Response.json({ok:true,coursePath:result.coursePath,filename:result.filename,bytes:result.bytes});
}


export async function readP2LRNStudioDocument(bytes,{filename='document.bin',mediaType}={}){
  const body=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const {readDocument}=await import('@p2lrn/toolkit/document-reader');
  return readDocument({name:String(filename||'document.bin'),data:body,mediaType:mediaType?String(mediaType):undefined});
}

export async function handleP2LRNStudioReader(request,{maxBytes=128*1024*1024}={}){
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{Allow:'POST'}});
  const length=Number(request.headers.get('content-length')||0);
  if(length>maxBytes)return new Response('Document too large',{status:413});
  const body=new Uint8Array(await request.arrayBuffer());
  if(body.byteLength>maxBytes)return new Response('Document too large',{status:413});
  let filename='document.bin';
  const raw=request.headers.get('x-p2lrn-filename');
  if(raw){try{filename=decodeURIComponent(raw);}catch{filename=raw;}}
  try{
    const result=await readP2LRNStudioDocument(body,{filename,mediaType:request.headers.get('content-type')||undefined});
    return Response.json(result);
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:422});
  }
}


export async function convertP2LRNStudioExternalPackage(bytes,{filename='package.zip'}={}){
  const body=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const work=await mkdtemp(join(tmpdir(),'p2lrn-studio-import-'));
  const source=join(work,basename(String(filename||'package.zip')).replace(/[^A-Za-z0-9._-]+/g,'-')||'package.zip');
  const output=join(work,'converted.p2lrn');
  try{
    await writeFile(source,body);
    const {convertExternalPackage}=await import('@p2lrn/toolkit/creator');
    const report=convertExternalPackage(source,output);
    return {bytes:new Uint8Array(await readFile(output)),report};
  }finally{
    await rm(work,{recursive:true,force:true}).catch(()=>{});
  }
}

export async function handleP2LRNStudioExternalImport(request,{maxBytes=512*1024*1024}={}){
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{Allow:'POST'}});
  const length=Number(request.headers.get('content-length')||0);
  if(length>maxBytes)return new Response('Package too large',{status:413});
  const body=new Uint8Array(await request.arrayBuffer());
  if(body.byteLength>maxBytes)return new Response('Package too large',{status:413});
  let filename='package.zip';const raw=request.headers.get('x-p2lrn-filename');if(raw){try{filename=decodeURIComponent(raw);}catch{filename=raw;}}
  try{
    const result=await convertP2LRNStudioExternalPackage(body,{filename});
    const kind=String(result.report?.detectedFormat??'external');
    return new Response(result.bytes,{status:200,headers:{'Content-Type':'application/vnd.p2lrn+zip','X-P2LRN-External-Kind':encodeURIComponent(kind)}});
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:422});
  }
}
