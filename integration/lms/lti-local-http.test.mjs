import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
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


test('same-origin local LMS proxy accepts only its registered Host, Lax cookies and origin-bound Player APIs',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'p2lrn-http-cohost-'));
 const gateway=createP2LRNLtiServer({dataDir:dir,baseUrl:BASE,tool,adminToken,allowInsecureLoopback:true});
 try{
  const {port}=await gateway.listen(0);
  const request=(route,options={})=>new Promise((resolve,reject)=>{
   const headers=new Headers(options.headers||{});
   const body=options.body==null?null:(Buffer.isBuffer(options.body)||options.body instanceof Uint8Array?Buffer.from(options.body):Buffer.from(String(options.body)));
   if(body)headers.set('Content-Length',String(body.length));
   const req=http.request({hostname:'127.0.0.1',port,path:route,method:options.method||'GET',
    headers:Object.fromEntries(headers)},res=>{
    const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>{
     const responseHeaders=new Headers();
     for(const [name,value] of Object.entries(res.headers)){
      if(Array.isArray(value)){for(const v of value)responseHeaders.append(name,v);}
      else if(value!=null)responseHeaders.set(name,String(value));
     }
     resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:responseHeaders}));
    });
   });
   req.on('error',reject);req.end(body);
  });
  const cohostHeaders={Host:new URL(ISSUER).host};
  const register={
   id:'moodle-cohost',tenantId:'qa-campus',issuer:ISSUER,clientId:CLIENT,
   authUrl:ISSUER+'/mod/lti/auth.php',tokenUrl:ISSUER+'/mod/lti/token.php',
   launchUrl:ISSUER+'/lti/launch',deepLinkLaunchUrl:ISSUER+'/lti/deep-link',
   jwks:{keys:[{...privateLms.publicKey.export({format:'jwk'}),kid:'local-qa-lms-key',alg:'RS256',use:'sig'}]},
   deployments:['local-qa-deployment'],deepLinkReturnOrigins:[ISSUER],status:'ACTIVE'
  };
  const headers={Authorization:'Bearer '+adminToken,'Content-Type':'application/json'};
  assert.equal((await request('/lti/admin/platforms',{method:'POST',headers,body:JSON.stringify(register)})).status,201);
  const bytes=readFileSync(new URL('../../examples/canonical/minimal-course.p2lrn',import.meta.url));
  const imported=await request('/lti/admin/catalog',{method:'POST',headers:{
   Authorization:headers.Authorization,'x-p2lrn-tenant':'qa-campus','x-p2lrn-title':'QA cohost',
   'Content-Type':'application/vnd.p2lrn+zip'
  },body:bytes});
  assert.equal(imported.status,201,await imported.text());
  const catalog=(await (await request('/lti/admin/catalog/qa-campus',{headers})).json()).courses[0];
  const entity=catalog.entities.find(x=>x.type==='course');
  assert.ok(entity);
  const bound=await request('/lti/admin/bindings',{method:'POST',headers,
   body:JSON.stringify({registrationId:'moodle-cohost',deploymentId:'local-qa-deployment',
    catalogId:catalog.id,entityId:entity.id})});
  assert.equal(bound.status,201);
  const bindingId=(await bound.json()).bindingId;
  async function initiate(target){
   const params=new URLSearchParams({iss:ISSUER,client_id:CLIENT,login_hint:'qa',
    target_link_uri:target,lti_deployment_id:'local-qa-deployment'});
   const wrong=await request('/lti/login?'+params,{headers:{Host:'p2lrn-lti.localhost'}});
   assert.equal(wrong.status,403,'cannot start a cohost transaction on an unregistered host');
   const res=await request('/lti/login?'+params,{headers:cohostHeaders});
   assert.equal(res.status,302);
   const cookies=res.headers.getSetCookie();
   assert.equal(cookies.length,1,'same-origin local flow must not need third-party cookies');
   assert.match(cookies[0],/^p2lrn_oidc=/);
   assert.match(cookies[0],/SameSite=Lax/);
   assert.doesNotMatch(cookies[0],/; Secure|Partitioned/);
   const location=new URL(res.headers.get('location'));
   return {nonce:location.searchParams.get('nonce'),state:location.searchParams.get('state'),
    binding:cookies[0].split(';')[0]};
  }
  const dlTarget=ISSUER+'/lti/deep-link';
  const dl=await initiate(dlTarget);
  const dlResult=await request('/lti/deep-link',{method:'POST',headers:{
   ...cohostHeaders,'Content-Type':'application/x-www-form-urlencoded',Cookie:dl.binding
  },body:new URLSearchParams({state:dl.state,id_token:signPlatformDeepLink(dl.nonce,dlTarget)})});
  assert.equal(dlResult.status,200,await dlResult.text());

  const target=ISSUER+'/lti/launch',start=await initiate(target);
  const t=Math.floor(Date.now()/1000);
  const claims={
   iss:ISSUER,aud:CLIENT,sub:'local-learner',nonce:start.nonce,iat:t,exp:t+300,
   [claim+'version']:'1.3.0',[claim+'message_type']:'LtiResourceLinkRequest',
   [claim+'deployment_id']:'local-qa-deployment',
   [claim+'target_link_uri']:target,
   [claim+'roles']:['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
   [claim+'resource_link']:{id:'cohost-resource'},[claim+'context']:{id:'cohost-course'},
   [claim+'custom']:{p2lrn_binding_id:bindingId}
  };
  const body=b64({alg:'RS256',typ:'JWT',kid:'local-qa-lms-key'})+'.'+b64(claims);
  const jwt=body+'.'+sign('RSA-SHA256',Buffer.from(body),privateLms.privateKey).toString('base64url');
  const launch=await request('/lti/launch',{method:'POST',headers:{
    ...cohostHeaders,'Content-Type':'application/x-www-form-urlencoded',Cookie:start.binding
   },body:new URLSearchParams({state:start.state,id_token:jwt})});
  const player=await launch.text();
  assert.equal(launch.status,200,player);
  assert.match(player,/<p2lrn-player/);
  const set=launch.headers.getSetCookie();
  assert.equal(set.length,1);
  assert.match(set[0],/^p2lrn_session=.*SameSite=Lax/);
  assert.doesNotMatch(set[0],/; Secure|Partitioned/);
  const session=set[0].split(';')[0];
  const asset=await request('/lti/runtime/package',{headers:{...cohostHeaders,Cookie:session}});
  assert.equal(asset.status,200);
  assert.equal((await asset.arrayBuffer()).byteLength,bytes.length);
  assert.equal((await request('/lti/runtime/package',{headers:{
   Host:'p2lrn-lti.localhost',Cookie:session
  }})).status,403,'cohost session cannot be accessed from the canonical tool Host');
  const csrf=/const csrf="([^"]+)"/.exec(player)?.[1];
  assert.ok(csrf);
  const context={packageId:catalog.packageId,contentRoot:catalog.contentRoot,entityId:entity.id};
  const api={method:'POST',headers:{...cohostHeaders,Cookie:session,Origin:ISSUER,
    'X-P2LRN-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify({context})};
  assert.equal((await request('/lti/runtime/state/load',api)).status,200);
  assert.equal((await request('/lti/runtime/state/load',{...api,headers:{...api.headers,Origin:BASE}})).status,403,
   'cohost CSRF origin cannot be switched to canonical tool');
 }finally{await gateway.close();rmSync(dir,{recursive:true,force:true})}
});
