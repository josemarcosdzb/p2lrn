import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createP2LRNLtiProvider} from './lti-provider.mjs';
import {issueP2LRNBindingId,LTI_CLAIMS} from './launch-contract.mjs';

const {privateKey: platformKey,publicKey: platformPublic}=generateKeyPairSync('rsa',{modulusLength:2048});
const {privateKey: toolKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const issuer='https://school.example',clientId='p2lrn-client',launchUrl='https://p2lrn.example/lti/launch';
const deepLinkLaunchUrl='https://p2lrn.example/lti/deep-link';
const root='sha256:'+'a'.repeat(64);
const reg={id:'reg1',tenantId:'school1',issuer,clientId,status:'ACTIVE',
  authUrl:issuer+'/oidc/auth',launchUrl,deepLinkLaunchUrl,deployments:['deployment-1'],
  deepLinkReturnOrigins:[issuer],jwks:{keys:[{...platformPublic.export({format:'jwk'}),kid:'lms-1',use:'sig',alg:'RS256'}]}};
const binding={id:issueP2LRNBindingId(),tenantId:'school1',registrationId:'reg1',
  deploymentId:'deployment-1',packageId:'urn:uuid:course1',contentRoot:root,
  entityId:'urn:uuid:unit1',status:'PUBLISHED'};
const now=1800000000;
function createFixture({dynamicCanvas=false}={}){
 const registration={...reg,dynamicCanvas};
 const states=new Map();
 let record;
 const tool={privateKeyPem:toolKey.export({format:'pem',type:'pkcs8'}),kid:'tool-1'};
 const provider=createP2LRNLtiProvider({
   getRegistration:async({issuer:iss,clientId:id})=>iss===issuer&&id===clientId?registration:null,
   transactions:{
     async create(tx){record=tx;states.set(tx.stateHash,tx);},
     async consume(hash){let v=states.get(hash);states.delete(hash);return v??null;}
   },
   getBinding:async({id,tenantId,registrationId,deploymentId})=>
     id===binding.id&&tenantId===binding.tenantId&&registrationId===binding.registrationId&&deploymentId===binding.deploymentId?binding:null,
   tool,now:()=>now
 });
 function token({nonce,kind='LtiResourceLinkRequest',changes={}}){
   const claims={
    iss:issuer,aud:clientId,sub:'learner1',iat:now,exp:now+300,nonce,
    [LTI_CLAIMS.version]:'1.3.0',[LTI_CLAIMS.messageType]:kind,
    [LTI_CLAIMS.deploymentId]:'deployment-1',
    [LTI_CLAIMS.targetLinkUri]:kind==='LtiDeepLinkingRequest'?deepLinkLaunchUrl:launchUrl,
    [LTI_CLAIMS.roles]:[kind==='LtiDeepLinkingRequest'
     ? 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'
     : 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
    [LTI_CLAIMS.context]:{id:'course1'},
    [LTI_CLAIMS.resourceLink]:{id:'resource1'},
    [LTI_CLAIMS.custom]:{p2lrn_binding_id:binding.id},
    'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings':{
      deep_link_return_url:issuer+'/lti/return',accept_types:['ltiResourceLink'],data:'opaque-data'
    },...changes
   };
   const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
   const input=b64({alg:'RS256',kid:'lms-1',typ:'JWT'})+'.'+b64(claims);
   return input+'.'+sign('RSA-SHA256',Buffer.from(input),platformKey).toString('base64url');
 }
 async function start(kind='LtiResourceLinkRequest'){
   const target=kind==='LtiDeepLinkingRequest'?deepLinkLaunchUrl:launchUrl;
   const auth=await provider.beginLogin({browserBinding:'browser-secret',
    login:{iss:issuer,client_id:clientId,login_hint:'hint',target_link_uri:target}});
   const q=new URL(auth.authorizationUrl).searchParams;
   return {auth,q,nonce:q.get('nonce'),state:q.get('state')};
 }
 return {provider,start,token,getRecord:()=>record};
}
test('universal LTI provider has trusted JWKS and no LMS-specific branches',async()=>{
 const f=createFixture(), keys=f.provider.publicJwks();
 assert.equal(keys.keys[0].kid,'tool-1');
 assert(!JSON.stringify(keys).includes('PRIVATE'));
 const {q,nonce,state}=await f.start();
 assert.equal(q.get('response_mode'),'form_post');
 assert.equal(q.get('scope'),'openid');
 assert.equal(q.get('redirect_uri'),launchUrl);
 const verified=await f.provider.verifyLaunch({state,idToken:f.token({nonce}),browserBinding:'browser-secret'});
 assert.equal(verified.kind,'resource');
 assert.equal(verified.launch.entityId,binding.entityId);
 assert.equal(verified.launch.learnerKey.length,64);
 await assert.rejects(f.provider.verifyLaunch({state,idToken:f.token({nonce}),browserBinding:'browser-secret'}),/consumed/);
});
test('rejects wrong browser binding, untrusted platform and unregistered target',async()=>{
 const f=createFixture();
 await assert.rejects(f.provider.beginLogin({login:{iss:'https://evil.example',client_id:clientId,login_hint:'x',target_link_uri:launchUrl},browserBinding:'b'}),/registration/);
 await assert.rejects(f.provider.beginLogin({login:{iss:issuer,client_id:clientId,login_hint:'x',target_link_uri:'https://evil.example'},browserBinding:'b'}),/target/);
 const {nonce,state}=await f.start();
 await assert.rejects(f.provider.verifyLaunch({state,idToken:f.token({nonce}),browserBinding:'wrong'}),/browser binding/);
 await assert.rejects(f.provider.verifyLaunch({state,idToken:f.token({nonce}),browserBinding:'browser-secret'}),/consumed/);
});
test('JWT signature, issuer, audience, nonce and deployment are enforced',async()=>{
 for(const changes of [{iss:'https://wrong.example'},{aud:'another-client'},{nonce:'wrong'},
   {[LTI_CLAIMS.deploymentId]:'another-deployment'}, {exp:now-1000}]){
   const f=createFixture(), {state,nonce}=await f.start();
   await assert.rejects(f.provider.verifyLaunch({
     state,idToken:f.token({nonce,changes}),browserBinding:'browser-secret'
   }));
 }
 const f=createFixture(),{nonce,state}=await f.start();
 const valid=f.token({nonce});
 const altered=valid.slice(0,-2)+(valid.slice(-2)==='AA'?'BB':'AA');
 await assert.rejects(f.provider.verifyLaunch({state,idToken:altered,browserBinding:'browser-secret'}),/signature/);
});
test('Sakai one-hour signed JWTs are accepted, but future/old tokens remain rejected',async()=>{
 const accepted=createFixture(),a=await accepted.start();
 const launch=await accepted.provider.verifyLaunch({
  state:a.state,idToken:accepted.token({nonce:a.nonce,changes:{exp:now+3600}}),
  browserBinding:'browser-secret'
 });
 assert.equal(launch.kind,'resource');
 const denied=[
  {exp:now+3601},
  {iat:now-601,exp:now+30},
  {iat:now+61,exp:now+3600},
  {exp:now-100},
  {iat:'invalid'}
 ];
 for(const changes of denied){
  const f=createFixture(),{state,nonce}=await f.start();
  await assert.rejects(
   f.provider.verifyLaunch({state,idToken:f.token({nonce,changes}),browserBinding:'browser-secret'}),
   /timestamps/
  );
 }
});

test('signed Deep Linking is restricted to approved instructor and registered return origin',async()=>{
 const f=createFixture(),{nonce,state}=await f.start('LtiDeepLinkingRequest');
 const verified=await f.provider.verifyLaunch({state,
  idToken:f.token({nonce,kind:'LtiDeepLinkingRequest'}),browserBinding:'browser-secret'});
 assert.equal(verified.kind,'deep-link');
 const response=await f.provider.deepLinkResponse({launch:verified,
  selected:[{bindingId:binding.id,title:'Activity'}]});
 assert.equal(response.returnUrl,issuer+'/lti/return');
 const payload=JSON.parse(Buffer.from(response.jwt.split('.')[1],'base64url').toString());
 assert.equal(payload['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'][0].custom.p2lrn_binding_id,binding.id);
 assert.equal(payload['https://purl.imsglobal.org/spec/lti-dl/claim/data'],'opaque-data');
 await assert.rejects(f.provider.deepLinkResponse({launch:verified,
  selected:[{bindingId:'unknown',title:'Another'}]}),/authorized/);
 const denied=createFixture(),s=await denied.start('LtiDeepLinkingRequest');
 await assert.rejects(denied.provider.verifyLaunch({state:s.state,browserBinding:'browser-secret',
  idToken:denied.token({nonce:s.nonce,kind:'LtiDeepLinkingRequest',
    changes:{'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings':{
      deep_link_return_url:'https://evil.example/return',accept_types:['ltiResourceLink']}}})}),/origin/);
});

test('dynamic Canvas Deep Linking refuses unregistered callback origins',async()=>{
 const f=createFixture({dynamicCanvas:true});
 const {state,nonce}=await f.start('LtiDeepLinkingRequest');
 await assert.rejects(f.provider.verifyLaunch({state,browserBinding:'browser-secret',
  idToken:f.token({nonce,kind:'LtiDeepLinkingRequest',changes:{
   'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings':{
    deep_link_return_url:'https://unauthorized.example/callback',
    accept_types:['ltiResourceLink']
   }
  }})}),/origin/);
});
