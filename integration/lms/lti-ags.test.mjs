import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createLtiAgsClient} from './lti-ags.mjs';

const SCORE='https://purl.imsglobal.org/spec/lti-ags/scope/score';
const LINEITEM='https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';
const LINEITEM_READ='https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly';
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const tool={kid:'p2lrn-test-key',privateKeyPem:privateKey.export({type:'pkcs8',format:'pem'})};
const base={clientId:'p2lrn',issuer:'https://school.example',
 tokenUrl:'https://school.example/oauth/token',subject:'anonymous-learner',
 resourceLinkId:'course-resource-123',score:{normalized:0.85,completed:true}};
const lookup=async()=>[{address:'203.0.113.7',family:4}];

test('AGS existing lineitem uses signed OAuth and writes only server-approved score',async()=>{
 const calls=[];
 const client=createLtiAgsClient({tool,lookup,fetchImpl:async(url,opts)=>{
  const request={path:new URL(url).pathname,method:opts.method};
  calls.push(request);
  if(request.path==='/oauth/token'){
   const form=new URLSearchParams(opts.body);
   assert.equal(form.get('scope'),SCORE);
   assert.ok(form.get('client_assertion').split('.').length===3);
   return new Response(JSON.stringify({access_token:'test-bearer',token_type:'Bearer'}),{status:200});
  }
  if(request.path==='/ags/lineitems/42/scores'){
   assert.equal(opts.headers.Authorization,'Bearer test-bearer');
   const score=JSON.parse(opts.body);
   assert.equal(score.userId,'anonymous-learner');
   assert.equal(score.scoreGiven,0.85);
   return new Response(null,{status:200});
  }
  throw new Error('Unexpected AGS request '+request.path);
 }});
 const result=await client.postScore({...base,ags:{
  scope:[SCORE],lineitem:'https://school.example/ags/lineitems/42'
 }});
 assert.equal(result.ok,true);
 assert.deepEqual(calls.map(x=>x.method),['POST','POST']);
});

test('AGS collection creates one stable gradebook column and reuses it for later attempts',async()=>{
 const calls=[];
 let row=null;
 const client=createLtiAgsClient({tool,lookup,fetchImpl:async(url,opts)=>{
  const u=new URL(url);
  calls.push({path:u.pathname,method:opts.method});
  if(u.pathname==='/oauth/token'){
   const form=new URLSearchParams(opts.body);
   assert.deepEqual(form.get('scope').split(' ').sort(),[SCORE,LINEITEM].sort());
   return new Response(JSON.stringify({access_token:'test-bearer',token_type:'Bearer'}),{status:200});
  }
  if(u.pathname==='/ags/lineitems'&&opts.method==='GET'){
   assert.equal(u.searchParams.get('resource_link_id'),base.resourceLinkId);
   return new Response(JSON.stringify(row?[row]:[]),{status:200});
  }
  if(u.pathname==='/ags/lineitems'&&opts.method==='POST'){
   row={...JSON.parse(opts.body),id:'https://school.example/ags/lineitems/43'};
   assert.equal(row.resourceLinkId,base.resourceLinkId);
   assert.equal(row.scoreMaximum,1);
   assert.match(row.tag,/^p2lrn:[a-f0-9]{24}$/);
   assert.equal(opts.headers.Authorization,'Bearer test-bearer');
   return new Response(null,{status:201,headers:{Location:row.id}});
  }
  if(u.pathname==='/ags/lineitems/43/scores'){
   assert.equal(opts.headers.Authorization,'Bearer test-bearer');
   return new Response(null,{status:200});
  }
  throw new Error('Unexpected request '+u.pathname);
 }});
 const ags={scope:[SCORE,LINEITEM],lineitems:'https://school.example/ags/lineitems'};
 const first=await client.postScore({...base,ags});
 const second=await client.postScore({...base,ags,subject:'second-learner',
  score:{normalized:0.5,completed:false}});
 assert.equal(first.ok,true);
 assert.equal(second.ok,true);
 assert.equal(calls.filter(x=>x.method==='POST'&&x.path==='/ags/lineitems').length,1,
  'Retries must not create a second gradebook column');
 assert.equal(calls.filter(x=>x.path.endsWith('/scores')).length,2);
});


