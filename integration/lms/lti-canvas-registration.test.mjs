import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canvasDynamicRegistrationBody,installCanvasDynamicRegistration,
 CANVAS_PENDING_DEPLOYMENT,trustedCanvasUrl} from './lti-canvas-registration.mjs';
import {createLtiStore} from './lti-store.mjs';
import {createP2LRNLtiProvider} from './lti-provider.mjs';
import {LTI_CLAIMS} from './launch-contract.mjs';

const LMS='http://canvas.school.localhost';
const TOOL='http://p2lrn-lti.localhost';
const OIDC=LMS+'/api/lti/openid_configuration';
const REG=LMS+'/api/lti/registrations';
const DEV_TOKEN='temporary-test-canvas-registration-token';
const platformKeys=generateKeyPairSync('rsa',{modulusLength:2048});
const toolKeys=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...platformKeys.publicKey.export({format:'jwk'}),kid:'canvas-kid-1',alg:'RS256',use:'sig'};
const claims={
 issuer:LMS,authorization_endpoint:LMS+'/api/lti/authorize_redirect',
 token_endpoint:LMS+'/login/oauth2/token',
 jwks_uri:LMS+'/api/lti/security/jwks',registration_endpoint:REG
};
function mockCanvasFetch({config=claims}={}){
 const calls=[];
 const fetchImpl=async(url,options={})=>{
  calls.push({url,method:options.method||'GET',hasAdminToken:options.headers?.Authorization==='Bearer '+DEV_TOKEN});
  if(url===OIDC)return Response.json(config);
  if(url===claims.jwks_uri)return Response.json({keys:[jwk]});
  if(url===REG&&options.method==='POST'){
   const data=JSON.parse(options.body);
   assert.equal(data.client_name,'P2LRN');
   assert.equal(data.initiate_login_uri,TOOL+'/lti/login');
   assert(data['https://purl.imsglobal.org/spec/lti-tool-configuration'].messages.some(x=>
    x.type==='LtiDeepLinkingRequest'&&x.placements.includes('assignment_selection')));
   return Response.json({client_id:'canvas-install-client-22'},{status:201});
  }
  throw Error('Unexpected URL '+url);
 };
 return {calls,fetchImpl};
}
function withStore(run){
 const dir=mkdtempSync(join(tmpdir(),'p2lrn-canvas-registration-'));
 const store=createLtiStore(join(dir,'lti.sqlite'));
 return Promise.resolve().then(()=>run(store)).finally(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
}
test('Canvas provides a valid one-URL dynamic registration and resource selector',()=>{
 const body=canvasDynamicRegistrationBody(TOOL);
 assert.equal(body.application_type,'web');
 assert.equal(body.token_endpoint_auth_method,'private_key_jwt');
 assert.equal(body.redirect_uris.length,2);
 assert(body.scope.includes('lti-ags/scope/score'));
 assert(body.scope.includes('contextmembership.readonly'));
 assert(!JSON.stringify(body).includes('client_id'));
 assert.throws(()=>trustedCanvasUrl('http://169.254.169.254/latest/meta-data/'),/HTTPS_REQUIRED|HOST_NOT_TRUSTED/);
 assert.throws(()=>trustedCanvasUrl('https://evil.example/config'),/HOST_NOT_TRUSTED/);
 assert.equal(trustedCanvasUrl(OIDC,{allowInsecureLocal:true}).toString(),OIDC);
});
test('a real Canvas protocol handshake stores the registration without the install token',async()=>{
 await withStore(async store=>{
  const {calls,fetchImpl}=mockCanvasFetch();
  const result=await installCanvasDynamicRegistration({
   openidConfiguration:OIDC,registrationToken:DEV_TOKEN,baseUrl:TOOL,
   allowInsecureLocal:true,fetchImpl,registerPlatform:store.registerCanvasDynamicPlatform
  });
  assert.equal(result.clientId,'canvas-install-client-22');
  const registered=store.getRegistration({issuer:LMS,clientId:result.clientId});
  assert.equal(registered.dynamicCanvas,true);
  assert.deepEqual(registered.deployments,[CANVAS_PENDING_DEPLOYMENT]);
  assert.equal(registered.jwks.keys[0].kid,'canvas-kid-1');
  assert(calls.some(x=>x.url===REG&&x.method==='POST'&&x.hasAdminToken));
  assert(calls.some(x=>x.url===claims.jwks_uri&&!x.hasAdminToken));
  assert(!JSON.stringify(store.listPlatforms()).includes(DEV_TOKEN));
  await assert.rejects(installCanvasDynamicRegistration({
   openidConfiguration:OIDC,registrationToken:DEV_TOKEN,baseUrl:TOOL,
   allowInsecureLocal:true,fetchImpl,registerPlatform:store.registerCanvasDynamicPlatform
  }),/ALREADY_EXISTS/);
 });
});
test('a Canvas token cannot be forwarded to another endpoint during discovery',async()=>{
 await withStore(async store=>{
  const bad={...claims,registration_endpoint:'https://attacker.instructure.com/api/lti/registrations'};
  const {fetchImpl,calls}=mockCanvasFetch({config:bad});
  await assert.rejects(installCanvasDynamicRegistration({
   openidConfiguration:OIDC,registrationToken:DEV_TOKEN,baseUrl:TOOL,
   allowInsecureLocal:true,fetchImpl,registerPlatform:store.registerCanvasDynamicPlatform
  }),/HOST_MISMATCH/);
  assert.equal(calls.some(x=>x.url===bad.registration_endpoint),false);
 });
});
test('a newly installed Canvas deployment is trusted only after a signed LTI 1.3 launch',async()=>{
 await withStore(async store=>{
  const {fetchImpl}=mockCanvasFetch();
  const installed=await installCanvasDynamicRegistration({
   openidConfiguration:OIDC,registrationToken:DEV_TOKEN,baseUrl:TOOL,
   allowInsecureLocal:true,fetchImpl,registerPlatform:store.registerCanvasDynamicPlatform
  });
  const t=Math.floor(Date.now()/1000);
  const provider=createP2LRNLtiProvider({
   getRegistration:store.getRegistration,
   getRegistrationByIssuer:store.getRegistrationByIssuer,
   getRegistrationById:store.getRegistrationById,
   getBinding:store.getBinding,
   transactions:store.transactions,
   activateDynamicDeployment:store.activateCanvasDynamicDeployment,
   tool:{privateKeyPem:toolKeys.privateKey.export({format:'pem',type:'pkcs8'}),kid:'p2lrn-test'},
   allowInsecureLocal:true,now:()=>t
  });
  async function login(deployment){
   const auth=await provider.beginLogin({
    browserBinding:'browser-one',
    login:{iss:LMS,client_id:installed.clientId,login_hint:'canvas-login-hint',
     target_link_uri:TOOL+'/lti/deep-link',deployment_id:deployment}
   });
   const url=new URL(auth.authorizationUrl);
   return {state:url.searchParams.get('state'),nonce:url.searchParams.get('nonce')};
  }
  function jwt(nonce,deployment,key=platformKeys.privateKey){
   const payload={
    iss:LMS,aud:installed.clientId,iat:t,exp:t+180,nonce,
    [LTI_CLAIMS.version]:'1.3.0',
    [LTI_CLAIMS.messageType]:'LtiDeepLinkingRequest',
    [LTI_CLAIMS.deploymentId]:deployment,
    [LTI_CLAIMS.targetLinkUri]:TOOL+'/lti/deep-link',
    [LTI_CLAIMS.roles]:['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
    'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings':{
     deep_link_return_url:LMS+'/api/lti/return',accept_types:['ltiResourceLink']
    }
   };
   const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
   const raw=enc({alg:'RS256',kid:'canvas-kid-1'})+'.'+enc(payload);
   return raw+'.'+sign('RSA-SHA256',Buffer.from(raw),key).toString('base64url');
  }
  const fake=await login('4:bad-attempt');
  const wrong=generateKeyPairSync('rsa',{modulusLength:2048});
  await assert.rejects(provider.verifyLaunch({
   state:fake.state,browserBinding:'browser-one',
   idToken:jwt(fake.nonce,'4:bad-attempt',wrong.privateKey)
  }),/signature/);
  assert.deepEqual(store.getRegistrationById(installed.registrationId).deployments,[CANVAS_PENDING_DEPLOYMENT]);
  const correct=await login('4:valid-deployment');
  const launch=await provider.verifyLaunch({
   state:correct.state,browserBinding:'browser-one',
   idToken:jwt(correct.nonce,'4:valid-deployment')
  });
  assert.equal(launch.kind,'deep-link');
  const stored=store.getRegistrationById(installed.registrationId);
  assert(stored.deployments.includes('4:valid-deployment'));
  assert.equal(stored.dynamicCanvas,true);
 });
});
test('Canvas administrator one-URL installation is exposed by the actual P2LRN HTTP server',async()=>{
 const {createP2LRNLtiServer}=await import('./lti-server.mjs');
 const dir=mkdtempSync(join(tmpdir(),'p2lrn-canvas-route-'));
 const {fetchImpl}=mockCanvasFetch();
 const gateway=createP2LRNLtiServer({
  dataDir:dir,baseUrl:TOOL,port:0,bindHost:'127.0.0.1',
  allowInsecureLoopback:true,fetchImpl,
  adminToken:'test-only-lti-admin-placeholder-1234',
  tool:{privateKeyPem:toolKeys.privateKey.export({format:'pem',type:'pkcs8'}),kid:'tool-test'}
 });
 try{
  const addr=await gateway.listen(0,'127.0.0.1');
  const u=new URL('http://127.0.0.1:'+addr.port+'/lti/register/canvas');
  u.searchParams.set('openid_configuration',OIDC);
  u.searchParams.set('registration_token',DEV_TOKEN);
  const result=await fetch(u,{headers:{accept:'text/html'}});
  assert.equal(result.status,200);
  const html=await result.text();
  assert(html.includes('P2LRN conectado'));
  assert(html.includes('org.imsglobal.lti.close'));
  assert(html.includes('history.replaceState'),'installer token must not remain visible in history');
  assert(!html.includes(DEV_TOKEN));
  assert.equal(result.headers.get('cache-control'),'no-store');
  const reg=gateway.store.getRegistration({issuer:LMS,clientId:'canvas-install-client-22'});
  assert.equal(reg.dynamicCanvas,true);
  const duplicate=new URL(u);duplicate.searchParams.append('registration_token','forged');
  assert.equal((await fetch(duplicate)).status,403,'ambiguous registration tokens are rejected');
  const invalid=await fetch('http://127.0.0.1:'+addr.port+'/lti/register/canvas');
  assert.equal(invalid.status,403);
  assert.equal(gateway.store.count('platforms'),1);
 }finally{
  await gateway.close();
  rmSync(dir,{recursive:true,force:true});
 }
});