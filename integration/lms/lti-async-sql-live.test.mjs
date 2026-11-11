// Genuinely connected SQL regression. Always opt-in; the database guard
// permits only loopback and disposable p2lrn_test/p2lrn_qa databases.
// One engine and two stores per execution; no load test or LMS network I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAsyncLtiStore} from './lti-async-store.mjs';
import {resolveAsyncLtiTestDatabase} from './lti-test-sql-guard.mjs';

const optedIn=process.env.P2LRN_TEST_LTI_ASYNC_ENABLE==='YES';
const now=()=>Math.floor(Date.now()/1000);
test('real asynchronous SQL: two stores, replay prevention, CAS, rate limit, AGS and restart',{
 skip:optedIn?false:'Explicit isolated real SQL opt-in required',
 timeout:150000
},async()=>{
 const settings=resolveAsyncLtiTestDatabase();
 assert.ok(settings,'actual engine and test database required');
 const {dbEngine:engine,dbUrl:connectionString}=settings;
 const ignoredSqliteFile=join(tmpdir(),'p2lrn-unused-'+randomUUID()+'.sqlite');
 let first=null,second=null;
 const tag=randomUUID().replaceAll('-','');
 const tenantId='async_'+tag,registrationId='lms_'+tag;
 try{
  first=createAsyncLtiStore(ignoredSqliteFile,{engine,connectionString});
  await first.ready;
  assert.equal(first.healthy,true);
  second=createAsyncLtiStore(ignoredSqliteFile,{engine,connectionString});
  await second.ready;
  await first.upsertPlatform({
   id:registrationId,tenantId,issuer:'https://lms.example/'+tag,
   clientId:'client-'+tag,authUrl:'https://lms.example/auth',
   launchUrl:'https://tool.example/lti/launch',
   tokenUrl:'https://lms.example/token',status:'ACTIVE',deployments:['deployment'],
   deepLinkReturnOrigins:['https://lms.example'],
   jwks:{keys:[{kty:'RSA',kid:'test',n:'AA',e:'AQAB'}]}
  });
  assert.equal((await second.getRegistrationById(registrationId)).tenantId,tenantId);
  const packageId='urn:uuid:'+randomUUID(),contentRoot='sha256:'+'a'.repeat(64);
  const catalogId=await first.publishPackage({
   tenantId,title:'Async SQL real fixture',packageId,contentRoot,
   sha:tag.padEnd(64,'b'),filename:'fixture.p2lrn',bytes:128,
   entities:[{id:'course',type:'course',title:'Course'}]
  });
  const bindingId=await first.createBinding({
   tenantId,registrationId,deploymentId:'deployment',catalogId,entityId:'course'
  });
  assert.equal(await second.getBinding({id:bindingId,tenantId:'another-school',
   registrationId,deploymentId:'deployment'}),null);
  const tokenHash=tag.padEnd(64,'0');
  const launch={tenantId,registrationId,deploymentId:'deployment',
   bindingId,packageId,contentRoot,entityId:'course',learnerKey:'l'.repeat(64),
   platformSubject:'learner-qa',contextId:'context',resourceLinkId:'resource'};
  const attempt=await first.attachLaunch({
   launch,ags:null,tokenHash,csrfHash:tag.padEnd(64,'1'),
   expiresAt:now()+3600,canReceiveGrades:true
  });
  assert.equal((await second.getSession(tokenHash)).attemptId,attempt.attemptId);

  // 1 valid claim, 5 denied replays across independently connected stores.
  const stateHash=tag.padEnd(64,'f');
  await first.transactions.create({
   stateHash,nonceHash:'a'.repeat(64),browserHash:'b'.repeat(64),
   issuer:'https://lms.example',clientId:'client',registrationId,
   deploymentHint:null,targetLinkUri:'https://tool.example/lti/launch',
   expiresAt:now()+120
  });
  const states=await Promise.all(Array.from({length:6},(_,i)=>
   (i%2?first:second).transactions.consume(stateHash)));
  assert.equal(states.filter(Boolean).length,1,'one-time OIDC cannot replay across stores');

  // Optimistic revision and last-write isolation on one learner, two stores.
  const writes=await Promise.all(Array.from({length:6},(_,i)=>
   (i%2?first:second).saveState(attempt.attemptId,'course','quiz',{answer:i},0)));
  assert.equal(writes.filter(w=>w.saved&&!w.unchanged).length,1);
  assert.equal(writes.filter(w=>w.conflict).length,5);
  const persisted=await second.getState(attempt.attemptId,'course','quiz');
  assert.equal(persisted.revision,1);
  const replay=await first.saveState(attempt.attemptId,'course','quiz',persisted.value,0);
  assert.equal(replay.unchanged,true);
  const eventId='event-'+tag;
  const events=await Promise.all(Array.from({length:4},(_,i)=>
   (i%2?first:second).appendEvent(attempt.attemptId,eventId,'course',{type:'p2lrn:answer'})));
  assert.equal(events.filter(e=>e.saved).length,1);
  const quota=[{scope:'two-store-rate-'+tag,limit:3,seconds:60}];
  const rates=await Promise.all(Array.from({length:8},(_,i)=>
   (i%2?first:second).admitSecurityRequest(quota)));
  assert.equal(rates.filter(Boolean).length,3);

  // Grade delivery remains PENDING; this test never contacts a real LMS.
  const scoreHash='score-'+tag,payload={normalized:0.91,completed:true};
  const one=await first.approveScore(attempt.attemptId,0.91,true,scoreHash,payload);
  const two=await second.approveScore(attempt.attemptId,0.91,true,scoreHash,payload);
  assert.equal(one.id,two.id,'same approved score must not generate two outbox rows');
  assert.equal((await second.outboxById(one.id)).status,'PENDING');
  await first.close();
  first=null;
  first=createAsyncLtiStore(ignoredSqliteFile,{engine,connectionString});
  await first.ready;
  assert.deepEqual(await first.getState(attempt.attemptId,'course','quiz'),persisted);
  assert.equal((await first.getSession(tokenHash)).attemptId,attempt.attemptId);
  assert.equal((await first.outboxById(one.id)).status,'PENDING');
  assert.equal((await first.listPending(tenantId)).filter(id=>id===one.id).length,1);
 }finally{
  await Promise.allSettled([first?.close(),second?.close()]);
 }
});
