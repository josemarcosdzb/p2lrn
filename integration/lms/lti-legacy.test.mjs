import test from 'node:test';
import assert from 'node:assert/strict';
import {legacySigningBase,signLegacyOauth,parseLegacyForm,verifyLegacyLaunch,
 encryptLegacySecret,decryptLegacySecret,sendLegacyOutcome,validateLegacyPlatform} from './lti-legacy.mjs';

const reg={id:'legacy:chamilo',tenantId:'chamilo-qa',consumerKey:'qa-consumer',
 launchUrl:'https://p2lrn.example/lti/legacy/launch',issuerOrigin:'https://chamilo.example',
 status:'ACTIVE'};
const secret='a very long QA-only secret that is unique';
const timestamp=()=>Math.floor(Date.now()/1000);
const params=(overrides={})=>{
 const p={lti_version:'LTI-1p0',lti_message_type:'basic-lti-launch-request',
 oauth_consumer_key:reg.consumerKey,oauth_nonce:'n-12345678901234567890',
 oauth_timestamp:String(timestamp()),oauth_signature_method:'HMAC-SHA1',
 oauth_version:'1.0',oauth_callback:'about:blank',resource_link_id:'r-1',
 context_id:'course-1',user_id:'learner-1',roles:'Learner',
 custom_p2lrn_binding_id:'a'.repeat(64),...overrides};
 p.oauth_signature=signLegacyOauth('POST',reg.launchUrl,p,secret);
 return p;
};
const consume=()=>true;
const verify=(p,options={})=>verifyLegacyLaunch({params:p,registration:reg,
 secret,requestUrl:reg.launchUrl,consumeNonce:consume,...options});
test('RFC OAuth signing base sorts parameters, supports URL encoded characters',()=>{
 const q=legacySigningBase('POST','https://www.example.net/resource',
  {b:'three two',a:'&',oauth_signature:'ignore'});
 assert.equal(q,'POST&https%3A%2F%2Fwww.example.net%2Fresource&a%3D%2526%26b%3Dthree%2520two');
});
test('Chamilo LTI-1p0 signed launch can open the exact bound content',()=>{
 const v=verify(params());
 assert.equal(v.tenantId,'chamilo-qa');
 assert.equal(v.deploymentId,'legacy');
 assert.equal(v.platformSubject,'learner-1');
 assert.equal(v.bindingId,'a'.repeat(64));
 assert.equal(v.basicOutcome,null);
});
test('LTI-1p1 launch with same signature verifies',()=>{
 const v=verify(params({lti_version:'LTI-1p1'}));
 assert.equal(v.resourceLinkId,'r-1');
});
test('OAuth HMAC-SHA256 optional signature works without loosening 1.3',()=>{
 assert.equal(verify(params({oauth_signature_method:'HMAC-SHA256'})).tenantId,'chamilo-qa');
});
test('reject tampering, wrong consumer, spoofed OIDC and expired timestamps',()=>{
 const signed=params();
 for(const changes of [
  {user_id:'other-learner'},{oauth_signature:'bad'},
  {oauth_consumer_key:'unknown'},{id_token:'not-a-jwt'},
  {lti_version:'1.3.0'},{oauth_timestamp:String(timestamp()-700)}
 ]){
  const p={...signed,...changes};
  assert.throws(()=>verify(p));
 }
});
test('reject replays without touching 1.3 state',()=>{
 assert.throws(()=>verify(params(),{consumeNonce:()=>false}),/REPLAYED/);
});
test('registered origin and path are mandatory for the LTI 1.0 entrypoint',()=>{
 assert.throws(()=>verify(params(),{requestUrl:'https://other.example/lti/legacy/launch'}),/MISMATCH/);
 assert.throws(()=>validateLegacyPlatform({...reg,launchUrl:'http://p2lrn.example/lti/legacy/launch'}));
 assert.throws(()=>validateLegacyPlatform({...reg,launchUrl:'https://p2lrn.example/lti/launch'}));
});
test('reject duplicate form fields so signatures cannot be confused',()=>{
 assert.throws(()=>parseLegacyForm('user_id=alice&user_id=bob'),/INVALID/);
 assert.equal(parseLegacyForm('user_id=a%20b').user_id,'a b');
});
test('shared secrets encrypt at rest and are bound to persistent tool identity',()=>{
 const pem='persistent-qa-identity-text-never-used-for-public-release';
 const sealed=encryptLegacySecret(secret,pem);
 assert.equal(sealed.includes(secret),false);
 assert.equal(decryptLegacySecret(sealed,pem),secret);
 assert.throws(()=>decryptLegacySecret(sealed,'other identity'));
 assert.throws(()=>encryptLegacySecret('short',pem),/WEAK/);
});
test('outcome target cannot change to arbitrary host even after signed launch',()=>{
 const p=params({lti_version:'LTI-1p1',lis_result_sourcedid:'opaque',
  lis_outcome_service_url:'https://another.example/outcome'});
 assert.throws(()=>verify(p),/UNTRUSTED_LEGACY_OUTCOME/);
});
test('LTI-1.1 Basic Outcomes XML uses OAuth body hash and confirmed success, not HTTP status alone',async()=>{
 let count=0;
 const gateway=async(uri,opts)=>{
  count++;
  assert.equal(uri,'https://chamilo.example/lti/os');
  assert.equal(opts.method,'POST');
  assert.match(opts.headers.Authorization,/oauth_body_hash=/);
  assert.match(opts.body,/<replaceResultRequest>/);
  assert.match(opts.body,/<textString>0.75<\/textString>/);
  return new Response('<?xml version="1.0"?><imsx_POXEnvelopeResponse><imsx_POXHeader><imsx_POXResponseHeaderInfo><imsx_statusInfo><imsx_codeMajor>success</imsx_codeMajor></imsx_statusInfo></imsx_POXResponseHeaderInfo></imsx_POXHeader></imsx_POXEnvelopeResponse>',{status:200});
 };
 const r=await sendLegacyOutcome({serviceUrl:'https://chamilo.example/lti/os',
  sourceId:'attempt<1',consumerKey:reg.consumerKey,secret,issuerOrigin:reg.issuerOrigin,
  normalized:0.75,fetchImpl:gateway});
 assert.equal(r.delivered,true);
 assert.equal(count,1);
 await assert.rejects(sendLegacyOutcome({serviceUrl:'https://evil.example/os',sourceId:'x',
  consumerKey:reg.consumerKey,secret,issuerOrigin:reg.issuerOrigin,normalized:0.7,fetchImpl:gateway}),/UNTRUSTED/);
 await assert.rejects(sendLegacyOutcome({serviceUrl:'https://chamilo.example/lti/os',sourceId:'x',
  consumerKey:reg.consumerKey,secret,issuerOrigin:reg.issuerOrigin,normalized:0.7,
  fetchImpl:async()=>new Response('<imsx_codeMajor>failure</imsx_codeMajor>',{status:200})}),/NOT_ACCEPTED/);
});
