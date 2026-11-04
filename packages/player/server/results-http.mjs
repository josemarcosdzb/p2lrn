// Optional reference Host implementation: authenticated P2LRN result files.
// Mount under an existing platform server; it does NOT implement login or
// decide which courses a user may access. Both callbacks must be supplied.
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,mkdir,readdir,stat,unlink} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute} from 'node:path';

const RESULT_SCHEMA='https://p2lrn.org/schema/offline-result/1';
const INDEX_SCHEMA='https://p2lrn.org/schema/analytics-results-index/1';
const LIMIT=5*1024*1024,MAX_RESULTS=500,MAX_JSON_DEPTH=128,MAX_JSON_NODES=200000;
const sha=x=>createHash('sha256').update(x).digest('hex');
const clean=x=>typeof x==='string'&&x.trim().length<=512?x.trim():'';
const failure=(code,status=422)=>Object.assign(new Error(code),{code,status});
function canonical(v){
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'){
  if(!Number.isFinite(v)||Number.isInteger(v)&&!Number.isSafeInteger(v))throw failure('INVALID_NUMBER');
  return JSON.stringify(v);
 }
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 throw failure('INVALID_JSON_TYPE');
}
// Length-safe learner identifiers. The old colon-delimited key could collide
// for distinct (issuer,subject) pairs containing a colon.
const actorKey=who=>sha(JSON.stringify([who.mode,who.issuer,who.subject]));
const legacyActorKey=who=>sha(who.mode+':'+who.issuer+':'+who.subject);
function validateComplexity(root){
 const pending=[{value:root,depth:0}];let nodes=0;
 while(pending.length){
  const {value,depth}=pending.pop();
  if(depth>MAX_JSON_DEPTH||++nodes>MAX_JSON_NODES)throw failure('RESULT_COMPLEXITY_LIMIT',422);
  if(value&&typeof value==='object'){
   for(const child of (Array.isArray(value)?value:Object.values(value)))
    pending.push({value:child,depth:depth+1});
  }
 }
}
function identityOf(principal){
 const tenant=clean(principal?.tenantId),issuer=clean(principal?.issuer);
 const mode=principal?.mode==='code'?'code':'platform';
 const subject=mode==='code'?clean(principal?.code):clean(principal?.subjectId);
 if(!tenant||!issuer||!subject)throw failure('UNAUTHENTICATED',401);
 return {tenant,issuer,subject,mode};
}
function validateResult(result,who){
 validateComplexity(result);
 if(!result||typeof result!=='object'||Array.isArray(result)||
    result.schema!==RESULT_SCHEMA||result.version!=='1'||
    !['in_progress','submitted'].includes(result.attempt?.status))
  throw failure('INVALID_RESULT_SCHEMA');
 const courseId=clean(result.assignment?.packageId),attemptId=clean(result.attempt?.id);
 if(!courseId||!attemptId||!Number.isSafeInteger(result.attempt?.number)||result.attempt.number<1||
    !Number.isFinite(Date.parse(result.attempt?.startedAt))||
    (result.attempt.status==='submitted'&&!Number.isFinite(Date.parse(result.attempt.finishedAt)))||
    (result.attempt.status==='in_progress'&&result.attempt.finishedAt))
  throw failure('INVALID_RESULT_ATTEMPT');
 const identity=result.identity;
 if(identity?.mode!==who.mode||identity?.issuer!==who.issuer||
    (who.mode==='platform'?identity.subjectId!==who.subject:identity.code!==who.subject))
  throw failure('RESULT_IDENTITY_MISMATCH',403);
 if(!Array.isArray(result.analytics?.events)||result.analytics.events.length>20000||
    !Array.isArray(result.submission?.scores)||!Array.isArray(result.submission?.states))
  throw failure('RESULT_EVIDENCE_LIMIT');
 const body=JSON.parse(JSON.stringify(result));delete body.integrity;
 const expected='sha256:'+sha(canonical(body));
 if(result.integrity?.algorithm!=='sha256'||result.integrity?.payloadDigest!==expected)
  throw failure('RESULT_INTEGRITY_FAILED');
 return {courseId,attemptId,digest:expected,actorKey:actorKey(who),legacyActorKey:legacyActorKey(who)};
}
async function readExisting(file){
 try{
  const raw=await readFile(file,'utf8');
  if(Buffer.byteLength(raw)>LIMIT)throw failure('RESULT_TOO_LARGE',413);
  return JSON.parse(raw);
 }catch(error){if(error?.code==='ENOENT')return null;throw error;}
}
async function listCourse(root,tenant,course,cap=MAX_RESULTS){
 const dir=join(root,sha(tenant),sha(course)),found=[];
 let learners=[];try{learners=await readdir(dir,{withFileTypes:true});}
 catch(error){if(error?.code==='ENOENT')return [];throw error;}
 for(const learner of learners){
  if(!learner.isDirectory()||!/^[0-9a-f]{64}$/.test(learner.name))continue;
  const base=join(dir,learner.name);
  const entries=await readdir(base,{withFileTypes:true});
  for(const entry of entries){
   if(!entry.isFile()||!/^[0-9a-f]{64}\.p2lrn-result$/.test(entry.name))continue;
   if(found.length>=cap)throw failure('RESULT_INDEX_LIMIT',413);
   const file=join(base,entry.name);
   found.push({file,id:sha(learner.name+':'+entry.name.slice(0,64))});
  }
 }
 return found;
}
function respond(res,status,payload){
 const data=Buffer.from(JSON.stringify(payload)+'\n');
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
  'Content-Length':String(data.length),'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff','Vary':'Cookie, Authorization'});
 res.end(data);
}
async function bodyBytes(req){
 const chunks=[];let len=0;
 for await(const chunk of req){
  len+=chunk.byteLength;
  if(len>LIMIT)throw failure('RESULT_TOO_LARGE',413);
  chunks.push(chunk);
 }
 return Buffer.concat(chunks,len);
}
const unsafeStorage=e=>['EACCES','EPERM','ENOSPC','EROFS','EDQUOT'].includes(e?.code);

