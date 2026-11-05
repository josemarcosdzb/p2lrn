import {openNestedPackage, openPayloadPackage} from '../package-member.js';
import {createScormApi, isScormRuntimeProtocol, normalizeScormVersion, SCORM_PROFILE, SCORM_RUNTIME_PROTOCOL} from '../scorm-runtime-core.js';
import {createScorm2004Sequencer, parseScormManifest} from '../scorm2004-sequencing.js';
import {dispatchRuntimeEvent} from '../runtime-events.js';
import {isSafeRuntimeMessage} from '../runtime-message-security.js';
import {resolveScormRuntimeUrl} from '../runtime-host-config.js';

export const acceptsPayload = true;

const MAX_RUNTIME_FILES = 5000;
const MAX_RUNTIME_BYTES = 256 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', {fatal: false});

function mediaTypeForPath(path) {
  const ext = String(path).toLowerCase().split('?')[0].split('#')[0].split('.').pop();
  return ({
    html:'text/html', htm:'text/html', xhtml:'application/xhtml+xml', css:'text/css', js:'text/javascript', mjs:'text/javascript',
    json:'application/json', xml:'application/xml', txt:'text/plain', svg:'image/svg+xml', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
    gif:'image/gif', webp:'image/webp', ico:'image/x-icon', mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', mp4:'video/mp4', webm:'video/webm',
    pdf:'application/pdf', woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf', swf:'application/x-shockwave-flash',
  })[ext] ?? 'application/octet-stream';
}

function scormExtension(value) {
  const extension = value?.extensions?.[SCORM_PROFILE];
  return extension && typeof extension === 'object' ? extension : {};
}

