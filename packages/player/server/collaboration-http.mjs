export const P2LRN_COLLABORATION_HTTP_VERSION='1';
export const P2LRN_COLLABORATION_HTTP_MEDIA_TYPE='application/vnd.p2lrn.collaboration+json';
export const P2LRN_COLLABORATION_OPERATIONS=Object.freeze(['join','send','listen','snapshot','leave']);

const DEFAULT_MAX_BODY_BYTES=96*1024;
const DEFAULT_MAX_REQUESTS_PER_MINUTE=600;
const IDENTITY_KEYS=new Set(['participantId','actorId','userId','identity','principal']);
const LOCAL_HOSTS=new Set(['localhost','127.0.0.1','[::1]']);

function json(res,status,value,headers={}){
  const body=Buffer.from(JSON.stringify(value)+'\n');
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Length',String(body.length));
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  for(const [name,item] of Object.entries(headers))res.setHeader(name,item);
  res.end(body);
}

function normalizeOrigins(values){
  if(!Array.isArray(values)||values.length===0)throw new TypeError('allowedOrigins must contain at least one trusted application origin.');
  const out=[];
  for(const value of values){
    if(value==='*')throw new TypeError('Wildcard collaboration origins are not permitted.');
    const url=new URL(String(value));
    if(!['http:','https:'].includes(url.protocol)||url.origin!==String(value))throw new TypeError('Invalid collaboration origin: '+String(value));
    if(url.protocol==='http:'&&!LOCAL_HOSTS.has(url.hostname))throw new TypeError('Non-local collaboration origins must use HTTPS: '+url.origin);
    if(!out.includes(url.origin))out.push(url.origin);
  }
  return Object.freeze(out);
}

function normalizeHeaders(values){
  const source=values??['Content-Type','Authorization','X-CSRF-Token'];
  if(!Array.isArray(source))throw new TypeError('allowedRequestHeaders must be an array.');
  return Object.freeze([...new Set(source.map((value)=>String(value).trim()).filter(Boolean))]);
}

function cors(req,allowedOrigins,allowedHeaders){
  const origin=String(req.headers?.origin??'').trim();
  if(!origin)return {ok:true,headers:{}};
  if(!allowedOrigins.includes(origin))return {ok:false,headers:{}};
  return {ok:true,headers:{
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Credentials':'true',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':allowedHeaders.join(', '),
    'Access-Control-Max-Age':'600',
    'Vary':'Origin',
  }};
}

function collect(req,limit){
  return new Promise((resolvePromise,reject)=>{
    const chunks=[];let total=0;let finished=false;
    const fail=(error)=>{if(finished)return;finished=true;reject(error);};
    req.on('data',(chunk)=>{
      if(finished)return;
      total+=chunk.length;
      if(total>limit){
        const error=Object.assign(new Error('Collaboration request body is too large.'),{code:'P2LRN_COLLABORATION_BODY_TOO_LARGE',statusCode:413});
        fail(error);
        try{req.destroy?.();}catch{}
        return;
      }
      chunks.push(chunk);
    });
    req.on('end',()=>{if(finished)return;finished=true;resolvePromise(Buffer.concat(chunks,total));});
    req.on('error',fail);
  });
}