export function createP2LRNResultsHttpHandler({
 directory,authenticate,authorize,checkCsrf,basePath='/api/p2lrn/results',maxAttemptsPerLearner=100
}={}){
 if(!isAbsolute(String(directory||'')))throw new TypeError('An absolute private results directory is required');
 if(typeof authenticate!=='function'||typeof authorize!=='function'||typeof checkCsrf!=='function')
  throw new TypeError('The Host must provide authenticate(), authorize(), and checkCsrf()');
 if(typeof basePath!=='string'||!/^\/[a-z0-9/_-]+$/i.test(basePath)||basePath.endsWith('/'))
  throw new TypeError('Invalid results base path');
 if(!Number.isSafeInteger(maxAttemptsPerLearner)||maxAttemptsPerLearner<1||maxAttemptsPerLearner>MAX_RESULTS)
  throw new TypeError('maxAttemptsPerLearner must be between 1 and '+MAX_RESULTS);
 const root=resolve(directory),serial=new Map();
 const queue=(file,run)=>{
  const prev=serial.get(file)||Promise.resolve();
  const next=prev.catch(()=>{}).then(run);
  serial.set(file,next);
  void next.finally(()=>{if(serial.get(file)===next)serial.delete(file);}).catch(()=>{});
  return next;
 };
 async function handle(req,res,next){
  let request;
  try{request=new URL(req.url,'http://p2lrn.internal');}catch{respond(res,400,{error:'INVALID_URL'});return;}
  if(!(request.pathname===basePath||request.pathname.startsWith(basePath+'/'))){
   if(typeof next==='function')next();else respond(res,404,{error:'NOT_FOUND'});
   return;
  }
  const method=String(req.method||'GET').toUpperCase();
  try{
   const principal=await authenticate(req);
   const who=identityOf(principal);
   const courseId=clean(request.searchParams.get('courseId'));
   const action=method==='PUT'&&request.pathname===basePath?'write':
     method==='GET'&&request.pathname===basePath+'/current'?'read-own':'read-course';
   const course=action==='write'?null:courseId;
   if(action!=='write'&&!course)throw failure('COURSE_REQUIRED',400);
   if(action!=='write'&&(await authorize({principal,action,courseId:course}))!==true)
    throw failure('COURSE_ACCESS_DENIED',403);
   if(action==='write'){
    if((await checkCsrf(req,principal))!==true)throw failure('CSRF_REQUIRED',403);
    const type=String(req.headers['content-type']||'').split(';')[0].trim();
    if(!['application/vnd.p2lrn-result+json','application/json'].includes(type))
     throw failure('RESULT_MEDIA_TYPE',415);
    const bytes=await bodyBytes(req);
    let result;try{result=JSON.parse(bytes.toString('utf8'));}catch{throw failure('INVALID_RESULT_JSON',400);}
    const info=validateResult(result,who);
    if((await authorize({principal,action:'write',courseId:info.courseId}))!==true)
     throw failure('COURSE_ACCESS_DENIED',403);
    const courseFolder=join(root,sha(who.tenant),sha(info.courseId));
    const actorFolder=join(courseFolder,info.actorKey);
    const file=join(actorFolder,sha(info.attemptId)+'.p2lrn-result');
    const legacyFile=join(courseFolder,info.legacyActorKey,sha(info.attemptId)+'.p2lrn-result');
    // Serialize at course grain: parallel new attempts cannot bypass quotas.
    // This reference Host must run in a single writer process.
    const answer=await queue(courseFolder,async()=>{
     let existing=await readExisting(file),legacyExisting=null;
     if(!existing&&legacyFile!==file){
      const previous=await readExisting(legacyFile);
      if(previous){
       try{
        const verified=validateResult(previous,who);
        if(verified.attemptId===info.attemptId)legacyExisting=previous;
       }catch(error){
        // An older delimiter-based folder might belong to another actor.
        if(error?.code!=='RESULT_IDENTITY_MISMATCH')throw error;
       }
       if(legacyExisting)existing=legacyExisting;
      }
     }
     if(!existing){
      if((await listCourse(root,who.tenant,info.courseId)).length>=MAX_RESULTS)
       throw failure('RESULT_COURSE_QUOTA_EXCEEDED',429);
      let entries=[];try{entries=await readdir(actorFolder);}catch(error){
       if(error?.code!=='ENOENT')throw error;
      }
      if(entries.filter(name=>/^[0-9a-f]{64}\.p2lrn-result$/.test(name)).length>=maxAttemptsPerLearner)
       throw failure('RESULT_LEARNER_QUOTA_EXCEEDED',429);
     }
     if(existing){
      const old=validateResult(existing,who);
      if(old.attemptId!==info.attemptId||existing.assignment?.contentRoot!==result.assignment?.contentRoot)
       throw failure('RESULT_ATTEMPT_CONFLICT',409);
      if(old.digest===info.digest){
       if(legacyExisting){await mkdir(actorFolder,{recursive:true,mode:0o700});await rename(legacyFile,file);}
       return {saved:true,unchanged:true,attemptId:info.attemptId};
      }
      if(existing.attempt.status==='submitted')throw failure('RESULT_ALREADY_SUBMITTED',409);
      const earlier=existing.analytics.events,later=result.analytics.events;
      if(later.length<earlier.length||earlier.some((event,index)=>canonical(event)!==canonical(later[index])))
       throw failure('STALE_OR_DIVERGENT_RESULT',409);
     }
     await mkdir(dirname(file),{recursive:true,mode:0o700});
     // Preserve the existing checkpoint even if the updated write fails.
     if(legacyExisting)await rename(legacyFile,file);
     const temp=file+'.'+randomUUID()+'.tmp';
     try{await writeFile(temp,JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});await rename(temp,file);}
     finally{await unlink(temp).catch(()=>{});}
     return {saved:true,attemptId:info.attemptId,status:result.attempt.status};
    });
    respond(res,200,answer);return;
   }
   if(method!=='GET')throw failure('METHOD_NOT_ALLOWED',405);
   if(request.pathname===basePath+'/current'){
    const parent=join(root,sha(who.tenant),sha(course));
    let latest=null,latestMs=-Infinity;
    const keys=[actorKey(who),legacyActorKey(who)];
    for(const [index,key] of keys.entries()){
     if(index>0&&key===keys[0])continue;
     const folder=join(parent,key);
     let entries=[];try{entries=await readdir(folder);}catch(error){if(error.code!=='ENOENT')throw error;}
     for(const name of entries){
      if(!/^[0-9a-f]{64}\.p2lrn-result$/.test(name))continue;
      const path=join(folder,name),result=await readExisting(path);
      if(!result||result.attempt?.status!=='in_progress')continue;
      try{validateResult(result,who);}catch(error){
       if(index>0&&error?.code==='RESULT_IDENTITY_MISMATCH')continue;
       throw error;
      }
      const info=await stat(path);
      if(info.mtimeMs>latestMs){latest=result;latestMs=info.mtimeMs;}
     }
    }
    if(latest===null){res.writeHead(204,{'Cache-Control':'private, no-store'});res.end();return;}
    respond(res,200,{result:latest});return;
   }
   if(request.pathname===basePath+'/index'){
    const entries=await listCourse(root,who.tenant,course);
    const links=entries.map(({id})=>basePath+'/file/'+id+'?courseId='+encodeURIComponent(course));
    respond(res,200,{schema:INDEX_SCHEMA,results:links});return;
   }
   if(request.pathname.startsWith(basePath+'/file/')){
    const id=request.pathname.slice((basePath+'/file/').length);
    if(!/^[0-9a-f]{64}$/.test(id))throw failure('INVALID_FILE_ID',400);
    const entries=await listCourse(root,who.tenant,course);
    const entry=entries.find(x=>x.id===id);
    if(!entry)throw failure('RESULT_NOT_FOUND',404);
    const stored=await readExisting(entry.file);
    if(!stored)throw failure('RESULT_NOT_FOUND',404);
    const {tenant,issuer,subject,mode}=who;
    // Teacher reads records only after authorize() has explicitly granted read-course.
    const actor=stored?.identity;
    const owner={tenant,issuer:clean(actor?.issuer),subject:clean(actor?.mode==='platform'?actor?.subjectId:actor?.code),mode:actor?.mode};
    if(!owner.subject||!owner.issuer)throw failure('INVALID_STORED_RESULT');
    validateResult(stored,owner);
    if(stored.assignment?.packageId!==course)throw failure('WRONG_COURSE_RESULT');
    respond(res,200,stored);return;
   }
   throw failure('NOT_FOUND',404);
  }catch(error){
   const status=unsafeStorage(error)?507:(Number.isSafeInteger(error?.status)?error.status:500);
   respond(res,status,{error:unsafeStorage(error)?'STORAGE_UNAVAILABLE':status===500?'INTERNAL_ERROR':error.code});
  }
 }
 return handle;
}
