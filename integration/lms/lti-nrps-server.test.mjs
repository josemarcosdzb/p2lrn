import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createP2LRNLtiServer} from './lti-server.mjs';
import {LTI_CLAIMS} from './launch-contract.mjs';
import {NRPS_CLAIM,NRPS_SCOPE,NRPS_MEDIA_TYPE} from './lti-nrps.mjs';

const LMS='https://canvas.example',TOOL_URL='https://p2lrn.example';
const platformKey=generateKeyPairSync('rsa',{modulusLength:2048});
const toolKey=generateKeyPairSync('rsa',{modulusLength:2048});
const encoder=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const now=()=>Math.floor(Date.now()/1000);
function ltiJwt({nonce,subject,role,bindingId,withNrps=true}){
 const claims={
  iss:LMS,aud:'p2lrn-client',sub:subject,nonce,iat:now(),exp:now()+300,
  [LTI_CLAIMS.version]:'1.3.0',
  [LTI_CLAIMS.messageType]:'LtiResourceLinkRequest',
  [LTI_CLAIMS.deploymentId]:'school-deploy',
  [LTI_CLAIMS.targetLinkUri]:TOOL_URL+'/lti/launch',
  [LTI_CLAIMS.roles]:['http://purl.imsglobal.org/vocab/lis/v2/membership#'+role],
  [LTI_CLAIMS.context]:{id:'course-qa'},
  [LTI_CLAIMS.resourceLink]:{id:'resource-qa'},
  [LTI_CLAIMS.custom]:{p2lrn_binding_id:bindingId}
 };
 if(withNrps)claims[NRPS_CLAIM]={service_versions:['2.0'],
  context_memberships_url:LMS+'/courses/qa/memberships'};
 const head=encoder({alg:'RS256',typ:'JWT',kid:'canvas-test-key'});
 const payload=head+'.'+encoder(claims);
 return payload+'.'+sign('RSA-SHA256',Buffer.from(payload),platformKey.privateKey).toString('base64url');
}
test('verified signed NRPS claims enable course-scoped instructor roster, never learner or unauthorized admin access',async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),'p2lrn-lti-nrps-http-'));
 const adminToken='nrps-qa-admin-token-not-production-1234567890';
 const outbound=[];
 const gateway=createP2LRNLtiServer({
  dataDir,baseUrl:TOOL_URL,
  tool:{privateKeyPem:toolKey.privateKey.export({type:'pkcs8',format:'pem'}),kid:'p2lrn-test'},
  adminToken,lookup:async()=>[{address:'203.0.113.29',family:4}],
  fetchImpl:async(url,options)=>{
   const u=new URL(url);outbound.push({path:u.pathname,method:options.method});
   if(u.pathname==='/token'){
    assert.equal(new URLSearchParams(options.body).get('scope'),NRPS_SCOPE);
    return new Response(JSON.stringify({access_token:'read-only-test-token',token_type:'Bearer'}),{
     headers:{'content-type':'application/json'}});
   }
   if(u.pathname==='/courses/qa/memberships'){
    assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,'Bearer read-only-test-token');
    return new Response(JSON.stringify({context:{id:'course-qa'},members:[
     {user_id:'alice-test',roles:['Learner'],name:'Synthetic Alice'},
     {user_id:'teacher-test',roles:['Instructor'],name:'Synthetic Teacher'}]}),{
      headers:{'content-type':NRPS_MEDIA_TYPE}});
   }
   throw new Error('Unexpected outbound LTI URL');
  }
 });
 try{
  const registration={
   id:'canvas-qa',tenantId:'school-qa',issuer:LMS,clientId:'p2lrn-client',
   authUrl:LMS+'/auth',tokenUrl:LMS+'/token',launchUrl:TOOL_URL+'/lti/launch',
   deepLinkLaunchUrl:TOOL_URL+'/lti/deep-link',
   jwks:{keys:[{...platformKey.publicKey.export({format:'jwk'}),kid:'canvas-test-key',use:'sig',alg:'RS256'}]},
   deployments:['school-deploy'],deepLinkReturnOrigins:[LMS],status:'ACTIVE'
  };
  gateway.store.upsertPlatform(registration);
  const catalogId=gateway.store.publishPackage({
   tenantId:'school-qa',title:'Synthetic QA Course',packageId:'p2lrn-qa',
   contentRoot:'sha256:'+'a'.repeat(64),sha:'b'.repeat(64),
   filename:'qa.p2lrn',bytes:456,entities:[{id:'qa-course',type:'course',title:'QA'}]
  });
  const bindingId=gateway.store.createBinding({tenantId:'school-qa',
   registrationId:'canvas-qa',deploymentId:'school-deploy',catalogId,entityId:'qa-course'});
  const address=await gateway.listen(0);
  const request=(path,opts)=>fetch('http://127.0.0.1:'+address.port+path,opts);
  const admin={Authorization:'Bearer '+adminToken};
  async function launch(role,subject,withNrps=true){
   const q=new URLSearchParams({iss:LMS,client_id:'p2lrn-client',
    login_hint:'one-time-test-hint',target_link_uri:TOOL_URL+'/lti/launch',
    lti_deployment_id:'school-deploy'});
   const login=await request('/lti/login?'+q,{redirect:'manual'});
   assert.equal(login.status,302);
   const loc=new URL(login.headers.get('location'));
   const cookie=login.headers.get('set-cookie').split(';')[0];
   const launch=await request('/lti/launch',{method:'POST',
    headers:{Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({state:loc.searchParams.get('state'),
     id_token:ltiJwt({nonce:loc.searchParams.get('nonce'),subject,role,bindingId,withNrps})})});
   assert.equal(launch.status,200);
   return launch.headers.get('set-cookie').split(';')[0];
  }
  const teacher=await launch('Instructor','teacher-user');
  const adminList='/lti/admin/nrps/contexts?tenantId=school-qa';
  assert.equal((await request(adminList)).status,403);
  const contexts=await (await request(adminList,{headers:admin})).json();
  assert.equal(contexts.contexts.length,1);
  assert.equal(contexts.contexts[0].contextId,'course-qa');
  const rosterPath='/lti/admin/nrps/memberships?'+new URLSearchParams({
   tenantId:'school-qa',registrationId:'canvas-qa',
   deploymentId:'school-deploy',contextId:'course-qa'});
  const teacherRoster=await request('/lti/runtime/nrps/memberships',{headers:{Cookie:teacher}});
  assert.equal(teacherRoster.status,200);
  assert.equal((await teacherRoster.json()).total,2);
  const roster=await request(rosterPath,{headers:admin});
  assert.equal(roster.status,200);
  assert.equal((await roster.json()).members[0].name,'Synthetic Alice');
  assert.equal(outbound.filter(call=>call.path==='/courses/qa/memberships').length,2);
  const learner=await launch('Learner','learner-user');
  assert.equal((await request('/lti/runtime/nrps/memberships',{headers:{Cookie:learner}})).status,403);
  assert.equal((await request(rosterPath.replace('tenantId=school-qa','tenantId=other-school'),{headers:admin})).status,403);
  await launch('Instructor','teacher-user',false);
  assert.equal((await request(rosterPath,{headers:admin})).status,404,
   'A signed launch without NRPS revokes the previously advertised service');
 }finally{
  await gateway.close();
  rmSync(dataDir,{recursive:true,force:true});
 }
});
