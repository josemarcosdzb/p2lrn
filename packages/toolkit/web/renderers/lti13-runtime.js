import {dispatchRuntimeEvent} from '../runtime-events.js';

export const acceptsPayload=true;
export const acceptsRemote=true;
const LTI_PROFILE='https://p2lrn.org/profile/lti';

function fail(code,message){const error=new Error(message);error.code=code;throw error;}
function httpUrl(value,label){
  let url;try{url=new URL(String(value));}catch{fail('P2LRN_LTI_LAUNCH_INVALID',`Invalid LTI ${label} URL.`);}
  if(!['http:','https:'].includes(url.protocol))fail('P2LRN_LTI_LAUNCH_INVALID',`LTI ${label} must use HTTP(S).`);
  return url;
}
export function validateLti13Launch(result){
  if(!result||typeof result!=='object')fail('P2LRN_LTI_LAUNCH_UNAVAILABLE','The host did not return an LTI launch session.');
  if(String(result.protocol??'')!=='LTI-1.3')fail('P2LRN_LTI_LAUNCH_INVALID','The host must explicitly return protocol LTI-1.3.');
  if(result.rebound!==true)fail('P2LRN_LTI_REBIND_REQUIRED','The host did not confirm an LTI 1.3 registration/deployment binding.');
  const url=httpUrl(result.url,'launch');
  const presentation=String(result.presentation??'iframe');
  if(!['iframe','window'].includes(presentation))fail('P2LRN_LTI_PRESENTATION_UNSUPPORTED',`Unsupported LTI presentation: ${presentation}`);
  return Object.freeze({...result,url:url.href,presentation});
}
function metadata(representation,entity){
  const rep=representation?.extensions?.[LTI_PROFILE];
  const act=entity?.extensions?.[LTI_PROFILE];
  return {...(act&&typeof act==='object'&&!Array.isArray(act)?act:{}),...(rep&&typeof rep==='object'&&!Array.isArray(rep)?rep:{})};
}
function emit(target,adapter,context,type,payload={}){return dispatchRuntimeEvent(target,type,{runtime:'lti13',...payload},context,{adapter});}

export async function render({container,representation,entity,resource,eventTarget,adapter,context}){
  if(!adapter?.resolveRuntimeLaunch)fail('P2LRN_LTI_HOST_LAUNCH_REQUIRED','LTI delivery requires host adapter resolveRuntimeLaunch().');
  const meta=metadata(representation,entity);
  const targetLinkUri=String(meta.targetLinkUri??representation?.location?.href??'').trim();
  if(!targetLinkUri)fail('P2LRN_LTI_TARGET_REQUIRED','LTI resource has no target_link_uri intent.');
  httpUrl(targetLinkUri,'target_link_uri');
  const request=Object.freeze({
    runtime:'lti13',
    profile:LTI_PROFILE,
    source:Object.freeze({...representation.location}),
    targetLinkUri,
    sourceStandard:meta.sourceStandard??null,
    sourceVersion:meta.sourceVersion??null,
    rebindRequired:meta.rebindRequired!==false,
    descriptorMember:meta.descriptorMember??null,
    title:meta.title??entity?.title??resource?.title??null,
  });
  let resolved;
  try{resolved=validateLti13Launch(await adapter.resolveRuntimeLaunch(request,Object.freeze({...context,runtime:'lti13'})));}
  catch(error){if(!error.code)error.code='P2LRN_LTI_LAUNCH_FAILED';throw error;}

  let destroyed=false;
  const shell=document.createElement('section');shell.className='p2lrn-lti-runtime';
  if(resolved.presentation==='window'){
    const message=document.createElement('p');message.textContent='Esta herramienta LTI se abrirá en una ventana independiente.';
    const link=document.createElement('a');link.href=resolved.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir herramienta';link.className='p2lrn-lti-window';
    link.addEventListener('click',()=>{if(!destroyed)emit(eventTarget,adapter,context,'p2lrn:activityready',{presentation:'window',sessionId:resolved.sessionId??null,registrationId:resolved.registrationId??null,deploymentId:resolved.deploymentId??null});});
    shell.append(message,link);
  }else{
    const iframe=document.createElement('iframe');iframe.className='p2lrn-lti-frame';iframe.title=Object.values(entity?.title??{})[0]??'LTI tool';
    iframe.referrerPolicy='no-referrer';
    iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads');
    iframe.setAttribute('allow','fullscreen');
    iframe.style.cssText='display:block;width:100%;min-height:70vh;border:0;background:#fff';
    iframe.addEventListener('load',()=>{if(!destroyed)emit(eventTarget,adapter,context,'p2lrn:activityready',{presentation:'iframe',sessionId:resolved.sessionId??null,registrationId:resolved.registrationId??null,deploymentId:resolved.deploymentId??null});},{once:true});
    iframe.src=resolved.url;shell.append(iframe);
  }
  container.replaceChildren(shell);
  emit(eventTarget,adapter,context,'p2lrn:statechange',{state:{prepared:true,presentation:resolved.presentation,sessionId:resolved.sessionId??null},authoritative:false});
  return Object.freeze({kind:'lti13',presentation:resolved.presentation,sessionId:resolved.sessionId??null,flush:async()=>undefined,destroy(){destroyed=true;container.replaceChildren();}});
}
