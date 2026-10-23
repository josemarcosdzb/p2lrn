import {normalizeHostAdapter} from './host-adapter.js';

export const OFFLINE_HOST_ADAPTER_VERSION = '1';
export const DEFAULT_OFFLINE_DB_NAME = 'p2lrn-runtime-v1';

let lastSequence = 0;
function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key)=>JSON.stringify(key)+':'+stable(value[key])).join(',') + '}';
}
function contextKey(context) { return stable(context && typeof context === 'object' ? context : {}); }
function nextSequence() {
  const wall = Date.now() * 1000;
  lastSequence = Math.max(wall, lastSequence + 1);
  return lastSequence;
}
function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);
    return 'p2lrn-'+Array.from(bytes,(byte)=>byte.toString(16).padStart(2,'0')).join('');
  }
  return `p2lrn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function operation(type, value, context, coalesceKey = null) {
  return Object.freeze({id:uuid(), type, value:cloneJson(value), context:cloneJson(context ?? {}), coalesceKey, queuedAt:new Date().toISOString(), sequence:nextSequence()});
}

export function createMemoryOfflineStore() {
  const states = new Map();
  const outbox = [];
  return {
    async getState(key) { return states.has(key) ? cloneJson(states.get(key)) : null; },
    async setState(key, state) { states.set(key, cloneJson(state)); },
    async enqueue(item) {
      if (item.coalesceKey) {
        for (let i=outbox.length-1;i>=0;i--) if (outbox[i].coalesceKey === item.coalesceKey) outbox.splice(i,1);
      }
      outbox.push(cloneJson(item));
    },
    async listOutbox() { return outbox.map(cloneJson).sort((a,b)=>a.sequence-b.sequence || String(a.id).localeCompare(String(b.id))); },
    async removeOutbox(id) { const index=outbox.findIndex((item)=>item.id===id); if(index>=0)outbox.splice(index,1); },
    async removeByCoalesceKey(key) { for(let i=outbox.length-1;i>=0;i--)if(outbox[i].coalesceKey===key)outbox.splice(i,1); },
    async hasCoalesceKey(key) { return outbox.some((item)=>item.coalesceKey===key); },
    async clear() { states.clear(); outbox.length=0; },
  };
}

function openIndexedDb(name) {
  if (!globalThis.indexedDB) throw new Error('IndexedDB is unavailable in this context.');
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('state'))db.createObjectStore('state',{keyPath:'key'});
      if(!db.objectStoreNames.contains('outbox')){
        const store=db.createObjectStore('outbox',{keyPath:'id'});
        store.createIndex('sequence','sequence',{unique:false});
        store.createIndex('coalesceKey','coalesceKey',{unique:false});
      }
    };
    request.onerror=()=>reject(request.error ?? new Error('Failed to open P2LRN IndexedDB store.'));
    request.onsuccess=()=>resolve(request.result);
  });
}
function idbRequest(request) { return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}); }
function txDone(tx) { return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error ?? new Error('IndexedDB transaction aborted.'));}); }

export function createIndexedDbOfflineStore({name=DEFAULT_OFFLINE_DB_NAME, namespace}={}) {
  const ns=String(namespace ?? '').trim();
  if(!ns)throw new TypeError('IndexedDB offline store namespace is required.');
  if(ns.length>256)throw new TypeError('IndexedDB offline store namespace is too long.');
  const prefix=ns+'\u0000';
  const internal=(value)=>prefix+String(value);
  const dbPromise=openIndexedDb(String(name));
  const storedItem=(item)=>({...cloneJson(item),id:internal(item.id),externalId:String(item.id),namespace:ns,coalesceKey:item.coalesceKey?internal(item.coalesceKey):null,externalCoalesceKey:item.coalesceKey??null});
  const publicItem=(item)=>{const out=cloneJson(item);out.id=String(out.externalId);out.coalesceKey=out.externalCoalesceKey??null;delete out.externalId;delete out.externalCoalesceKey;delete out.namespace;return out;};
  return {
    async getState(key) { const db=await dbPromise;const tx=db.transaction('state','readonly');const result=await idbRequest(tx.objectStore('state').get(internal(key)));await txDone(tx);return result?cloneJson(result.state):null; },
    async setState(key,state) { const db=await dbPromise;const tx=db.transaction('state','readwrite');tx.objectStore('state').put({key:internal(key),namespace:ns,state:cloneJson(state),updatedAt:new Date().toISOString()});await txDone(tx); },
    async enqueue(item) {
      const db=await dbPromise;const tx=db.transaction('outbox','readwrite');const store=tx.objectStore('outbox');
      if(item.coalesceKey){const index=store.index('coalesceKey');const existing=await idbRequest(index.getAllKeys(internal(item.coalesceKey)));for(const key of existing)store.delete(key);}
      store.put(storedItem(item));await txDone(tx);
    },
    async listOutbox() { const db=await dbPromise;const tx=db.transaction('outbox','readonly');const result=await idbRequest(tx.objectStore('outbox').getAll());await txDone(tx);return (result??[]).filter((item)=>item.namespace===ns).map(publicItem).sort((a,b)=>a.sequence-b.sequence || String(a.id).localeCompare(String(b.id))); },
    async removeOutbox(id) { const db=await dbPromise;const tx=db.transaction('outbox','readwrite');tx.objectStore('outbox').delete(internal(id));await txDone(tx); },
    async removeByCoalesceKey(key) { const db=await dbPromise;const tx=db.transaction('outbox','readwrite');const store=tx.objectStore('outbox');const keys=await idbRequest(store.index('coalesceKey').getAllKeys(internal(key)));for(const id of keys)store.delete(id);await txDone(tx); },
    async hasCoalesceKey(key) { const db=await dbPromise;const tx=db.transaction('outbox','readonly');const count=await idbRequest(tx.objectStore('outbox').index('coalesceKey').count(internal(key)));await txDone(tx);return count>0; },
    async clear() { const db=await dbPromise;const tx=db.transaction(['state','outbox'],'readwrite');for(const storeName of ['state','outbox']){const store=tx.objectStore(storeName);const keys=await idbRequest(store.getAllKeys());for(const key of keys)if(String(key).startsWith(prefix))store.delete(key);}await txDone(tx); },
  };
}

function defaultOnline() { return globalThis.navigator?.onLine !== false; }
function sameJson(a,b){try{return stable(a)===stable(b);}catch{return false;}}

export function createOfflineHostAdapter({remote=null,store=null,online=defaultOnline,conflictResolver=null,storageNamespace=null,dbName=DEFAULT_OFFLINE_DB_NAME}={}) {
  if (typeof online !== 'function') throw new TypeError('offline adapter online must be a function.');
  if (conflictResolver != null && typeof conflictResolver !== 'function') throw new TypeError('offline adapter conflictResolver must be a function.');
  const remoteAdapter=normalizeHostAdapter(remote);
  const persistence=store ?? (globalThis.indexedDB && String(storageNamespace ?? '').trim() ? createIndexedDbOfflineStore({name:dbName,namespace:String(storageNamespace).trim()}) : createMemoryOfflineStore());
  for(const method of ['getState','setState','enqueue','listOutbox','removeOutbox','removeByCoalesceKey','hasCoalesceKey','clear'])if(typeof persistence?.[method]!=='function')throw new TypeError(`Offline store requires ${method}().`);

  let writeChain=Promise.resolve();
  function serializeWrite(task){const run=writeChain.then(task,task);writeChain=run.catch(()=>{});return run;}
  async function connected(){try{return Boolean(await online());}catch{return false;}}
  async function hasPending(){return (await persistence.listOutbox()).length>0;}
  async function enqueue(item){await persistence.enqueue(item);return item;}
  function deliveryContext(item){
    return Object.freeze({...cloneJson(item.context ?? {}),offlineDeliveryId:String(item.id),offlineQueuedAt:String(item.queuedAt)});
  }
  async function send(item){
    if(!remoteAdapter)throw new Error('No remote Host Adapter is configured.');
    const remoteContext=deliveryContext(item);
    if(item.type==='state'){
      let value=item.value;
      if(conflictResolver&&remoteAdapter.loadState){
        const remoteState=await remoteAdapter.loadState(item.context);
        if(remoteState!=null&&!sameJson(remoteState,value))value=await conflictResolver({local:cloneJson(value),remote:cloneJson(remoteState),context:cloneJson(item.context),direction:'push'});
      }
      if(!remoteAdapter.saveState)throw new Error('Remote Host Adapter has no saveState().');
      await remoteAdapter.saveState(value,remoteContext);await persistence.setState(contextKey(item.context),value);return;
    }
    if(item.type==='score'){
      if(!remoteAdapter.reportScore)throw new Error('Remote Host Adapter has no reportScore().');
      await remoteAdapter.reportScore(item.value,remoteContext);return;
    }
    if(item.type==='event'){
      if(!remoteAdapter.emitEvent)throw new Error('Remote Host Adapter has no emitEvent().');
      await remoteAdapter.emitEvent(item.value,remoteContext);return;
    }
    throw new Error(`Unsupported offline operation: ${item.type}`);
  }

  const implementation={
    version:'1',
    async loadState(context={}){
      const key=contextKey(context);const local=await persistence.getState(key);const pending=await persistence.hasCoalesceKey(`state:${key}`);
      if(remoteAdapter?.loadState&&await connected()){
        try{
          const remoteState=await remoteAdapter.loadState(context);
          if(remoteState!=null){
            if(local!=null&&pending&&!sameJson(local,remoteState)){
              const resolved=conflictResolver?await conflictResolver({local:cloneJson(local),remote:cloneJson(remoteState),context:cloneJson(context),direction:'load'}):local;
              await persistence.setState(key,resolved);return cloneJson(resolved);
            }
            if(!pending){await persistence.setState(key,remoteState);return cloneJson(remoteState);}
          }
        }catch{}
      }
      return cloneJson(local);
    },
    async saveState(state,context={}){return serializeWrite(async()=>{
      const key=contextKey(context),coalesce=`state:${key}`,item=operation('state',state,context,coalesce);await persistence.setState(key,state);
      if(remoteAdapter?.saveState&&await connected()&&!(await hasPending())){
        try{await send(item);await persistence.removeByCoalesceKey(coalesce);return;}catch{}
      }
      await enqueue(item);
    });},
    async reportScore(score,context={}){return serializeWrite(async()=>{
      const item=operation('score',score,context);
      if(remoteAdapter?.reportScore&&await connected()&&!(await hasPending())){
        try{await send(item);return;}catch{}
      }
      await enqueue(item);
    });},
    async emitEvent(event,context={}){return serializeWrite(async()=>{
      const item=operation('event',event,context);
      if(remoteAdapter?.emitEvent&&await connected()&&!(await hasPending())){
        try{await send(item);return;}catch{}
      }
      await enqueue(item);
    });},
    async resolveResourceUrl(request,context={}){
      if(!remoteAdapter?.resolveResourceUrl||!(await connected()))return null;
      return remoteAdapter.resolveResourceUrl(request,context);
    },
  };

  return Object.freeze({
    version:OFFLINE_HOST_ADAPTER_VERSION,
    ...implementation,
    async pending(){await writeChain;return persistence.listOutbox();},
    async clearLocal(){return serializeWrite(()=>persistence.clear());},
    async sync(){return serializeWrite(async()=>{
      const summary={attempted:0,acked:0,pending:0,online:await connected()};
      if(!summary.online||!remoteAdapter){summary.pending=(await persistence.listOutbox()).length;return summary;}
      const items=await persistence.listOutbox();
      for(const item of items){
        summary.attempted+=1;
        try{await send(item);await persistence.removeOutbox(item.id);summary.acked+=1;}
        catch{break;}
      }
      summary.pending=(await persistence.listOutbox()).length;return summary;
    });},
    store:persistence,
  });
}