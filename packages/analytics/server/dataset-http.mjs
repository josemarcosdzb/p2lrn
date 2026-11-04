// Secure, opt-in Node HTTP adapter for P2LRN Analytics.
// This does not create users, approve grades, or authorize a database itself.
// A Host must supply real identity, per-tenant/course ACLs, and scoped data.
const MAX_RESPONSE_BYTES=4*1024*1024;
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/;
const VALID_ROLES=new Set(['learner','teacher','admin']);
const LOCAL=new Set(['localhost','127.0.0.1','[::1]']);

function trustedOrigins(values){
  if(!Array.isArray(values)||!values.length)throw new TypeError('Analytics requires explicit allowedOrigins.');
  return values.map(value=>{
    const url=new URL(value);
    if(url.href!==url.origin+'/'||
       !['http:','https:'].includes(url.protocol)||
       (url.protocol!=='https:'&&!LOCAL.has(url.hostname)))
      throw new TypeError('Invalid Analytics allowed origin.');
    return url.origin;
  });
}
function send(res,status,payload,extraHeaders={}){
  const body=JSON.stringify(payload);
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store, max-age=0',
    'Pragma':'no-cache',
    'Vary':'Origin',
    'X-Content-Type-Options':'nosniff',
    ...extraHeaders,
    'Content-Length':Buffer.byteLength(body),
  });
  res.end(body);
}
function cleanId(value){
  const id=typeof value==='string'?value:'';
  return SAFE_ID.test(id)?id:null;
}
function limited(records,max=20000){
  return Array.isArray(records)?records.slice(0,max):[];
}
function projectDataset(dataset,courseId,grant){
  const data=dataset&&typeof dataset==='object'&&!Array.isArray(dataset)?dataset:{};
  const role=grant.role;
  const allowed=new Set((role==='admin'?limited(data.learners).map(x=>x?.id):
    role==='learner'?[grant.learnerId]:grant.allowedLearnerIds).filter(id=>typeof id==='string'));
  // Teacher/learner authorization is only granted for explicitly pinned identities.
  const learnerAllowed=id=>typeof id==='string'&&allowed.has(id);
  const redactedLearners=limited(data.learners).filter(x=>learnerAllowed(x?.id)).map(x=>({
    id:x.id,name:typeof x.name==='string'?x.name:x.id,
    email:grant.allowPii===true&&typeof x.email==='string'?x.email:'',
    group:typeof x.group==='string'?x.group:'',
    cohort:typeof x.cohort==='string'?x.cohort:'',
    status:typeof x.status==='string'?x.status:'active',
  }));
  const course=x=>x?.courseId===courseId;
  const scopeRecord=x=>course(x)&&learnerAllowed(x?.learnerId);
  const removeMetadata=x=>{
    const copy={};
    // Explicit allowlist prevents arbitrary PII or secrets in nested metadata.
    for(const name of ['id','learnerId','courseId','entityId','status','type','category',
      'timestamp','updatedAt','startedAt','submittedAt','completedAt','progress',
      'activeTimeMs','value','maxValue','authoritative','source','attemptId','passed']){
      if(Object.hasOwn(x,name))copy[name]=x[name];
    }
    // Browser/unsigned grades never become authoritative just by saying so.
    if(Object.hasOwn(copy,'authoritative') && grant.allowAuthoritativeGrades!==true)
      copy.authoritative=false;
    return copy;
  };
  const subset=name=>limited(data[name]).filter(scopeRecord).map(removeMetadata);
  return {
    schema:'https://p2lrn.org/schema/analytics-dataset/1',
    generatedAt:new Date().toISOString(),
    learners:redactedLearners,
    courses:limited(data.courses).filter(x=>x?.id===courseId).map(x=>({
      id:x.id,title:typeof x.title==='string'?x.title:x.id,
    })),
    enrollments:subset('enrollments'),
    attempts:subset('attempts'),
    grades:subset('grades'),
    events:subset('events'),
    metadata:{scope:'host-authorized',redacted:true},
  };
}
/**
 * Mount behind HTTPS. authenticate(req) must verify Host session/bearer;
 * authorize({principal,tenantId,courseId}) must check the actual database ACL
 * and return {role,learnerId? ,allowedLearnerIds?,allowPii?,allowAuthoritativeGrades?}.
 * loadDataset({principal,tenantId,courseId}) must scope DB queries with
 * parameterized bindings; never concatenate client identifiers into SQL.
 * The adapter additionally filters each returned row before exposing it.
 */
