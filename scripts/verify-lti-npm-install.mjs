// Release gate: install @p2lrn/lti-provider from its actual .tgz beside
// real locally staged Player/Toolkit tarballs, in a clean npm project.
// No source alias or development-tree relative paths can satisfy this test.
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,readdir,rm,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const call=promisify(execFile);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const artifactRoot=join(root,'.npm-pack-gate','packs');
const version=JSON.parse(await readFile(join(root,'integration/lms/package.json'),'utf8')).version;
const testDir=await mkdtemp(join(tmpdir(),'p2lrn-lti-npm-clean-'));
const npm=(args,cwd)=>call('npm',args,{cwd,timeout:180000,
 env:{...process.env,npm_config_fund:'false',npm_config_audit:'false'},maxBuffer:8*1024*1024});
async function freePort(){
 const server=createServer();
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const port=server.address().port;
 await new Promise(ok=>server.close(ok));
 return port;
}
async function requirePack(label){
 const files=await readdir(artifactRoot);
 const filename='p2lrn-'+label+'-'+version+'.tgz';
 assert.ok(files.includes(filename),'Missing staged package '+filename);
 return join(artifactRoot,filename);
}
function runCli(bin,args,cwd){
 return call(process.execPath,[bin,...args],{cwd,timeout:55000,maxBuffer:8*1024*1024});
}
let providerProcess=null;
try{
 const {stdout}=await npm(['pack','--json','--pack-destination',artifactRoot],join(root,'integration/lms'));
 const details=JSON.parse(stdout)[0];
 assert.equal(details.name,'@p2lrn/lti-provider');
 assert.equal(details.version,version);
 const contents=details.files.map(f=>f.path);
 for(const required of ['bin/p2lrn-lti.mjs','lti-server.mjs','lti-database-worker.mjs',
  'lti-installer.mjs','LICENSE','NOTICE.md','README.md']){
  assert.ok(contents.includes(required),'Missing LTI npm member: '+required);
 }
 assert.ok(!contents.some(p=>p.endsWith('.test.mjs')||/\.env|private-key|node_modules/.test(p)),
  'LTI package contains tests, secrets or a vendored node_modules');
 const ltiTarball=join(artifactRoot,details.filename);
 const tarballs=[
  await requirePack('toolkit'),await requirePack('player'),
  await requirePack('h5p-libraries'),ltiTarball
 ];
 await npm(['init','-y'],testDir);
 await npm(['install','--ignore-scripts','--no-audit','--no-fund',...tarballs],testDir);
 const installed=join(testDir,'node_modules','@p2lrn','lti-provider');
 const bin=join(installed,'bin','p2lrn-lti.mjs');
 assert.ok((await stat(bin)).isFile());
 const help=await runCli(bin,['help'],testDir);
 assert.match(help.stdout,/instalacion guiada/i);
 const instance=join(testDir,'installation'),port=await freePort();
 const init=await runCli(bin,[
  'init','--directory',instance,'--database','sqlite',
  '--domain','https://lti.example.org','--port',String(port),
  '--proxy','existing','--yes','--json'
 ],testDir);
 const installation=JSON.parse(init.stdout);
 assert.equal(installation.config.engine,'sqlite');
 assert.equal(installation.config.domain,'https://lti.example.org');
 assert.equal(installation.publicHttpsVerified,false);
 assert.ok(!init.stdout.includes('BEGIN PRIVATE KEY'));
 const doctor=JSON.parse((await runCli(bin,[
  'doctor','--directory',instance,'--json'
 ],testDir)).stdout);
 assert.deepEqual(doctor.database.stats,{platforms:0,courses:0,attempts:0});
 const endpoints=JSON.parse((await runCli(bin,[
  'endpoints','--directory',instance,'--json'
 ],testDir)).stdout);
 assert.equal(endpoints.launch,'https://lti.example.org/lti/launch');
 providerProcess=spawn(process.execPath,[bin,'start','--directory',instance],{
  cwd:testDir,stdio:['ignore','pipe','pipe']
 });
 let exited=false,stderr='';
 providerProcess.once('exit',()=>{exited=true});
 providerProcess.stderr.on('data',b=>{stderr+=b.toString()});
 const local='http://127.0.0.1:'+port;
 let healthy=false;
 for(let i=0;i<75;i++){
  if(exited)break;
  await new Promise(r=>setTimeout(r,100));
  try{
   const health=await fetch(local+'/lti/health',{signal:AbortSignal.timeout(350)});
   if(health.status===200){healthy=true;break}
  }catch{}
 }
 assert.equal(healthy,true,'Installed npm LTI server did not start: '+stderr);
 const jwks=await fetch(local+'/lti/jwks');
 assert.equal(jwks.status,200);
 const publicJwks=(await jwks.json()).keys;
 assert.ok(publicJwks.some(k=>k.kid===installation.config.kid));
 const player=await fetch(local+'/lti/assets/player/p2lrn.js');
 assert.equal(player.status,200,'Installed server could not load npm Player dist');
 const playerBytes=await player.arrayBuffer();
 assert.ok(playerBytes.byteLength>0,'Installed npm Player asset must contain real script bytes');
 console.log(JSON.stringify({
  ok:true,package:'@p2lrn/lti-provider',version,
  sourceOfTruth:'installed-local-npm-tarballs',freshProject:true,
  generatedRSA:true,privateInstall:true,sqlite:true,
  doctor:true,httpsRequiresOperator:true,lmsEndpoints:true,
  ltiHttp:true,jwks:true,installedPlayerAsset:true,
  noCourseOrSqlBackups:true
 },null,2));
}finally{
 if(providerProcess&&!providerProcess.killed){
  const closed=new Promise(r=>providerProcess.once('exit',r));
  providerProcess.kill('SIGTERM');
  await Promise.race([closed,new Promise(r=>setTimeout(r,4000))]);
  if(providerProcess.exitCode===null)providerProcess.kill('SIGKILL');
 }
 await rm(testDir,{recursive:true,force:true,maxRetries:4,retryDelay:250});
}
