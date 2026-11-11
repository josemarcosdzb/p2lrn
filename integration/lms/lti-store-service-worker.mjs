// The legacy store and its synchronous dialect calls run only in this worker.
// Keep schema and transactional semantics unchanged while HTTP stays responsive.
import {parentPort,workerData} from 'node:worker_threads';
import {createLtiStore} from './lti-store.mjs';

const secret=typeof workerData.options?.connectionString==='string'?workerData.options.connectionString:'';
const sanitize=error=>{
 const message=String(error?.message||'SQL operation failed');
 return {code:String(error?.code||'LTI_DATABASE_ERROR').slice(0,80),
  message:(secret?message.replaceAll(secret,'[DATABASE_URL_REDACTED]'):message).slice(0,500)};
};
let store;
try{
 store=createLtiStore(workerData.filename,workerData.options);
 parentPort.postMessage({type:'ready'});
}catch(error){
 parentPort.postMessage({type:'fatal',...sanitize(error)});
 parentPort.close();
}
if(store){
 parentPort.on('message',async request=>{
  const {id,method,args}=request||{};
  if(!Number.isSafeInteger(id)||typeof method!=='string'||!Array.isArray(args)||args.length>16)return;
  try{
   const parts=method.split('.');
   const target=parts.length===2&&parts[0]==='transactions'?store.transactions:store;
   const name=parts.length===2?parts[1]:parts[0];
   if(parts.length>2||!Object.hasOwn(target,name)||typeof target[name]!=='function')
    throw new Error('LTI_DATABASE_INVALID_METHOD');
   const value=await target[name](...args);
   parentPort.postMessage({id,ok:true,value:value??null});
   if(method==='close')parentPort.close();
  }catch(error){parentPort.postMessage({id,ok:false,...sanitize(error)});}
 });
}
