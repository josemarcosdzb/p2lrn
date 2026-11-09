import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign,verify} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createP2LRNLtiServer,parseLtiCookieHeader} from './lti-server.mjs';
import {LTI_CLAIMS} from './launch-contract.mjs';

test('LTI cookie parser preserves complete token values without granting access by cookie syntax',()=>{
 const values=parseLtiCookieHeader(' __Host-p2lrn-session=abc=def==; p2lrn_oidc=xyz ; malformed ; other=x=y');
 assert.equal(values['__Host-p2lrn-session'],'abc=def==');
 assert.equal(values.p2lrn_oidc,'xyz');
 assert.equal(values.other,'x=y');
 assert.equal(Object.hasOwn(values,'malformed'),false);
});

const HERE=dirname(fileURLToPath(import.meta.url)),BASE='https://p2lrn.example',
 ISSUER='https://moodle.example', CLIENT='p2lrn-tool';
const PRIVATE=generateKeyPairSync('rsa',{modulusLength:2048});
const TOOL=generateKeyPairSync('rsa',{modulusLength:2048});
const jwtBase=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const C={
 scope:'https://purl.imsglobal.org/spec/lti-ags/scope/score',
 ags:'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
 dl:'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
 items:'https://purl.imsglobal.org/spec/lti-dl/claim/content_items'
};
const now=()=>Math.floor(Date.now()/1000);
function signedPlatformToken({nonce,kind,target,bindingId,changes={}}){
 const epoch=now();
 const claims={
  iss:ISSUER,aud:CLIENT,sub:'learner-opaque-1',nonce,iat:epoch,exp:epoch+300,
  [LTI_CLAIMS.version]:'1.3.0',[LTI_CLAIMS.messageType]:kind,
  [LTI_CLAIMS.deploymentId]:'D1',[LTI_CLAIMS.targetLinkUri]:target,
  [LTI_CLAIMS.roles]:['http://purl.imsglobal.org/vocab/lis/v2/membership#'+(kind==='LtiDeepLinkingRequest'?'Instructor':'Learner')],
  [LTI_CLAIMS.resourceLink]:{id:'resource-1'},[LTI_CLAIMS.context]:{id:'course-1'},
  [LTI_CLAIMS.custom]:{p2lrn_binding_id:bindingId},
  [C.dl]:{deep_link_return_url:ISSUER+'/return',accept_types:['ltiResourceLink'],data:'return-value'},
  [C.ags]:{lineitem:ISSUER+'/ags/items/1',scope:[C.scope]},...changes
 };
 const head=jwtBase({alg:'RS256',typ:'JWT',kid:'platform-key'});
 const message=head+'.'+jwtBase(claims);
 return message+'.'+sign('RSA-SHA256',Buffer.from(message),PRIVATE.privateKey).toString('base64url');
}
test('standalone HTTP integration: trusted LMS admin, Deep Linking, Player, persistence, grades, OAuth and replay',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'p2lrn-lti-live-http-'));
 const calls=[],adminToken='testing-admin-token-1234567890123456789';
 const tool={privateKeyPem:TOOL.privateKey.export({format:'pem',type:'pkcs8'}),kid:'tool-key'};
 const gateway=createP2LRNLtiServer({dataDir:folder,baseUrl:BASE,tool,adminToken,
  fetchImpl:async(uri,opts)=>{
   const path=new URL(uri).pathname;
   calls.push({path,method:opts.method,body:String(opts.body)});
   if(path==='/token')return new Response(JSON.stringify({access_token:'trusted-lms-token',token_type:'Bearer'}),{
    status:200,headers:{'Content-Type':'application/json'}});
   if(path==='/ags/items/1/scores'){
    assert.equal(opts.headers.Authorization,'Bearer trusted-lms-token');
    assert.equal(JSON.parse(opts.body).userId,'learner-opaque-1');
    return new Response('',{status:200});
   }
   throw new Error('Unexpected outbound request: '+uri);
  },
  lookup:async()=>[{address:'203.0.113.7',family:4}]
 });
 try{
  const listen=await gateway.listen(0);
  const local='http://127.0.0.1:'+listen.port;
  const admin={'Authorization':'Bearer '+adminToken};
  const req=(path,options={})=>fetch(local+path,options);
  assert.equal((await req('/lti/health')).status,200);
  const rapierModule=await req('/lti/assets/player/vendor/rapier3d.mjs');
  assert.equal(rapierModule.status,200,'3D physics module must be available to the Player');
  assert.match(rapierModule.headers.get('content-type')??'',/^text\/javascript\b/,
    'browser must receive .mjs as JavaScript, never application/octet-stream');
  assert.ok((await rapierModule.arrayBuffer()).byteLength>100000,'3D physics payload is present');
  const pub=await (await req('/lti/jwks')).json();
  assert.equal(pub.keys[0].kid,'tool-key');
  assert.equal(pub.keys[0].kty,'RSA');
  const registration={
   id:'moodle',tenantId:'school',issuer:ISSUER,clientId:CLIENT,
   authUrl:ISSUER+'/auth',launchUrl:BASE+'/lti/launch',
   deepLinkLaunchUrl:BASE+'/lti/deep-link',tokenUrl:ISSUER+'/token',
   jwks:{keys:[{...PRIVATE.publicKey.export({format:'jwk'}),kid:'platform-key',use:'sig',alg:'RS256'}]},
   deployments:['D1'],deepLinkReturnOrigins:[ISSUER],status:'ACTIVE'
  };
  assert.equal((await req('/lti/admin/platforms',{method:'POST',
   headers:{...admin,'Content-Type':'application/json'},body:JSON.stringify(registration)})).status,201);
  assert.equal((await req('/lti/admin/platforms')).status,403);
  assert.equal((await (await req('/lti/admin/platforms',{headers:admin})).json()).platforms.length,1);

  const course=readFileSync(resolve(HERE,'../../examples/canonical/minimal-course.p2lrn'));
  const imported=await req('/lti/admin/catalog',{method:'POST',
   headers:{...admin,'x-p2lrn-tenant':'school','x-p2lrn-title':'Curso prueba',
    'Content-Type':'application/vnd.p2lrn+zip'},body:course});
  assert.equal(imported.status,201,await imported.text());
  const list=await (await req('/lti/admin/catalog/school',{headers:admin})).json();
  assert.equal(list.courses.length,1);
  const catalogue=list.courses[0];
  const selected=catalogue.entities.find(x=>['course','unit','activity'].includes(x.type));
  assert.ok(selected);
  const bindingBody={registrationId:'moodle',deploymentId:'D1',
   catalogId:catalogue.id,entityId:selected.id};
  const unauthenticated=await req('/lti/admin/bindings',{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify(bindingBody)});
  assert.equal(unauthenticated.status,403,'manual binding must require admin authorization');
  const wrongDeployment=await req('/lti/admin/bindings',{method:'POST',
   headers:{...admin,'Content-Type':'application/json'},
   body:JSON.stringify({...bindingBody,deploymentId:'OTHER-LMS'})});
  assert.equal(wrongDeployment.status,403,'manual binding cannot cross LTI deployment');
  const manual=await req('/lti/admin/bindings',{method:'POST',
   headers:{...admin,'Content-Type':'application/json'},
   body:JSON.stringify(bindingBody)});
  assert.equal(manual.status,201);
  const manualData=await manual.json();
  assert.match(manualData.bindingId,/^[a-f0-9]{64}$/);
  assert.equal(manualData.customParameters.p2lrn_binding_id,manualData.bindingId);
  assert.equal(gateway.store.getBinding({id:manualData.bindingId,
   tenantId:'school',registrationId:'moodle',deploymentId:'D1'}).entityId,selected.id);
  assert.equal(gateway.store.getBinding({id:manualData.bindingId,
   tenantId:'other-school',registrationId:'moodle',deploymentId:'D1'}),null);

  async function begin(kind){
   const target=BASE+(kind==='LtiDeepLinkingRequest'?'/lti/deep-link':'/lti/launch');
   const query=new URLSearchParams({iss:ISSUER,client_id:CLIENT,login_hint:'one-time-hint',
    target_link_uri:target,lti_deployment_id:'D1'});
   const initial=await req('/lti/login?'+query,{redirect:'manual'});
   assert.equal(initial.status,302);
   const location=new URL(initial.headers.get('location'));
   assert.equal(location.origin,ISSUER);
   assert.equal(location.searchParams.get('response_mode'),'form_post');
   const browserCookie=initial.headers.get('set-cookie').split(';')[0];
   assert.ok(browserCookie.startsWith('__Host-p2lrn-oidc='));
   return {state:location.searchParams.get('state'),nonce:location.searchParams.get('nonce'),browserCookie,target};
  }
  const teacher=await begin('LtiDeepLinkingRequest');
  const teacherResponse=await req('/lti/deep-link',{method:'POST',headers:{
   'Content-Type':'application/x-www-form-urlencoded','Cookie':teacher.browserCookie},
   body:new URLSearchParams({state:teacher.state,id_token:signedPlatformToken({
    nonce:teacher.nonce,kind:'LtiDeepLinkingRequest',target:teacher.target})})});
  assert.equal(teacherResponse.status,200);
  const teacherHtml=await teacherResponse.text();
  assert.match(teacherHtml,/Insertar contenido P2LRN/);
  const ticket=/name="ticket" value="([^"]+)"/.exec(teacherHtml)?.[1];
  assert.ok(ticket);
  const confirm=await req('/lti/deep-link/confirm',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({ticket,catalogId:catalogue.id,entityId:selected.id})});
  assert.equal(confirm.status,200);
  const confirmation=await confirm.text();
  const signed=/name="JWT" value="([^"]+)"/.exec(confirmation)?.[1];
  assert.ok(signed);
  const [header,payload,signature]=signed.split('.');
  assert.equal(verify('RSA-SHA256',Buffer.from(header+'.'+payload),TOOL.publicKey,Buffer.from(signature,'base64url')),true);
  const deepLink=JSON.parse(Buffer.from(payload,'base64url').toString());
  const bindingId=deepLink[C.items][0].custom.p2lrn_binding_id;
  assert.match(bindingId,/^[A-Za-z0-9_-]{32,128}$/);
  assert.equal(deepLink[C.items][0].url,BASE+'/lti/launch');
  assert.equal(deepLink['https://purl.imsglobal.org/spec/lti-dl/claim/data'],'return-value');
  assert.equal((await req('/lti/deep-link/confirm',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({ticket,catalogId:catalogue.id,entityId:selected.id})})).status,403);

  const learner=await begin('LtiResourceLinkRequest');
  const token=signedPlatformToken({nonce:learner.nonce,kind:'LtiResourceLinkRequest',
   target:learner.target,bindingId});
  const launch=await req('/lti/launch',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded','Cookie':learner.browserCookie},
   body:new URLSearchParams({state:learner.state,id_token:token})});
  assert.equal(launch.status,200);
  assert.match(launch.headers.get('content-security-policy')??'',/script-src[^;]*'wasm-unsafe-eval'/,
    'the LTI Player must permit WebAssembly physics without globally enabling JavaScript eval');
  const htmlBody=await launch.text();
  const playerNonce=/<meta name="p2lrn-opaque-runtime-nonce" content="([^"]+)">/u.exec(htmlBody)?.[1];
  assert.match(playerNonce ?? '',/^[A-Za-z0-9_-]{20,128}$/u,'each LTI launch must expose a valid opaque-runtime bootstrap nonce');
  const csp=launch.headers.get('content-security-policy') ?? '';
  assert.match(csp,/style-src[^;]*blob:/u,'LTI H5P must permit sandboxed blob stylesheets');
  assert.match(csp,/font-src[^;]*blob:/u,'LTI H5P must permit sandboxed blob fonts');
  assert.match(csp,/media-src[^;]*blob:/u,'LTI activities must permit packaged audio and video');
  assert.doesNotMatch(csp,/script-src[^;]*unsafe-inline/u,'the LTI top-level page must keep strict nonce-based scripts');
  assert.ok(launch.headers.get('content-security-policy')?.includes("'nonce-" + playerNonce + "'"),
    'the runtime nonce must be the same nonce enforced by the LTI launch CSP');
  assert.ok(htmlBody.includes('<script nonce="' + playerNonce + '">'));
  assert.match(htmlBody,/<p2lrn-player/);
  assert.match(htmlBody,/p2lrn-player\{display:block;width:100%;height:auto;min-height:500px\}/u,
    'the embedded Player must expand to show interactive content without clipping buttons');
  assert.doesNotMatch(htmlBody,/main\{height:100%;display:flex/u,
    'LTI must not clip H5P and SCORM content to the initial LMS iframe height');
  assert.match(htmlBody,/player\.setAttribute\("src",src\)/,
    'LTI HTML must use the observed src attribute, not an inert player.src property');
  assert.doesNotMatch(htmlBody,/player\.src=src/);
  assert.match(htmlBody,/expectedRevision/, 'the embedded LMS adapter must preserve optimistic state revisions');
  assert.match(htmlBody,/retryTransient/, 'temporary network failures must be retried in a bounded fashion');
  assert.match(htmlBody,/No se pudo guardar tu progreso/, 'a student must see failed progress persistence');
  assert.match(htmlBody,/p2lrn:rendered/, 'loading a file is not the same as a rendered activity');
  assert(!htmlBody.includes('learner-opaque-1'));
  const cookie=launch.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie.startsWith('__Host-p2lrn-session='));
  const csrf=/const csrf="([^"]+)"/.exec(htmlBody)?.[1];
  assert.ok(csrf);

  const pack=await req('/lti/runtime/package',{headers:{Cookie:cookie}});
  assert.equal(pack.status,200);
  assert.deepEqual(Buffer.from(await pack.arrayBuffer()),course);
  const playerContext={packageId:catalogue.packageId,contentRoot:catalogue.contentRoot,
   entityId:selected.id,rendererId:'quiz'};
  const runtimeHeaders={'Cookie':cookie,'Content-Type':'application/json','X-P2LRN-CSRF':csrf};
  const postRuntime=(endpoint,body,headers=runtimeHeaders)=>req('/lti/runtime/'+endpoint,{
   method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await postRuntime('state/save',{context:playerContext,state:{answer:'A'},expectedRevision:0})).status,200);
  const state=await (await postRuntime('state/load',{context:playerContext})).json();
  assert.deepEqual(state,{value:{answer:'A'},revision:1});
  const replay=await postRuntime('state/save',{context:playerContext,state:{answer:'A'},expectedRevision:0});
  assert.equal(replay.status,200,'repeated save after lost response must not discard an already committed answer');
  assert.equal((await replay.json()).unchanged,true);
  assert.equal((await postRuntime('state/save',{context:playerContext,state:{answer:'B'},expectedRevision:0})).status,409);
  assert.equal((await postRuntime('state/load',{context:playerContext},{Cookie:cookie,'Content-Type':'application/json'})).status,403);
  assert.equal((await postRuntime('score',{context:playerContext,score:{normalized:0.8,completed:true}})).status,200);
  assert.equal(calls.length,0,'browser-reported grade must never trigger AGS OAuth');
  assert.equal((await postRuntime('event',{context:playerContext,event:{id:'ev1',type:'p2lrn:complete'}})).status,200);
  const packageContext={packageId:catalogue.packageId,contentRoot:catalogue.contentRoot};
  assert.equal((await postRuntime('event',{context:packageContext,event:{id:'package-ready',type:'p2lrn:ready'}})).status,200,
    'the real Player sends package-ready telemetry without an entityId');
  assert.equal((await postRuntime('event',{context:packageContext,event:{id:'package-error',type:'p2lrn:error'}})).status,200);
  assert.equal((await postRuntime('event',{context:packageContext,event:{id:'no-entity',type:'p2lrn:interaction'}})).status,403,
    'activity events must still identify an authorized graph entity');
  assert.equal((await postRuntime('event',{context:{...packageContext,packageId:'forged'},event:{type:'p2lrn:ready'}})).status,403);
  assert.equal((await postRuntime('state/load',{context:packageContext})).status,403,
    'missing entityId must never be accepted for state, score or other APIs');
  assert.equal((await req('/lti/launch',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded','Cookie':learner.browserCookie},
   body:new URLSearchParams({state:learner.state,id_token:token})})).status,403);
  const attempts=await (await req('/lti/admin/attempts?tenantId=school',{headers:admin})).json();
  assert.equal(attempts.attempts.length,1);
  const grade=await req('/lti/admin/grades',{method:'POST',
   headers:{...admin,'Content-Type':'application/json'},
   body:JSON.stringify({attemptId:attempts.attempts[0].id,normalized:0.8,completed:true})});
  assert.equal(grade.status,200,await grade.text());
  assert.deepEqual(calls.map(x=>x.path),['/token','/ags/items/1/scores']);
  const pending=await (await req('/lti/admin/ags/pending',{headers:admin})).json();
  assert.equal(pending.pending.length,0);
 }finally{
  await gateway.close();rmSync(folder,{recursive:true,force:true});
 }
});
