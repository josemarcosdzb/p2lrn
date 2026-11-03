import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {NRPS_CLAIM,NRPS_SCOPE,NRPS_MEDIA_TYPE,validateNrpsClaim,createLtiNrpsClient} from './lti-nrps.mjs';

const ISSUER='https://lms.example',TOOL_KEY=generateKeyPairSync('rsa',{modulusLength:2048});
const tool={privateKeyPem:TOOL_KEY.privateKey.export({type:'pkcs8',format:'pem'}),kid:'p2lrn-qa'};
const reg={id:'school-a',tenantId:'school-a',status:'ACTIVE',issuer:ISSUER,
 clientId:'client-p2lrn',tokenUrl:ISSUER+'/oauth/token'};
const claim={context_memberships_url:ISSUER+'/courses/77/memberships',service_versions:['2.0']};
const service=validateNrpsClaim(claim,reg);
const people=[{user_id:'learner-1',roles:['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
  status:'Active',name:'Test Learner'},
 {user_id:'teacher-1',roles:['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor']}];

function fixture({next='valid',context='course-77',second=true,tokenStatus=200,
 type=NRPS_MEDIA_TYPE,firstMembers=[people[0]],host='203.0.113.9'}={}){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  const u=new URL(url);calls.push({url:u.href,method:options.method,redirect:options.redirect});
  assert.equal(options.redirect,'manual');
  if(u.pathname==='/oauth/token'){
   assert.equal(options.method,'POST');
   const body=new URLSearchParams(options.body);
   assert.equal(body.get('scope'),NRPS_SCOPE);
   assert.equal(body.get('grant_type'),'client_credentials');
   const jwt=String(body.get('client_assertion')).split('.');
   const payload=JSON.parse(Buffer.from(jwt[1],'base64url').toString('utf8'));
   assert.equal(payload.aud,reg.tokenUrl);
   assert.equal(payload.sub,reg.clientId);
   assert.equal(verify('RSA-SHA256',Buffer.from(jwt[0]+'.'+jwt[1]),
     TOOL_KEY.publicKey,Buffer.from(jwt[2],'base64url')),true);
   return new Response(JSON.stringify({access_token:'opaque-qa-token',token_type:'Bearer'}),{
    status:tokenStatus,headers:{'content-type':'application/json'}});
  }
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Accept,NRPS_MEDIA_TYPE);
  assert.equal(options.headers.Authorization,'Bearer opaque-qa-token');
  const page2=u.searchParams.get('page')==='2';
  const link=page2?null:next==='valid' ? '<'+ISSUER+'/courses/77/memberships?page=2>; rel="next"':
   next==='external'?'<https://evil.example/steal>; rel="next"':
   next==='loop'?'<'+ISSUER+'/courses/77/memberships>; rel="next"':null;
  return new Response(JSON.stringify({context:{id:context},members:page2?(second?[people[1]]:[]):firstMembers}),{
   status:200,headers:{'content-type':type,...(link?{link}:{})}});
 };
 const client=createLtiNrpsClient({tool,fetchImpl,lookup:async()=>[{address:host,family:4}]});
 return {client,calls};
}
test('NRPS requires a signed-launch claim with version 2 and an approved LMS URL',()=>{
 assert.equal(NRPS_CLAIM,'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice');
 assert.equal(validateNrpsClaim(undefined,reg),null);
 assert.equal(service.membershipUrl,claim.context_memberships_url);
 assert.deepEqual(service.serviceVersions,['2.0']);
 assert.throws(()=>validateNrpsClaim({...claim,service_versions:['1.0']},reg),/NRPS 2/);
 assert.throws(()=>validateNrpsClaim({...claim,context_memberships_url:'https://evil.example/roster'},reg),/Unapproved/);
 assert.throws(()=>validateNrpsClaim({...claim,context_memberships_url:'http://lms.example/roster'},reg),/Unapproved/);
 assert.throws(()=>validateNrpsClaim({...claim,context_memberships_url:'https://127.0.0.1/roster'},reg),/Unapproved/);
});
test('OAuth2 JWT client assertion and NRPS GET pagination return verified course roster',async()=>{
 const {client,calls}=fixture();
 const roster=await client.listMembers({registration:reg,service,contextId:'course-77'});
 assert.equal(roster.total,2);assert.equal(roster.pages,2);
 assert.deepEqual(roster.members.map(x=>x.userId),['learner-1','teacher-1']);
 assert.equal(roster.members[1].status,'Active');
 assert.equal(roster.members[0].name,'Test Learner');
 assert.deepEqual(calls.map(x=>x.method),['POST','GET','GET']);
});
test('NRPS does not allow untrusted paging targets or loops',async()=>{
 for(const next of ['external','loop']){
  const {client}=fixture({next});
  await assert.rejects(client.listMembers({registration:reg,service,contextId:'course-77'}),
   /NRPS|pagination|Unapproved/);
 }
});
test('NRPS fails closed on context mismatch, invalid roles, inaccessible or wrong media',async()=>{
 const variants=[
  {config:{context:'other-course'},error:/context/},
  {config:{firstMembers:[{user_id:'u',roles:[]}]},error:/schema/},
  {config:{type:'text/html'},error:/content type/},
  {config:{tokenStatus:403},error:/OAuth/},
  {config:{host:'127.0.0.1'},error:/private or unsafe/}
 ];
 for(const {config,error} of variants){
  const {client}=fixture(config);
  await assert.rejects(client.listMembers({registration:reg,service,contextId:'course-77'}),error);
 }
});
test('NRPS cannot query disabled LMS registrations or invented service URLs',async()=>{
 const {client}=fixture();
 await assert.rejects(client.listMembers({registration:{...reg,status:'DISABLED'},service,contextId:'course-77'}),/Inactive/);
 await assert.rejects(client.listMembers({registration:reg,service:{membershipUrl:'https://evil.example/roster',serviceVersions:['2.0']},contextId:'course-77'}),/Unapproved/);
 await assert.rejects(client.listMembers({registration:reg,service:{membershipUrl:claim.context_memberships_url,serviceVersions:[]},contextId:'course-77'}),/not offered/);
});
