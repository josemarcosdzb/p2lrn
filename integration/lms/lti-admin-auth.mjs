// Explicit, tenant-bound authorization for the standalone LTI administration API.
// Config stores *hashes* of high-entropy API keys, never plaintext credentials.
import {createHash,timingSafeEqual} from 'node:crypto';

export const LTI_ADMIN_PERMISSIONS=Object.freeze([
 'platform:read','platform:write','content:read','content:write',
 'roster:read','grades:read','grades:approve','grades:retry'
]);
const allowed=new Set(LTI_ADMIN_PERMISSIONS);
const hashToken=value=>createHash('sha256').update(value).digest();
const denied=()=>{throw new Error('ADMIN_DENIED')};

export function createLtiAdminAuthorizer({masterToken,scopedKeys=null}={}){
 if(typeof masterToken!=='string'||Buffer.byteLength(masterToken)<32)
  throw new TypeError('Missing secure LTI administrative bootstrap secret');
 if(scopedKeys!==null&&!Array.isArray(scopedKeys))
  throw new TypeError('LTI scoped keys must be an array');
 const entries=[];
 const uniqueIds=new Set(),uniqueHashes=new Set();
 for(const item of scopedKeys||[]){
  const {id,sha256,tenantId,permissions,expiresAt,revoked=false}=item??{};
  if(typeof id!=='string'||!id||id.length>128||uniqueIds.has(id)||
     typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256)||uniqueHashes.has(sha256)||
     typeof tenantId!=='string'||!tenantId||tenantId.length>128||
     !Array.isArray(permissions)||!permissions.length||
     permissions.some(p=>!allowed.has(p))||
     typeof expiresAt!=='number'||!Number.isSafeInteger(expiresAt)||
     typeof revoked!=='boolean')
   throw new TypeError('Invalid LTI scoped admin policy');
  uniqueIds.add(id);uniqueHashes.add(sha256);
  if(timingSafeEqual(Buffer.from(sha256,'hex'),hashToken(masterToken)))
   throw new TypeError('Legacy master secret cannot be reused as scoped key');
  entries.push({id,hash:Buffer.from(sha256,'hex'),tenantId,
   permissions:new Set(permissions),expiresAt,revoked});
 }
 const masterHash=hashToken(masterToken),hasScopedConfig=scopedKeys!==null;
 const authenticate=authorization=>{
  if(typeof authorization!=='string'||!authorization.startsWith('Bearer ')||
     authorization.length>8192)return denied();
  const bearer=authorization.slice(7);
  // Short/invalid tokens are never accepted, regardless of hash equality.
  if(Buffer.byteLength(bearer)<32)return denied();
  const actual=hashToken(bearer);
  if(!hasScopedConfig&&timingSafeEqual(actual,masterHash))
   return Object.freeze({id:'legacy-master',tenantId:'*',permissions:new Set(LTI_ADMIN_PERMISSIONS)});
  let match=null;
  for(const entry of entries){
   if(timingSafeEqual(actual,entry.hash))match=entry;
  }
  if(!match||match.revoked||match.expiresAt<=Math.floor(Date.now()/1000))return denied();
  return Object.freeze({id:match.id,tenantId:match.tenantId,permissions:match.permissions});
 };
 const requirePermission=(identity,permission,tenantId)=>{
  if(!allowed.has(permission)||!identity?.permissions?.has(permission)||
     typeof tenantId!=='string'||!tenantId||
     (identity.tenantId!=='*'&&identity.tenantId!==tenantId))return denied();
 };
 const filterTenant=(identity,rows,permission)=>{
  if(!identity?.permissions?.has(permission))return denied();
  return identity.tenantId==='*'?rows:
   rows.filter(row=>row.tenantId===identity.tenantId);
 };
 return Object.freeze({authenticate,requirePermission,filterTenant,hasScopedConfig});
}
