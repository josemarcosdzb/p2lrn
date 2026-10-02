import {mkdir,writeFile} from 'node:fs/promises';
import {basename,resolve,sep} from 'node:path';

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

export async function handleP2LRNStudioSave(request,{root=process.cwd(),maxBytes=DEFAULT_MAX_BYTES}={}){
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{Allow:'POST'}});
  const length=Number(request.headers.get('content-length')||0);
  if(length>maxBytes)return new Response('Package too large',{status:413});
  const body=new Uint8Array(await request.arrayBuffer());
  if(body.byteLength>maxBytes)return new Response('Package too large',{status:413});
  const result=await saveP2LRNStudioPackage(body,{
    root,
    coursePath:request.headers.get('x-p2lrn-path')||'course',
    filename:request.headers.get('x-p2lrn-filename')||'course.p2lrn',
  });
  return Response.json({ok:true,coursePath:result.coursePath,filename:result.filename,bytes:result.bytes});
}
