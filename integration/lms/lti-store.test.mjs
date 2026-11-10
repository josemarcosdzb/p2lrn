import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createLtiStore} from './lti-store.mjs';
import {issueP2LRNBindingId} from './launch-contract.mjs';
const root='sha256:'+'a'.repeat(64);
function fixture(){
 const folder=mkdtempSync(join(tmpdir(),'p2lrn-lti-store-'));
 const path=join(folder,'state.sqlite');
 const store=createLtiStore(path);
 const reg={id:'lms1',tenantId:'school1',issuer:'https://moodle.example',
 clientId:'p2lrn-app',authUrl:'https://moodle.example/auth',
 launchUrl:'https://p2lrn.example/lti/launch',
 deepLinkLaunchUrl:'https://p2lrn.example/lti/deep-link',
 tokenUrl:'https://moodle.example/token',status:'ACTIVE',deployments:['deploy1'],
 jwks:{keys:[{kty:'RSA',kid:'x',n:'AA',e:'AQAB'}]},
 deepLinkReturnOrigins:['https://moodle.example']};
 store.upsertPlatform(reg);
 return {folder,path,store,reg,clean(){try{this.store.close()}catch{}rmSync(folder,{recursive:true,force:true})}};
}
test('LTI registrations and deployment allowlist survive process restart',()=>{
 const f=fixture();
 try{
  assert.equal(f.store.getRegistration({issuer:f.reg.issuer,clientId:f.reg.clientId}).tenantId,'school1');
  assert.equal(f.store.listPlatforms().length,1);
  f.store.close();
  f.store=createLtiStore(f.path);
  assert.equal(f.store.getRegistrationById('lms1').deployments[0],'deploy1');
  assert.equal(f.store.listPlatforms()[0].id,'lms1');
 }finally{f.clean()}
});
test('OIDC state and Deep Linking tickets are atomically consumed exactly once',()=>{
 const f=fixture();
 try{
  const expiresAt=Math.floor(Date.now()/1000)+300;
  f.store.transactions.create({stateHash:'a'.repeat(64),nonceHash:'b'.repeat(64),
   browserHash:'c'.repeat(64),issuer:f.reg.issuer,clientId:f.reg.clientId,
   registrationId:'lms1',deploymentHint:'deploy1',
   targetLinkUri:f.reg.launchUrl,expiresAt});
  assert.equal(f.store.transactions.consume('a'.repeat(64)).registrationId,'lms1');
  assert.equal(f.store.transactions.consume('a'.repeat(64)),null);
  f.store.createPicker({ticketHash:'d'.repeat(64),registrationId:'lms1',
   tenantId:'school1',deploymentId:'deploy1',returnUrl:'https://moodle.example/return',expiresAt});
  assert.equal(f.store.consumePicker('d'.repeat(64)).tenantId,'school1');
  assert.equal(f.store.consumePicker('d'.repeat(64)),null);
 }finally{f.clean()}
});
test('tenant isolation, durable Player snapshots and idempotent client events',()=>{
 const f=fixture();
 try{
  const catalogId=f.store.publishPackage({tenantId:'school1',title:'Curso',
    packageId:'urn:uuid:course1',contentRoot:root,sha:'e'.repeat(64),
    filename:'e'.repeat(64)+'.p2lrn',bytes:512,
    entities:[{id:'course1',type:'course',title:'Curso'},{id:'lesson1',type:'activity',title:'Actividad'}]});
  assert.equal(f.store.listCatalog('other').length,0);
  assert.throws(()=>f.store.createBinding({tenantId:'other',registrationId:'lms1',
   deploymentId:'deploy1',catalogId,entityId:'lesson1'}));
  const bindingId=f.store.createBinding({tenantId:'school1',registrationId:'lms1',
   deploymentId:'deploy1',catalogId,entityId:'lesson1',id:issueP2LRNBindingId()});
  const launch={tenantId:'school1',registrationId:'lms1',deploymentId:'deploy1',bindingId,
   packageId:'urn:uuid:course1',contentRoot:root,entityId:'lesson1',
   learnerKey:'f'.repeat(64),platformSubject:'user1',contextId:'context1',resourceLinkId:'resource1'};
  const attempt=f.store.attachLaunch({launch,ags:null,tokenHash:'a'.repeat(64),
   csrfHash:'b'.repeat(64),expiresAt:Math.floor(Date.now()/1000)+3600});
  const session=f.store.getSession('a'.repeat(64));
  assert.equal(session.attemptId,attempt.attemptId);
  assert.deepEqual(session.entities.map(e=>e.id),['course1','lesson1']);
  assert.deepEqual(f.store.getState(attempt.attemptId,'lesson1','quiz'),{value:null,revision:0});
  assert.deepEqual(f.store.saveState(attempt.attemptId,'lesson1','quiz',{answers:['B']},0),{saved:true,revision:1});
  assert.deepEqual(f.store.saveState(attempt.attemptId,'lesson1','quiz',{answers:['B']},0),{saved:true,revision:1,unchanged:true},'HTTP replay of an already persisted snapshot must be idempotent');
  assert.deepEqual(f.store.saveState(attempt.attemptId,'lesson1','quiz',{answers:['C']},0),{saved:false,conflict:true,revision:1});
  assert.equal(f.store.appendEvent(attempt.attemptId,'event-1','lesson1',{type:'p2lrn:complete'}).saved,true);
  assert.equal(f.store.appendEvent(attempt.attemptId,'event-1','lesson1',{type:'p2lrn:complete'}).saved,false);
  assert.equal(f.store.observeScore(attempt.attemptId,0.75,true).gradeSent,false);
  f.store.close();f.store=createLtiStore(f.path);
  assert.deepEqual(f.store.getState(attempt.attemptId,'lesson1','quiz'),{value:{answers:['B']},revision:1});
  assert.equal(f.store.getSession('a'.repeat(64)).attemptId,attempt.attemptId);
  assert.equal(f.store.listAttempts('school1').length,1);
  const out=f.store.approveScore(attempt.attemptId,0.75,true,'score-hash',{normalized:0.75,completed:true});
  const duplicate=f.store.approveScore(attempt.attemptId,0.75,true,'score-hash',{normalized:0.75,completed:true});
  assert.equal(duplicate.id,out.id);
  assert.equal(f.store.listPending().length,1);
  assert.equal(f.store.outboxById(out.id).subject,'user1');
  f.store.markOutbox(out.id,'SENT');
  assert.equal(f.store.listPending().length,0);
 }finally{f.clean()}
});

