// Bounded asynchronous boundary for the existing durable LTI store.
// This removes SQL waits from HTTP's event loop, but DOES NOT remove
// the existing per-store serialization or global database write locks.
import {Worker} from 'node:worker_threads';

const MAX_INFLIGHT=128;
const CALL_TIMEOUT_MS=40000;

function rpcError(code,message){
 const error=new Error(message||code);
 error.code=code;
 return error;
}

export function createAsyncLtiStore(filename,options={}){
 const worker=new Worker(new URL('./lti-store-service-worker.mjs',import.meta.url),{
  workerData:{filename,options},
  resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32}
 });
 let state='starting',nextId=0;
 const inflight=new Map();
 let resolveReady,rejectReady;
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 ready.catch(()=>{});

 function fail(error){
  if(state==='failed'||state==='closed')return;
  state='failed';
  rejectReady(error);
  for(const entry of inflight.values()){
   clearTimeout(entry.timer);
   entry.reject(error);
  }
  inflight.clear();
 }
 worker.on('message',reply=>{
  if(reply?.type==='ready'){
   if(state==='starting'){state='ready';resolveReady();}
   return;
  }
  if(reply?.type==='fatal'){
   fail(rpcError(reply.code||'LTI_DB_INIT_FAILED',reply.message||'Database initialization failed'));
   return;
  }
  if(!Number.isSafeInteger(reply?.id))return;
  const entry=inflight.get(reply.id);
  if(!entry)return;
  inflight.delete(reply.id);
  clearTimeout(entry.timer);
  if(reply.ok)entry.resolve(reply.value);
  else entry.reject(rpcError(reply.code||'LTI_DATABASE_ERROR',reply.message||'Database operation failed'));
 });
 worker.on('error',()=>fail(rpcError('LTI_DB_WORKER_ERROR','LTI database worker failed')));
 worker.on('exit',code=>{
  if(state!=='closed')fail(rpcError('LTI_DB_WORKER_EXIT','LTI database worker exited unexpectedly: '+code));
 });

 function send(method,args){
  return ready.then(()=>new Promise((resolve,reject)=>{
   if(state!=='ready')return reject(rpcError('LTI_DB_CLOSED','LTI database is not ready'));
   if(inflight.size>=MAX_INFLIGHT)return reject(rpcError('LTI_DB_BUSY','LTI database queue is full'));
   const id=++nextId;
   const timer=setTimeout(()=>{
    fail(rpcError('LTI_DATABASE_TIMEOUT','LTI database operation exceeded its deadline'));
    worker.terminate().catch(()=>{});
   },CALL_TIMEOUT_MS);
   timer.unref();
   inflight.set(id,{resolve,reject,timer});
   try{worker.postMessage({id,method,args});}
   catch{clearTimeout(timer);inflight.delete(id);reject(rpcError('LTI_DATABASE_SERIALIZATION','Cannot send LTI database request'));}
  }));
 }
 const transactions=Object.freeze({
  create:(...args)=>send('transactions.create',args),
  consume:(...args)=>send('transactions.consume',args)
 });
 const api={
  ready,transactions,
  get healthy(){return state==='ready';},
  async close(){
   if(state==='closed')return;
   try{
    if(state==='starting')await ready;
    if(state==='ready')await send('close',[]);
   }catch{}finally{
    state='closed';
    for(const entry of inflight.values()){
     clearTimeout(entry.timer);
     entry.reject(rpcError('LTI_DB_CLOSED','LTI database closed'));
    }
    inflight.clear();
    await worker.terminate().catch(()=>{});
   }
  }
 };
 return new Proxy(Object.freeze(api),{
  get(target,property,receiver){
   if(Reflect.has(target,property))return Reflect.get(target,property,receiver);
   if(typeof property!=='string'||property==='then'||property==='constructor'||property.startsWith('__'))return undefined;
   return (...args)=>send(property,args);
  }
 });
}
