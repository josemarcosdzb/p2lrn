export const XAPI_PROFILE='https://p2lrn.org/profile/xapi';
export const XAPI_DECLARATION_VERSION='2.0';
export const XAPI_INTENT_SCHEMA='https://p2lrn.org/schema/xapi-statement-intent/1';
export const XAPI_INTENT_VERSION='1';

const DEFAULT_VERBS=Object.freeze({
  initialized:'http://adlnet.gov/expapi/verbs/initialized',
  answered:'http://adlnet.gov/expapi/verbs/answered',
  scored:'http://adlnet.gov/expapi/verbs/scored',
  completed:'http://adlnet.gov/expapi/verbs/completed',
});
const DISPLAY=Object.freeze({initialized:'initialized',answered:'answered',scored:'scored',completed:'completed'});

function iri(value,label){
  const text=String(value??'').trim();
  if(!text)throw new TypeError(`${label} is required.`);
  let url;try{url=new URL(text);}catch{throw new TypeError(`${label} must be an absolute IRI.`);}
  if(['http:','https:'].includes(url.protocol)&&(url.username||url.password))throw new TypeError(`${label} must not contain embedded credentials.`);
  return text;
}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function compact(value){return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined&&v!==null));}

export function normalizeXapiActivityDeclaration(value){
  if(value==null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('xAPI activity declaration must be an object.');
  if(value.version!==XAPI_DECLARATION_VERSION)throw new TypeError(`xAPI activity declaration version must be ${XAPI_DECLARATION_VERSION}.`);
  const verbs={};
  if(value.verbs!=null){
    if(!value.verbs||typeof value.verbs!=='object'||Array.isArray(value.verbs))throw new TypeError('xAPI verbs must be an object.');
    for(const key of Object.keys(value.verbs)){
      if(!(key in DEFAULT_VERBS))throw new TypeError(`Unsupported xAPI verb override key: ${key}`);
      verbs[key]=iri(value.verbs[key],`xAPI verb ${key}`);
    }
  }
  return Object.freeze(compact({
    version:XAPI_DECLARATION_VERSION,
    activityId:iri(value.activityId,'xAPI activityId'),
    profileId:value.profileId==null?undefined:iri(value.profileId,'xAPI profileId'),
    verbs:Object.keys(verbs).length?Object.freeze(verbs):undefined,
  }));
}
function responseString(value){
  if(value==null)return undefined;
  if(typeof value==='string')return value;
  if(['number','boolean'].includes(typeof value))return String(value);
  try{return JSON.stringify(value);}catch{return undefined;}
}
function scoreResult(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const score={};
  const raw=Number(value.raw),min=Number(value.min),max=Number(value.max),scaled=Number(value.scaled??value.normalized);
  if(Number.isFinite(raw))score.raw=raw;
  if(Number.isFinite(min))score.min=min;
  if(Number.isFinite(max))score.max=max;
  if(Number.isFinite(scaled)&&scaled>=-1&&scaled<=1)score.scaled=scaled;
  return Object.keys(score).length?score:undefined;
}
function resultFor(event,key){
  const payload=event.payload??{},result={};
  if(key==='answered'){
    const response=responseString(payload.response??payload.answer);
    if(response!==undefined)result.response=response;
    if(typeof payload.correct==='boolean')result.success=payload.correct;
  }else if(key==='scored'){
    const score=scoreResult(payload);if(score)result.score=score;
    if(typeof payload.passed==='boolean')result.success=payload.passed;
  }else if(key==='completed'){
    result.completion=true;
    const nested=payload.score&&typeof payload.score==='object'?payload.score:payload;
    const score=scoreResult(nested);if(score)result.score=score;
    if(typeof nested?.passed==='boolean')result.success=nested.passed;
  }
  return Object.keys(result).length?Object.freeze(result):undefined;
}

export function runtimeEventToXapiStatementIntent(event){
  if(!event||typeof event!=='object')return null;
  if(event.payload?.runtime==='cmi5')return null;
  const declaration=normalizeXapiActivityDeclaration(event.context?.xapi);
  if(!declaration)return null;
  const key=event.type==='p2lrn:activityready'?'initialized'
    :event.type==='p2lrn:answer'&&event.payload?.final===true?'answered'
    :event.type==='p2lrn:score'?'scored'
    :event.type==='p2lrn:complete'?'completed'
    :null;
  if(!key)return null;
  const verbId=declaration.verbs?.[key]??DEFAULT_VERBS[key];
  const result=resultFor(event,key);
  const source=compact({
    packageId:event.context?.packageId??undefined,
    contentRoot:event.context?.contentRoot??undefined,
    entityId:event.context?.entityId??undefined,
    resourceId:event.context?.resourceId??undefined,
    representationId:event.context?.representationId??undefined,
    runtime:event.payload?.runtime??undefined,
    questionId:event.payload?.questionId??undefined,
    responseIdentifier:event.payload?.responseIdentifier??undefined,
    itemIdentifier:event.payload?.itemIdentifier??undefined,
  });
  return Object.freeze(compact({
    schema:XAPI_INTENT_SCHEMA,
    version:XAPI_INTENT_VERSION,
    timestamp:event.timestamp,
    verb:Object.freeze({id:verbId,display:Object.freeze({'en-US':DISPLAY[key]})}),
    object:Object.freeze({objectType:'Activity',id:declaration.activityId}),
    result,
    profileId:declaration.profileId,
    source:Object.freeze(source),
  }));
}