test('signed instructor launch cannot enqueue an official learner score across restarts',()=>{
 const f=fixture();
 try{
  const catalogId=f.store.publishPackage({tenantId:'school1',title:'Official score access',
   packageId:'urn:uuid:grade-role',contentRoot:root,sha:'c'.repeat(64),
   filename:'c'.repeat(64)+'.p2lrn',bytes:512,
   entities:[{id:'course1',type:'course',title:'Course'},{id:'lesson1',type:'activity',title:'Activity'}]});
  const bindingId=f.store.createBinding({tenantId:'school1',registrationId:'lms1',
   deploymentId:'deploy1',catalogId,entityId:'lesson1',id:issueP2LRNBindingId()});
  const launch={tenantId:'school1',registrationId:'lms1',deploymentId:'deploy1',bindingId,
   packageId:'urn:uuid:grade-role',contentRoot:root,entityId:'lesson1',
   learnerKey:'1'.repeat(64),platformSubject:'instructor',contextId:'course1',resourceLinkId:'link1'};
  const attempt=f.store.attachLaunch({launch,ags:null,canReceiveGrades:false,
   tokenHash:'2'.repeat(64),csrfHash:'3'.repeat(64),expiresAt:Math.floor(Date.now()/1000)+3600});
  const grade=()=>f.store.approveScore(attempt.attemptId,0.85,true,'attempt-85',{normalized:0.85,completed:true});
  assert.throws(grade,/LTI_GRADE_ROLE_DENIED/);
  assert.equal(f.store.listPending().length,0);
  f.store.close();f.store=createLtiStore(f.path);
  assert.throws(grade,/LTI_GRADE_ROLE_DENIED/);
  assert.equal(f.store.listPending().length,0);
 }finally{f.clean()}
});
test('LTI sessions have immutable roles, content links and grade privileges',()=>{
 const f=fixture();
 try{
  const catalogId=f.store.publishPackage({tenantId:'school1',title:'Role isolation',
   packageId:'urn:uuid:roles',contentRoot:root,sha:'b'.repeat(64),
   filename:'b'.repeat(64)+'.p2lrn',bytes:512,
   entities:[{id:'course1',type:'course',title:'Course'}]});
  const bindingId=f.store.createBinding({tenantId:'school1',registrationId:'lms1',
   deploymentId:'deploy1',catalogId,entityId:'course1'});
  const launch={tenantId:'school1',registrationId:'lms1',deploymentId:'deploy1',
   bindingId,packageId:'urn:uuid:roles',contentRoot:root,entityId:'course1',
   learnerKey:'e'.repeat(64),platformSubject:'person',contextId:'context',
   resourceLinkId:'link-1'};
  const expiresAt=Math.floor(Date.now()/1000)+3600;
  const learner=f.store.attachLaunch({launch,ags:null,tokenHash:'4'.repeat(64),
   csrfHash:'5'.repeat(64),expiresAt,canReadRoster:false,canReceiveGrades:true});
  const instructor=f.store.attachLaunch({launch,ags:null,tokenHash:'6'.repeat(64),
   csrfHash:'7'.repeat(64),expiresAt,canReadRoster:true,canReceiveGrades:false});
  assert.notEqual(learner.attemptId,instructor.attemptId);
  const a=f.store.getSession('4'.repeat(64)),b=f.store.getSession('6'.repeat(64));
  assert.deepEqual([a.canReadRoster,a.canReceiveGrades],[false,true]);
  assert.deepEqual([b.canReadRoster,b.canReceiveGrades],[true,false]);
  assert.throws(()=>f.store.approveScore(instructor.attemptId,0.8,true,
   'instructor-grade',{normalized:0.8,completed:true}),/LTI_GRADE_ROLE_DENIED/);
  const differentLink=f.store.attachLaunch({launch:{...launch,resourceLinkId:'link-2'},
   ags:null,tokenHash:'8'.repeat(64),csrfHash:'9'.repeat(64),expiresAt,
   canReadRoster:false,canReceiveGrades:true});
  assert.notEqual(learner.attemptId,differentLink.attemptId);
  f.store.close();f.store=createLtiStore(f.path);
  assert.equal(f.store.getSession('4'.repeat(64)).attemptId,learner.attemptId);
  assert.deepEqual([f.store.getSession('6'.repeat(64)).canReadRoster,
   f.store.getSession('6'.repeat(64)).canReceiveGrades],[true,false]);
  assert.equal(f.store.listAttempts('school1').length,3);
 }finally{f.clean()}
});

