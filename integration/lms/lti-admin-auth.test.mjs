import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createP2LRNLtiServer} from './lti-server.mjs';
import {createLtiAdminAuthorizer} from './lti-admin-auth.mjs';

const root='root-test-token-abcdefghijklmnopqrstuvwxyz0123456789';
const token='tenant-A-test-key-abcdefghijklmnopqrstuvwxyz012345';
const hash=value=>createHash('sha256').update(value).digest('hex');
const policy=()=>[{id:'teacher-a',sha256:hash(token),tenantId:'school-a',
 permissions:['content:read','content:write'],expiresAt:Math.floor(Date.now()/1000)+3600}];
test('scoped tokens never inherit legacy master authority or cross tenant boundaries',()=>{
 const a=createLtiAdminAuthorizer({masterToken:root,scopedKeys:policy()});
 assert.equal(a.hasScopedConfig,true);
 assert.throws(()=>a.authenticate('Bearer '+root),/ADMIN_DENIED/);
 const actor=a.authenticate('Bearer '+token);
 assert.equal(actor.tenantId,'school-a');
 assert.doesNotThrow(()=>a.requirePermission(actor,'content:write','school-a'));
 assert.throws(()=>a.requirePermission(actor,'grades:approve','school-a'),/ADMIN_DENIED/);
 assert.throws(()=>a.requirePermission(actor,'content:read','school-b'),/ADMIN_DENIED/);
 assert.deepEqual(a.filterTenant(actor,[
  {tenantId:'school-a',id:'a'},{tenantId:'school-b',id:'b'}],'content:read'),
  [{tenantId:'school-a',id:'a'}]);
 assert.throws(()=>a.authenticate('Bearer invalid'),/ADMIN_DENIED/);
});
test('disabled, expired, duplicated and weak scoped credentials fail closed',()=>{
 for(const overrides of [
  {expiresAt:1},{revoked:true}
 ]){
  const a=createLtiAdminAuthorizer({masterToken:root,scopedKeys:[
   {...policy()[0],...overrides}
  ]});
  assert.throws(()=>a.authenticate('Bearer '+token),/ADMIN_DENIED/);
 }
 const base=policy()[0];
 assert.throws(()=>createLtiAdminAuthorizer({masterToken:root,scopedKeys:[
  base,{...base,id:'second'}
 ]}),/Invalid LTI scoped admin policy/);
 assert.throws(()=>createLtiAdminAuthorizer({masterToken:root,scopedKeys:[
  {...base,permissions:['grades:approve','unknown:permission']}
 ]}),/Invalid LTI scoped admin policy/);
 assert.throws(()=>createLtiAdminAuthorizer({masterToken:root,scopedKeys:[
  {...base,sha256:hash(root)}
 ]}),/Legacy master secret/);
});
test('legacy master remains compatible only until a scoped policy is explicitly installed',()=>{
 const legacy=createLtiAdminAuthorizer({masterToken:root});
 const actor=legacy.authenticate('Bearer '+root);
 legacy.requirePermission(actor,'grades:approve','any-school');
 const locked=createLtiAdminAuthorizer({masterToken:root,scopedKeys:[]});
 assert.throws(()=>locked.authenticate('Bearer '+root),/ADMIN_DENIED/);
});

test('live LTI HTTP administration filters other tenants and prevents cross-scope actions',async()=>{
 const rootDir=mkdtempSync(join(tmpdir(),'p2lrn-auth-scoped-'));
 const pair=generateKeyPairSync('rsa',{modulusLength:2048});
 const writer='writer-A-abcdefghijklmnopqrstuvwxyz0123456789';
 const viewer='viewer-A-abcdefghijklmnopqrstuvwxyz0123456789';
 const policies=[
  {id:'writer-a',sha256:hash(writer),tenantId:'school-a',
   permissions:['platform:write','platform:read'],expiresAt:Math.floor(Date.now()/1000)+3600},
  {id:'viewer-a',sha256:hash(viewer),tenantId:'school-a',
   permissions:['platform:read','content:read'],expiresAt:Math.floor(Date.now()/1000)+3600}
 ];
 const server=createP2LRNLtiServer({dataDir:rootDir,baseUrl:'https://p2lrn.example',
  tool:{privateKeyPem:pair.privateKey.export({format:'pem',type:'pkcs8'}),kid:'tool-test'},
  adminToken:root,adminScopes:policies,port:0});
 const registration=(id,tenantId)=>({
  id,tenantId,issuer:'https://'+id+'.school.example',clientId:'app',
  authUrl:'https://'+id+'.school.example/auth',tokenUrl:'https://'+id+'.school.example/token',
  launchUrl:'https://p2lrn.example/lti/launch',deepLinkLaunchUrl:'https://p2lrn.example/lti/deep-link',
  deployments:['D1'],deepLinkReturnOrigins:['https://'+id+'.school.example'],status:'ACTIVE',
  jwks:{keys:[{...pair.publicKey.export({format:'jwk'}),kid:'platform',use:'sig',alg:'RS256'}]}
 });
 try{
  server.store.upsertPlatform(registration('school-a','school-a'));
  server.store.upsertPlatform(registration('school-b','school-b'));
  const addr=await server.listen(0),url='http://127.0.0.1:'+addr.port;
  const req=(path,t,opts={})=>fetch(url+path,{...opts,headers:{
   ...(t?{authorization:'Bearer '+t}:{}),...(opts.headers||{})
  }});
  const visible=await req('/lti/admin/platforms',viewer);
  assert.equal(visible.status,200);
  assert.deepEqual((await visible.json()).platforms.map(x=>x.id),['school-a']);
  assert.equal((await req('/lti/admin/platforms',root)).status,403);
  assert.equal((await req('/lti/admin/catalog/school-b',viewer)).status,403);
  assert.equal((await req('/lti/admin/ags/pending',viewer)).status,403);
  const wrong=await req('/lti/admin/platforms',writer,{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(registration('school-c','school-c'))
  });
  assert.equal(wrong.status,403);
  assert.equal(server.store.getRegistrationById('school-c'),null);
 }finally{await server.close();rmSync(rootDir,{recursive:true,force:true})}
});
