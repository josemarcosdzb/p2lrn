import {lstat,mkdir,mkdtemp,readFile,realpath,rename,rm,unlink,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {basename,join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';

const DEFAULT_MAX_BYTES=512*1024*1024;

function uploadError(statusCode,message){return Object.assign(new Error(message),{statusCode});}
async function receiveBodyBounded(request,maxBytes){
  const limit=Number(maxBytes);
  if(!Number.isSafeInteger(limit)||limit<1)throw new TypeError('Invalid Studio maxBytes limit.');
  const header=request.headers.get('content-length');
  if(header!==null){
    if(!/^(0|[1-9][0-9]*)$/.test(header.trim()))throw uploadError(400,'Invalid Content-Length.');
    if(Number(header)>limit)throw uploadError(413,'Studio upload exceeds size limit.');
  }
  if(!request.body)return new Uint8Array(0);
  const reader=request.body.getReader();const chunks=[];let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      if(!(value instanceof Uint8Array))throw uploadError(400,'Invalid Studio request body chunk.');
      total+=value.byteLength;
      if(total>limit)throw uploadError(413,'Studio upload exceeds size limit.');
      chunks.push(value);
    }
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;
  for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
  return bytes;
}
async function readUpload(request,maxBytes,label){
  try{return {bytes:await receiveBodyBounded(request,maxBytes)};}
  catch(error){if(error?.statusCode===413)return {response:new Response(label+' too large',{status:413})};
    if(error?.statusCode===400)return {response:new Response('Invalid request body',{status:400})};throw error;}
}
async function assertWithinStorageRoot(root,target){
  const canonicalRoot=await realpath(resolve(root));
  const canonicalDir=await realpath(target.dir);
  if(canonicalDir!==canonicalRoot&&!canonicalDir.startsWith(canonicalRoot+sep))throw new Error('Studio destination escapes storage root through a symbolic link.');
  let existing;try{existing=await lstat(target.file);}catch(error){if(error?.code!=='ENOENT')throw error;}
  if(existing?.isSymbolicLink())throw new Error('Studio destination must not be a symbolic link.');
  if(existing){const canonicalFile=await realpath(target.file);
    if(canonicalFile!==canonicalRoot&&!canonicalFile.startsWith(canonicalRoot+sep))throw new Error('Studio destination escapes storage root.');}
}

function safeSegment(value,label){
  const text=String(value??'').trim();
  if(!text||text==='.'||text==='..'||text.includes('\\')||text.includes('\0'))throw new Error('Invalid '+label+'.');
  if(text.split('/').some((part)=>!part||part==='.'||part==='..'))throw new Error('Unsafe '+label+'.');
  return text.replace(/^\/+|\/+$/g,'');
}
function safeFilename(value){
  const name=basename(String(value||'course.p2lrn')).replace(/[^A-Za-z0-9._-]+/g,'-');
  const filename=name.toLowerCase().endsWith('.p2lrn')?name:name+'.p2lrn';
  // Apache and other servers may treat ANY extension in a multi-extension
  // filename as executable (e.g. shell.php.p2lrn). Do not create these files.
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.p2lrn$/i.test(filename)||
      /\.(?:php[0-9]*|phtml|phar|cgi|asp|aspx|jsp|shtml)\./i.test(filename))
    throw new Error('Unsafe Studio course filename.');
  return filename;
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
  await assertWithinStorageRoot(root,target);
  // Never truncate an existing destination in place. In particular, a
  // symlink swapped into the destination after validation must be replaced,
  // not followed. A failed write leaves the previous course intact.
  const temporary=target.file+'.'+randomUUID()+'.tmp';
  try{
    await writeFile(temporary,body,{flag:'wx',mode:0o600});
    await assertWithinStorageRoot(root,target);
    await rename(temporary,target.file);
  }finally{await unlink(temporary).catch(()=>{});}
  return {ok:true,path:target.file,coursePath:safeSegment(coursePath||'course','course path'),filename:safeFilename(filename),bytes:body.byteLength};
}

export async function handleP2LRNStudioSave(request,{root=process.cwd(),coursePath='course',allowClientPath=false,maxBytes=DEFAULT_MAX_BYTES}={}){
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405,headers:{Allow:'POST'}});
  const upload=await readUpload(request,maxBytes,'Package');
  if(upload.response)return upload.response;
  const body=upload.bytes;
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
  const upload=await readUpload(request,maxBytes,'Document');
  if(upload.response)return upload.response;
  const body=upload.bytes;
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
  const upload=await readUpload(request,maxBytes,'Package');
  if(upload.response)return upload.response;
  const body=upload.bytes;
  let filename='package.zip';const raw=request.headers.get('x-p2lrn-filename');if(raw){try{filename=decodeURIComponent(raw);}catch{filename=raw;}}
  try{
    const result=await convertP2LRNStudioExternalPackage(body,{filename});
    const kind=String(result.report?.detectedFormat??'external');
    return new Response(result.bytes,{status:200,headers:{'Content-Type':'application/vnd.p2lrn+zip','X-P2LRN-External-Kind':encodeURIComponent(kind)}});
  }catch(error){
    return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:422});
  }
}
