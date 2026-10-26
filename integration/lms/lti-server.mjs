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
import {createLtiAgsClient} from './lti-ags.mjs';
import {validatePackageBytes} from '../../packages/toolkit/dist/core/validator.js';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const AGS_CLAIM='https://purl.imsglobal.org/spec/lti-ags/claim/endpoint';
const DL_CLAIM='https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings';
const digest=s=>createHash('sha256').update(s).digest('hex');
const nonce=(len=32)=>randomBytes(len).toString('base64url');
const html=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeJs=s=>JSON.stringify(s).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const time=()=>Math.floor(Date.now()/1000);
const allowedType={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.mp3':'audio/mpeg','.mp4':'video/mp4','.map':'application/json'};
const secureCookie=(name,value,secure,maxAge)=>name+'='+value+'; Path=/; HttpOnly; SameSite='+(secure?'None':'Lax')+(secure?'; Secure; Partitioned':'')+'; Max-Age='+maxAge;
const cookies=request=>Object.fromEntries(String(request.headers.cookie||'').split(';').map(x=>x.trim().split('=')).filter(p=>p.length===2));
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
 "script-src 'self' 'nonce-"+nonceStr+"' blob:","style-src 'self' 'unsafe-inline'",
 "img-src 'self' blob: data:","font-src 'self' data:",
 "connect-src 'self' blob:","worker-src 'self' blob:","frame-src 'self' blob:",
 "frame-ancestors "+(ancestor||"'none'")
].join('; ');
const browserId=(req)=>valid(cookies(req).p2lrn_oidc||cookies(req)['__Host-p2lrn-oidc'],'OIDC browser binding',512);
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
function pickerHtml({ticket,tenantId,contents,cspNonce}){
 const forms=contents.flatMap(c=>(c.entities||[])
  .filter(e=>['course','unit','activity'].includes(e.type))
  .slice(0,150).map(e=>[
   '<form action="/lti/deep-link/confirm" method="post">',
   '<input type="hidden" name="ticket" value="',html(ticket),'">',
   '<input type="hidden" name="catalogId" value="',html(c.id),'">',
   '<input type="hidden" name="entityId" value="',html(e.id),'">',
   '<strong>',html(c.title),'</strong> · ',html(e.title||e.id),
   ' <button type="submit">Insertar en LMS</button></form>'
  ].join(''))).join('');
 return ['<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<title>Seleccionar P2LRN</title><style>body{font:16px system-ui;margin:2rem;color:#17253b;background:#f4f7fb}main{max-width:900px;margin:auto}form{background:white;padding:14px;border:1px solid #cbd5e1;margin:12px 0;border-radius:10px}button{background:#1459ad;color:white;border:0;border-radius:6px;padding:10px 16px;margin-left:12px;cursor:pointer}</style>',
 '</head><body><main><h1>Insertar contenido P2LRN</h1><p>Centro: ',html(tenantId),'. Selecciona un curso o una actividad publicada.</p>',
 forms||'<p>No hay paquetes P2LRN publicados para esta institución.</p>',
 '</main></body></html>'].join('');
}
function playerHtml({entityId,csrf,playerScript}){
 const code=[
 '(()=>{const csrf=',safeJs(csrf),';const api="/lti/runtime";',
 'const status=document.getElementById("p2lrn-status");',
 'const request=async(path,data)=>{const r=await fetch(api+path,{method:"POST",credentials:"same-origin",',
 'headers:{"Content-Type":"application/json","X-P2LRN-CSRF":csrf},body:JSON.stringify(data)});',
 'if(!r.ok)throw Error("P2LRN API "+r.status);return r.json()};',
 'async function main(){if(window.P2LRNReady)await window.P2LRNReady;',
 'await customElements.whenDefined("p2lrn-player");',
 'const player=document.querySelector("p2lrn-player");',
 'const kit=window.P2LRN;',
 'if(!kit||typeof kit.createHostAdapter!=="function")throw Error("Host Adapter no disponible");',
 'player.adapter=kit.createHostAdapter({',
 'loadState:async c=>(await request("/state/load",{context:c})).value??null,',
 'saveState:async(s,c)=>{await request("/state/save",{state:s,context:c})},',
 'reportScore:async(s,c)=>{await request("/score",{score:s,context:c})},',
 'emitEvent:async(e,c)=>{await request("/event",{event:e,context:c})},',
 'resolveResourceUrl:async()=>null});',
 'const resp=await fetch(api+"/package",{credentials:"same-origin",cache:"no-store"});',
 'if(!resp.ok)throw Error("Paquete no disponible: "+resp.status);',
 'const blob=await resp.blob();const src=URL.createObjectURL(blob);player.src=src;',
 'window.addEventListener("pagehide",()=>URL.revokeObjectURL(src),{once:true});',
 'status.textContent="";',
 '}main().catch(e=>{status.textContent="No se pudo cargar P2LRN: "+String(e.message||e)});})();'
 ].join('');
 return ['<!doctype html><html lang="es"><head><meta charset="utf-8">',
 '<meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">',
 '<title>Actividad P2LRN</title><style>html,body{margin:0;width:100%;height:100%;font-family:system-ui}main{height:100%;display:flex;flex-direction:column}p2lrn-player{flex:1;min-height:500px}#p2lrn-status{padding:8px}</style>',
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
 if(reg.launchUrl!==baseUrl+'/lti/launch'||(reg.deepLinkLaunchUrl&&reg.deepLinkLaunchUrl!==baseUrl+'/lti/deep-link'))
  throw new Error('LTI launch URL must match this independent P2LRN server');
 for(const v of [reg.issuer,reg.authUrl,reg.tokenUrl,...(reg.deepLinkReturnOrigins||[])])
  if(!(new URL(v).protocol==='https:'||(allowInsecureLocal&&new URL(v).protocol==='http:'&&/^(localhost|127\.0\.0\.1|[a-z0-9-]+\.localhost)$/.test(new URL(v).hostname))))throw new Error('LTI platform endpoints must use HTTPS outside the local test lab');
 return reg;
}
export function createP2LRNLtiServer({dataDir,baseUrl,tool,adminToken,port,bindHost='127.0.0.1',
 fetchImpl,lookup,allowInsecureLoopback=false}){
 valid(dataDir,'dataDir',4096);valid(baseUrl,'baseUrl');
 if(!tool||typeof tool.privateKeyPem!=='string'||!tool.kid)throw new TypeError('Persistent P2LRN RSA tool identity required');
 if(typeof adminToken!=='string'||adminToken.length<32)throw new TypeError('Secure P2LRN admin token must contain at least 32 characters');
 const base=new URL(baseUrl);
 if(base.username||base.password||base.hash||base.search||
    (base.protocol!=='https:'&&!(allowInsecureLoopback&&base.protocol==='http:'&&/^(localhost|127\.0\.0\.1|[a-z0-9-]+\.localhost)$/.test(base.hostname))))
  throw new Error('Public P2LRN LTI endpoint requires HTTPS');
 const baseOrigin=base.origin,canonicalBase=baseUrl.replace(/\/$/,'');
 if(canonicalBase!==base.origin)throw new Error('P2LRN LTI baseUrl must be an origin without path');
 const secure=base.protocol==='https:';
 const root=resolve(dataDir),packages=join(root,'packages');
 mkdirSync(packages,{recursive:true});
 const store=createLtiStore(join(root,'lti.sqlite'));
 const provider=createP2LRNLtiProvider({
  getRegistration:store.getRegistration,getRegistrationByIssuer:store.getRegistrationByIssuer,
  getRegistrationById:store.getRegistrationById,
  transactions:store.transactions,getBinding:store.getBinding,tool,allowInsecureLocal:allowInsecureLoopback
 });
 const ags=createLtiAgsClient({tool,fetchImpl,lookup,allowInsecureLoopback});
 const sessionCookie=secure?'__Host-p2lrn-session':'p2lrn_session';
 const oidcCookie=secure?'__Host-p2lrn-oidc':'p2lrn_oidc';
 const playerDist=resolve(ROOT,'packages/player/dist');
 function requireAdmin(req){
  const raw=String(req.headers.authorization||'');
  if(!raw.startsWith('Bearer ')||!compare(raw.slice(7),adminToken))throw new Error('ADMIN_DENIED');
 }
 function requireSession(req,csrf=false){
  const hash=digest(String(cookies(req)[sessionCookie]||''));
  const s=store.getSession(hash);
  if(!s)throw new Error('SESSION_EXPIRED');
  if(csrf)csrfGuard(req,s,canonicalBase);
  return s;
 }
 async function deliver(id){
  const pending=store.outboxById(id);
  if(!pending)throw new Error('Unknown AGS delivery');
  if(pending.status==='SENT')return {delivered:true,duplicate:false};
  try{
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
 const routes=async(req,res)=>{
  try{
   const incoming=new URL(req.url||'/',canonicalBase);
   const path=incoming.pathname,method=req.method;
   if(method==='GET'&&path==='/lti/health')
    return sendJson(res,200,{status:'ok',provider:'P2LRN LTI 1.3',standalone:true});
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
    res.writeHead(302,{'Location':result.authorizationUrl,
     'Set-Cookie':secureCookie(oidcCookie,binding,secure,3600),'Cache-Control':'no-store',
     'Referrer-Policy':'no-referrer'});return res.end();
   }
   if(method==='POST'&&(path==='/lti/launch'||path==='/lti/deep-link')){
    const data=input(await readBody(req,131072),req);
    const verified=await provider.verifyLaunch({
     state:valid(data.state,'state',512),idToken:valid(data.id_token,'id_token',65536),
     browserBinding:browserId(req)
    });
    const inspected=provider.inspectVerifiedLaunch(verified);
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
    store.attachLaunch({launch:verified.launch,ags:agsData,tokenHash:digest(token),
      csrfHash:digest(csrf),expiresAt:time()+3600});
    const cspNonce=nonce(16);
    const body=playerHtml({entityId:verified.launch.entityId,csrf,
      playerScript:'/lti/assets/player/p2lrn.js'})
      .replace('__CSP_NONCE__',html(cspNonce));
    return sendHtml(res,200,body,policy(cspNonce,ancestor),
      {'Set-Cookie':secureCookie(sessionCookie,token,secure,3600)});
   }
   if(method==='POST'&&path==='/lti/deep-link/confirm'){
    const formData=input(await readBody(req,32768),req);
    const entry=store.consumePicker(digest(valid(formData.ticket,'picker ticket',128)));
    if(!entry)throw new Error('PICKER_EXPIRED');
    const c=store.getCatalog(valid(formData.catalogId,'catalogId',128),entry.tenantId);
    const node=valid(formData.entityId,'entityId',2048);
    if(!c||!JSON.parse(c.entities_json).some(e=>e.id===node))
     throw new Error('UNAUTHORIZED_DEEP_LINK_CONTENT');
    const bindingId=store.createBinding({tenantId:entry.tenantId,
     registrationId:entry.registrationId,deploymentId:entry.deploymentId,catalogId:c.id,
     entityId:node});
    const launch=await provider.restoreDeepLink(entry);
    const name=JSON.parse(c.entities_json).find(e=>e.id===node)?.title||c.title;
    const signed=await provider.deepLinkResponse({launch,selected:[{bindingId,title:name}]});
    const cspNonce=nonce(16);
    return sendHtml(res,200,form(signed.returnUrl,signed.jwt,cspNonce),
      policy(cspNonce,new URL(signed.returnUrl).origin));
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
   if(method==='GET'&&path==='/lti/runtime/package'){
    const session=requireSession(req),file=resolve(packages,session.filename);
    if(!file.startsWith(packages+sep)||!existsSync(file))return sendJson(res,503,{error:'PACKAGE_NOT_AVAILABLE'});
    res.writeHead(200,{'Content-Type':'application/vnd.p2lrn+zip','Content-Length':session.bytes,
      'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'});
    return createReadStream(file).pipe(res);
   }
   if(method==='POST'&&path.startsWith('/lti/runtime/')){
    const s=requireSession(req,true),data=input(await readBody(req,512*1024),req);
    const {entityId,surface}=contextFor(data,s);
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
     const sourceSha=digest(bytes);
     const parsed=validatePackageBytes(bytes,{strictProfiles:true,validateProfilePayloads:true});
     const entities=parsed.graph.entities.filter(e=>['course','unit','activity'].includes(e.type))
       .map(e=>({id:e.id,type:e.type,title:String(e.title||e.name||e.id).slice(0,200)}));
     if(!entities.length)throw new Error('P2LRN package contains no publishable learning entities');
     const filename=sourceSha+'.p2lrn';
     const destination=join(packages,filename);
     if(!existsSync(destination))writeFileSync(destination,bytes,{flag:'wx',mode:0o600});
     const id=store.publishPackage({tenantId,title,packageId:parsed.manifest.packageId,
      contentRoot:parsed.manifest.integrity.contentRoot,sha:sourceSha,filename,bytes:bytes.length,entities});
     return sendJson(res,201,{id,packageId:parsed.manifest.packageId,
      contentRoot:parsed.manifest.integrity.contentRoot,entities:entities.length});
    }
    if(method==='GET'&&path.startsWith('/lti/admin/catalog/')){
     const tenantId=valid(decodeURIComponent(path.slice('/lti/admin/catalog/'.length)),'tenantId',128);
     return sendJson(res,200,{courses:store.listCatalog(tenantId)});
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
   const forbidden=/ADMIN_DENIED|UNAUTHORIZED|CROSS_SITE|INVALID_CSRF|SESSION_EXPIRED|PICKER_EXPIRED|LTI|JWT|OIDC|issuer|audience|nonce|binding|deployment|registered|registration|platform|signature|token|key|origin|P2LRN content authorization/i.test(message);
   const status=message==='REQUEST_TOO_LARGE'?413:forbidden?403:400;
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
  const gateway=createP2LRNLtiServer({
   dataDir:valid(process.env.P2LRN_LTI_DATA_DIR,'P2LRN_LTI_DATA_DIR',4096),
   baseUrl,tool:{privateKeyPem,kid:keyId},adminToken:process.env.P2LRN_LTI_ADMIN_TOKEN_FILE
    ? readFileSync(process.env.P2LRN_LTI_ADMIN_TOKEN_FILE,'utf8').trim()
    : process.env.P2LRN_LTI_ADMIN_TOKEN,
   port,bindHost:process.env.P2LRN_LTI_HOST||'127.0.0.1',allowInsecureLoopback:dev
  });
  await gateway.listen();
  console.log('P2LRN LTI server ready on '+baseUrl+' (bind port '+port+')');
 }catch(err){console.error('P2LRN LTI startup failed: '+err.message);process.exitCode=1;}
}
