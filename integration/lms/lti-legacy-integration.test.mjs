import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createP2LRNLtiServer} from './lti-server.mjs';
import {signLegacyOauth} from './lti-legacy.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const PUBLIC='https://p2lrn.example';
let launchUrl=PUBLIC+'/lti/legacy/launch';
const ISSUER='https://chamilo.example';
const creds={consumerKey:'chamilo-qa-oauth1',sharedSecret:'a unique test shared secret with enough entropy'};
const makeForm=({binding,version='LTI-1p0',outcomes=false,nonce=randomBytes(20).toString('hex')}={})=>{
 const p={
  lti_version:version,lti_message_type:'basic-lti-launch-request',
  oauth_consumer_key:creds.consumerKey,oauth_nonce:nonce,
  oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_signature_method:'HMAC-SHA1',
  oauth_version:'1.0',oauth_callback:'about:blank',
  resource_link_id:'chamilo-course-4-tool-3',context_id:'course-4',
  user_id:'student-qa-1',roles:'Learner',custom_p2lrn_binding_id:binding
 };
 if(outcomes){
  p.lis_outcome_service_url=ISSUER+'/lti/os';
  p.lis_result_sourcedid='signed-gradebook-source-1234';
 }
 p.oauth_signature=signLegacyOauth('POST',launchUrl,p,creds.sharedSecret);
 return p;
};
test('LTI 1.0 and 1.3 are isolated: real legacy signed launch, Player state and 1.1 outcome grade',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'p2lrn-lti-legacy-e2e-'));
 const rsa=generateKeyPairSync('rsa',{modulusLength:2048});
 const tool={privateKeyPem:rsa.privateKey.export({type:'pkcs8',format:'pem'}),kid:'qa-tool-key'};
 const adminToken=randomBytes(40).toString('hex'),sent=[];
 const gateway=createP2LRNLtiServer({
  dataDir:folder,baseUrl:PUBLIC,tool,adminToken,allowInsecureLoopback:true,
  fetchImpl:async(uri,options)=>{
   sent.push({uri,headers:options.headers,body:options.body});
   assert.equal(uri,ISSUER+'/lti/os');
   assert.match(options.headers.Authorization,/^OAuth /);
   assert.match(options.body,/<textString>0.81<\/textString>/);
   return new Response('<imsx_POXEnvelopeResponse><imsx_POXHeader><imsx_POXResponseHeaderInfo><imsx_statusInfo><imsx_codeMajor>success</imsx_codeMajor></imsx_statusInfo></imsx_POXResponseHeaderInfo></imsx_POXHeader></imsx_POXEnvelopeResponse>',{status:200});
  }
 });
 try{
  const {port}=await gateway.listen(0),base='http://127.0.0.1:'+port;
  launchUrl=base+'/lti/legacy/launch';
  const fetchLocal=(route,opt={})=>fetch(base+route,opt);
  const admin={Authorization:'Bearer '+adminToken,'Content-Type':'application/json'};
  assert.equal((await fetchLocal('/lti/jwks')).status,200);
  const legacyRegistration={
   id:'legacy:chamilo',tenantId:'chamilo-qa',consumerKey:creds.consumerKey,
   sharedSecret:creds.sharedSecret,launchUrl,
   issuerOrigin:ISSUER,status:'ACTIVE'
  };
  const unauthorized=await fetchLocal('/lti/admin/legacy/platforms',{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify(legacyRegistration)});
  assert.equal(unauthorized.status,403);
  const registered=await fetchLocal('/lti/admin/legacy/platforms',{method:'POST',
   headers:admin,body:JSON.stringify(legacyRegistration)});
  assert.equal(registered.status,201,await registered.clone().text());
  const safe=await (await fetchLocal('/lti/admin/legacy/platforms',{headers:admin})).text();
  assert.equal(safe.includes(creds.sharedSecret),false,'admin list must not expose shared secret');
  assert.equal(safe.includes('legacy:chamilo'),true);
  const file=readFileSync(resolve(HERE,'../../examples/canonical/minimal-course.p2lrn'));
  const imported=await fetchLocal('/lti/admin/catalog',{method:'POST',headers:{
   Authorization:'Bearer '+adminToken,'x-p2lrn-tenant':'chamilo-qa',
   'x-p2lrn-title':'Original QA course','Content-Type':'application/vnd.p2lrn+zip'
  },body:file});
  assert.equal(imported.status,201,await imported.clone().text());
  const catalog=(await (await fetchLocal('/lti/admin/catalog/chamilo-qa',{headers:admin})).json()).courses[0];
  const entity=catalog.entities.find(e=>e.type==='course');
  assert.ok(entity);
  const bind=await fetchLocal('/lti/admin/legacy/bindings',{method:'POST',headers:admin,
   body:JSON.stringify({registrationId:legacyRegistration.id,catalogId:catalog.id,entityId:entity.id})});
  assert.equal(bind.status,201,await bind.clone().text());
  const bindingId=(await bind.json()).bindingId;
  assert.match(bindingId,/^[a-f0-9]{64}$/);
  const launch=async form=>fetchLocal('/lti/legacy/launch',{method:'POST',headers:{
   'Content-Type':'application/x-www-form-urlencoded'
  },body:new URLSearchParams(form)});
  assert.equal((await launch({...makeForm({binding:bindingId}),oauth_signature:'tampered'})).status,403);
  assert.equal((await launch(makeForm({binding:'f'.repeat(64)}))).status,403,
   'signed launch must not access unbound P2LRN content');
  const legacy1=makeForm({binding:bindingId,version:'LTI-1p0'});
  const page=await launch(legacy1);
  assert.equal(page.status,200,await page.clone().text());
  const html=await page.clone().text();
  assert.match(html,/<p2lrn-player /);
  const csrf=html.match(/const csrf="([^"]+)";/)?.[1];
  assert.ok(csrf,'real Player needs a CSRF token');
  const cookie=page.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  assert.equal((await launch(legacy1)).status,403,'same signed nonce cannot launch twice');
  const pack=await fetchLocal('/lti/runtime/package',{headers:{Cookie:cookie}});
  assert.equal(pack.status,200);
  assert.deepEqual(Buffer.from(await pack.arrayBuffer()),file);
  const context={packageId:catalog.packageId,contentRoot:catalog.contentRoot,entityId:entity.id,rendererId:'qa'};
  const post=async(action,data,ck=cookie)=>fetchLocal('/lti/runtime/'+action,{method:'POST',
   headers:{Cookie:ck,'Content-Type':'application/json','X-P2LRN-CSRF':csrf},
   body:JSON.stringify(data)});
  assert.equal((await post('state/save',{context,state:{page:2}})).status,200);
  const state=await (await post('state/load',{context})).json();
  assert.deepEqual(state,{value:{page:2},revision:1});
  assert.equal((await post('score',{context,score:{normalized:0.9,completed:true}})).status,200);
  assert.equal(sent.length,0,'learner cannot directly issue official grades');
  const attempt0=(await (await fetchLocal('/lti/admin/attempts?tenantId=chamilo-qa',{headers:admin})).json()).attempts;
  assert.equal(attempt0.length,1);
  const noService=await fetchLocal('/lti/admin/grades',{method:'POST',headers:admin,
   body:JSON.stringify({attemptId:attempt0[0].id,normalized:0.9,completed:true})});
  assert.equal(noService.status,403,'1.0 without Basic Outcomes cannot be officially graded');
  const legacy11=makeForm({binding:bindingId,version:'LTI-1p1',outcomes:true});
  const gradePage=await launch(legacy11);
  assert.equal(gradePage.status,200,await gradePage.clone().text());
  await gradePage.clone().text();
  const attempts=(await (await fetchLocal('/lti/admin/attempts?tenantId=chamilo-qa',{headers:admin})).json()).attempts;
  assert.equal(attempts.length,1,'reentry must preserve same attempt');
  const graded=await fetchLocal('/lti/admin/grades',{method:'POST',headers:admin,
   body:JSON.stringify({attemptId:attempts[0].id,normalized:0.81,completed:true})});
  assert.equal(graded.status,200,await graded.clone().text());
  const gradeStatus=await graded.json();
  assert.equal(gradeStatus.ags.delivered,true);
  assert.equal(gradeStatus.ags.protocol,'legacy');
  assert.equal(sent.length,1);
  const outbox=await (await fetchLocal('/lti/admin/ags/pending',{headers:admin})).json();
  assert.equal(outbox.pending.length,0);
  const broken=makeForm({binding:bindingId,version:'LTI-1p1',outcomes:true});
  broken.id_token='pretend-1p3';
  assert.equal((await launch(broken)).status,403,'legacy route must reject unsigned 1.3 downgrade');
  const wrongRoute=await fetchLocal('/lti/launch',{method:'POST',headers:{
   'Content-Type':'application/x-www-form-urlencoded'
  },body:new URLSearchParams(makeForm({binding:bindingId}))});
  assert.equal(wrongRoute.status,400,'1.3 route must not accept OAuth 1.0a');

  const disabled=await fetchLocal('/lti/admin/legacy/platforms',{method:'POST',
   headers:admin,body:JSON.stringify({...legacyRegistration,status:'DISABLED'})});
  assert.equal(disabled.status,201,await disabled.clone().text());
  assert.equal((await fetchLocal('/lti/runtime/package',{headers:{Cookie:cookie}})).status,403,
   'disabling a legacy registration must revoke existing sessions');
  assert.equal((await launch(makeForm({binding:bindingId}))).status,403,
   'disabled legacy LMS must not create new learner attempts');
  assert.equal((await fetchLocal('/lti/jwks')).status,200,
   'revoking LTI 1.0 must not alter the existing LTI 1.3 endpoint');

 }finally{
  await gateway.close();
  rmSync(folder,{recursive:true,force:true});
 }
});
