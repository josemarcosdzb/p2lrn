import {dispatchRuntimeEvent} from '../runtime-events.js';

export const acceptsPayload=true;
export const acceptsRemote=true;
const CMI5_PROFILE='https://p2lrn.org/profile/cmi5';

function metadata(representation,entity){
  const rep=representation?.extensions?.[CMI5_PROFILE];
  const act=entity?.extensions?.[CMI5_PROFILE];
  return {...(act&&typeof act==='object'&&!Array.isArray(act)?act:{}),...(rep&&typeof rep==='object'&&!Array.isArray(rep)?rep:{})};
}
function httpUrl(value,label){
  let url;try{url=new URL(String(value));}catch{throw Object.assign(new Error(`Invalid cmi5 ${label} URL.`),{code:'P2LRN_CMI5_LAUNCH_INVALID'});}
  if(!['http:','https:'].includes(url.protocol))throw Object.assign(new Error(`cmi5 ${label} must use HTTP(S).`),{code:'P2LRN_CMI5_LAUNCH_INVALID'});
  return url;
}
function validateLaunch(result){
  if(!result||typeof result!=='object'||typeof result.url!=='string')throw Object.assign(new Error('The host did not return a cmi5 launch URL.'),{code:'P2LRN_CMI5_LAUNCH_UNAVAILABLE'});
  const url=httpUrl(result.url,'launch');
  for(const key of ['endpoint','fetch','actor','registration','activityId'])if(!url.searchParams.get(key))throw Object.assign(new Error(`cmi5 launch URL is missing required parameter: ${key}`),{code:'P2LRN_CMI5_LAUNCH_INVALID'});
  httpUrl(url.searchParams.get('endpoint'),'endpoint');
  httpUrl(url.searchParams.get('fetch'),'fetch');
  let actor;try{actor=JSON.parse(url.searchParams.get('actor'));}catch{throw Object.assign(new Error('cmi5 actor launch parameter is not valid JSON.'),{code:'P2LRN_CMI5_LAUNCH_INVALID'});}
  if(!actor||typeof actor!=='object'||!actor.account||typeof actor.account!=='object'||!String(actor.account.homePage??'').trim()||!String(actor.account.name??'').trim()){
    throw Object.assign(new Error('cmi5 actor must use the required account IFI.'),{code:'P2LRN_CMI5_LAUNCH_INVALID'});
  }
  const registration=url.searchParams.get('registration');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registration))throw Object.assign(new Error('cmi5 registration must be a UUID.'),{code:'P2LRN_CMI5_LAUNCH_INVALID'});
  try{new URL(url.searchParams.get('activityId'));}catch{throw Object.assign(new Error('cmi5 activityId must be an absolute IRI/URL.'),{code:'P2LRN_CMI5_LAUNCH_INVALID'});}
  const launchMethod=String(result.launchMethod??'AnyWindow');
  if(!['AnyWindow','OwnWindow'].includes(launchMethod))throw Object.assign(new Error(`Unsupported cmi5 launchMethod: ${launchMethod}`),{code:'P2LRN_CMI5_LAUNCH_METHOD_UNSUPPORTED'});
  return Object.freeze({...result,url:url.href,launchMethod});
}
function emit(target,adapter,context,type,payload={}){return dispatchRuntimeEvent(target,type,{runtime:'cmi5',...payload},context,{adapter});}

export async function render({container,representation,entity,resource,eventTarget,adapter,context}){
  if(!adapter?.resolveRuntimeLaunch){
    const error=new Error('cmi5 delivery requires host adapter resolveRuntimeLaunch().');
    error.code='P2LRN_CMI5_HOST_LAUNCH_REQUIRED';
    throw error;
  }
  const meta=metadata(representation,entity);
  const request=Object.freeze({
    runtime:'cmi5',
    profile:CMI5_PROFILE,
    source:Object.freeze({...representation.location}),
    sourceAuId:meta.auId??null,
    moveOn:meta.moveOn??null,
    masteryScore:meta.masteryScore??null,
    launchMethod:meta.launchMethod??null,
    launchParameters:meta.launchParameters??null,
    entitlementKey:meta.entitlementKey??null,
    title:entity?.title??resource?.title??null,
  });
  let resolved;
  try{resolved=validateLaunch(await adapter.resolveRuntimeLaunch(request,Object.freeze({...context,runtime:'cmi5'})));}
  catch(error){
    if(!error.code)error.code='P2LRN_CMI5_LAUNCH_FAILED';
    throw error;
  }

  let destroyed=false,popup=null;
  const shell=document.createElement('section');shell.className='p2lrn-cmi5-runtime';
  if(resolved.launchMethod==='OwnWindow'){
    const message=document.createElement('p');message.textContent='Esta actividad cmi5 requiere abrirse en una ventana propia.';
    const button=document.createElement('button');button.type='button';button.textContent='Abrir actividad';
    button.addEventListener('click',()=>{
      if(destroyed)return;
      popup=window.open(resolved.url,'_blank','noopener,noreferrer');
      if(!popup){emit(eventTarget,adapter,context,'p2lrn:error',{phase:'cmi5-popup',error:'The browser blocked the cmi5 OwnWindow launch.'});return;}
      emit(eventTarget,adapter,context,'p2lrn:activityready',{launchMethod:'OwnWindow',sourceAuId:meta.auId??null,sessionId:resolved.sessionId??null});
    });
    shell.append(message,button);
  }else{
    const iframe=document.createElement('iframe');
    iframe.className='p2lrn-cmi5-frame';
    iframe.title=Object.values(entity?.title??{})[0]??'cmi5';
    iframe.referrerPolicy='no-referrer';
    iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads');
    iframe.setAttribute('allow','fullscreen');
    iframe.style.cssText='display:block;width:100%;min-height:70vh;border:0;background:#fff';
    iframe.addEventListener('load',()=>{if(!destroyed)emit(eventTarget,adapter,context,'p2lrn:activityready',{launchMethod:'AnyWindow',sourceAuId:meta.auId??null,sessionId:resolved.sessionId??null});},{once:true});
    iframe.src=resolved.url;shell.append(iframe);
  }
  container.replaceChildren(shell);
  emit(eventTarget,adapter,context,'p2lrn:statechange',{state:{prepared:true,launchMethod:resolved.launchMethod,sessionId:resolved.sessionId??null},authoritative:false});
  return Object.freeze({
    kind:'cmi5',launchMethod:resolved.launchMethod,sessionId:resolved.sessionId??null,
    flush:async()=>undefined,
    destroy(){destroyed=true;container.replaceChildren();},
  });
}
