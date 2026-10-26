import {createHostAdapter} from '../../packages/toolkit/web/host-adapter.js';
export function createP2LRNLmsHostAdapter({session,gateway}){
 const s=session&&typeof session==='object'?session:{};
 const required=(value,label)=>{if(typeof value!=='string'||!value.trim())throw new TypeError(label+' is required');return value;};
 const sessionRef=required(s.sessionRef,'sessionRef'),packageId=required(s.packageId,'packageId');
 const contentRoot=required(s.contentRoot,'contentRoot');
 if(!/^sha256:[0-9a-f]{64}$/.test(contentRoot))throw new TypeError('Invalid contentRoot');
 const api=gateway&&typeof gateway==='object'?gateway:{};
 for(const method of ['loadState','saveState','recordClientScore','appendClientEvent','resolveResourceUrl']){
   if(typeof api[method]!=='function')throw new TypeError('LMS gateway missing '+method);
 }
 const args=context=>{
   if(!context||context.packageId!==packageId||context.contentRoot!==contentRoot)
     throw new Error('Session and Player content do not match');
   return {sessionRef,context:Object.freeze({
     packageId,contentRoot,entityId:required(context.entityId,'entityId'),
     surface:context.profile||context.rendererId||context.runtime||'package'
   })};
 };
 return createHostAdapter({
   loadState:async context=>api.loadState(args(context)),
   saveState:async(state,context)=>api.saveState({...args(context),state}),
   reportScore:async(score,context)=>api.recordClientScore({...args(context),score,authoritative:false}),
   emitEvent:async(event,context)=>api.appendClientEvent({...args(context),event,authoritative:false}),
   resolveResourceUrl:async(request,context)=>api.resolveResourceUrl({...args(context),request})
 });
}
