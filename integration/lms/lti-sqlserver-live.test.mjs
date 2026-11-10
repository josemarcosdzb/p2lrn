import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {createLtiStore} from './lti-store.mjs';

const serverUrl=process.env.P2LRN_TEST_SQLSERVER_URL;
test('real Microsoft SQL Server persists Platform, OIDC, LTI lesson state and grade outbox',{
 skip:!serverUrl?'Set P2LRN_TEST_SQLSERVER_URL to an actual SQL Server test instance':false,
 timeout:150000
},async()=>{
 const mssql=(await import('mssql')).default;
 const uri=new URL(serverUrl);
 const config={
  server:uri.hostname,port:Number(uri.port||1433),
  user:decodeURIComponent(uri.username),password:decodeURIComponent(uri.password),
  database:decodeURIComponent(uri.pathname.slice(1)),
  options:{encrypt:false,trustServerCertificate:true},
  connectionTimeout:15000,requestTimeout:20000
 };
 // Initial creation uses the real master server and a database for the LTI QA.
 let admin;
 for(let i=0;i<20;i++){
  try{
   admin=await new mssql.ConnectionPool({...config,database:'master'}).connect();
   break;
  }catch(error){
   if(i===19)throw error;
   await new Promise(done=>setTimeout(done,2500));
  }
 }
 try{
  await admin.request().query("IF DB_ID(N'p2lrn_test') IS NULL CREATE DATABASE [p2lrn_test]");
 }finally{await admin.close()}
 const db=new mssql.ConnectionPool({...config,database:'p2lrn_test'});
 let store;
 const prefix='mssql_'+randomUUID().replaceAll('-','');
 const tenantId=prefix+'_tenant',registrationId=prefix+'_platform';
 const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 try{
  await db.connect();
  assert.match((await db.request().query('SELECT @@VERSION AS version'))
   .recordset[0].version,/Microsoft SQL Server/i);
  const ltiUrl=new URL(serverUrl);
  ltiUrl.pathname='/p2lrn_test';
  store=createLtiStore('C:/ignored-sqlserver.sqlite',
   {engine:'sqlserver',connectionString:ltiUrl.href});
  store.upsertPlatform({
   id:registrationId,tenantId,issuer:'https://example.com/'+prefix,
   clientId:'tool-'+prefix,authUrl:'https://example.com/auth',
   tokenUrl:'https://example.com/token',launchUrl:'https://p2lrn.org/lti/launch',
   status:'ACTIVE',deployments:['deployment1'],deepLinkReturnOrigins:['https://example.com'],
   jwks:{keys:[{...publicKey.export({format:'jwk'}),kid:'key-1',use:'sig',alg:'RS256'}]}
  });
  assert.equal(store.getRegistrationById(registrationId)?.tenantId,tenantId);
  const packageId='urn:uuid:'+randomUUID();
  const catalogId=store.publishPackage({
   tenantId,title:'Genuine SQL Server',packageId,contentRoot:'sha256:'+'a'.repeat(64),
   sha:'b'.repeat(64),filename:'course.p2lrn',bytes:2000,
   entities:[{id:'course',type:'course',title:'Course'}]
  });
  const bindingId=store.createBinding({tenantId,registrationId,
   deploymentId:'deployment1',catalogId,entityId:'course'});
  const launch={tenantId,registrationId,deploymentId:'deployment1',
   bindingId,packageId,contentRoot:'sha256:'+'a'.repeat(64),entityId:'course',
   learnerKey:'9'.repeat(64),platformSubject:'learner',contextId:'course-context',
   resourceLinkId:'resource-link'};
  const attempt=store.attachLaunch({launch,ags:null,
   tokenHash:'1'.repeat(64),csrfHash:'2'.repeat(64),
   expiresAt:Math.floor(Date.now()/1000)+3600});
  assert.equal(store.getSession('1'.repeat(64)).attemptId,attempt.attemptId);
  assert.equal(store.saveState(attempt.attemptId,'course','reader',{lastPage:4}).revision,1);
  assert.equal(store.appendEvent(attempt.attemptId,prefix,'course',{event:'question'}).saved,true);
  store.observeScore(attempt.attemptId,0.67,false);
  const approved=store.approveScore(attempt.attemptId,0.87,true,'hash-'+prefix,
   {normalized:0.87,completed:true});
  assert.equal(store.outboxById(approved.id).status,'PENDING');
  const rows=(await db.request().input('id',attempt.attemptId)
   .query('SELECT approved,normalized FROM [assessments] WHERE attempt_id=@id')).recordset;
  assert.equal(rows[0].approved,1);
  assert.equal(Number(rows[0].normalized),0.87);
  store.close();store=null;
  store=createLtiStore('C:/ignored-sqlserver.sqlite',
   {engine:'sqlserver',connectionString:ltiUrl.href});
  assert.equal(store.getSession('1'.repeat(64)).attemptId,attempt.attemptId);
  assert.deepEqual(store.getState(attempt.attemptId,'course','reader'),{
   value:{lastPage:4},revision:1});
  assert.equal(store.listPending(tenantId).includes(approved.id),true);
  const limiter=[{scope:'test-'+prefix,limit:1,seconds:60}];
  assert.equal(store.admitSecurityRequest(limiter),true);
  assert.equal(store.admitSecurityRequest(limiter),false);
 }finally{store?.close();await db.close()}
});
