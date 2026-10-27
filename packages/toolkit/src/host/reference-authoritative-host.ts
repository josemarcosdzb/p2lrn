import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

export const REFERENCE_AUTHORITATIVE_HOST_VERSION = '1' as const;

type JsonObject = Record<string, any>;

export interface AuthoritativeHostSnapshot {
  version: typeof REFERENCE_AUTHORITATIVE_HOST_VERSION;
  states: Record<string, {value:any; updatedAt:string}>;
  scores: Record<string, {reported:any; authoritative:any; updatedAt:string}>;
  events: Array<{scopeKey:string; event:any; context:any; receivedAt:string; offlineDeliveryId:string|null}>;
  deliveries: Record<string, {kind:string; receivedAt:string}>;
}

export interface AuthoritativeHostStore {
  load(): Promise<AuthoritativeHostSnapshot>;
  save(snapshot: AuthoritativeHostSnapshot): Promise<void>;
}

function emptySnapshot(): AuthoritativeHostSnapshot {
  return {version:REFERENCE_AUTHORITATIVE_HOST_VERSION,states:{},scores:{},events:[],deliveries:{}};
}
function clone<T>(value:T):T{return value===undefined?value:JSON.parse(JSON.stringify(value));}
function normalizeSnapshot(value:any):AuthoritativeHostSnapshot{
  if(!value||typeof value!=='object'||value.version!==REFERENCE_AUTHORITATIVE_HOST_VERSION)return emptySnapshot();
  return {
    version:REFERENCE_AUTHORITATIVE_HOST_VERSION,
    states:value.states&&typeof value.states==='object'&&!Array.isArray(value.states)?clone(value.states):{},
    scores:value.scores&&typeof value.scores==='object'&&!Array.isArray(value.scores)?clone(value.scores):{},
    events:Array.isArray(value.events)?clone(value.events):[],
    deliveries:value.deliveries&&typeof value.deliveries==='object'&&!Array.isArray(value.deliveries)?clone(value.deliveries):{},
  };
}
function nonEmpty(value:any,label:string):string{
  const text=String(value??'').trim();
  if(!text)throw new TypeError(label+' is required.');
  return text;
}
function contextRecord(value:any):JsonObject{return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function deliveryId(context:any):string|null{
  const value=contextRecord(context).offlineDeliveryId;
  return value==null?null:nonEmpty(value,'offlineDeliveryId');
}
function scopeSuffix(context:any):string{
  const source=contextRecord(context);
  return JSON.stringify([
    source.contentRoot??null,
    source.entityId??null,
    source.resourceId??null,
    source.representationId??null,
    source.runtime??null,
    source.profile??null,
  ]);
}

export function createMemoryAuthoritativeHostStore(initial?:Partial<AuthoritativeHostSnapshot>):AuthoritativeHostStore{
  let snapshot=normalizeSnapshot({...emptySnapshot(),...clone(initial??{})});
  return Object.freeze({
    async load(){return clone(snapshot);},
    async save(value:AuthoritativeHostSnapshot){snapshot=normalizeSnapshot(value);},
  });
}

export function createJsonFileAuthoritativeHostStore(filePath:string):AuthoritativeHostStore{
  const path=resolve(nonEmpty(filePath,'authoritative host filePath'));
  let chain=Promise.resolve();
  const read=async()=>{
    try{return normalizeSnapshot(JSON.parse(await readFile(path,'utf8')));}
    catch(error:any){if(error?.code==='ENOENT')return emptySnapshot();throw error;}
  };
  return Object.freeze({
    async load(){await chain;return read();},
    async save(value:AuthoritativeHostSnapshot){
      const snapshot=normalizeSnapshot(value);
      const run=chain.then(async()=>{
        await mkdir(dirname(path),{recursive:true});
        const temp=path+'.tmp-'+Date.now()+'-'+Math.random().toString(36).slice(2);
        await writeFile(temp,JSON.stringify(snapshot,null,2)+'\n','utf8');
        await rename(temp,path);
      });
      chain=run.catch(()=>{});
      return run;
    },
  });
}

export interface ReferenceAuthoritativeHostOptions {
  partitionKey:(context:JsonObject)=>string|Promise<string>;
  store?:AuthoritativeHostStore;
  grade?:(input:{reportedScore:any; context:JsonObject; state:any; events:any[]})=>any|Promise<any>;
  stateConflictPolicy?:'last-write'|'server-wins';
  mergeState?:(input:{current:any; incoming:any; context:JsonObject})=>any|Promise<any>;
  resolveResourceUrl?:(request:any,context:JsonObject)=>any|Promise<any>;
  now?:()=>string;
}

export function createReferenceAuthoritativeHost(options:ReferenceAuthoritativeHostOptions){
  if(!options||typeof options.partitionKey!=='function')throw new TypeError('Reference authoritative host requires partitionKey(context).');
  const store=options.store??createMemoryAuthoritativeHostStore();
  if(!store||typeof store.load!=='function'||typeof store.save!=='function')throw new TypeError('Invalid authoritative host store.');
  if(options.grade!=null&&typeof options.grade!=='function')throw new TypeError('grade must be a function.');
  if(options.mergeState!=null&&typeof options.mergeState!=='function')throw new TypeError('mergeState must be a function.');
  if(options.resolveResourceUrl!=null&&typeof options.resolveResourceUrl!=='function')throw new TypeError('resolveResourceUrl must be a function.');
  const policy=options.stateConflictPolicy??'last-write';
  if(!['last-write','server-wins'].includes(policy))throw new TypeError('stateConflictPolicy must be last-write or server-wins.');
  const now=options.now??(()=>new Date().toISOString());
  let chain=Promise.resolve();

  async function scope(context:any){
    const ctx=contextRecord(context);
    const partition=nonEmpty(await options.partitionKey(clone(ctx)),'authoritative host partition');
    return {context:ctx,scopeKey:partition+'|'+scopeSuffix(ctx)};
  }
  async function mutate<T>(task:(snapshot:AuthoritativeHostSnapshot)=>Promise<T>|T):Promise<T>{
    let output!:T;
    const run=chain.then(async()=>{
      const snapshot=normalizeSnapshot(await store.load());
      output=await task(snapshot);
      await store.save(snapshot);
    });
    chain=run.catch(()=>{});
    await run;
    return output;
  }
  function alreadyDelivered(snapshot:AuthoritativeHostSnapshot,id:string|null){return id!=null&&snapshot.deliveries[id]!=null;}
  function markDelivered(snapshot:AuthoritativeHostSnapshot,id:string|null,kind:string){
    if(id!=null)snapshot.deliveries[id]={kind,receivedAt:now()};
  }

  const adapter=Object.freeze({
    version:'1',
    async loadState(context:JsonObject={}){
      await chain;
      const {scopeKey}=await scope(context);
      const snapshot=normalizeSnapshot(await store.load());
      return clone(snapshot.states[scopeKey]?.value??null);
    },
    async saveState(state:any,context:JsonObject={}){
      const {scopeKey,context:ctx}=await scope(context);
      const id=deliveryId(ctx);
      return mutate(async(snapshot)=>{
        if(alreadyDelivered(snapshot,id))return;
        const current=snapshot.states[scopeKey]?.value??null;
        let next=clone(state);
        if(current!=null){
          if(options.mergeState)next=await options.mergeState({current:clone(current),incoming:clone(state),context:clone(ctx)});
          else if(policy==='server-wins')next=clone(current);
        }
        snapshot.states[scopeKey]={value:clone(next),updatedAt:now()};
        markDelivered(snapshot,id,'state');
      });
    },
    async reportScore(score:any,context:JsonObject={}){
      const {scopeKey,context:ctx}=await scope(context);
      const id=deliveryId(ctx);
      return mutate(async(snapshot)=>{
        if(alreadyDelivered(snapshot,id))return clone(snapshot.scores[scopeKey]?.authoritative??null);
        if(!options.grade){
          const error:any=new Error('Reference authoritative host requires grade() before it can store an authoritative result.');
          error.code='P2LRN_AUTHORITATIVE_GRADER_REQUIRED';
          throw error;
        }
        const state=clone(snapshot.states[scopeKey]?.value??null);
        const events=snapshot.events.filter((item)=>item.scopeKey===scopeKey).map((item)=>clone(item.event));
        const authoritative=await options.grade({reportedScore:clone(score),context:clone(ctx),state,events});
        if(!authoritative||typeof authoritative!=='object'||authoritative.authoritative!==true){
          const error:any=new Error('grade() must return an object with authoritative:true.');
          error.code='P2LRN_AUTHORITATIVE_RESULT_REQUIRED';
          throw error;
        }
        snapshot.scores[scopeKey]={reported:clone(score),authoritative:clone(authoritative),updatedAt:now()};
        markDelivered(snapshot,id,'score');
        return clone(authoritative);
      });
    },
    async emitEvent(event:any,context:JsonObject={}){
      const {scopeKey,context:ctx}=await scope(context);
      const id=deliveryId(ctx);
      return mutate(async(snapshot)=>{
        if(alreadyDelivered(snapshot,id))return;
        snapshot.events.push({scopeKey,event:clone(event),context:clone(ctx),receivedAt:now(),offlineDeliveryId:id});
        markDelivered(snapshot,id,'event');
      });
    },
    async resolveResourceUrl(request:any,context:JsonObject={}){
      if(!options.resolveResourceUrl)return null;
      return options.resolveResourceUrl(clone(request),clone(contextRecord(context)));
    },
  });

  return Object.freeze({
    version:REFERENCE_AUTHORITATIVE_HOST_VERSION,
    adapter,
    store,
    async snapshot(){await chain;return normalizeSnapshot(await store.load());},
    async state(context:JsonObject={}){const {scopeKey}=await scope(context);const snap=await this.snapshot();return clone(snap.states[scopeKey]??null);},
    async score(context:JsonObject={}){const {scopeKey}=await scope(context);const snap=await this.snapshot();return clone(snap.scores[scopeKey]??null);},
    async events(context:JsonObject={}){const {scopeKey}=await scope(context);const snap=await this.snapshot();return snap.events.filter((item)=>item.scopeKey===scopeKey).map(clone);},
  });
}