export function createP2LRNAnalyticsDatasetHandler({
  allowedOrigins,authenticate,authorize,loadDataset,
  basePath='/api/p2lrn/analytics/dataset',
  maxResponseBytes=MAX_RESPONSE_BYTES,
}={}){
  const origins=trustedOrigins(allowedOrigins);
  if(typeof authenticate!=='function'||typeof authorize!=='function'||typeof loadDataset!=='function')
    throw new TypeError('Analytics requires Host authentication, course authorization and data loader callbacks.');
  if(!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1024||maxResponseBytes>MAX_RESPONSE_BYTES)
    throw new TypeError('Invalid Analytics response quota.');
  return async function analyticsDatasetHandler(req,res,next){
    let url;
    try{url=new URL(req.url,'http://p2lrn.internal');}
    catch{send(res,400,{ok:false,error:'INVALID_URL'});return;}
    if(url.pathname!==basePath){
      if(typeof next==='function')return next();
      send(res,404,{ok:false,error:'NOT_FOUND'});return;
    }
    const origin=String(req.headers?.origin??'');
    if(origin&&!origins.includes(origin)){
      send(res,403,{ok:false,error:'ORIGIN_DENIED'});return;
    }
    const cors=origin?{'Access-Control-Allow-Origin':origin}:{};
    if(req.method==='OPTIONS'){
      res.writeHead(204,{...cors,'Access-Control-Allow-Methods':'GET, OPTIONS',
        'Access-Control-Allow-Headers':'Authorization, Content-Type',
        'Cache-Control':'no-store','Vary':'Origin','Content-Length':'0'});
      res.end();return;
    }
    if(req.method!=='GET'){
      send(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'},{...cors,Allow:'GET, OPTIONS'});return;
    }
    const tenantId=cleanId(url.searchParams.get('tenantId'));
    const courseId=cleanId(url.searchParams.get('courseId'));
    if(!tenantId||!courseId){send(res,400,{ok:false,error:'INVALID_SCOPE'},cors);return;}
    try{
      const principal=await authenticate(req);
      if(!principal){send(res,401,{ok:false,error:'AUTHENTICATION_REQUIRED'},cors);return;}
      const grant=await authorize({principal,tenantId,courseId,operation:'analytics:read'});
      if(!grant||!VALID_ROLES.has(grant.role)||
         (grant.role==='learner'&&!cleanId(grant.learnerId))||
         (grant.role==='teacher'&&(!Array.isArray(grant.allowedLearnerIds)||
           !grant.allowedLearnerIds.every(cleanId)))||
         (grant.role==='admin'&&grant.tenantId!==tenantId)){
        send(res,403,{ok:false,error:'COURSE_ACCESS_DENIED'},cors);return;
      }
      const dataset=await loadDataset({principal,tenantId,courseId});
      const scoped=projectDataset(dataset,courseId,grant);
      const size=Buffer.byteLength(JSON.stringify(scoped));
      if(size>maxResponseBytes){send(res,413,{ok:false,error:'ANALYTICS_RESPONSE_TOO_LARGE'},cors);return;}
      send(res,200,scoped,cors);
    }catch{
      send(res,500,{ok:false,error:'ANALYTICS_UNAVAILABLE'},cors);
    }
  };
}
