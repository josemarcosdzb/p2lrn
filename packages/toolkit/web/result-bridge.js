// Shared Player <-> Analytics result contract, without mandatory databases.
// In production the Host authenticates requests and authorizes each course.
import {createResultRecorder} from './result-recorder.js';

export const P2LRN_RESULT_HOST_VERSION='1';

function required(value,name){
  if(typeof value!=='string'||!value.trim()||value.length>512)throw new TypeError(name+' is required');
  return value.trim();
}
function assertHost(host){
  if(!host||typeof host.loadCurrent!=='function'||typeof host.saveResult!=='function')
    throw new TypeError('Result Host requires loadCurrent({courseId}) and saveResult(result).');
}

// Call once for each authenticated learner + course. The Host is responsible for
// rejecting mismatched learner identities; never trust browser identity alone.
export async function createPlayerAnalyticsSession(player,{
  identity,courseId,courseTitle='',host,autoSaveDelayMs=500,onSaveError=()=>{},
}={}){
  if(!player||typeof player.addEventListener!=='function')throw new TypeError('A P2LRN Player is required');
  assertHost(host);
  if(typeof onSaveError!=='function')throw new TypeError('onSaveError must be a function');
  const course=required(courseId,'courseId');
  if(!Number.isFinite(autoSaveDelayMs)||autoSaveDelayMs<0||autoSaveDelayMs>60000)
    throw new TypeError('autoSaveDelayMs must be between 0 and 60000');
  const existing=await host.loadCurrent({courseId:course});
  if(existing!=null&&(existing.attempt?.status!=='in_progress'||existing.assignment?.packageId!==course))
    throw new Error('Host returned a non-resumable or mismatched attempt');
  const recorder=createResultRecorder(player,{identity,courseId:course,courseTitle,
    ...(existing?{attemptId:existing.attempt.id,attemptNumber:existing.attempt.number}:{})});
  if(existing)await recorder.restore(existing);

  // Preserve all previous Host Adapter capabilities (LTI, external packages,
  // SCORM/H5P and resource URLs) while adding portable persisted state.
  const originalAdapter=player.adapter??null;
  const stateContext=(context={})=>{
    const safe=JSON.parse(JSON.stringify(context??{}));
    // Context annotations on a SAVE must not change the identity of the state.
    delete safe.reason;delete safe.phase;delete safe.timestamp;
    const stable=value=>value===null||typeof value!=='object'?JSON.stringify(value):
      Array.isArray(value)?'['+value.map(stable).join(',')+']':
      '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
    return stable(safe);
  };
  const snapshots=new Map();
  for(const entry of existing?.submission?.states??[]){
    if(entry&&entry.context&&entry.value!==undefined)
      snapshots.set(stateContext(entry.context),JSON.parse(JSON.stringify(entry.value)));
  }
  let writeChain=Promise.resolve(),timer=null,lastError=null,finished=false,closed=false;
  const types=['p2lrn:score','p2lrn:statechange','p2lrn:progressionchange','p2lrn:learning','p2lrn:complete'];
  const cancel=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
  const serialize=task=>{
    const current=writeChain.then(task,task);
    writeChain=current.catch(()=>{});
    return current;
  };
  const persist=result=>serialize(async()=>{
    const saved=await host.saveResult(result);
    if(saved?.saved!==true)throw new Error('Host did not confirm result persistence');
    lastError=null;return result;
  });
  async function checkpoint(){
    if(closed)throw new Error('The result session has been closed');
    cancel();
    const result=await recorder.checkpoint();
    try{return await persist(result);}
    catch(error){lastError=error;onSaveError(error);throw error;}
  }
  function autoSave(){
    if(closed||finished)return;
    cancel();
    timer=setTimeout(()=>{timer=null;void checkpoint().catch(()=>{});},autoSaveDelayMs);
  }
  for(const type of types)player.addEventListener(type,autoSave);
  player.adapter={
    version:'1',
    async loadState(context={}){
      const fromHost=await originalAdapter?.loadState?.(context);
      if(fromHost!==null&&fromHost!==undefined)return fromHost;
      const key=stateContext(context);
      return snapshots.has(key)?JSON.parse(JSON.stringify(snapshots.get(key))):null;
    },
    async saveState(value,context={}){
      const saved=await originalAdapter?.saveState?.(value,context);
      const cloned=JSON.parse(JSON.stringify(value??null));
      const key=stateContext(context);
      snapshots.set(key,cloned);
      recorder.record({type:'p2lrn:statechange',detail:{context,payload:cloned}});
      autoSave();
      return saved;
    },
    async reportScore(value,context={}){
      const saved=await originalAdapter?.reportScore?.(value,context);
      recorder.record({type:'p2lrn:score',detail:{context,payload:value}});
      autoSave();
      return saved;
    },
    async emitEvent(event,context={}){
      const saved=await originalAdapter?.emitEvent?.(event,context);
      recorder.record({type:'p2lrn:learning',detail:{context,payload:event}});
      autoSave();
      return saved;
    },
    ...(originalAdapter?.resolveResourceUrl?{
      resolveResourceUrl:(...args)=>originalAdapter.resolveResourceUrl(...args)
    }:{})
  };
  const boundAdapter=player.adapter;
  async function finish(){
    if(closed)throw new Error('The result session has been closed');
    cancel();finished=true;
    const result=await recorder.finish();
    try{return await persist(result);}
    catch(error){lastError=error;onSaveError(error);throw error;}
  }
  function stop(){
    cancel();closed=true;
    for(const type of types)player.removeEventListener(type,autoSave);
    recorder.stop();
    if(player.adapter===boundAdapter)player.adapter=originalAdapter;
  }
  return Object.freeze({
    version:P2LRN_RESULT_HOST_VERSION,
    get identity(){return recorder.identity;},
    get attemptId(){return recorder.attemptId;},
    get resumed(){return Boolean(existing);},
    get lastSaveError(){return lastError;},
    checkpoint,finish,stop,
  });
}