test('browser reports do not revoke or overwrite an approved grade',()=>{
 const f=fixture();
 try{
  const catalogId=f.store.publishPackage({tenantId:'school1',title:'Grade',
   packageId:'urn:uuid:approved',contentRoot:root,sha:'d'.repeat(64),
   filename:'d'.repeat(64)+'.p2lrn',bytes:512,
   entities:[{id:'course1',type:'course',title:'Course'}]});
  const bindingId=f.store.createBinding({tenantId:'school1',registrationId:'lms1',
   deploymentId:'deploy1',catalogId,entityId:'course1'});
  const launch={tenantId:'school1',registrationId:'lms1',deploymentId:'deploy1',
   bindingId,packageId:'urn:uuid:approved',contentRoot:root,entityId:'course1',
   learnerKey:'9'.repeat(64),platformSubject:'learner',contextId:'context',
   resourceLinkId:'resource'};
  const attempt=f.store.attachLaunch({launch,ags:null,tokenHash:'1'.repeat(64),
   csrfHash:'2'.repeat(64),expiresAt:Math.floor(Date.now()/1000)+3600});
  f.store.observeScore(attempt.attemptId,0.7,true);
  f.store.approveScore(attempt.attemptId,0.7,true,'approved',
   {normalized:0.7,completed:true});
  f.store.observeScore(attempt.attemptId,0.01,false);
  const inspector=new DatabaseSync(f.path);
  try{
   const r=inspector.prepare('SELECT approved,normalized,completed FROM assessments WHERE attempt_id=?')
    .get(attempt.attemptId);
   assert.deepEqual([r.approved,r.normalized,r.completed],[1,0.7,1]);
  }finally{inspector.close()}
 }finally{f.clean()}
});
