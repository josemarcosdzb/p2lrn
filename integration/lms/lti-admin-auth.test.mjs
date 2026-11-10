import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