function bodyObject(bytes){
  let value;
  try{value=JSON.parse(bytes.toString('utf8'));}catch{
    const error=Object.assign(new Error('Collaboration request body must be valid JSON.'),{code:'P2LRN_COLLABORATION_INVALID_JSON',statusCode:400});
    throw error;
  }
  if(!value||typeof value!=='object'||Array.isArray(value)){
    const error=Object.assign(new Error('Collaboration request body must be an object.'),{code:'P2LRN_COLLABORATION_INVALID_REQUEST',statusCode:400});
    throw error;
  }
  if(String(value.version??'')!==P2LRN_COLLABORATION_HTTP_VERSION){
    const error=Object.assign(new Error('Unsupported P2LRN collaboration HTTP version.'),{code:'P2LRN_COLLABORATION_VERSION',statusCode:400});
    throw error;
  }
  const operation=String(value.operation??'');
  if(!P2LRN_COLLABORATION_OPERATIONS.includes(operation)){
    const error=Object.assign(new Error('Unsupported collaboration operation.'),{code:'P2LRN_COLLABORATION_OPERATION',statusCode:400});
    throw error;
  }
  const input=value.input==null?{}:value.input;
  const clientContext=value.context==null?{}:value.context;
  if(!input||typeof input!=='object'||Array.isArray(input)||!clientContext||typeof clientContext!=='object'||Array.isArray(clientContext)){
    const error=Object.assign(new Error('Collaboration input and context must be objects.'),{code:'P2LRN_COLLABORATION_INVALID_REQUEST',statusCode:400});
    throw error;
  }
  for(const key of IDENTITY_KEYS){
    if(Object.prototype.hasOwnProperty.call(input,key)){
      const error=Object.assign(new Error('Collaboration identity is assigned by the authenticated host, not by package input.'),{code:'P2LRN_COLLABORATION_IDENTITY_FORBIDDEN',statusCode:400});
      throw error;
    }
  }
  return {operation,input,clientContext};
}

function normalizeService(service){
  if(!service||typeof service!=='object'||Array.isArray(service))throw new TypeError('Collaboration service is required.');
  const out={};
  for(const operation of P2LRN_COLLABORATION_OPERATIONS){
    if(typeof service[operation]!=='function')throw new TypeError('Collaboration service requires '+operation+'().');
    out[operation]=service[operation].bind(service);
  }
  return Object.freeze(out);
}

function actorKey(actor){
  if(actor==null)return 'anonymous';
  if(typeof actor==='string'||typeof actor==='number')return String(actor);
  for(const key of ['id','sub','userId','accountId']){
    if(actor&&actor[key]!=null)return String(actor[key]);
  }
  return 'authenticated';
}

export function createP2LRNCollaborationService(implementation={}){
  return normalizeService(implementation);
}

