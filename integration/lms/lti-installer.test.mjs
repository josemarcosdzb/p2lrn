import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,statSync,existsSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {createPrivateKey,generateKeyPairSync} from 'node:crypto';
import {
 installLti,readInstallation,testLtiDatabase,startLti,exportRecovery,
 publicLmsEndpoints,validateInstallationOptions,caddyConfiguration,
 importRecovery,acknowledgeRestoredData,systemdUserService,databaseConnectionFromFields,
 listLtiPlatforms,registerLtiPlatform,disableLtiPlatform,LTI_SQL_ENGINES
} from './lti-installer.mjs';

async function freePort(){
 const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));
 const p=s.address().port;
 await new Promise(r=>s.close(r));
 return p;
}
test('installer rejects insecure domains, missing SQL credentials and URL secrets',()=>{
 for(const domain of ['http://lti.example.org','https://localhost','https://host.test/path',
  'https://user:pass@host.test','https://host.test:8443','invalid']){
  assert.throws(()=>validateInstallationOptions({domain}),/P2LRN_INSTALL_/);
 }
 assert.throws(()=>validateInstallationOptions({
  domain:'https://host.test',engine:'postgres'}),/DATABASE_CONNECTION_REQUIRED/);
 assert.throws(()=>validateInstallationOptions({
  domain:'https://host.test',engine:'sqlserver',databaseUrl:'mysql://x@y/z'
 }),/DATABASE_CONNECTION_REQUIRED/);
});
test('real SQLite installation creates RSA, scoped operator key, private profile, live HTTP endpoints and encrypted identity export',async()=>{
 const root=mkdtempSync(join(tmpdir(),'p2lrn-lti-wizard-'));
 const dir=join(root,'private-lti'),port=await freePort();
 let running;
 try{
  const install=await installLti({
   domain:'https://lti.example.org',engine:'sqlite',port,proxy:'caddy',directory:dir
  });
  assert.equal(install.publicHttpsVerified,false);
  assert.equal(install.backupsResponsibility,'hosting-platform-or-technician');
  assert.equal(existsSync(join(dir,'Caddyfile')),true);
  assert.match(caddyConfiguration('https://lti.example.org',port),
   /reverse_proxy 127\.0\.0\.1:/);
  const pem=readFileSync(join(dir,'tool-key.pem'),'utf8');
  assert.equal(createPrivateKey(pem).asymmetricKeyType,'rsa');
  const secret=readFileSync(join(dir,'administrator-secret.txt'),'utf8').trim();
  assert.ok(secret.length>=32);
  assert.ok(!readFileSync(join(dir,'config.json'),'utf8').includes(secret));
  const policies=JSON.parse(readFileSync(join(dir,'administrator-scopes.json'),'utf8'));
  assert.equal(policies[0].tenantId,'*');
  assert.ok(!JSON.stringify(policies).includes(secret),'save hashed admin token');
  assert.equal(readFileSync(join(dir,'bootstrap-secret.txt'),'utf8').trim().length>=32,true);
  if(process.platform!=='win32'){
   for(const file of ['tool-key.pem','administrator-secret.txt','bootstrap-secret.txt','config.json']){
    assert.equal(statSync(join(dir,file)).mode&0o077,0,'secret accessible only to its owner');
   }
   assert.equal(statSync(dir).mode&0o077,0);
  }
  const result=await testLtiDatabase(dir);
  assert.equal(result.connected,true);assert.equal(result.engine,'sqlite');
  assert.deepEqual(result.stats,{platforms:0,courses:0,attempts:0});
  const read=await readInstallation(dir);
  assert.equal(read.config.domain,'https://lti.example.org');
  assert.equal(read.config.engine,'sqlite');
  assert.equal('secrets' in read,false);
  running=await startLti(dir);
  const local='http://127.0.0.1:'+port;
  const health=await fetch(local+'/lti/health');
  assert.equal(health.status,200);
  const jwks=await fetch(local+'/lti/jwks');
  assert.equal(jwks.status,200);
  const keys=(await jwks.json()).keys;
  assert.ok(keys.length>=1);
  assert.equal(keys[0].kid,read.config.kid);
  assert.equal((await fetch(local+'/lti/assets/player/p2lrn.js')).status,200);
  await assert.rejects(installLti({
   domain:'https://lti.example.org',engine:'sqlite',port,proxy:'caddy',directory:dir
  }),/ALREADY_INSTALLED/);
  const archive=join(root,'keys.recovery.json');
  await exportRecovery(dir,archive,'correct-horse-battery-example-42');
  const serialized=readFileSync(archive,'utf8');
  assert.ok(!serialized.includes('BEGIN PRIVATE KEY'));
  assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes('lti.example.org'));
  assert.equal(existsSync(join(dir,'data','lti.sqlite')),true);
 }finally{
  if(running)await running.gateway.close();
  rmSync(root,{recursive:true,force:true});
 }
});
test('LMS registration endpoints are identical for all compatible hosts',()=>{
 const endpoints=publicLmsEndpoints('https://lti.example.org');
 assert.equal(endpoints.login,'https://lti.example.org/lti/login');
 assert.equal(endpoints.deepLink,'https://lti.example.org/lti/deep-link');
 assert.equal(endpoints.jwks,'https://lti.example.org/lti/jwks');
});

