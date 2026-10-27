export const LEARNING_EVENT_MODEL_VERSION = '1';
export const LEARNING_EVENT_SCHEMA = 'https://p2lrn.org/schema/learning-event/1';

const CATEGORY_BY_RUNTIME_TYPE = Object.freeze({
  'p2lrn:ready':'lifecycle',
  'p2lrn:rendered':'lifecycle',
  'p2lrn:activityready':'lifecycle',
  'p2lrn:navigation':'navigation',
  'p2lrn:answer':'assessment',
  'p2lrn:attempt':'assessment',
  'p2lrn:interaction':'interaction',
  'p2lrn:progress':'progress',
  'p2lrn:score':'assessment',
  'p2lrn:complete':'completion',
  'p2lrn:statechange':'state',
  'p2lrn:progressionchange':'adaptation',
  'p2lrn:timeout':'assessment',
  'p2lrn:timeupdate':'timing',
  'p2lrn:attention':'attention',
  'p2lrn:active-time':'attention',
  'p2lrn:xapi':'interop',
  'p2lrn:capability':'capability',
  'p2lrn:error':'error',
});

const TYPE_RE=/^p2lrn:[a-z][a-z0-9-]*$/;
let fallbackSequence=0;

function clone(value){
  if(value===undefined)return undefined;
  try{return JSON.parse(JSON.stringify(value));}catch{return null;}
}
function semantic(value,label,max=160){
  const text=String(value??'').trim();
  if(!text||text.length>max||!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text))throw new TypeError(label+' must be a semantic identifier.');
  return text;
}
function eventId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  fallbackSequence+=1;
  return 'learning-'+Date.now().toString(36)+'-'+fallbackSequence.toString(36);
}
function finiteSequence(value){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0)throw new TypeError('learning event sequence must be a non-negative safe integer.');
  return n;
}
function safeRecord(value){return value&&typeof value==='object'&&!Array.isArray(value)?clone(value)??{}:{};}

export function learningEventCategory(type,payload={}){
  const value=String(type??'').trim();
  if(!TYPE_RE.test(value))throw new TypeError('Invalid P2LRN learning event type: '+value);
  if(value==='p2lrn:interaction'){
    const action=String(payload?.action??'');
    if(action.startsWith('media-'))return 'media';
    if(action.startsWith('collaboration-'))return 'collaboration';
    if(action==='resource-open')return 'resource';
    if(action==='answer-change')return 'assessment';
  }
  return CATEGORY_BY_RUNTIME_TYPE[value] ?? 'extension';
}

export function createLearningEvent(runtimeEvent,{sessionId=null,attemptId=null,sequence=0,id=null,category=null}={}){
  if(!runtimeEvent||typeof runtimeEvent!=='object'||Array.isArray(runtimeEvent))throw new TypeError('P2LRN learning event requires a runtime event object.');
  const type=String(runtimeEvent.type??'').trim();
  if(!TYPE_RE.test(type))throw new TypeError('Invalid P2LRN learning event type: '+type);
  const timestamp=String(runtimeEvent.timestamp??'');
  if(!timestamp||Number.isNaN(Date.parse(timestamp)))throw new TypeError('P2LRN learning event runtime timestamp is invalid.');
  const context=safeRecord(runtimeEvent.context);
  const payload=safeRecord(runtimeEvent.payload);
  const out={
    schema:LEARNING_EVENT_SCHEMA,
    version:LEARNING_EVENT_MODEL_VERSION,
    id:id==null?eventId():semantic(id,'learning event id'),
    sequence:finiteSequence(sequence),
    type,
    category:category==null?learningEventCategory(type,payload):semantic(category,'learning event category'),
    timestamp,
    context,
    payload,
  };
  if(sessionId!=null)out.sessionId=semantic(sessionId,'learning event sessionId');
  if(attemptId!=null)out.attemptId=semantic(attemptId,'learning event attemptId');
  return Object.freeze(out);
}

export function createLearningEventStream({sessionId=null,attemptId=null,startSequence=0,onEvent=()=>{}}={}){
  if(typeof onEvent!=='function')throw new TypeError('learning event stream onEvent must be a function.');
  let sequence=finiteSequence(startSequence);
  let currentSession=sessionId==null?null:semantic(sessionId,'learning event sessionId');
  let currentAttempt=attemptId==null?null:semantic(attemptId,'learning event attemptId');
  return Object.freeze({
    push(runtimeEvent){
      sequence+=1;
      const event=createLearningEvent(runtimeEvent,{sessionId:currentSession,attemptId:currentAttempt,sequence});
      onEvent(event);
      return event;
    },
    setSession(value){currentSession=value==null?null:semantic(value,'learning event sessionId');},
    setAttempt(value){currentAttempt=value==null?null:semantic(value,'learning event attemptId');},
    snapshot(){return Object.freeze({sessionId:currentSession,attemptId:currentAttempt,sequence});},
  });
}

export function isLearningEvent(value){
  return Boolean(value)
    && value.schema===LEARNING_EVENT_SCHEMA
    && value.version===LEARNING_EVENT_MODEL_VERSION
    && TYPE_RE.test(String(value.type??''))
    && Number.isSafeInteger(value.sequence)
    && value.sequence>=0
    && typeof value.category==='string'
    && !Number.isNaN(Date.parse(String(value.timestamp??'')));
}

export const LEARNING_RUNTIME_EVENT_TYPES = Object.freeze(Object.keys(CATEGORY_BY_RUNTIME_TYPE));
export const LEARNING_EVENT_CATEGORIES = Object.freeze([...new Set(Object.values(CATEGORY_BY_RUNTIME_TYPE)),'extension']);

export function observeLearningEvents({target,sessionId=null,attemptId=null,onEvent=()=>{},types=LEARNING_RUNTIME_EVENT_TYPES}={}){
  if(!target||typeof target.addEventListener!=='function'||typeof target.removeEventListener!=='function')throw new TypeError('learning event observer target must be EventTarget-like.');
  if(typeof onEvent!=='function')throw new TypeError('learning event observer onEvent must be a function.');
  const stream=createLearningEventStream({sessionId,attemptId,onEvent});
  const listeners=[];
  for(const type of [...new Set(types.map(String))]){
    if(!TYPE_RE.test(type))throw new TypeError('Invalid observed P2LRN runtime event type: '+type);
    const handler=(event)=>{
      const runtime=event?.detail?.event;
      if(runtime&&runtime.type===type)stream.push(runtime);
    };
    target.addEventListener(type,handler);
    listeners.push([type,handler]);
  }
  return Object.freeze({
    stream,
    stop(){for(const [type,handler] of listeners)target.removeEventListener(type,handler);},
  });
}