test('AGS readonly lineitems scope reuses a gradebook column without creating one',async()=>{
 const operations=[];
 const client=createLtiAgsClient({tool,lookup,fetchImpl:async(url,opts)=>{
  const parsed=new URL(url);
  operations.push(opts.method+' '+parsed.pathname);
  if(parsed.pathname==='/oauth/token'){
   assert.deepEqual(new URLSearchParams(opts.body).get('scope').split(' ').sort(),[SCORE,LINEITEM_READ].sort());
   return new Response(JSON.stringify({access_token:'qa-token',token_type:'Bearer'}),{status:200});
  }
  if(parsed.pathname==='/ags/lineitems'&&opts.method==='GET'){
   assert.equal(parsed.searchParams.get('resource_link_id'),base.resourceLinkId);
   return new Response(JSON.stringify([{id:'https://school.example/ags/lineitems/44',
    resourceLinkId:base.resourceLinkId,scoreMaximum:100,label:'Moodle existing activity'}]),{status:200});
  }
  if(parsed.pathname==='/ags/lineitems/44/scores'&&opts.method==='POST'){
   const payload=JSON.parse(opts.body);
   assert.equal(payload.scoreGiven,85);
   assert.equal(payload.scoreMaximum,100);
   return new Response(null,{status:200});
  }
  throw new Error('Unexpected AGS endpoint or write '+parsed.pathname);
 }});
 const ags={scope:[SCORE,LINEITEM_READ],lineitems:'https://school.example/ags/lineitems'};
 const result=await client.postScore({...base,ags});
 assert.equal(result.ok,true);
 assert.deepEqual(operations,[
  'POST /oauth/token','GET /ags/lineitems','POST /ags/lineitems/44/scores'
 ]);
});

test('AGS readonly-only scope never creates a new LMS gradebook column',async()=>{
 const operations=[];
 const client=createLtiAgsClient({tool,lookup,fetchImpl:async(url,opts)=>{
  const parsed=new URL(url);
  operations.push(opts.method+' '+parsed.pathname);
  if(parsed.pathname==='/oauth/token')
   return new Response(JSON.stringify({access_token:'qa-token',token_type:'Bearer'}),{status:200});
  if(parsed.pathname==='/ags/lineitems'&&opts.method==='GET')
   return new Response('[]',{status:200});
  throw new Error('Readonly AGS client attempted unauthorized creation');
 }});
 const ags={scope:[SCORE,LINEITEM_READ],lineitems:'https://school.example/ags/lineitems'};
 await assert.rejects(client.postScore({...base,ags}),/creation scope was not granted/);
 assert.deepEqual(operations,['POST /oauth/token','GET /ags/lineitems']);
});

test('AGS diagnostic phase identifies OAuth timeout without leaking signed JWT or bearer',async()=>{
 const client=createLtiAgsClient({tool,lookup,fetchImpl:async()=>{
  throw new DOMException('Network request timed out','TimeoutError');
 }});
 await assert.rejects(client.postScore({...base,ags:{
  scope:[SCORE],lineitem:'https://school.example/ags/lineitems/45'
 }}),error=>error.message==='LMS AGS TOKEN_REQUEST TIMEOUT'&&!error.message.includes('jwt'));
});

test('AGS diagnostic phase identifies lineitems lookup timeout',async()=>{
 const client=createLtiAgsClient({tool,lookup,fetchImpl:async(url,options)=>{
  if(new URL(url).pathname==='/oauth/token')
   return new Response(JSON.stringify({access_token:'private-token',token_type:'Bearer'}),{status:200});
  throw new DOMException('Network request timed out','TimeoutError');
 }});
 await assert.rejects(client.postScore({...base,ags:{
  scope:[SCORE,LINEITEM_READ],lineitems:'https://school.example/ags/lineitems'
 }}),error=>error.message==='LMS AGS LINEITEM_LOOKUP TIMEOUT'&&!error.message.includes('private-token'));
});

test('AGS rejects unapproved lineitems collections, missing scopes and invalid grades before network calls',async()=>{
 const client=createLtiAgsClient({tool,lookup,fetchImpl:async()=>{throw new Error('Network should not be called');}});
 await assert.rejects(client.postScore({...base,ags:{
  scope:[SCORE,LINEITEM],lineitems:'https://attacker.example/private'
 }}),/Unapproved LMS service URL/);
 await assert.rejects(client.postScore({...base,ags:{
  scope:[SCORE],lineitems:'https://school.example/ags/lineitems'
 }}),/lineitem lookup requires/);
 await assert.rejects(client.postScore({...base,score:{normalized:2,completed:true},ags:{
  scope:[SCORE],lineitem:'https://school.example/ags/lineitems/12'
 }}),/Server-approved score/);
});
