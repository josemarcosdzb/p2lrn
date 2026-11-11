import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createLtiStore} from './lti-store.mjs';

const url=process.env.P2LRN_TEST_POSTGRES_URL;
test('real PostgreSQL persists LTI logins, course sessions, progress and approved AGS outbox', {
 skip:!url?'Set P2LRN_TEST_POSTGRES_URL to a real PostgreSQL test database':false,
 timeout:60000
}, async()=>{
 const pg=(await import('pg')).default;
 const prefix='pg_'+randomUUID().replaceAll('-','');
 const registrationId=prefix+'_registration',tenantId=prefix+'_tenant';
 const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwks={keys:[{...publicKey.export({format:'jwk'}),kid:'platform-key',use:'sig',alg:'RS256'}]};
 const registration={
  id:registrationId,tenantId,issuer:'https://example.org/'+prefix,clientId:'client-'+prefix,
  authUrl:'https://example.org/auth',launchUrl:'https://p2lrn.org/lti/launch',
  deepLinkLaunchUrl:'https://p2lrn.org/lti/deep-link',tokenUrl:'https://example.org/token',
  jwks,deployments:['deployment1'],deepLinkReturnOrigins:['https://example.org'],status:'ACTIVE'
 };
 let store;
 const db=new pg.Client({connectionString:url});
 try{
  store=createLtiStore('/tmp/p2lrn-sql-ignored.sqlite',{engine:'postgres',connectionString:url});
  await db.connect();
  const sqlVersion=await db.query('SELECT version() AS version');
  assert.match(sqlVersion.rows[0].version,/PostgreSQL/i);
  store.upsertPlatform(registration);
  assert.equal(store.getRegistrationById(registrationId).tenantId,tenantId);
  const catalogId=store.publishPackage({
   tenantId,title:'Postgres actual',packageId:'urn:uuid:'+randomUUID(),
   contentRoot:'sha256:'+'a'.repeat(64),sha:'b'.repeat(64),
   filename:'course.p2lrn',bytes:512,
   entities:[{id:'course',type:'course',title:'Real course'}]
  });
  const bindingId=store.createBinding({tenantId,registrationId,
   deploymentId:'deployment1',catalogId,entityId:'course'});
  const launch={tenantId,registrationId,deploymentId:'deployment1',
   bindingId,packageId:store.getBinding({id:bindingId,tenantId,registrationId,
    deploymentId:'deployment1'}).packageId,
   contentRoot:'sha256:'+'a'.repeat(64),entityId:'course',
   learnerKey:'e'.repeat(64),platformSubject:'student-1',contextId:'context1',
   resourceLinkId:'resource1'
  };
  const session=store.attachLaunch({launch,ags:null,
   tokenHash:'1'.repeat(64),csrfHash:'2'.repeat(64),
   expiresAt:Math.floor(Date.now()/1000)+3600,canReceiveGrades:true});
  assert.equal(store.getSession('1'.repeat(64)).attemptId,session.attemptId);
  assert.equal(store.getAttemptTenant(session.attemptId),tenantId,
   'actual PostgreSQL must preserve tenant identity across grade authorization');
  assert.equal(store.saveState(session.attemptId,'course','assessment',{step:1}).revision,1);
  assert.deepEqual(store.getState(session.attemptId,'course','assessment'),
   {value:{step:1},revision:1});
  assert.equal(store.appendEvent(session.attemptId,prefix,'course',{event:'question'}).saved,true);
  store.observeScore(session.attemptId,0.5,false);
  const grade=store.approveScore(session.attemptId,0.9,true,'grade-'+prefix,{
   normalized:0.9,completed:true
  });
  assert.equal(store.outboxById(grade.id).status,'PENDING');
  store.observeScore(session.attemptId,0.2,false);
  const persisted=await db.query(
   'SELECT s.value_json,a.approved,a.normalized FROM snapshots s JOIN assessments a ON a.attempt_id=s.attempt_id WHERE s.attempt_id=$1',
   [session.attemptId]);
  assert.equal(JSON.parse(persisted.rows[0].value_json).step,1);
  assert.equal(persisted.rows[0].approved,1);
  assert.equal(persisted.rows[0].normalized,0.9);
  const rules=[{scope:prefix,limit:1,seconds:60}];
  assert.equal(store.admitSecurityRequest(rules),true);
  assert.equal(store.admitSecurityRequest(rules),false);
  store.close();store=null;
  store=createLtiStore('/tmp/p2lrn-sql-ignored.sqlite',{engine:'postgres',connectionString:url});
  assert.equal(store.getSession('1'.repeat(64)).attemptId,session.attemptId);
  assert.equal(store.getState(session.attemptId,'course','assessment').revision,1);
  assert.equal(store.admitSecurityRequest(rules),false);
 }finally{
  store?.close();
  await db.end().catch(()=>{});
 }
});
