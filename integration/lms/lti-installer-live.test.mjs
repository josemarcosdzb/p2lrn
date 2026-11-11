// Installation smoke against genuine, separately running database engines.
// Unlike mock fixtures these connections perform real schema operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,existsSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installLti,testLtiDatabase,readInstallation} from './lti-installer.mjs';

for(const [engine,varName] of [
 ['postgres','P2LRN_TEST_POSTGRES_URL'],
 ['mysql','P2LRN_TEST_MYSQL_URL'],
 ['mariadb','P2LRN_TEST_MARIADB_URL'],
 ['sqlserver','P2LRN_TEST_SQLSERVER_URL']
]){
 const url=process.env[varName];
 test('console installer connects to and initializes real '+engine+' without SQLite fallback',{
  skip:!url?'No real SQL service configured':false,timeout:60000
 },async()=>{
  const root=mkdtempSync(join(tmpdir(),'p2lrn-install-'+engine+'-'));
  const target=join(root,'provider');
  try{
   const installed=await installLti({
    domain:'https://lti.example.org',engine,databaseUrl:url,
    directory:target,proxy:'existing'
   });
   assert.equal(installed.config.engine,engine);
   assert.equal(installed.publicHttpsVerified,false);
   assert.ok(!readFileSync(join(target,'config.json'),'utf8').includes(url));
   assert.equal(readFileSync(join(target,'database-url.txt'),'utf8').trim(),url);
   if(process.platform!=='win32')assert.equal(statSync(join(target,'database-url.txt')).mode&0o077,0);
   assert.equal(existsSync(join(target,'data','lti.sqlite')),false);
   const doctor=await testLtiDatabase(target);
   assert.equal(doctor.connected,true);
   assert.equal(doctor.engine,engine);
   assert.ok(Number.isInteger(doctor.stats.platforms));
   const read=await readInstallation(target);
   assert.equal(read.config.domain,'https://lti.example.org');
   assert.equal('secrets' in read,false);
  }finally{rmSync(root,{recursive:true,force:true})}
 });
}
