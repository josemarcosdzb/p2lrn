import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createP2LRNLtiServer} from './lti-server.mjs';

const BASE='http://p2lrn-lti.localhost';
const ISSUER='http://jose-moodle-qa-20261017.localhost';
const CLIENT='local-http-lab-client';
const privateLms=generateKeyPairSync('rsa',{modulusLength:2048});
const privateTool=generateKeyPairSync('rsa',{modulusLength:2048});
const tool={privateKeyPem:privateTool.privateKey.export({type:'pkcs8',format:'pem'}),kid:'local-tool-key'};
const adminToken='test-only-admin-token-not-for-production-012345678901';
const claim='https://purl.imsglobal.org/spec/lti/claim/';
const dlClaim='https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings';
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');

function signPlatformDeepLink(nonce,target){
 const t=Math.floor(Date.now()/1000);
 const data={
  iss:ISSUER,aud:CLIENT,sub:'qa-professor',nonce,iat:t,exp:t+300,
  [claim+'version']:'1.3.0',
  [claim+'message_type']:'LtiDeepLinkingRequest',
  [claim+'deployment_id']:'local-qa-deployment',
  [claim+'target_link_uri']:target,
  [claim+'roles']:['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
  [claim+'context']:{id:'local-qa-course'},
  [dlClaim]:{deep_link_return_url:ISSUER+'/local-qa-return',accept_types:['ltiResourceLink']}
 };
 const head=b64({alg:'RS256',typ:'JWT',kid:'local-qa-lms-key'});
 const payload=head+'.'+b64(data);
 return payload+'.'+sign('RSA-SHA256',Buffer.from(payload),privateLms.privateKey).toString('base64url');
}

test('public HTTP cannot be used even when local integration mode is requested',()=>{
 const config={dataDir:'/tmp/lti-should-not-be-written',tool,adminToken,allowInsecureLoopback:true};
 assert.throws(()=>createP2LRNLtiServer({...config,baseUrl:'http://public.example'}),/requires HTTPS/);
 assert.throws(()=>createP2LRNLtiServer({...config,baseUrl:BASE,allowInsecureLoopback:false}),/requires HTTPS/);
});

test('local HTTP sends cross-site OIDC cookies with Secure and Partitioned fallback, then verifies LTI JWT',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'p2lrn-http-dev-'));
 const gateway=createP2LRNLtiServer({dataDir:dir,baseUrl:BASE,tool,adminToken,allowInsecureLoopback:true});
 try{
  const {port}=await gateway.listen(0);
  const request=(route,options={})=>fetch('http://127.0.0.1:'+port+route,{redirect:'manual',...options});
  const headers={Authorization:'Bearer '+adminToken,'Content-Type':'application/json'};
  const registration={
   id:'moodle-http-qa',tenantId:'qa-campus',issuer:ISSUER,clientId:CLIENT,
   authUrl:ISSUER+'/mod/lti/auth.php',tokenUrl:ISSUER+'/mod/lti/token.php',
   launchUrl:BASE+'/lti/launch',deepLinkLaunchUrl:BASE+'/lti/deep-link',
   jwks:{keys:[{...privateLms.publicKey.export({format:'jwk'}),kid:'local-qa-lms-key',alg:'RS256',use:'sig'}]},
   deployments:['local-qa-deployment'],deepLinkReturnOrigins:[ISSUER],status:'ACTIVE'
  };
  const register=await request('/lti/admin/platforms',{method:'POST',headers,body:JSON.stringify(registration)});
  assert.equal(register.status,201,await register.text());
  const target=BASE+'/lti/deep-link';
  async function login(){
   const query=new URLSearchParams({iss:ISSUER,client_id:CLIENT,login_hint:'professor-local-qa',target_link_uri:target,lti_deployment_id:'local-qa-deployment'});
   const response=await request('/lti/login?'+query);
   assert.equal(response.status,302);
   const cookies=response.headers.getSetCookie();
   assert.equal(cookies.length,2);
   assert.match(cookies[0],/^p2lrn_oidc=[A-Za-z0-9_-]+;/);
   assert.match(cookies[0],/SameSite=None; Secure/);
   assert.doesNotMatch(cookies[0],/Partitioned/);
   assert.match(cookies[1],/^p2lrn_oidc-partitioned=[A-Za-z0-9_-]+;/);
   assert.match(cookies[1],/SameSite=None; Secure; Partitioned/);
   const location=new URL(response.headers.get('location'));
   assert.equal(location.origin,ISSUER);
   assert.equal(location.searchParams.get('response_mode'),'form_post');
   return {nonce:location.searchParams.get('nonce'),state:location.searchParams.get('state'),cookies};
  }
  const initial=await login();
  // When third-party cookies are blocked, Chromium may still send a partitioned cookie.
  const binding=initial.cookies[1].split(';')[0];
  const launch=await request('/lti/deep-link',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:binding},
   body:new URLSearchParams({state:initial.state,id_token:signPlatformDeepLink(initial.nonce,target)})});
  const launchBody=await launch.text();
  assert.equal(launch.status,200,launchBody);
  assert.match(launchBody,/Insertar contenido P2LRN/);
  const duplicate=await request('/lti/deep-link',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:binding},
   body:new URLSearchParams({state:initial.state,id_token:signPlatformDeepLink(initial.nonce,target)})});
  assert.equal(duplicate.status,403,'OIDC state and nonce must not be reusable');
  const second=await login();
  const ordinaryCookie=second.cookies[0].split(';')[0];
  const standardLaunch=await request('/lti/deep-link',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:ordinaryCookie},
   body:new URLSearchParams({state:second.state,id_token:signPlatformDeepLink(second.nonce,target)})});
  assert.equal(standardLaunch.status,200);
 }finally{
  await gateway.close();
  rmSync(dir,{recursive:true,force:true});
 }
});
