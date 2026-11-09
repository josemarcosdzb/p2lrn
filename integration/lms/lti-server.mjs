// Standalone LTI 1.3 provider for all conforming LMS, independent of AulaP2P.
// Start with node integration/lms/lti-server.mjs after setting the required env.
// Requires Node 22.13+, packages/toolkit/dist and packages/player/dist.
import http from 'node:http';
import {createHash,randomBytes,createPublicKey,createPrivateKey,timingSafeEqual} from 'node:crypto';
import {createReadStream,existsSync,readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {join,resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createP2LRNLtiProvider} from './lti-provider.mjs';
import {createLtiStore} from './lti-store.mjs';
import {pickerHtml} from './lti-picker-ui.mjs';
import {classifyLtiUserError,ltiErrorHtml} from './lti-user-errors.mjs';
import {createLtiAgsClient} from './lti-ags.mjs';
import {createLocalQaLmsFetch} from './lti-local-qa-gateway.mjs';
import {createLtiNrpsClient,validateNrpsClaim,NRPS_CLAIM} from './lti-nrps.mjs';
import {decryptLegacySecret,encryptLegacySecret,parseLegacyForm,validateLegacyPlatform,verifyLegacyLaunch,sendLegacyOutcome} from './lti-legacy.mjs';
import {validatePackageBytes} from '../../packages/toolkit/dist/core/validator.js';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const AGS_CLAIM='https://purl.imsglobal.org/spec/lti-ags/claim/endpoint';
const ROLES_CLAIM='https://purl.imsglobal.org/spec/lti/claim/roles';
const DL_CLAIM='https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings';
const digest=s=>createHash('sha256').update(s).digest('hex');
const nonce=(len=32)=>randomBytes(len).toString('base64url');
const html=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeJs=s=>JSON.stringify(s).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const time=()=>Math.floor(Date.now()/1000);
const allowedType={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.mp3':'audio/mpeg','.mp4':'video/mp4','.map':'application/json'};
const secureCookie=(name,value,secure,maxAge,partitioned=false)=>name+'='+value+'; Path=/; HttpOnly; SameSite='+(secure?'None':'Lax')+(secure?'; Secure':'')+(secure&&partitioned?'; Partitioned':'')+'; Max-Age='+maxAge;
export function parseLtiCookieHeader(header){
 return Object.fromEntries(String(header||'').split(';').map(item=>{
  const part=item.trim(),separator=part.indexOf('=');
  return separator>0?[part.slice(0,separator).trim(),part.slice(separator+1)]:null;
 }).filter(Boolean));
}
const cookies=request=>parseLtiCookieHeader(request.headers.cookie);
const compare=(a,b)=>typeof a==='string'&&typeof b==='string'&&
 timingSafeEqual(Buffer.from(digest(a),'hex'),Buffer.from(digest(b),'hex'));
const active=(r)=>r?.status==='ACTIVE';

async function readBody(req,maxBytes=1024*1024){
 const chunks=[];let total=0;
 for await(const chunk of req){
  total+=chunk.length;
  if(total>maxBytes)throw new Error('REQUEST_TOO_LARGE');
  chunks.push(chunk);
 }
 return Buffer.concat(chunks);
}
const input=(raw,req)=>{
 const type=String(req.headers['content-type']||'').split(';')[0];
 if(type==='application/json')return JSON.parse(raw.toString('utf8'));
 if(type==='application/x-www-form-urlencoded')return Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
 throw new Error('UNSUPPORTED_BODY_TYPE');
};
const valid=(x,name,max=2048)=>{if(typeof x!=='string'||!x.trim()||x.length>max)throw new TypeError('Invalid '+name);return x;};
const sendJson=(res,status,value)=>{
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(value));
};
const sendHtml=(res,status,body,csp,headers={})=>{
 res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':csp,...headers});
 res.end(body);
};
const policy=(nonceStr,ancestor)=>[
 "default-src 'none'","base-uri 'none'","form-action 'self' "+(ancestor||''),
 "script-src 'self' 'nonce-"+nonceStr+"' 'wasm-unsafe-eval' blob:","style-src 'self' 'unsafe-inline' blob:",
 "img-src 'self' blob: data:","font-src 'self' data: blob:",
 "connect-src 'self' blob:","worker-src 'self' blob:","media-src blob: data:","frame-src 'self' blob: about:",
 "frame-ancestors "+(ancestor||"'none'")
].join('; ');
const browserId=(req)=>valid(cookies(req).p2lrn_oidc||cookies(req)['p2lrn_oidc-partitioned']||cookies(req)['__Host-p2lrn-oidc']||cookies(req)['__Host-p2lrn-oidc-partitioned'],'OIDC browser binding',512);
const csrfGuard=(req,session,baseUrl)=>{
 const origin=req.headers.origin;
 if(origin&&origin!==new URL(baseUrl).origin)throw new Error('CROSS_SITE_REQUEST');
 if(!compare(digest(String(req.headers['x-p2lrn-csrf']||'')),session.csrfHash))
  throw new Error('INVALID_CSRF_TOKEN');
};
const form=(url,jwt,nonceStr)=>[
 '<!doctype html><html><head><meta charset="utf-8"><title>P2LRN Deep Linking</title></head><body>',
 '<form id="p2lrn-return" method="post" action="',html(url),'">',
 '<input type="hidden" name="JWT" value="',html(jwt),'"></form>',
 '<script nonce="',html(nonceStr),'">document.getElementById("p2lrn-return").submit()</script>',
 '<noscript><button form="p2lrn-return" type="submit">Volver al LMS</button></noscript></body></html>'
].join('');
function playerHtml({entityId,csrf,playerScript}){
 const code=[
 '(()=>{const csrf=',safeJs(csrf),';const api="/lti/runtime";',
 'const status=document.getElementById("p2lrn-status");',
 'const request=async(path,data)=>{const r=await fetch(api+path,{method:"POST",credentials:"same-origin",',
 'headers:{"Content-Type":"application/json","X-P2LRN-CSRF":csrf},body:JSON.stringify(data)});',
 'if(!r.ok){const e=new Error("P2LRN API "+r.status);e.status=r.status;throw e;}return r.json()};',
 'const revisions=new Map(),stateWrites=new Map();',
 'const stateKey=c=>JSON.stringify([c.packageId,c.contentRoot,c.entityId,c.profile||c.rendererId||c.runtime||"package"]);',
 'const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));',
 'async function retryTransient(run){for(let i=0;i<3;i++){try{return await run()}catch(e){',
 'if(i===2||(typeof e.status==="number"&&![429,500,502,503,504].includes(e.status)))throw e;',
 'await pause(300*(i+1));}}}',
 'async function saveWithRevision(s,c){const key=stateKey(c),previous=stateWrites.get(key)||Promise.resolve();',
 'const pending=previous.catch(()=>undefined).then(async()=>{const rev=revisions.get(key);',
 'const result=await retryTransient(()=>request("/state/save",{state:s,context:c,',
 '...(Number.isSafeInteger(rev)?{expectedRevision:rev}:{})}));',
 'if(result.saved!==true)throw Error("P2LRN server did not confirm state persistence");',
 'if(Number.isSafeInteger(result.revision))revisions.set(key,result.revision);return result;});',
 'stateWrites.set(key,pending);try{return await pending}finally{if(stateWrites.get(key)===pending)stateWrites.delete(key)}}',
 'window.addEventListener("beforeunload",event=>{if(stateWrites.size||status.dataset.saveError==="true"){event.preventDefault();event.returnValue="";}});',
 'async function main(){if(window.P2LRNReady)await window.P2LRNReady;',
 'await customElements.whenDefined("p2lrn-player");',
 'const player=document.querySelector("p2lrn-player");',
 'const kit=window.P2LRN;',
 'if(!kit||typeof kit.createHostAdapter!=="function")throw Error("Host Adapter no disponible");',
 'player.adapter=kit.createHostAdapter({',
 'loadState:async c=>{const data=await retryTransient(()=>request("/state/load",{context:c}));',
 'if(Number.isSafeInteger(data.revision))revisions.set(stateKey(c),data.revision);return data.value??null;},',
 'saveState:async(s,c)=>{try{const result=await saveWithRevision(s,c);',
 'if(status.dataset.saveError==="true"){status.dataset.saveError="";status.textContent="Progreso guardado.";}',
 'return result;}catch(e){status.dataset.saveError="true";status.setAttribute("role","alert");',
 'status.textContent="No se pudo guardar tu progreso. Comprueba la conexión y no cierres la actividad.";throw e;}},',
 'reportScore:async(s,c)=>{const reply=await request("/score",{score:s,context:c});',
 'if(reply.received===true){status.textContent="Resultado registrado; nota oficial pendiente de validación por el LMS.";}', 
 'return reply;},',
 'emitEvent:async(e,c)=>{await request("/event",{event:e,context:c})},',
 'resolveResourceUrl:async()=>null});',
 'player.addEventListener("p2lrn:rendered",()=>{if(!status.dataset.saveError&&status.dataset.playbackError!=="true")status.textContent="";});',
 'player.addEventListener("p2lrn:error",e=>{if(e.detail?.phase==="progression-load"){',
 'player.inert=true;status.dataset.playbackError="true";status.setAttribute("role","alert");',
 'status.textContent="No se pudo recuperar el progreso guardado. La actividad está bloqueada para evitar sobrescribir respuestas. Comprueba la conexión y recarga la página.";return;}',
 'if(status.dataset.saveError==="true")return;',
 'status.dataset.playbackError="true";status.setAttribute("role","alert");',
 'status.textContent="La actividad ha tenido un problema. Comprueba la conexión y avisa al profesor antes de continuar.";});',
 'const resp=await fetch(api+"/package",{credentials:"same-origin",cache:"no-store"});',
 'if(!resp.ok)throw Error("Paquete no disponible: "+resp.status);',
 'const blob=await resp.blob();const src=URL.createObjectURL(blob);player.setAttribute("src",src);',
 'window.addEventListener("pagehide",()=>URL.revokeObjectURL(src),{once:true});',
 'status.textContent="Abriendo contenido y comprobando las actividades…";',
 '}main().catch(e=>{status.textContent="No se pudo cargar P2LRN: "+String(e.message||e)});})();'
 ].join('');
 return ['<!doctype html><html lang="es"><head><meta charset="utf-8">',
 '<meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<meta name="p2lrn-opaque-runtime-nonce" content="__CSP_NONCE__">',
'<title>Actividad P2LRN</title><style>html,body{margin:0;width:100%;min-height:100%;font-family:system-ui}main{display:block;min-height:100%;width:100%}p2lrn-player{display:block;width:100%;height:auto;min-height:500px}#p2lrn-status{padding:8px}</style>',
 '</head><body><main><div id="p2lrn-status">Preparando actividad P2LRN…</div>',
 '<p2lrn-player node="',html(entityId),'"></p2lrn-player></main>',
 '<script src="',html(playerScript),'" defer></script>',
 '<script nonce="__CSP_NONCE__">',code,'</script></body></html>'
 ].join('');
}
function contextFor(body,session){
 const ctx=body?.context;
 if(!ctx||typeof ctx!=='object'||Array.isArray(ctx)||
    ctx.packageId!==session.packageId||ctx.contentRoot!==session.contentRoot||
    !session.entities.some(e=>e.id===ctx.entityId))throw new Error('UNAUTHORIZED_PLAYER_CONTEXT');
 const surface=String(ctx.profile||ctx.rendererId||ctx.runtime||'package');
 if(surface.length>180||!surface.trim())throw new Error('INVALID_PLAYER_SURFACE');
 return {entityId:ctx.entityId,surface};
}
function assertTrustedReg(reg,baseUrl,allowInsecureLocal=false){
 if(!reg||typeof reg!=='object')throw new TypeError('LTI platform JSON object required');
 const direct=reg.launchUrl===baseUrl+'/lti/launch'&&(!reg.deepLinkLaunchUrl||reg.deepLinkLaunchUrl===baseUrl+'/lti/deep-link');
 const localCohost=allowInsecureLocal&&new URL(baseUrl).protocol==='http:'&&
  new URL(reg.issuer).protocol==='http:'&&
  reg.launchUrl===new URL(reg.issuer).origin+'/lti/launch'&&
  (!reg.deepLinkLaunchUrl||reg.deepLinkLaunchUrl===new URL(reg.issuer).origin+'/lti/deep-link');
 if(!direct&&!localCohost)
  throw new Error('LTI launch URL must match this independent P2LRN server or its registered LMS-origin local proxy');
 for(const v of [reg.issuer,reg.authUrl,reg.tokenUrl,...(reg.deepLinkReturnOrigins||[])])
  if(!(new URL(v).protocol==='https:'||(allowInsecureLocal&&new URL(v).protocol==='http:'&&/^(localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)+localhost)$/.test(new URL(v).hostname))))throw new Error('LTI platform endpoints must use HTTPS outside the local test lab');
 const extra=reg.nrpsAllowedOrigins??[];
 if(!Array.isArray(extra)||extra.length>12)throw new Error('Invalid additional NRPS origins');
 for(const origin of extra){
  let u;try{u=new URL(origin);}catch{throw new Error('Invalid additional NRPS origin');}
  if(origin!==u.origin||u.username||u.password||u.hash||
     !(u.protocol==='https:'||(allowInsecureLocal&&u.protocol==='http:'&&
       /^(localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)+localhost)$/.test(u.hostname))))
    throw new Error('Untrusted additional NRPS origin');
 }
 return reg;
}
export function createP2LRNLtiServer({dataDir,baseUrl,tool,adminToken,port,bindHost='127.0.0.1',
 fetchImpl,lookup,allowInsecureLoopback=false}){
 valid(dataDir,'dataDir',4096);valid(baseUrl,'baseUrl');
 if(!tool||typeof tool.privateKeyPem!=='string'||!tool.kid)throw new TypeError('Persistent P2LRN RSA tool identity required');
 if(typeof adminToken!=='string'||adminToken.length<32)throw new TypeError('Secure P2LRN admin token must contain at least 32 characters');
 const base=new URL(baseUrl);
 if(base.username||base.password||base.hash||base.search||
    (base.protocol!=='https:'&&!(allowInsecureLoopback&&base.protocol==='http:'&&/^(localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)+localhost)$/.test(base.hostname))))
  throw new Error('Public P2LRN LTI endpoint requires HTTPS');
 const baseOrigin=base.origin,canonicalBase=baseUrl.replace(/\/$/,'');
 if(canonicalBase!==base.origin)throw new Error('P2LRN LTI baseUrl must be an origin without path');
 const secure=base.protocol==='https:';
 // HTTP is an explicit loopback-only integration test mode. Chromium treats
 // .localhost as a potentially trustworthy origin for Secure cookies.
 // Never enable it on a public hostname or without allowInsecureLoopback.
 const localHttp=!secure&&allowInsecureLoopback;
 const crossSiteCookie=secure||localHttp;
 const localHost=/^(localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)+localhost)$/;
 function originForRequest(req){
  const host=valid(req.headers.host,'HTTP Host',255);
  const parsed=new URL('http://'+host);
  if(!localHost.test(parsed.hostname)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)
   throw new Error('UNAPPROVED_LTI_LOCAL_HOST');
  return parsed.origin;
 }
 function checkLocalCohost(req,target){
  if(localHttp&&new URL(target).origin!==baseOrigin&&originForRequest(req)!==new URL(target).origin)
   throw new Error('LTI_LOCAL_HOST_MISMATCH');
 }
 const isLmsCohost=(reg,target)=>localHttp&&new URL(reg.issuer).origin===new URL(target).origin;
 const root=resolve(dataDir),packages=join(root,'packages');
 mkdirSync(packages,{recursive:true});
 const store=createLtiStore(join(root,'lti.sqlite'));
 const provider=createP2LRNLtiProvider({
  getRegistration:store.getRegistration,getRegistrationByIssuer:store.getRegistrationByIssuer,
  getRegistrationById:store.getRegistrationById,
  transactions:store.transactions,getBinding:store.getBinding,tool,allowInsecureLocal:allowInsecureLoopback
 });
 const ags=createLtiAgsClient({tool,fetchImpl,lookup,allowInsecureLoopback});
 const nrps=createLtiNrpsClient({tool,fetchImpl,lookup,allowInsecureLoopback});
 const sessionCookie=secure?'__Host-p2lrn-session':'p2lrn_session';
 const oidcCookie=secure?'__Host-p2lrn-oidc':'p2lrn_oidc';
 const playerDist=resolve(ROOT,'packages/player/dist');
 function requireAdmin(req){
  const raw=String(req.headers.authorization||'');
  if(!raw.startsWith('Bearer ')||!compare(raw.slice(7),adminToken))throw new Error('ADMIN_DENIED');
 }
 function requireSession(req,csrf=false){
  const cookieValues=cookies(req);
  const value=cookieValues[sessionCookie]||(localHttp?cookieValues[sessionCookie+'-partitioned']:null);
  const hash=digest(String(value||''));
  const s=store.getSession(hash);
  if(!s)throw new Error('SESSION_EXPIRED');
  const reg=store.getRegistrationById(s.registrationId)||store.getLegacyRegistrationById(s.registrationId);
  if(!reg||reg.status!=='ACTIVE')throw new Error('SESSION_PLATFORM_REVOKED');
  checkLocalCohost(req,reg.launchUrl);
  if(csrf)csrfGuard(req,s,new URL(reg.launchUrl).origin);
  return s;
 }
 async function deliver(id){
  const pending=store.outboxById(id);
  if(!pending)throw new Error('Unknown AGS delivery');
  if(pending.status==='SENT')return {delivered:true,duplicate:false};
   if(pending.status==='REJECTED')return {delivered:false,error:'AGS_RECIPIENT_NOT_ELIGIBLE',terminal:true};
  try{
   if(pending.protocol==='legacy'){
    if(!pending.ags?.serviceUrl||!pending.ags?.sourceId)throw new Error('LEGACY_OUTCOME_NOT_AVAILABLE');
    const result=await sendLegacyOutcome({
     serviceUrl:pending.ags.serviceUrl,sourceId:pending.ags.sourceId,
     consumerKey:pending.legacyConsumerKey,
     secret:decryptLegacySecret(pending.legacySecretEncrypted,tool.privateKeyPem),
     issuerOrigin:pending.legacyIssuer,normalized:pending.payload.normalized,
     fetchImpl,allowInsecureLocal:allowInsecureLoopback
    });
    store.markOutbox(id,'SENT');return {delivered:true,status:result.http,protocol:'legacy'};
   }
   const result=await ags.postScore({
    ags:pending.ags,subject:pending.subject,resourceLinkId:pending.resourceLinkId,clientId:pending.clientId,
    tokenUrl:pending.tokenUrl,issuer:pending.issuer,
    score:pending.payload
   });
   store.markOutbox(id,'SENT');return {delivered:true,status:result.status};
  }catch(err){
   store.markOutbox(id,'PENDING',String(err.message||err).slice(0,200));
   return {delivered:false,error:'AGS_PENDING_RETRY'};
  }
 }
 function inspectCourseBytes(bytes,titleHint=''){
  if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>64*1024*1024)
   throw new Error('INVALID_P2LRN_UPLOAD');
  const parsed=validatePackageBytes(bytes,{strictProfiles:true,validateProfilePayloads:true});
  const entities=parsed.graph.entities.filter(e=>['course','unit','activity'].includes(e.type))
   .map(e=>({id:e.id,type:e.type,title:String(e.title||e.name||e.id).slice(0,200)}));
  const course=entities.find(e=>e.type==='course')||entities[0];
  if(!course)throw new Error('P2LRN package contains no publishable learning entities');
  const title=String(titleHint||course.title||'Curso P2LRN').trim().slice(0,200);
  return {parsed,entities,course,title,sha:digest(bytes)};
 }
 function persistCourse(tenantId,inspection,bytes){
  const filename=inspection.sha+'.p2lrn';
  const destination=join(packages,filename);
  if(!existsSync(destination))writeFileSync(destination,bytes,{flag:'wx',mode:0o600});
  const id=store.publishPackage({tenantId,title:inspection.title,
   packageId:inspection.parsed.manifest.packageId,
   contentRoot:inspection.parsed.manifest.integrity.contentRoot,
   sha:inspection.sha,filename,bytes:bytes.length,entities:inspection.entities});
  return {id,packageId:inspection.parsed.manifest.packageId,
   contentRoot:inspection.parsed.manifest.integrity.contentRoot,
   entities:inspection.entities.length,entityId:inspection.course.id};
 }
 async function finishDeepLink(entry,catalogId,entityId,req,res){
  const pickerReg=store.getRegistrationById(entry.registrationId);
  if(!pickerReg||pickerReg.status!=='ACTIVE')throw new Error('PICKER_PLATFORM_REVOKED');
  checkLocalCohost(req,pickerReg.deepLinkLaunchUrl||pickerReg.launchUrl);
  const c=store.getCatalog(catalogId,entry.tenantId);
  if(!c||!JSON.parse(c.entities_json).some(e=>e.id===entityId))
   throw new Error('UNAUTHORIZED_DEEP_LINK_CONTENT');
  const bindingId=store.createBinding({tenantId:entry.tenantId,
   registrationId:entry.registrationId,deploymentId:entry.deploymentId,
   catalogId:c.id,entityId});
  const launch=await provider.restoreDeepLink(entry);
  const name=JSON.parse(c.entities_json).find(e=>e.id===entityId)?.title||c.title;
  const signed=await provider.deepLinkResponse({launch,selected:[{bindingId,title:name}]});
  const cspNonce=nonce(16);
  return sendHtml(res,200,form(signed.returnUrl,signed.jwt,cspNonce),
   policy(cspNonce,new URL(signed.returnUrl).origin));
 }
 const routes=async(req,res)=>{
  try{
   const incoming=new URL(req.url||'/',canonicalBase);
   const path=incoming.pathname,method=req.method;
   if(method==='GET'&&path==='/lti/health')
    return sendJson(res,200,{status:'ok',provider:'P2LRN LTI 1.3',standalone:true});
   if(method==='POST'&&path==='/lti/legacy/launch'){
    if(String(req.headers['content-type']||'').split(';')[0]!=='application/x-www-form-urlencoded')
     throw new Error('LEGACY_FORM_REQUIRED');
    const params=parseLegacyForm((await readBody(req,65536)).toString('utf8'));
    const registration=store.getLegacyRegistrationByConsumerKey(valid(params.oauth_consumer_key,'oauth_consumer_key',256));
    if(!registration||registration.status!=='ACTIVE')throw new Error('UNREGISTERED_LEGACY_PLATFORM');
    const actualHost=valid(req.headers.host,'legacy Host',255).toLowerCase();
    if(actualHost!==new URL(registration.launchUrl).host)
     throw new Error('LEGACY_LAUNCH_HOST_MISMATCH');
    checkLocalCohost(req,registration.launchUrl);
    const verified=verifyLegacyLaunch({
     params,registration,requestUrl:registration.launchUrl,
     secret:decryptLegacySecret(registration.secretEncrypted,tool.privateKeyPem),
     consumeNonce:store.consumeLegacyNonce,allowInsecureLocal:allowInsecureLoopback
    });
    const binding=store.getLegacyBinding({id:verified.bindingId,
     tenantId:registration.tenantId,registrationId:registration.id});
    if(!binding)throw new Error('UNAUTHORIZED_LEGACY_BINDING');
    const token=nonce(),csrf=nonce();
    store.attachLaunch({
     legacy:true,
     launch:{...verified,packageId:binding.packageId,contentRoot:binding.contentRoot,entityId:binding.entityId},
     ags:verified.basicOutcome,tokenHash:digest(token),csrfHash:digest(csrf),expiresAt:time()+3600
    });
    const cohost=isLmsCohost({issuer:registration.issuerOrigin},registration.launchUrl);
    const cspNonce=nonce(16);
    const page=playerHtml({entityId:binding.entityId,csrf,playerScript:'/lti/assets/player/p2lrn.js'})
     .replaceAll('__CSP_NONCE__',html(cspNonce));
    return sendHtml(res,200,page,policy(cspNonce,registration.issuerOrigin),
     {'Set-Cookie':cohost?secureCookie(sessionCookie,token,false,3600):localHttp?[
      secureCookie(sessionCookie,token,true,3600),
      secureCookie(sessionCookie+'-partitioned',token,true,3600,true)
     ]:secureCookie(sessionCookie,token,secure,3600,true)});
   }
   if(method==='GET'&&path==='/lti/jwks')
    return sendJson(res,200,provider.publicJwks());
   if((method==='GET'||method==='POST')&&path==='/lti/login'){
    const login=method==='GET'?Object.fromEntries(incoming.searchParams):
      input(await readBody(req,32768),req);
    let binding=nonce();
    const incomingCookie=cookies(req)[oidcCookie];
    if(typeof incomingCookie==='string'&&/^[A-Za-z0-9_-]{32,128}$/.test(incomingCookie))
     binding=incomingCookie;
    const result=await provider.beginLogin({login,browserBinding:binding});
    checkLocalCohost(req,login.target_link_uri);
    const cohost=isLmsCohost({issuer:login.iss},login.target_link_uri);
    res.writeHead(302,{'Location':result.authorizationUrl,
     'Set-Cookie':cohost?secureCookie(oidcCookie,binding,false,3600):crossSiteCookie?[secureCookie(oidcCookie,binding,true,3600),secureCookie(oidcCookie+'-partitioned',binding,true,3600,true)]:secureCookie(oidcCookie,binding,false,3600),'Cache-Control':'no-store',
     'Referrer-Policy':'no-referrer'});return res.end();
   }
   if(method==='POST'&&(path==='/lti/launch'||path==='/lti/deep-link')){
    const data=input(await readBody(req,131072),req);
    const verified=await provider.verifyLaunch({
     state:valid(data.state,'state',512),idToken:valid(data.id_token,'id_token',65536),
     browserBinding:browserId(req)
    });
    const inspected=provider.inspectVerifiedLaunch(verified);
    const expectedTarget=verified.kind==='deep-link'?(inspected.registration.deepLinkLaunchUrl||inspected.registration.launchUrl):inspected.registration.launchUrl;
    checkLocalCohost(req,expectedTarget);
    const cohost=isLmsCohost(inspected.registration,expectedTarget);
    const ancestor=new URL(inspected.registration.issuer).origin;
    if(verified.kind==='deep-link'){
     if(path!=='/lti/deep-link')throw new Error('WRONG_LTI_TARGET');
     const ticket=nonce();
     const settings=inspected.claims[DL_CLAIM]||{};
     store.createPicker({ticketHash:digest(ticket),registrationId:verified.registrationId,
      tenantId:verified.tenantId,deploymentId:verified.deploymentId,returnUrl:verified.returnUrl,
      ltiData:typeof settings.data==='string'?settings.data:null,expiresAt:time()+900});
     const cspNonce=nonce(16);
     return sendHtml(res,200,pickerHtml({ticket,tenantId:verified.tenantId,
      contents:store.listCatalog(verified.tenantId),cspNonce}),
      policy(cspNonce,ancestor));
    }
    if(path!=='/lti/launch')throw new Error('WRONG_LTI_TARGET');
    const token=nonce(),csrf=nonce();
    const claims=inspected.claims;
    const agsClaim=claims[AGS_CLAIM];
    const agsData=agsClaim&&typeof agsClaim==='object'&&!Array.isArray(agsClaim)?
      {lineitem:agsClaim.lineitem,lineitems:agsClaim.lineitems,scope:agsClaim.scope}:null;
    let nrpsService=null;
     if(claims[NRPS_CLAIM]!==undefined){
      try{nrpsService=validateNrpsClaim(claims[NRPS_CLAIM],inspected.registration,{allowInsecureLoopback});}
      catch{nrpsService=null;} // NRPS is optional; invalid data cannot stop a standard launch.
     }
     if(verified.launch.contextId)store.saveNrpsContext({
      registrationId:verified.launch.registrationId,tenantId:verified.launch.tenantId,
      deploymentId:verified.launch.deploymentId,contextId:verified.launch.contextId,service:nrpsService});
     const roles=claims[ROLES_CLAIM];
     const canReceiveGrades=Array.isArray(roles)&&roles.some(role=>typeof role==='string'&&/#Learner$/i.test(role));
      const canReadRoster=Array.isArray(roles)&&roles.some(role=>
      typeof role==='string'&&/#(Instructor|Administrator|TeachingAssistant)$/i.test(role));
     store.attachLaunch({launch:verified.launch,ags:agsData,canReadRoster,canReceiveGrades,tokenHash:digest(token),
      csrfHash:digest(csrf),expiresAt:time()+3600});
    const cspNonce=nonce(16);
    const body=playerHtml({entityId:verified.launch.entityId,csrf,
      playerScript:'/lti/assets/player/p2lrn.js'})
      .replaceAll('__CSP_NONCE__',html(cspNonce));
    return sendHtml(res,200,body,policy(cspNonce,ancestor),
      {'Set-Cookie':cohost?secureCookie(sessionCookie,token,false,3600):localHttp?[
       secureCookie(sessionCookie,token,true,3600),
       secureCookie(sessionCookie+'-partitioned',token,true,3600,true)
      ]:secureCookie(sessionCookie,token,secure,3600,true)});
   }
   if(method==='POST'&&path==='/lti/deep-link/confirm'&&String(req.headers['content-type']||'').startsWith('multipart/form-data;')){
    const contentType=String(req.headers['content-type']||'');
    if(!/^multipart\/form-data;\s*boundary=/i.test(contentType))
     throw new Error('INVALID_P2LRN_UPLOAD_FORM');
    const body=await readBody(req,64*1024*1024+16384);
    const upload=new Request('http://localhost/lti/deep-link/confirm',{
     method:'POST',headers:{'Content-Type':contentType},body});
    const fields=await upload.formData();
    if(fields.getAll('ticket').length!==1||fields.getAll('course').length!==1)
     throw new Error('INVALID_P2LRN_UPLOAD_FORM');
    const ticketHash=digest(valid(fields.get('ticket'),'picker ticket',128));
    const pending=store.peekPicker(ticketHash);
    if(!pending)throw new Error('PICKER_EXPIRED');
    const reg=store.getRegistrationById(pending.registrationId);
    if(!reg||reg.status!=='ACTIVE'||reg.tenantId!==pending.tenantId||
       !reg.deployments.includes(pending.deploymentId))
     throw new Error('PICKER_PLATFORM_REVOKED');
    checkLocalCohost(req,reg.deepLinkLaunchUrl||reg.launchUrl);
    const renderInvalidCourse=()=>{
     const cspNonce=nonce(16);
     return sendHtml(res,422,pickerHtml({
      ticket:fields.get('ticket'),contents:store.listCatalog(pending.tenantId),cspNonce,
      errorMessage:'Comprueba que has elegido el archivo .p2lrn exportado desde Studio y vuelve a seleccionarlo. No se ha perdido tu selección del aula.'
     }),policy(cspNonce,new URL(reg.issuer).origin));
    };
    const file=fields.get('course');
    if(!file||typeof file.arrayBuffer!=='function'||typeof file.name!=='string'||
       !file.name.toLowerCase().endsWith('.p2lrn')||file.size===0||file.size>64*1024*1024)
     return renderInvalidCourse();
    const bytes=Buffer.from(await file.arrayBuffer());
    let inspection;
    try{inspection=inspectCourseBytes(bytes);}
    catch{return renderInvalidCourse();}
    const entry=store.consumePicker(ticketHash);
    if(!entry)throw new Error('PICKER_EXPIRED');
    const published=persistCourse(entry.tenantId,inspection,bytes);
    return finishDeepLink(entry,published.id,published.entityId,req,res);
   }
   if(method==='POST'&&path==='/lti/deep-link/confirm'){
    const formData=input(await readBody(req,32768),req);
    const ticketHash=digest(valid(formData.ticket,'picker ticket',128));
    const entry=store.consumePicker(ticketHash);
    if(!entry)throw new Error('PICKER_EXPIRED');
    return finishDeepLink(entry,
     valid(formData.catalogId,'catalogId',128),
     valid(formData.entityId,'entityId',2048),req,res);
   }
   if(method==='GET'&&path.startsWith('/lti/assets/player/')){
    const name=decodeURIComponent(path.slice('/lti/assets/player/'.length));
    if(!name||name.includes('\\')||name.split('/').some(s=>s==='..'||!s))throw new Error('INVALID_ASSET_PATH');
    const absolute=resolve(playerDist,name);
    if(!absolute.startsWith(playerDist+sep)||!existsSync(absolute)||!statSync(absolute).isFile())return sendJson(res,404,{error:'ASSET_NOT_FOUND'});
    const type=allowedType[extname(absolute).toLowerCase()]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=60'});
    return createReadStream(absolute).pipe(res);
   }
   if(method==='GET'&&path==='/lti/runtime/nrps/memberships'){
     const session=requireSession(req);
     if(!session.canReadRoster)throw new Error('NRPS_ROLE_DENIED');
     const registration=store.getRegistrationById(session.registrationId);
     if(!registration||registration.status!=='ACTIVE'||registration.tenantId!==session.tenantId)
      throw new Error('NRPS_PLATFORM_REVOKED');
     const service=store.getNrpsContext({registrationId:session.registrationId,
      tenantId:session.tenantId,deploymentId:session.deploymentId,contextId:session.contextId});
     if(!service)return sendJson(res,404,{error:'NRPS_NOT_AVAILABLE'});
     return sendJson(res,200,await nrps.listMembers({registration,service,contextId:session.contextId}));
    }
    if(method==='GET'&&path==='/lti/runtime/package'){
    const session=requireSession(req),file=resolve(packages,session.filename);
    if(!file.startsWith(packages+sep)||!existsSync(file))return sendJson(res,503,{error:'PACKAGE_NOT_AVAILABLE'});
    res.writeHead(200,{'Content-Type':'application/vnd.p2lrn+zip','Content-Length':session.bytes,
      'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'});
    return createReadStream(file).pipe(res);
   }
   if(method==='POST'&&path.startsWith('/lti/runtime/')){
    const s=requireSession(req,true),data=input(await readBody(req,512*1024),req);
    // Package-level ready/error telemetry carries package integrity but no entityId.
    // Bind only these lifecycle events to the launch-authorized root entity;
    // all other events and state/grade writes require their explicit graph entity.
    const packageLifecycle=path==='/lti/runtime/event'
     && ['p2lrn:ready','p2lrn:error'].includes(data.event?.type)
     && data.context&&typeof data.context==='object'&&!Array.isArray(data.context)
     && data.context.entityId==null;
    const scoped=packageLifecycle?{...data,context:{...data.context,entityId:s.entityId}}:data;
    const {entityId,surface}=contextFor(scoped,s);
    if(path==='/lti/runtime/state/load')
     return sendJson(res,200,store.getState(s.attemptId,entityId,surface));
    if(path==='/lti/runtime/state/save'){
     if(Buffer.byteLength(JSON.stringify(data.state??null))>262144)throw new Error('STATE_TOO_LARGE');
     const version=data.expectedRevision;
     if(version!==undefined&&(!Number.isSafeInteger(version)||version<0))throw new Error('INVALID_REVISION');
     const saved=store.saveState(s.attemptId,entityId,surface,data.state??null,version);
     return sendJson(res,saved.conflict?409:200,saved);
    }
    if(path==='/lti/runtime/event'){
     if(typeof data.event?.type!=='string'||!data.event.type.startsWith('p2lrn:')||
       Buffer.byteLength(JSON.stringify(data.event))>65536)throw new Error('INVALID_EVENT');
     const eventId=typeof data.event.id==='string'&&data.event.id.length<=128?
       data.event.id:digest(JSON.stringify(data.event));
     return sendJson(res,200,store.appendEvent(s.attemptId,eventId,entityId,data.event));
    }
    if(path==='/lti/runtime/score'){
     const n=data.score?.normalized;
     if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)throw new Error('INVALID_SCORE');
     return sendJson(res,200,store.observeScore(s.attemptId,n,data.score.completed===true));
    }
   }
   if(path.startsWith('/lti/admin/')){
    requireAdmin(req);
    if(method==='GET'&&path==='/lti/admin/nrps/contexts'){
      const tenantId=valid(incoming.searchParams.get('tenantId'),'tenantId',128);
      return sendJson(res,200,{contexts:store.listNrpsContexts(tenantId)});
     }
     if(method==='GET'&&path==='/lti/admin/nrps/memberships'){
      const tenantId=valid(incoming.searchParams.get('tenantId'),'tenantId',128);
      const registrationId=valid(incoming.searchParams.get('registrationId'),'registrationId',128);
      const deploymentId=valid(incoming.searchParams.get('deploymentId'),'deploymentId',256);
      const contextId=valid(incoming.searchParams.get('contextId'),'contextId',1024);
      const registration=store.getRegistrationById(registrationId);
      if(!registration||registration.status!=='ACTIVE'||registration.tenantId!==tenantId||
         !registration.deployments.includes(deploymentId))throw new Error('NRPS_UNAUTHORIZED_CONTEXT');
      const service=store.getNrpsContext({registrationId,tenantId,deploymentId,contextId});
      if(!service)return sendJson(res,404,{error:'NRPS_NOT_AVAILABLE'});
      return sendJson(res,200,await nrps.listMembers({registration,service,contextId}));
     }
     if(method==='GET'&&path==='/lti/admin/legacy/platforms')
     return sendJson(res,200,{platforms:store.listLegacyPlatforms()});
    if(method==='POST'&&path==='/lti/admin/legacy/platforms'){
     const data=input(await readBody(req,32768),req);
     const reg=validateLegacyPlatform(data,{allowInsecureLocal:allowInsecureLoopback});
     const sealed=encryptLegacySecret(valid(data.sharedSecret,'legacy shared secret',512),tool.privateKeyPem);
     store.upsertLegacyPlatform({...reg,secretEncrypted:sealed});
     return sendJson(res,201,{id:reg.id,status:reg.status,protocols:['LTI-1p0','LTI-1p1']});
    }
    if(method==='POST'&&path==='/lti/admin/legacy/bindings'){
     const data=input(await readBody(req,16384),req);
     const registrationId=valid(data.registrationId,'legacy registrationId',128);
     const registration=store.getLegacyRegistrationById(registrationId);
     if(registration?.status!=='ACTIVE')throw new Error('UNREGISTERED_LEGACY_PLATFORM');
     const bindingId=store.createLegacyBinding({
      registrationId,tenantId:registration.tenantId,
      catalogId:valid(data.catalogId,'catalogId',128),
      entityId:valid(data.entityId,'entityId',2048)
     });
     return sendJson(res,201,{bindingId,registrationId,protocol:'legacy',
      customParameters:{p2lrn_binding_id:bindingId}});
    }
    if(method==='GET'&&path==='/lti/admin/platforms')
     return sendJson(res,200,{platforms:store.listPlatforms()});
    if(method==='POST'&&path==='/lti/admin/platforms'){
     const reg=assertTrustedReg(input(await readBody(req,131072),req),canonicalBase,allowInsecureLoopback);
     store.upsertPlatform(reg);return sendJson(res,201,{id:reg.id,status:reg.status});
    }
    if(method==='POST'&&path==='/lti/admin/catalog'){
     const tenantId=valid(req.headers['x-p2lrn-tenant'],'x-p2lrn-tenant',128);
     const title=valid(req.headers['x-p2lrn-title'],'x-p2lrn-title',200);
     const bytes=await readBody(req,64*1024*1024);
     const inspected=inspectCourseBytes(bytes,title);
     const published=persistCourse(tenantId,inspected,bytes);
     return sendJson(res,201,{id:published.id,packageId:published.packageId,
      contentRoot:published.contentRoot,entities:published.entities});
    }
    if(method==='GET'&&path.startsWith('/lti/admin/catalog/')){
     const tenantId=valid(decodeURIComponent(path.slice('/lti/admin/catalog/'.length)),'tenantId',128);
     return sendJson(res,200,{courses:store.listCatalog(tenantId)});
    }
    // For LMS instances where a teacher cannot use Deep Linking, an explicitly
    // authenticated P2LRN administrator may prepare a resource binding to
    // be stored as an LTI custom parameter. Content and deployment are checked
    // by the same store validation used for signed Deep Linking responses.
    if(method==='POST'&&path==='/lti/admin/bindings'){
     const reqData=input(await readBody(req,32768),req);
     const registrationId=valid(reqData.registrationId,'registrationId',128);
     const deploymentId=valid(reqData.deploymentId,'deploymentId',256);
     const catalogId=valid(reqData.catalogId,'catalogId',128);
     const entityId=valid(reqData.entityId,'entityId',2048);
     const registration=store.getRegistrationById(registrationId);
     if(!registration||registration.status!=='ACTIVE')throw new Error('Unregistered LMS');
     const bindingId=store.createBinding({
      tenantId:registration.tenantId,registrationId,deploymentId,catalogId,entityId
     });
     return sendJson(res,201,{bindingId,
      customParameters:{p2lrn_binding_id:bindingId},
      registrationId,deploymentId,catalogId,entityId});
    }
    if(method==='GET'&&path==='/lti/admin/attempts'){
     const tenantId=valid(incoming.searchParams.get('tenantId'),'tenantId',128);
     return sendJson(res,200,{attempts:store.listAttempts(tenantId)});
    }
    if(method==='GET'&&path==='/lti/admin/ags/pending')
     return sendJson(res,200,{pending:store.listPending()});
    if(method==='POST'&&path==='/lti/admin/grades'){
     const data=input(await readBody(req,32768),req);
     const attemptId=valid(data.attemptId,'attemptId',128),n=data.normalized;
     if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)throw new Error('INVALID_SCORE');
     const completed=data.completed===true;
     const payload={normalized:n,completed};
     const outbox=store.approveScore(attemptId,n,completed,digest(JSON.stringify(payload)),payload);
     const delivery=await deliver(outbox.id);
     return sendJson(res,delivery.delivered?200:202,{serverApproved:true,outboxId:outbox.id,ags:delivery});
    }
    if(method==='POST'&&path==='/lti/admin/ags/retry'){
     const data=input(await readBody(req,4096),req);
     const delivery=await deliver(valid(data.outboxId,'outboxId',128));
     return sendJson(res,delivery.delivered?200:202,delivery);
    }
   }
   return sendJson(res,404,{error:'NOT_FOUND'});
  }catch(error){
   const message=String(error?.message||error).slice(0,300);
   if(process.env.P2LRN_LEGACY_QA_TRACE==='1'&&String(req.url).startsWith('/lti/legacy/'))console.error('LTI_LEGACY_QA_ERROR_CODE',/^[A-Z0-9_]{3,120}$/.test(message)?message:'MASKED');
   const forbidden=/NRPS_ROLE_DENIED|NRPS_UNAUTHORIZED_CONTEXT|NRPS_PLATFORM_REVOKED|ADMIN_DENIED|UNAUTHORIZED|CROSS_SITE|INVALID_CSRF|SESSION_EXPIRED|PICKER_EXPIRED|LTI|JWT|OIDC|issuer|audience|nonce|binding|deployment|registered|registration|platform|signature|token|key|origin|LEGACY|P2LRN content authorization/i.test(message);
   const status=message==='REQUEST_TOO_LARGE'?413:forbidden?403:400;
   const problem=classifyLtiUserError(error);
   const incident=randomBytes(6).toString('hex').toUpperCase();
   const path=new URL(req.url||'/',canonicalBase).pathname;
   const isBrowser=String(req.headers.accept||'').includes('text/html');
   const isLtiUserRoute=['/lti/login','/lti/launch','/lti/deep-link',
    '/lti/deep-link/confirm','/lti/legacy/launch'].includes(path);
   if(isLtiUserRoute&&isBrowser){
    console.warn('P2LRN_LTI_ACCESS_DIAGNOSTIC',JSON.stringify({
     reference:incident,category:problem.code,method:req.method,route:path,status
    }));
    return sendHtml(res,status,ltiErrorHtml({problem,reference:incident}),
     "default-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; frame-ancestors *");
   }
   // Do not reflect secrets, JWTs, filesystem paths or untrusted form values.
   return sendJson(res,status,{error:status===403?'FORBIDDEN':status===413?'TOO_LARGE':'INVALID_REQUEST'});
  }
 };
 const server=http.createServer((req,res)=>{routes(req,res).catch(()=>{
  if(!res.headersSent)sendJson(res,500,{error:'INTERNAL_ERROR'});else res.destroy();
 });});
 return Object.freeze({server,store,provider,deliver,async listen(address=port,hostname=bindHost){
  if(!Number.isInteger(address)||address<0||address>65535)throw new TypeError('Invalid port');
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(address,hostname,()=>{server.off('error',fail);ok();});});
  return server.address();
 },async close(){if(server.listening)await new Promise((ok,fail)=>server.close(e=>e?fail(e):ok()));store.close();}});
}
const script=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(script){
 try{
  const keyFile=process.env.P2LRN_LTI_KEY_FILE;
  if(!keyFile)throw new Error('Set P2LRN_LTI_KEY_FILE to a persistent RSA private key PEM file');
  const privateKeyPem=readFileSync(keyFile,'utf8');
  const keyId=process.env.P2LRN_LTI_KID||
    'p2lrn-'+createHash('sha256').update(createPublicKey(createPrivateKey(privateKeyPem)).export({format:'der',type:'spki'})).digest('hex').slice(0,32);
  const baseUrl=valid(process.env.P2LRN_LTI_BASE_URL,'P2LRN_LTI_BASE_URL');
  const port=Number(process.env.P2LRN_LTI_PORT||37891);
  const dev=process.env.P2LRN_LTI_DEV_INSECURE==='true';
  const outboundLmsFetch=await createLocalQaLmsFetch({enabled:dev,gatewayHost:process.env.P2LRN_LTI_DEV_LMS_GATEWAY||'aulap2p-ingress-local'});
  const gateway=createP2LRNLtiServer({
   dataDir:valid(process.env.P2LRN_LTI_DATA_DIR,'P2LRN_LTI_DATA_DIR',4096),
   baseUrl,tool:{privateKeyPem,kid:keyId},adminToken:process.env.P2LRN_LTI_ADMIN_TOKEN_FILE
    ? readFileSync(process.env.P2LRN_LTI_ADMIN_TOKEN_FILE,'utf8').trim()
    : process.env.P2LRN_LTI_ADMIN_TOKEN,
   port,bindHost:process.env.P2LRN_LTI_HOST||'127.0.0.1',allowInsecureLoopback:dev,fetchImpl:outboundLmsFetch
  });
  await gateway.listen();
  console.log('P2LRN LTI server ready on '+baseUrl+' (bind port '+port+')');
 }catch(err){console.error('P2LRN LTI startup failed: '+err.message);process.exitCode=1;}
}
