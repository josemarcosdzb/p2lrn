import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createLtiStore} from './lti-store.mjs';

async function connectNative(engine,url){
 const uri=new URL(url),config={
  host:uri.hostname,port:Number(uri.port||3306),
  user:decodeURIComponent(uri.username),password:decodeURIComponent(uri.password),
  database:decodeURIComponent(uri.pathname.slice(1))
 };
 if(engine==='mysql'){
  const mysql=await import('mysql2/promise');
  const conn=await mysql.createConnection(config);
  return {async query(sql,args){return (await conn.query(sql,args))[0]},close:()=>conn.end()};
 }
 const mariadb=(await import('mariadb')).default;
 const conn=await mariadb.createConnection(config);
 return {async query(sql,args){return conn.query(sql,args)},close:()=>conn.end()};
}
for(const engine of ['mysql','mariadb']){
 const url=process.env['P2LRN_TEST_'+engine.toUpperCase()+'_URL'];
 test('real '+engine+' persists platform, published course, lesson state and official grade outbox',{
  skip:!url?'Configure a genuine '+engine+' database with P2LRN_TEST_'+engine.toUpperCase()+'_URL':false,
  timeout:90000
 },async()=>{
  const prefix=engine+'_'+randomUUID().replaceAll('-','');
  const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  let store,native;
  const tenantId=prefix+'_tenant',registrationId=prefix+'_platform';
  try{
   store=createLtiStore('/tmp/ignored-remote-db.sqlite',{engine,connectionString:url});
   native=await connectNative(engine,url);
   const version=await native.query('SELECT VERSION() AS version');
   assert.ok(version[0]?.version,engine+' must answer actual SQL');
   store.upsertPlatform({
    id:registrationId,tenantId,issuer:'https://example.org/'+prefix,clientId:prefix,
    authUrl:'https://example.org/auth',launchUrl:'https://p2lrn.org/lti/launch',
    tokenUrl:'https://example.org/token',deployments:['deployment'],
    jwks:{keys:[{...publicKey.export({format:'jwk'}),kid:'platform-key',use:'sig',alg:'RS256'}]},
    deepLinkReturnOrigins:['https://example.org'],status:'ACTIVE'
   });
   assert.equal(store.getRegistrationById(registrationId)?.tenantId,tenantId);
   const packageId='urn:uuid:'+randomUUID();
   const catalogId=store.publishPackage({tenantId,title:'Real '+engine+' LTI',
    packageId,contentRoot:'sha256:'+'a'.repeat(64),sha:'b'.repeat(64),
    filename:'real-course.p2lrn',bytes:1024,entities:[{id:'course',type:'course',title:'Course'}]});
   const bindingId=store.createBinding({tenantId,registrationId,
    deploymentId:'deployment',catalogId,entityId:'course'});
   const launch={bindingId,tenantId,registrationId,deploymentId:'deployment',
    packageId,contentRoot:'sha256:'+'a'.repeat(64),entityId:'course',
    learnerKey:'d'.repeat(64),platformSubject:'student',contextId:'context',
    resourceLinkId:'resource'};
   const expiry=Math.floor(Date.now()/1000)+3600;
   const attempt=store.attachLaunch({launch,ags:null,
    tokenHash:'1'.repeat(64),csrfHash:'2'.repeat(64),expiresAt:expiry,
    canReadRoster:false,canReceiveGrades:true});
   assert.ok(attempt.attemptId);
   assert.equal(store.getSession('1'.repeat(64)).attemptId,attempt.attemptId);
   assert.equal(store.saveState(attempt.attemptId,'course','player',{completed:false}).revision,1);
   const event=store.appendEvent(attempt.attemptId,prefix,'course',{answer:'A'});
   assert.equal(event.saved,true);
   const approved=store.approveScore(attempt.attemptId,0.84,true,'hash-'+prefix,{
    normalized:0.84,completed:true});
   assert.equal(store.outboxById(approved.id).status,'PENDING');
   const rows=await native.query(
    'SELECT normalized,approved FROM assessments WHERE attempt_id=?',[attempt.attemptId]);
   assert.equal(Number(rows[0].normalized),0.84);
   assert.equal(Number(rows[0].approved),1);
   store.close();store=null;
   store=createLtiStore('/tmp/ignored-remote-db.sqlite',{engine,connectionString:url});
   assert.equal(store.getSession('1'.repeat(64)).attemptId,attempt.attemptId);
   assert.deepEqual(store.getState(attempt.attemptId,'course','player'),
    {value:{completed:false},revision:1});
   assert.equal(store.listPending(tenantId).includes(approved.id),true);
   const quota=[{scope:'test-rate-'+prefix,limit:1,seconds:60}];
   assert.equal(store.admitSecurityRequest(quota),true);
   assert.equal(store.admitSecurityRequest(quota),false);
  }finally{
   store?.close();
   await native?.close();
  }
 });
}