function findLaunchMember(representation, payload) {
  if (payload?.member) return String(payload.member);
  if (representation?.location?.type === 'package-member') return String(representation.location.member ?? '');
  const extension = scormExtension(representation);
  return String(extension.member ?? extension.href ?? '');
}
function splitLaunchReference(value) {
  const raw = String(value ?? '').trim().replace(/^\.\//u, '');
  const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/u.exec(raw);
  return {
    path:String(match?.[1] ?? '').replace(/^\//u, ''),
    suffix:String(match?.[2] ?? '') + String(match?.[3] ?? ''),
  };
}

async function resolveNestedArchive(pkg, representation, payload) {
  if (payload?.nested?.archive) return payload.nested;
  if (payload?.multipart === true) return openPayloadPackage(payload);
  if (representation?.location?.type === 'embedded') return openNestedPackage(pkg, representation.location.path);
  const error = new Error('SCORM runtime requires an embedded ZIP or package-member representation.');
  error.code = 'P2LRN_SCORM_PACKAGE_UNAVAILABLE';
  throw error;
}

async function createSequencerForPackage(nested, version, launchMember, sequencingState = null) {
  if (version !== '2004') return null;
  const manifestMember = nested.names().find((name) => String(name).toLowerCase() === 'imsmanifest.xml');
  if (!manifestMember) return null;
  const xml = decoder.decode(await nested.read(manifestMember));
  const manifest = parseScormManifest(xml);
  if (manifest.version !== '2004') return null;
  return createScorm2004Sequencer(manifest, {launchMember, sequencingState});
}

async function collectRuntimeFiles(nested) {
  const names = nested.names();
  if (names.length > MAX_RUNTIME_FILES) {
    const error = new Error(`SCORM package contains too many runtime files (${names.length}).`);
    error.code = 'P2LRN_SCORM_RUNTIME_TOO_LARGE';
    throw error;
  }
  let total = 0;
  const files = [];
  const transfers = [];
  for (const path of names) {
    const entry = nested.archive.entries.get(path);
    if (!entry) continue;
    total += entry.uncompressedSize;
    if (total > MAX_RUNTIME_BYTES) {
      const error = new Error(`SCORM runtime payload exceeds ${MAX_RUNTIME_BYTES} bytes.`);
      error.code = 'P2LRN_SCORM_RUNTIME_TOO_LARGE';
      throw error;
    }
    const bytes = await nested.read(path);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    files.push({path, mediaType: mediaTypeForPath(path), buffer});
    transfers.push(buffer);
  }
  return {files, transfers, total};
}

function scoreFromState(state) {
  const values = state?.values ?? {};
  const is2004 = state?.scormVersion === '2004';
  const raw = Number(values[is2004 ? 'cmi.score.raw' : 'cmi.core.score.raw']);
  const max = Number(values[is2004 ? 'cmi.score.max' : 'cmi.core.score.max']);
  const scaled = Number(values['cmi.score.scaled']);
  const status = String(values[is2004 ? 'cmi.success_status' : 'cmi.core.lesson_status'] ?? '');
  const normalized = Number.isFinite(scaled) ? scaled : (Number.isFinite(raw) && Number.isFinite(max) && max !== 0 ? raw / max : null);
  if (!Number.isFinite(raw) && normalized == null && !['passed','failed'].includes(status)) return null;
  return {
    graded: true,
    raw: Number.isFinite(raw) ? raw : null,
    max: Number.isFinite(max) ? max : null,
    normalized: normalized == null ? null : Math.max(-1, Math.min(1, normalized)),
    passed: status === 'passed' ? true : status === 'failed' ? false : null,
  };
}

export function createScormSandboxShell(token, version) {
  const apiFactory = createScormApi.toString();
  const protocol = JSON.stringify(SCORM_RUNTIME_PROTOCOL);
  const versionLiteral = JSON.stringify(version);
  return String.raw`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline' blob:; img-src blob: data:; media-src blob: data:; font-src blob: data:; frame-src blob: data: about:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none';"><style>html,body,#stage{width:100%;height:100%;margin:0;overflow:auto}#content{width:100%;height:100%;border:0;display:block}.error{font:14px system-ui,sans-serif;padding:16px;color:#7a1f1f;white-space:pre-wrap}</style></head><body><div id="stage"></div><script>
(()=>{
'use strict';
let privatePort=null;let privateSend=null;let initialized=false;
const PROTOCOL=${protocol}; const SCORM_VERSION=${versionLiteral};
const createScormApi=${apiFactory};
const stage=document.getElementById('stage'); const files=new Map(); const urls=new Map(); let inlineScriptId=0; let content=null; let runtime=null; let currentPath=''; let identity={learnerId:'',learnerName:'',launchData:''};
function reply(action,payload={}){ privateSend?.({protocol:PROTOCOL,action,...payload}); }
function normalize(path){ const out=[]; for(const part of String(path||'').replace(/\\/g,'/').split('/')){ if(!part||part==='.')continue; if(part==='..'){if(!out.length)return null;out.pop();}else out.push(part);} return out.join('/'); }
function resolve(base,ref){ const raw=String(ref||'').trim(); if(!raw||raw[0]==='#'||/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw))return null; const match=/^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(raw); const target=match?.[1]||''; const root=target.startsWith('/'); const baseDir=base.includes('/')?base.slice(0,base.lastIndexOf('/')+1):''; const path=normalize(root?target.slice(1):baseDir+target); return path&&files.has(path)?{path,suffix:(match?.[2]||'')+(match?.[3]||'')}:null; }
function text(path){ return new TextDecoder('utf-8',{fatal:false}).decode(files.get(path).buffer); }
function rewriteCss(css,base,stack=new Set()){ return String(css).replace(/@import\s+(?:url\()?\s*(['"]?)([^'"\)\s;]+)\1\s*\)?\s*;/gi,(all,_q,ref)=>{const r=resolve(base,ref);if(!r||stack.has(r.path)||!files.get(r.path)?.mediaType?.includes('css'))return all;const next=new Set(stack);next.add(r.path);return rewriteCss(text(r.path),r.path,next);}).replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi,(all,_q,ref)=>{const r=resolve(base,ref);return r&&urls.has(r.path)?'url("'+urls.get(r.path)+r.suffix+'")':all;}); }
function rewriteHtml(path){ currentPath=path; const source=text(path); const doc=new DOMParser().parseFromString(source,'text/html'); doc.querySelectorAll('base').forEach((node)=>node.remove()); for(const el of doc.querySelectorAll('*')){for(const attr of [...el.attributes]){const name=attr.name.toLowerCase();if(/^on[a-z][a-z0-9]*$/.test(name)){el.setAttribute('data-p2lrn-legacy-'+name,attr.value);el.removeAttribute(attr.name);}}} const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline' blob:; img-src blob: data:; media-src blob: data:; font-src blob: data:; frame-src blob: data: about:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none';";doc.head?.prepend(csp);
  const attrs=[['src','src'],['href','href'],['poster','poster'],['data','data'],['background','background']];
  for(const el of doc.querySelectorAll('*')){ for(const [attr] of attrs){ if(!el.hasAttribute(attr))continue; const raw=el.getAttribute(attr); const r=resolve(path,raw); if(!r)continue; const tag=el.tagName.toLowerCase(); const mt=files.get(r.path)?.mediaType||''; if((tag==='a'||tag==='area')&&mt.includes('html')){el.setAttribute(attr,'#');el.setAttribute('data-p2lrn-member',r.path);continue;} if((tag==='iframe'||tag==='frame')&&mt.includes('html')){el.removeAttribute(attr);el.setAttribute('data-p2lrn-frame-member',r.path);continue;} if(urls.has(r.path))el.setAttribute(attr,urls.get(r.path)+r.suffix); }
    if(el.hasAttribute('style'))el.setAttribute('style',rewriteCss(el.getAttribute('style'),path));
    if(el.hasAttribute('srcset'))el.setAttribute('srcset',el.getAttribute('srcset').split(',').map((item)=>{const bits=item.trim().split(/\s+/);const r=resolve(path,bits[0]);if(r&&urls.has(r.path))bits[0]=urls.get(r.path)+r.suffix;return bits.join(' ');}).join(', ')); }
  for(const style of doc.querySelectorAll('style'))style.textContent=rewriteCss(style.textContent||'',path);
  return '<!doctype html>'+doc.documentElement.outerHTML;
}
function wireDocument(doc,path){ if(!doc)return; doc.addEventListener('click',(event)=>{const a=event.target?.closest?.('[data-p2lrn-member]');if(!a)return;event.preventDefault();void navigate(a.getAttribute('data-p2lrn-member'));});
  for(const frame of doc.querySelectorAll('[data-p2lrn-frame-member]')){const member=frame.getAttribute('data-p2lrn-frame-member');try{frame.srcdoc=rewriteHtml(member);}catch{}}
}
async function activateScripts(root){ for(const old of [...root.querySelectorAll('script')]){ const script=document.createElement('script'); for(const attr of [...old.attributes])script.setAttribute(attr.name,attr.value); const type=String(old.getAttribute('type')||'').toLowerCase().trim();if(!old.hasAttribute('src')&&(!type||['module','text/javascript','application/javascript','text/ecmascript','application/ecmascript'].includes(type))){const src=URL.createObjectURL(new Blob([old.textContent||''],{type:'text/javascript'}));urls.set('p2lrn-inline-'+(++inlineScriptId),src);script.setAttribute('src',src);}else if(!old.hasAttribute('src'))script.textContent=old.textContent||''; const waits=script.hasAttribute('src')&&!script.hasAttribute('async'); let done=null; if(waits)done=new Promise((resolve,reject)=>{script.addEventListener('load',resolve,{once:true});script.addEventListener('error',()=>reject(new Error('SCORM JavaScript resource failed to load')),{once:true});}); old.replaceWith(script); if(done)await done; } }
async function installLegacyInlineHandlers(doc){
  const handlers=[],onLoadElements=[];
  let size=0;
  for(const node of doc.querySelectorAll('*')){
    let id=null;
    for(const attr of [...node.attributes]){
      const name=attr.name.toLowerCase();
      const handlerName=name.startsWith('data-p2lrn-legacy-on')?name.slice('data-p2lrn-legacy-'.length):name;
      if(!/^on[a-z][a-z0-9]*$/.test(handlerName))continue;
      const body=attr.value;
      node.removeAttribute(attr.name);
      size+=body.length;
      if(++inlineScriptId>5000||size>512*1024)throw new Error('SCORM has too many legacy event handlers');
      if(!id){id='p2lrn-scorm-event-'+inlineScriptId;node.setAttribute('data-p2lrn-legacy-id',id);}
      handlers.push({id,eventName:handlerName.slice(2),body});
      if(handlerName==='onload'&&(node===doc.body||node===doc.documentElement))onLoadElements.push(node);
    }
  }
  if(!handlers.length)return;
  const text=handlers.map(x=>{
    const selector=JSON.stringify('[data-p2lrn-legacy-id="'+x.id+'"]');
    return '(function(){const node=document.querySelector('+selector+');if(!node)return;'+
      'node.addEventListener('+JSON.stringify(x.eventName)+',function(event){'+
      'const output=(function(event){\n'+x.body+'\n}).call(this,event);'+
      'if(output===false){event.preventDefault();event.stopPropagation();}'+
      '});})();';
  }).join('\n');
  const src=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));
  urls.set('p2lrn-legacy-events-'+(++inlineScriptId),src);
  const script=doc.createElement('script');script.src=src;
  await new Promise((resolve,reject)=>{
    script.addEventListener('load',resolve,{once:true});
    script.addEventListener('error',()=>reject(new Error('SCORM legacy event handlers failed to load')),{once:true});
    doc.head.append(script);
  });
  for(const element of onLoadElements)element.dispatchEvent(new Event('load'));
}
async function navigate(path){ if(!files.has(path)){showError('SCORM launch member not found: '+path);return;} const mt=files.get(path).mediaType||''; if(!mt.includes('html')&&!mt.includes('xhtml')){showError('SCORM launch member is not HTML/XHTML: '+path);return;} currentPath=path; const parsed=new DOMParser().parseFromString(rewriteHtml(path),'text/html'); document.title=parsed.title||document.title; document.head.replaceChildren(...[...parsed.head.childNodes].map((node)=>document.importNode(node,true))); document.body.replaceChildren(...[...parsed.body.childNodes].map((node)=>document.importNode(node,true))); wireDocument(document,path); await activateScripts(document); await installLegacyInlineHandlers(document); reply('ready',{member:path}); }
function showError(message){const pre=document.createElement('pre');pre.className='error';pre.textContent=message;(document.body||document.documentElement).replaceChildren(pre);reply('error',{message});}
function makeUrls(){ for(const [path,file] of files){ if(file.mediaType.includes('html')||file.mediaType.includes('xhtml')||file.mediaType.includes('css'))continue; urls.set(path,URL.createObjectURL(new Blob([file.buffer],{type:file.mediaType||'application/octet-stream'}))); }
  for(const [path,file] of files){ if(!file.mediaType.includes('css'))continue; const compiled=rewriteCss(text(path),path,new Set([path])); urls.set(path,URL.createObjectURL(new Blob([compiled],{type:'text/css'}))); }
}
function installApi(initialState,learnerId,learnerName,launchData,navigationState){ identity={learnerId,learnerName,launchData}; runtime=createScormApi({version:SCORM_VERSION,initialState,learnerId,learnerName,launchData,requestValid:navigationState?.requestValid||{},onChange:(state,meta)=>reply('state',{state,meta}),onNavigationRequest:(request,state)=>reply('navigation-request',{request,state})}); if(SCORM_VERSION==='2004')window.API_1484_11=runtime.api; else window.API=runtime.api; }
async function onPortMessage(event){ const data=event.data;if(!data||data.protocol!==PROTOCOL)return; try{ if(data.action==='init'&&!initialized){initialized=true;for(const file of data.files||[])files.set(file.path,{mediaType:file.mediaType,buffer:file.buffer});makeUrls();installApi(data.initialState||{},data.learnerId||'',data.learnerName||'',data.launchData||'',data.navigationState||null);await navigate(data.launchMember);reply('initialized',{version:SCORM_VERSION,files:files.size});return;}if(data.action==='navigate'&&initialized){installApi(data.initialState||{},identity.learnerId,identity.learnerName,identity.launchData,data.navigationState||null);await navigate(data.launchMember);reply('navigated',{member:data.launchMember,itemIdentifier:data.itemIdentifier||null});}}catch(error){showError(String(error?.message||error));} }
window.addEventListener('message',(event)=>{const data=event.data;if(privatePort||event.source!==parent||!data||data.protocol!==PROTOCOL||data.action!=='connect'||!event.ports?.[0])return;privatePort=event.ports[0];privateSend=privatePort.postMessage.bind(privatePort);privatePort.onmessage=onPortMessage;privatePort.start?.();reply('connected');});
window.addEventListener('unload',()=>{for(const url of urls.values())try{URL.revokeObjectURL(url)}catch{}});
parent.postMessage({protocol:PROTOCOL,action:'shell-ready',version:SCORM_VERSION},'*');
})();
</script></body></html>`;
}

async function loadInitialState(adapter, context, eventTarget) {
  if (!adapter?.loadState) return {};
  try {
    const state = await adapter.loadState(context);
    return state && typeof state === 'object' ? state : {};
  } catch (error) {
    dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {phase:'scorm-load-state', error:String(error?.message ?? error)}, context, {adapter});
    return {};
  }
}

export async function render({container, payload, representation, package: pkg, adapter, eventTarget, context, runtimeBaseUrl = null}) {
  const nested = await resolveNestedArchive(pkg, representation, payload);
  const launchReference = splitLaunchReference(findLaunchMember(representation, payload));
  const launchMember = launchReference.path;
  if (!launchMember || !nested.archive.entries.has(launchMember)) {
    const error = new Error(`SCORM launch member is missing from preserved package: ${launchMember || '(empty)'}`);
    error.code = 'P2LRN_SCORM_LAUNCH_MISSING';
    throw error;
  }
  const extension = scormExtension(representation);
  const version = normalizeScormVersion(extension.scormVersion ?? extension.version ?? '1.2');
  const restoredState = await loadInitialState(adapter, context, eventTarget);
  const restoredValues = {...(restoredState.values ?? restoredState)};
  for (const key of ['cmi.learner_id','cmi.learner_name','cmi.core.student_id','cmi.core.student_name']) delete restoredValues[key];
  const initialState = restoredState.values ? {...restoredState, values:restoredValues} : restoredValues;
  let sequencer = null;
  try {
    sequencer = await createSequencerForPackage(nested, version, launchMember, initialState?.sequencing ?? null);
  } catch (error) {
    dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {
      phase:'scorm-sequencing-manifest', error:String(error?.message ?? error),
    }, context, {adapter});
  }
  const {files, transfers, total} = await collectRuntimeFiles(nested);
  let isolatedRuntimeUrl = null;
  try {
    isolatedRuntimeUrl = resolveScormRuntimeUrl(runtimeBaseUrl);
  } catch (error) {
    if (error?.code !== 'P2LRN_SCORM_RUNTIME_ORIGIN_NOT_ISOLATED') throw error;
  }
  const fallbackToken = null; // Kept only for the legacy shell function signature.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; clipboard-read 'none'; clipboard-write 'none'; fullscreen");
  iframe.className = 'p2lrn-scorm-runtime';
  iframe.setAttribute('title', 'SCORM');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.style.cssText = 'display:block;width:100%;height:clamp(520px,68vh,760px);min-height:420px;max-width:100%;border:0;background:#fff';

  const topology = isolatedRuntimeUrl ? 'isolated-parent-api' : 'opaque-current-window-api';
  if (isolatedRuntimeUrl) {
    // This document is on a different origin from the LMS/application. The
    // isolated shell and its SCO child may therefore share the runtime origin
    // for canonical parent.API discovery without granting application-origin access.
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads');
  } else {
    iframe.setAttribute('sandbox', 'allow-scripts');
  }

  let destroyed = false;
  let didInit = false;
  let runtimePort = null;
  let runtimeSend = null;
  let runtimeProtocol = SCORM_RUNTIME_PROTOCOL;
  let saveQueue = Promise.resolve();
  let lastReported = '';
  const saveState = (state, reason) => {
    const persistedState = sequencer && state && typeof state === 'object' ? {...state, sequencing:sequencer.serialize()} : state;
    dispatchRuntimeEvent(eventTarget, 'p2lrn:statechange', {state:persistedState, runtime:'scorm', reason, topology}, context, {adapter});
    if (adapter?.saveState) {
      saveQueue = saveQueue.catch(() => undefined).then(() => adapter.saveState(persistedState, context)).catch((error) => {
        dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {phase:'scorm-save-state', error:String(error?.message ?? error)}, context, {adapter});
      });
    }
    if ((reason === 'commit' || reason === 'terminate') && adapter?.reportScore) {
      const score = scoreFromState(persistedState);
      const key = score ? JSON.stringify(score) : '';
      if (score && key !== lastReported) {
        lastReported = key;
        saveQueue = saveQueue.catch(() => undefined).then(() => adapter.reportScore({...score,authoritative:false}, context)).catch((error) => {
          dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {phase:'scorm-report-score', error:String(error?.message ?? error)}, context, {adapter});
        });
      }
    }
    if (reason === 'terminate') {
      const pendingNavigation = version === '2004' && sequencer && String(state?.values?.['adl.nav.request'] ?? '_none') !== '_none';
      if (!pendingNavigation) dispatchRuntimeEvent(eventTarget, 'p2lrn:complete', {runtime:'scorm', topology, authoritative:false, score:scoreFromState(persistedState), state:persistedState}, context, {adapter});
    }
  };

  const sendRuntimeCommand = (message) => {
    runtimeSend?.(message);
  };

  const processRuntimeData = (data) => {
    if (!isSafeRuntimeMessage(data) || data.protocol !== runtimeProtocol) return;
    if (data.action === 'resize') {
      const height = Number(data.height);
      if (Number.isFinite(height)) iframe.style.height = `${Math.max(420, Math.min(760, Math.ceil(height)))}px`;
      return;
    }
    if (data.action === 'state' && data.state) {
      saveState(data.state, data.meta?.reason ?? 'state');
    } else if (data.action === 'ready') {
      dispatchRuntimeEvent(eventTarget, 'p2lrn:activityready', {
        runtime:'scorm', scormVersion:version, member:data.member, packageBytes:total, topology,
      }, context, {adapter});
    } else if (data.action === 'navigation-request') {
      const request = String(data.request ?? '_none');
      if (!sequencer) {
        dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {
          phase:'scorm-sequencing-unavailable', error:`SCORM 2004 navigation request cannot be resolved: ${request}`,
        }, context, {adapter});
        return;
      }
      const result = sequencer.navigate(request, data.state ?? null);
      saveState(data.state && typeof data.state === 'object' ? data.state : {}, 'sequencing');
      dispatchRuntimeEvent(eventTarget, 'p2lrn:navigation', {runtime:'scorm', topology, ...result}, context, {adapter});
      if (result.blocked) {
        dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {
          phase:'scorm-sequencing-blocked', error:String(result.reason ?? `SCORM navigation blocked: ${request}`), result,
        }, context, {adapter});
        return;
      }
      if (result.terminal) {
        dispatchRuntimeEvent(eventTarget, 'p2lrn:complete', {runtime:'scorm', topology, authoritative:false, request, score:scoreFromState(data.state), state:{...(data.state ?? {}), sequencing:sequencer.serialize()}}, context, {adapter});
        return;
      }
      if (!result.targetMember || !nested.archive.entries.has(result.targetMember)) {
        dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {
          phase:'scorm-sequencing-target', error:`Resolved SCORM target is not present in the package: ${String(result.targetMember ?? '')}`,
        }, context, {adapter});
        return;
      }
      const nextState = data.state && typeof data.state === 'object'
        ? {...data.state, values:{...(data.state.values ?? {}), 'adl.nav.request':'_none'}, lifecycle:'not-initialized'}
        : {};
      sendRuntimeCommand({
        protocol:runtimeProtocol, action:'navigate', launchMember:result.targetMember,
        itemIdentifier:result.targetItemIdentifier, initialState:nextState, navigationState:sequencer.state(),
      });
    } else if (data.action === 'blocked-navigation') {
      dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {
        phase:'scorm-navigation-blocked', error:`SCORM attempted blocked navigation: ${String(data.href ?? '')}`,
      }, context, {adapter});
    } else if (data.action === 'error') {
      dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {phase:'scorm-shell', error:String(data.message ?? 'SCORM runtime error')}, context, {adapter});
    }
  };

  const initPayload = () => ({
    protocol: runtimeProtocol, action:'init', version,
    launchMember, launchSuffix:launchReference.suffix, files, initialState,
    learnerId: '', learnerName: '',
    launchData: String(extension.launchData ?? ''), navigationState:sequencer?.state() ?? null,
  });

  const runtimeOrigin = isolatedRuntimeUrl ? new URL(isolatedRuntimeUrl).origin : 'null';
  const onMessage = (event) => {
    if (destroyed || event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!isSafeRuntimeMessage(data) || !isScormRuntimeProtocol(data.protocol)) return;

    {
      if (event.origin !== runtimeOrigin || data.action !== 'shell-ready' || runtimePort) return;
      runtimeProtocol = data.protocol;
      const channel = new MessageChannel();
      runtimePort = channel.port1;
      runtimeSend = runtimePort.postMessage.bind(runtimePort);
      runtimePort.onmessage = (portEvent) => {
        const message = portEvent.data;
        if (!isSafeRuntimeMessage(message) || message.protocol !== runtimeProtocol) return;
        if (message.action === 'connected' && !didInit) {
          didInit = true;
          runtimeSend(initPayload(), transfers);
          return;
        }
        processRuntimeData(message);
      };
      runtimePort.start?.();
      iframe.contentWindow.postMessage({protocol: runtimeProtocol, action:'connect'}, isolatedRuntimeUrl ? runtimeOrigin : '*', [channel.port2]);
      return;
    }


  };
  window.addEventListener('message', onMessage);

  if (isolatedRuntimeUrl) iframe.src = isolatedRuntimeUrl;
  else iframe.srcdoc = createScormSandboxShell(fallbackToken, version);

  container.replaceChildren(iframe);
  return Object.freeze({
    kind: 'scorm', version, launchMember, topology,
    destroy() {
      destroyed = true;
      window.removeEventListener('message', onMessage);
      try { runtimePort?.close?.(); } catch {}
      iframe.remove();
    },
    flush: () => saveQueue,
  });
}

