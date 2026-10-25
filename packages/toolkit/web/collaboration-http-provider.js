import {COLLABORATION_CAPABILITY,COLLABORATION_OPERATIONS} from './collaboration-provider.js';

export const COLLABORATION_HTTP_VERSION='1';
export const COLLABORATION_HTTP_MEDIA_TYPE='application/vnd.p2lrn.collaboration+json';

const SAFE_CONTEXT_KEYS=['contentRoot','packageId','entityId'];
const CREDENTIALS=new Set(['omit','same-origin','include']);

function clone(value){
  if(value===undefined)return undefined;
  return JSON.parse(JSON.stringify(value));
}

function pickContext(context){
  const out={};
  for(const key of SAFE_CONTEXT_KEYS){
    const value=context?.[key];
    if(value!==undefined&&value!==null&&String(value).trim())out[key]=String(value);
  }
  return out;
}

function endpointValue(value){
  const text=String(value??'').trim();
  if(!text)throw new TypeError('P2LRN collaboration HTTP endpoint is required.');
  if(/^[a-z][a-z0-9+.-]*:/iu.test(text)){
    const url=new URL(text);
    if(!['http:','https:'].includes(url.protocol))throw new TypeError('P2LRN collaboration endpoint must use HTTP or HTTPS.');
    if(url.username||url.password)throw new TypeError('P2LRN collaboration endpoint must not embed credentials.');
    const local=url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.protocol==='http:'&&!local)throw new TypeError('Non-local P2LRN collaboration endpoint must use HTTPS.');
  }
  return text;
}

function positiveInteger(value,label,fallback){
  if(value==null)return fallback;
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<1)throw new TypeError(label+' must be a positive integer.');
  return number;
}

function responseError(status,payload){
  const message=String(payload?.error??payload?.message??('P2LRN collaboration HTTP request failed with status '+status+'.'));
  const error=new Error(message);
  error.code=String(payload?.code??'P2LRN_COLLABORATION_HTTP_ERROR');
  error.status=status;
  return error;
}

export function createHttpCollaborationProvider({
  endpoint='/p2lrn/collaboration',
  fetchImpl=globalThis.fetch,
  credentials='same-origin',
  getHeaders=null,
  requestTimeoutMs=15000,
  listenTimeoutMs=35000,
}={}){
  const target=endpointValue(endpoint);
  if(typeof fetchImpl!=='function')throw new TypeError('P2LRN collaboration HTTP provider requires fetch().');
  if(!CREDENTIALS.has(credentials))throw new TypeError('Unsupported collaboration HTTP credentials mode.');
  if(getHeaders!=null&&typeof getHeaders!=='function')throw new TypeError('getHeaders must be a function when provided.');
  const normalTimeout=positiveInteger(requestTimeoutMs,'requestTimeoutMs',15000);
  const longTimeout=positiveInteger(listenTimeoutMs,'listenTimeoutMs',35000);

  return Object.freeze({
    id:COLLABORATION_CAPABILITY,
    operations:COLLABORATION_OPERATIONS,
    describe(){
      return Object.freeze({transport:'http',version:COLLABORATION_HTTP_VERSION,endpoint:target,identity:'host-authenticated'});
    },
    async invoke(operation,input={},context={}){
      const op=String(operation??'');
      if(!COLLABORATION_OPERATIONS.includes(op)){
        const error=new Error('Unsupported P2LRN collaboration HTTP operation: '+op);
        error.code='P2LRN_CAPABILITY_UNAVAILABLE';
        throw error;
      }
      const timeout=op==='listen'?longTimeout:normalTimeout;
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),timeout);
      try{
        const headers={
          'Accept':COLLABORATION_HTTP_MEDIA_TYPE+', application/json',
          'Content-Type':COLLABORATION_HTTP_MEDIA_TYPE,
        };
        if(getHeaders){
          const extra=await getHeaders(Object.freeze({operation:op,context:Object.freeze(pickContext(context))}));
          if(extra!=null){
            if(typeof extra!=='object'||Array.isArray(extra))throw new TypeError('getHeaders must return an object.');
            for(const [name,value] of Object.entries(extra)){
              const lower=String(name).toLowerCase();
              if(['accept','content-type','content-length','host','origin'].includes(lower))continue;
              if(value!==undefined&&value!==null)headers[name]=String(value);
            }
          }
        }
        const response=await fetchImpl(target,{
          method:'POST',
          headers,
          credentials,
          cache:'no-store',
          redirect:'error',
          signal:controller.signal,
          body:JSON.stringify({
            version:COLLABORATION_HTTP_VERSION,
            operation:op,
            input:clone(input??{}),
            context:pickContext(context),
          }),
        });
        let payload=null;
        try{payload=await response.json();}catch{}
        if(!response.ok||payload?.ok===false)throw responseError(response.status,payload);
        if(!payload||payload.ok!==true||!Object.prototype.hasOwnProperty.call(payload,'result')){
          throw responseError(response.status,{code:'P2LRN_COLLABORATION_HTTP_INVALID_RESPONSE',error:'P2LRN collaboration host returned an invalid response.'});
        }
        return clone(payload.result);
      }catch(error){
        if(error?.name==='AbortError'){
          const timeoutError=new Error('P2LRN collaboration HTTP request timed out.');
          timeoutError.code='P2LRN_COLLABORATION_HTTP_TIMEOUT';
          throw timeoutError;
        }
        throw error;
      }finally{
        clearTimeout(timer);
      }
    },
  });
}