// Browser transport for a Host-owned, authenticated same-origin endpoint.
// No endpoint is built into a .p2lrn course, and Player does not store passwords.
export function createHttpResultHost({
  baseUrl='/api/p2lrn/results',fetchImpl=globalThis.fetch,
  csrfToken=null,pageURL=globalThis.location?.href,
}={}){
  if(typeof fetchImpl!=='function')throw new TypeError('fetch is required');
  const root=new URL(baseUrl,pageURL||'https://p2lrn.local/');
  if(!['https:','http:'].includes(root.protocol)||root.username||root.password||root.hash||
     (root.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(root.hostname)))
    throw new TypeError('Invalid result endpoint URL');
  if(pageURL&&new URL(pageURL).origin!==root.origin)
    throw new Error('Result Host must use the same origin as the platform');
  const base=root.pathname.endsWith('/')?root.pathname.slice(0,-1):root.pathname;
  const url=(tail,courseId='')=>{
    const resolved=new URL(root.href);resolved.pathname=base+tail;
    if(courseId)resolved.searchParams.set('courseId',courseId);
    return resolved.href;
  };
  async function request(url,options={}){
    const headers={Accept:'application/json',...options.headers};
    const response=await fetchImpl(url,{credentials:'same-origin',redirect:'error',...options,headers});
    if(response.status===204)return null;
    if(!response.ok)throw new Error('P2LRN result Host HTTP '+response.status);
    return response.json();
  }
  return Object.freeze({
    version:P2LRN_RESULT_HOST_VERSION,
    indexUrl:courseId=>url('/index',required(courseId,'courseId')),
    async loadCurrent({courseId}={}){
      const body=await request(url('/current',required(courseId,'courseId')));
      return body?.result??null;
    },
    async saveResult(result){
      if(!result||typeof result!=='object')throw new TypeError('A .p2lrn-result object is required');
      const csrf=typeof csrfToken==='function'?await csrfToken():csrfToken;
      const headers={'Content-Type':'application/vnd.p2lrn-result+json'};
      if(csrf)headers['X-P2LRN-CSRF']=String(csrf);
      return request(url(''),{method:'PUT',headers,body:JSON.stringify(result)});
    },
  });
}