export function createP2LRNCollaborationHandler({
  allowedOrigins,
  allowedRequestHeaders,
  authenticate,
  authorize,
  resolveContext,
  service,
  maxBodyBytes=DEFAULT_MAX_BODY_BYTES,
  maxRequestsPerMinute=DEFAULT_MAX_REQUESTS_PER_MINUTE,
  maxRequestsPerSecond=15,
  rateLimitKey=actorKey,
}={}){
  const origins=normalizeOrigins(allowedOrigins);
  const requestHeaders=normalizeHeaders(allowedRequestHeaders);
  if(typeof authenticate!=='function')throw new TypeError('Collaboration handler requires authenticate(request).');
  if(typeof authorize!=='function')throw new TypeError('Collaboration handler requires authorize(...).');
  if(typeof resolveContext!=='function')throw new TypeError('Collaboration handler requires resolveContext(...).');
  if(typeof rateLimitKey!=='function')throw new TypeError('rateLimitKey must be a function.');
  const backend=normalizeService(service);
  const bodyLimit=Number(maxBodyBytes);
  const rpm=Number(maxRequestsPerMinute);
  const rps=Number(maxRequestsPerSecond);
  if(!Number.isSafeInteger(bodyLimit)||bodyLimit<1024)throw new TypeError('Invalid collaboration maxBodyBytes.');
  if(!Number.isSafeInteger(rpm)||rpm<1)throw new TypeError('Invalid collaboration maxRequestsPerMinute.');
  if(!Number.isSafeInteger(rps)||rps<1||rps>1000)throw new TypeError('Invalid collaboration maxRequestsPerSecond.');

  const windows=new Map();
  function takeSlot(actor){
    const key=String(rateLimitKey(actor)??'authenticated');
    const now=Date.now();
    let current=windows.get(key);
    if(!current||now-current.startedAt>=60000){
      current={startedAt:now,count:0,secondStartedAt:now,secondCount:0};
      windows.set(key,current);
    }
    if(now-current.secondStartedAt>=1000){current.secondStartedAt=now;current.secondCount=0;}
    // A minute quota by itself permits hundreds of messages in one second.
    if(current.count>=rpm||current.secondCount>=rps)return false;
    current.count+=1;
    current.secondCount+=1;
    if(windows.size>10000){
      for(const [itemKey,item] of windows)if(now-item.startedAt>=120000)windows.delete(itemKey);
    }
    return true;
  }

  return async function p2lrnCollaborationHandler(req,res,next){
    let pathname;
    try{pathname=new URL(req.url||'/','http://p2lrn.invalid').pathname;}catch{pathname='/';}
    const cross=cors(req,origins,requestHeaders);
    if(!cross.ok){json(res,403,{ok:false,code:'P2LRN_COLLABORATION_ORIGIN_DENIED',error:'Origin is not allowed.'});return;}

    const method=String(req.method||'GET').toUpperCase();
    if(method==='OPTIONS'){
      res.statusCode=204;
      for(const [name,value] of Object.entries(cross.headers))res.setHeader(name,value);
      res.setHeader('Content-Length','0');res.end();return;
    }
    if(method!=='POST'){
      if(typeof next==='function'&&pathname!=='/'&&pathname!=='')return next();
      res.setHeader('Allow','POST, OPTIONS');
      json(res,405,{ok:false,code:'P2LRN_COLLABORATION_METHOD',error:'Method Not Allowed'},cross.headers);return;
    }

    const mediaType=String(req.headers?.['content-type']??'').split(';',1)[0].trim().toLowerCase();
    if(mediaType!==P2LRN_COLLABORATION_HTTP_MEDIA_TYPE){
      json(res,415,{ok:false,code:'P2LRN_COLLABORATION_MEDIA_TYPE',error:'Content-Type must be '+P2LRN_COLLABORATION_HTTP_MEDIA_TYPE+'.'},cross.headers);return;
    }

    try{
      const actor=await authenticate(req);
      if(actor==null){
        json(res,401,{ok:false,code:'P2LRN_COLLABORATION_UNAUTHENTICATED',error:'Authentication required.'},cross.headers);return;
      }
      if(!takeSlot(actor)){
        json(res,429,{ok:false,code:'P2LRN_COLLABORATION_RATE_LIMITED',error:'Collaboration request rate limit exceeded.'},{...cross.headers,'Retry-After':'60'});return;
      }
      const parsed=bodyObject(await collect(req,bodyLimit));
      const trustedContext=await resolveContext(Object.freeze({
        request:req,
        actor,
        operation:parsed.operation,
        input:parsed.input,
        clientContext:parsed.clientContext,
      }));
      if(!trustedContext||typeof trustedContext!=='object'||Array.isArray(trustedContext)){
        throw Object.assign(new Error('Host did not resolve a trusted collaboration context.'),{code:'P2LRN_COLLABORATION_CONTEXT_REQUIRED',statusCode:403});
      }
      const allowed=await authorize(Object.freeze({
        request:req,
        actor,
        operation:parsed.operation,
        input:parsed.input,
        context:trustedContext,
      }));
      if(!allowed){
        json(res,403,{ok:false,code:'P2LRN_COLLABORATION_DENIED',error:'Collaboration operation denied.'},cross.headers);return;
      }
      const result=await backend[parsed.operation](Object.freeze({
        actor,
        input:parsed.input,
        context:trustedContext,
        request:req,
      }));
      json(res,200,{ok:true,result:result??null},cross.headers);
    }catch(error){
      const status=Number(error?.statusCode);
      const safeStatus=Number.isInteger(status)&&status>=400&&status<600?status:500;
      const code=String(error?.code??'P2LRN_COLLABORATION_SERVER_ERROR');
      const message=safeStatus>=500?'Collaboration service failed.':String(error?.message??'Collaboration request failed.');
      json(res,safeStatus,{ok:false,code,error:message},cross.headers);
    }
  };
}
