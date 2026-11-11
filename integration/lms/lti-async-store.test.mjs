import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {createAsyncLtiStore} from './lti-async-store.mjs';

const now=()=>Math.floor(Date.now()/1000);
function fixture(){
 const folder=mkdtempSync(join(tmpdir(),'p2lrn-lti-async-'));
 const filename=join(folder,'state.sqlite');
 return {filename,open:()=>createAsyncLtiStore(filename,{engine:'sqlite'}),
  cleanup:()=>rmSync(folder,{recursive:true,force:true})};
}
async function createAttempt(store){
 const tag=randomUUID().replaceAll('-','');
 const tenantId='tenant-'+tag,registrationId='platform-'+tag;
 await store.upsertPlatform({
  id:registrationId,tenantId,issuer:'https://lms.example/'+tag,clientId:'client-'+tag,
  authUrl:'https://lms.example/auth',launchUrl:'https://tool.example/lti/launch',
  tokenUrl:'https://lms.example/token',status:'ACTIVE',deployments:['deployment'],
  jwks:{keys:[{kty:'RSA',kid:'test-key',n:'AA',e:'AQAB'}]},
  deepLinkReturnOrigins:['https://lms.example']
 });
 const packageId='urn:uuid:'+randomUUID(),contentRoot='sha256:'+'a'.repeat(64);
 const catalogId=await store.publishPackage({
  tenantId,title:'Async test fixture',packageId,contentRoot,sha:tag.padEnd(64,'b'),
  filename:'fixture.p2lrn',bytes:128,entities:[{id:'course',type:'course',title:'Course'}]
 });
 const bindingId=await store.createBinding({
  tenantId,registrationId,deploymentId:'deployment',catalogId,entityId:'course'
 });
 const tokenHash=tag.padEnd(64,'0'),csrfHash=tag.padEnd(64,'1');
 const attempt=await store.attachLaunch({
  launch:{tenantId,registrationId,deploymentId:'deployment',bindingId,
   packageId,contentRoot,entityId:'course',learnerKey:'l'.repeat(64),
   platformSubject:'test-learner',contextId:'context',resourceLinkId:'resource'},
  ags:null,tokenHash,csrfHash,expiresAt:now()+3600,canReceiveGrades:true
 });
 return {...attempt,tokenHash,tenantId,registrationId,bindingId};
}

test('worker atomically consumes OIDC state and applies rate limit',async()=>{
 const f=fixture(),store=f.open();
 try{
  await store.ready;
  assert.equal(store.healthy,true);
  assert.equal(await store.count('platforms'),0);
  const stateHash='a'.repeat(64);
  await store.transactions.create({
   stateHash,nonceHash:'b'.repeat(64),browserHash:'c'.repeat(64),
   issuer:'https://lms.example',clientId:'client',registrationId:'reg1',
   deploymentHint:null,targetLinkUri:'https://tool.example/lti/launch',
   expiresAt:now()+120
  });
  const consumed=await Promise.all(Array.from({length:8},()=>store.transactions.consume(stateHash)));
  assert.equal(consumed.filter(Boolean).length,1);
  const rate=await Promise.all(Array.from({length:12},()=>store.admitSecurityRequest([
   {scope:'async-worker-limiter',limit:3,seconds:60}
  ])));
  assert.equal(rate.filter(Boolean).length,3);
  assert.equal(rate.filter(x=>x===false).length,9);
 }finally{await store.close();f.cleanup();}
 assert.equal(store.healthy,false);
 await assert.rejects(store.count('platforms'),{code:'LTI_DB_CLOSED'});
});

test('concurrent progress: one CAS winner, idempotent retry, one event and one AGS record',async()=>{
 const f=fixture(),store=f.open();
 try{
  await store.ready;
  const {attemptId,tenantId,registrationId,bindingId,tokenHash}=await createAttempt(store);
  assert.equal((await store.getSession(tokenHash)).attemptId,attemptId);
  assert.equal(await store.getBinding({id:bindingId,tenantId:'other-school',
   registrationId,deploymentId:'deployment'}),null);
  const saves=await Promise.all(Array.from({length:8},(_,n)=>
   store.saveState(attemptId,'course','quiz',{answer:n},0)));
  assert.equal(saves.filter(s=>s.saved===true&&!s.unchanged).length,1);
  assert.equal(saves.filter(s=>s.conflict===true).length,7);
  const saved=await store.getState(attemptId,'course','quiz');
  assert.equal(saved.revision,1);
  const replay=await store.saveState(attemptId,'course','quiz',saved.value,0);
  assert.equal(replay.unchanged,true);
  assert.equal((await store.getState(attemptId,'course','quiz')).revision,1);
  const events=await Promise.all(Array.from({length:8},()=>
   store.appendEvent(attemptId,'event-1','course',{type:'p2lrn:answer'})));
  assert.equal(events.filter(e=>e.saved).length,1);
  const hash='hash-'+randomUUID(),payload={normalized:0.85,completed:true};
  const first=await store.approveScore(attemptId,0.85,true,hash,payload);
  const duplicate=await store.approveScore(attemptId,0.85,true,hash,payload);
  assert.equal(first.id,duplicate.id);
  assert.equal((await store.outboxById(first.id)).status,'PENDING');
  await store.observeScore(attemptId,0.1,false);
  assert.equal((await store.outboxById(first.id)).payload.normalized,0.85);
  assert.equal((await store.listPending(tenantId)).filter(x=>x===first.id).length,1);
  await store.close();
  const reopened=f.open();
  try{
   await reopened.ready;
   assert.equal((await reopened.getSession(tokenHash)).attemptId,attemptId);
   assert.deepEqual(await reopened.getState(attemptId,'course','quiz'),saved);
   assert.equal((await reopened.outboxById(first.id)).status,'PENDING');
  }finally{await reopened.close();}
 }finally{await store.close();f.cleanup();}
});

test('event loop stays responsive while SQL worker waits on genuine SQLite write lock',async()=>{
 const f=fixture(),store=f.open();
 let lock,timer,held=false,ticks=0;
 try{
  await store.ready;
  lock=new DatabaseSync(f.filename,{timeout:3000});
  lock.exec('BEGIN IMMEDIATE');held=true;
  timer=setInterval(()=>ticks++,10);
  const request=store.admitSecurityRequest([
   {scope:'held-lock-'+randomUUID(),limit:1,seconds:60}
  ]);
  await delay(180);
  assert.ok(ticks>=5,'database wait must not block the main event loop');
  lock.exec('ROLLBACK');held=false;
  assert.equal(await request,true);
 }finally{
  if(timer)clearInterval(timer);
  if(held)lock.exec('ROLLBACK');
  lock?.close();
  await store.close();
  f.cleanup();
 }
});

test('bounded worker queue rejects excess requests but recovers afterward',async()=>{
 const f=fixture(),store=f.open();
 try{
  await store.ready;
  const results=await Promise.allSettled(Array.from({length:136},()=>
   store.count('platforms')));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,128);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason?.code==='LTI_DB_BUSY').length,8);
  assert.equal(await store.count('platforms'),0);
 }finally{await store.close();f.cleanup();}
});

test('missing PostgreSQL URL fails closed and cannot silently open SQLite',async()=>{
 const f=fixture(),store=createAsyncLtiStore(f.filename,{engine:'postgres'});
 try{
  await assert.rejects(store.ready,/P2LRN_LTI_DB_URL/);
  assert.equal(store.healthy,false);
  await assert.rejects(store.count('platforms'),/P2LRN_LTI_DB_URL|LTI_DB/);
 }finally{await store.close();f.cleanup();}
});
