import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,statSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {createPrivateKey} from 'node:crypto';
import {
 installLti,readInstallation,testLtiDatabase,startLti,exportRecovery,
 publicLmsEndpoints,validateInstallationOptions,caddyConfiguration
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