test('encrypted identity recovery never restores course/database files and blocks premature server start',async()=>{
 const root=mkdtempSync(join(tmpdir(),'p2lrn-lti-recover-'));
 const orig=join(root,'original'),restored=join(root,'recovered');
 const file=join(root,'identity.json');
 const phrase='recovery-keyphrase-with-strong-entropy-2026';
 try{
  await installLti({domain:'https://lti.example.org',engine:'sqlite',directory:orig});
  const identity=await exportRecovery(orig,file,phrase);
  assert.equal(identity.includesCourseData,false);
  assert.equal(identity.includesDatabaseDump,false);
  await assert.rejects(importRecovery(file,restored,'wrong-password-long-enough'),
   /RECOVERY_DECRYPTION_FAILED/);
  assert.equal(existsSync(restored),false,'a wrong passphrase must leave no partial install');
  const result=await importRecovery(file,restored,phrase);
  assert.equal(result.requiresHostDataRestore,true);
  assert.equal(existsSync(join(restored,'data','lti.sqlite')),false);
  await assert.rejects(startLti(restored),/HOST_DATA_RESTORE_REQUIRED/);
  await assert.rejects(acknowledgeRestoredData(restored),
   /SQLITE_DATABASE_BACKUP_NOT_RESTORED/);
  copyFileSync(join(orig,'data','lti.sqlite'),join(restored,'data','lti.sqlite'));
  const confirmation=await acknowledgeRestoredData(restored);
  assert.equal(confirmation.activated,true);
  assert.equal((await readInstallation(restored)).config.requiresHostRestore,false);
  assert.equal(readFileSync(join(orig,'tool-key.pem'),'utf8').trim(),
    readFileSync(join(restored,'tool-key.pem'),'utf8').trim());
  assert.equal((await testLtiDatabase(restored)).connected,true);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('service file starts the same npm entrypoint, stays unprivileged and never schedules backups',()=>{
 const service=systemdUserService('/srv/p2lrn-lti');
 assert.match(service,/ExecStart=.*p2lrn-lti\.mjs/);
 assert.match(service,/NoNewPrivileges=true/);
 assert.match(service,/UMask=0077/);
 assert.doesNotMatch(service,/cron|backup|dump|supabase/i);
});

test('guided SQL wizard builds safe native connection strings from ordinary fields',()=>{
 for(const engine of ['postgres','mysql','mariadb','sqlserver']){
  const url=databaseConnectionFromFields({
   engine,hostname:'db.example.org',database:'learning',username:'school@group',
   password:'not-a-real-pass:/?#@&%+漢',tls:true
  });
  const parsed=new URL(url);
  assert.equal(parsed.hostname,'db.example.org');
  assert.equal(decodeURIComponent(parsed.username),'school@group');
  assert.equal(decodeURIComponent(parsed.password),'not-a-real-pass:/?#@&%+漢');
  assert.equal(decodeURIComponent(parsed.pathname.slice(1)),'learning');
  assert.ok(!url.includes('not-a-real-pass:/?#@&%+漢'));
  assert.equal(parsed.searchParams.get('sslmode')??parsed.searchParams.get('ssl')??
   parsed.searchParams.get('encrypt'),engine==='postgres'?'verify-full':'true');
 }
 assert.throws(()=>databaseConnectionFromFields({engine:'mysql',hostname:'db.example.org',
  database:'learning',username:'test',password:''}),/DATABASE_CREDENTIALS_REQUIRED/);
 assert.throws(()=>databaseConnectionFromFields({engine:'postgres',hostname:'bad.example.org@evil.test',
  database:'learning',username:'test',password:'test'}),/DATABASE_HOST_INVALID/);
});


test('standalone platform manager uses installed SQLite, rejects duplicates and preserves data on disable',async()=>{
 const root=mkdtempSync(join(tmpdir(),'p2lrn-lti-platform-'));
 const directory=join(root,'installed-provider');
 try{
  await installLti({domain:'https://lti.example.org',engine:'sqlite',directory});
  assert.deepEqual(LTI_SQL_ENGINES,['sqlite','postgres','mariadb','mysql','sqlserver']);
  assert.deepEqual(await listLtiPlatforms(directory),[]);
  const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'qa-moodle-2026',use:'sig',alg:'RS256'};
  const fetched=[];
  const fetchPublic=async url=>{
   fetched.push(url);
   return new Response(JSON.stringify({keys:[jwk]}),{
    status:200,headers:{'content-type':'application/json'}
   });
  };
  const profile={
   id:'qa-moodle',tenantId:'school-001',
   issuer:'https://moodle.example.org',clientId:'real-client-001',
   authUrl:'https://moodle.example.org/mod/lti/auth.php',
   tokenUrl:'https://moodle.example.org/mod/lti/token.php',
   jwksUrl:'https://moodle.example.org/mod/lti/certs.php',
   deployments:['2']
  };
  const added=await registerLtiPlatform(directory,profile,{fetchJwks:fetchPublic});
  assert.equal(added.status,'ACTIVE');
  assert.equal(added.issuer,profile.issuer);
  assert.deepEqual(fetched,[profile.jwksUrl]);
  assert.equal((await testLtiDatabase(directory)).stats.platforms,1);
  const listed=await listLtiPlatforms(directory);
  assert.equal(listed.length,1);
  assert.equal(listed[0].clientId,profile.clientId);
  assert.equal('jwks' in listed[0],false,'public listing never includes key material');
  await assert.rejects(registerLtiPlatform(directory,profile,{fetchJwks:fetchPublic}),
   /PLATFORM_ALREADY_REGISTERED/);
  const disabled=await disableLtiPlatform(directory,'qa-moodle');
  assert.equal(disabled.status,'DISABLED');
  assert.equal((await listLtiPlatforms(directory))[0].status,'DISABLED');
  assert.equal((await testLtiDatabase(directory)).stats.platforms,1,
   'disable must not delete registration or learner data');
  await assert.rejects(registerLtiPlatform(directory,{
   ...profile,id:'insecure',issuer:'http://moodle.example.org',
   authUrl:'http://moodle.example.org/auth.php',
   tokenUrl:'http://moodle.example.org/token.php',
   jwksUrl:'http://moodle.example.org/certs.php'
  },{fetchJwks:fetchPublic}),/LTI platform endpoints must use HTTPS/);
  await assert.rejects(registerLtiPlatform(directory,{
   ...profile,id:'invalid-jwk'
  },{fetchJwks:async()=>new Response(JSON.stringify({keys:[{...jwk,d:'leaked'}]}),
   {status:200})}),/PLATFORM_JWKS_INVALID_RSA/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
