// Durable LTI 1.3 storage. Node 22.13+ built-in SQLite, independent of AulaP2P.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
const J=JSON.stringify, P=s=>s==null?null:JSON.parse(s), t=()=>Math.floor(Date.now()/1000);
const req=(v,n)=>{if(typeof v!=='string'||!v.trim()||v.length>4096)throw new TypeError('Invalid '+n);return v;};
export function createLtiStore(filename){
 mkdirSync(dirname(req(filename,'database path')),{recursive:true});
 const db=new DatabaseSync(filename,{timeout:5000});
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 db.exec([
 'CREATE TABLE IF NOT EXISTS platforms(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,issuer TEXT NOT NULL,client_id TEXT NOT NULL,auth_url TEXT NOT NULL,launch_url TEXT NOT NULL,deep_link_launch_url TEXT,token_url TEXT NOT NULL,jwks_json TEXT NOT NULL,deployments_json TEXT NOT NULL,origins_json TEXT NOT NULL,status TEXT NOT NULL,UNIQUE(issuer,client_id))',
 'CREATE TABLE IF NOT EXISTS oidc(state_hash TEXT PRIMARY KEY,nonce_hash TEXT NOT NULL,browser_hash TEXT NOT NULL,issuer TEXT NOT NULL,client_id TEXT NOT NULL,registration_id TEXT NOT NULL,deployment_hint TEXT,target_link_uri TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed_at INTEGER)',
 'CREATE TABLE IF NOT EXISTS catalog(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,title TEXT NOT NULL,package_id TEXT NOT NULL,content_root TEXT NOT NULL,sha TEXT NOT NULL,filename TEXT NOT NULL,bytes INTEGER NOT NULL,entities_json TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(tenant_id,sha))',
 'CREATE TABLE IF NOT EXISTS bindings(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,registration_id TEXT NOT NULL,deployment_id TEXT NOT NULL,catalog_id TEXT NOT NULL,entity_id TEXT NOT NULL,status TEXT NOT NULL,FOREIGN KEY(catalog_id) REFERENCES catalog(id))',
 'CREATE TABLE IF NOT EXISTS pickers(ticket_hash TEXT PRIMARY KEY,registration_id TEXT NOT NULL,tenant_id TEXT NOT NULL,deployment_id TEXT NOT NULL,return_url TEXT NOT NULL,lti_data TEXT,expires_at INTEGER NOT NULL,consumed_at INTEGER)',
 'CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,binding_id TEXT NOT NULL,tenant_id TEXT NOT NULL,learner_key TEXT NOT NULL,subject TEXT NOT NULL,context_id TEXT NOT NULL,resource_link_id TEXT NOT NULL,ags_json TEXT,status TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,FOREIGN KEY(binding_id) REFERENCES bindings(id))',
 "CREATE UNIQUE INDEX IF NOT EXISTS attempts_active ON attempts(binding_id,learner_key,context_id) WHERE status='IN_PROGRESS'",
 'CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,attempt_id TEXT NOT NULL,csrf_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER,FOREIGN KEY(attempt_id) REFERENCES attempts(id))',
 'CREATE TABLE IF NOT EXISTS snapshots(attempt_id TEXT NOT NULL,entity_id TEXT NOT NULL,surface TEXT NOT NULL,value_json TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(attempt_id,entity_id,surface))',
 'CREATE TABLE IF NOT EXISTS events(attempt_id TEXT NOT NULL,event_id TEXT NOT NULL,entity_id TEXT NOT NULL,event_json TEXT NOT NULL,received_at INTEGER NOT NULL,PRIMARY KEY(attempt_id,event_id))',
 'CREATE TABLE IF NOT EXISTS assessments(attempt_id TEXT PRIMARY KEY,normalized REAL NOT NULL,completed INTEGER NOT NULL,approved INTEGER NOT NULL,approved_at INTEGER,updated_at INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS ags_outbox(id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL,score_hash TEXT NOT NULL,payload_json TEXT NOT NULL,status TEXT NOT NULL,tries INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(attempt_id,score_hash))'
 ].join(';\n')+';');
 const sql=q=>db.prepare(q);
 function upsertPlatform(r){
  for(const field of ['id','tenantId','issuer','clientId','authUrl','launchUrl','tokenUrl'])req(r[field],field);
  if(!['ACTIVE','DISABLED'].includes(r.status)||!Array.isArray(r.deployments)||!r.deployments.length||
     !Array.isArray(r.jwks?.keys)||!r.jwks.keys.length||!Array.isArray(r.deepLinkReturnOrigins))
    throw new TypeError('Invalid trusted platform registration');
  sql('INSERT INTO platforms VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET tenant_id=excluded.tenant_id,issuer=excluded.issuer,client_id=excluded.client_id,auth_url=excluded.auth_url,launch_url=excluded.launch_url,deep_link_launch_url=excluded.deep_link_launch_url,token_url=excluded.token_url,jwks_json=excluded.jwks_json,deployments_json=excluded.deployments_json,origins_json=excluded.origins_json,status=excluded.status').run(r.id,r.tenantId,r.issuer,r.clientId,r.authUrl,r.launchUrl,r.deepLinkLaunchUrl??null,r.tokenUrl,J(r.jwks),J(r.deployments),J(r.deepLinkReturnOrigins),r.status);
  return r.id;
 }
 const decodeReg=r=>r?{id:r.id,tenantId:r.tenant_id,issuer:r.issuer,clientId:r.client_id,authUrl:r.auth_url,launchUrl:r.launch_url,deepLinkLaunchUrl:r.deep_link_launch_url??undefined,tokenUrl:r.token_url,jwks:P(r.jwks_json),deployments:P(r.deployments_json),deepLinkReturnOrigins:P(r.origins_json),status:r.status}:null;
 const getRegistration=({issuer,clientId})=>decodeReg(sql('SELECT * FROM platforms WHERE issuer=? AND client_id=?').get(issuer,clientId));
 const getRegistrationById=id=>decodeReg(sql('SELECT * FROM platforms WHERE id=?').get(id));
 const listPlatforms=()=>sql('SELECT id,tenant_id,issuer,client_id,auth_url,launch_url,deep_link_launch_url,token_url,deployments_json,status FROM platforms ORDER BY tenant_id,id').all().map(r=>({id:r.id,tenantId:r.tenant_id,issuer:r.issuer,clientId:r.client_id,authUrl:r.auth_url,launchUrl:r.launch_url,deepLinkLaunchUrl:r.deep_link_launch_url,tokenUrl:r.token_url,deployments:P(r.deployments_json),status:r.status}));
 const transactions={
  create(v){sql('INSERT INTO oidc(state_hash,nonce_hash,browser_hash,issuer,client_id,registration_id,deployment_hint,target_link_uri,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').run(v.stateHash,v.nonceHash,v.browserHash,v.issuer,v.clientId,v.registrationId,v.deploymentHint,v.targetLinkUri,v.expiresAt);},
  consume(hash){const r=sql('UPDATE oidc SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL AND expires_at>? RETURNING *').get(t(),hash,t());return r?{nonceHash:r.nonce_hash,browserHash:r.browser_hash,issuer:r.issuer,clientId:r.client_id,registrationId:r.registration_id,deploymentHint:r.deployment_hint,targetLinkUri:r.target_link_uri,expiresAt:r.expires_at}:null;}
 };
 function publishPackage(c){
  for(const field of ['tenantId','title','packageId','contentRoot','sha','filename'])req(c[field],field);
  if(!Array.isArray(c.entities)||!c.entities.length||!Number.isSafeInteger(c.bytes)||c.bytes<1)throw new TypeError('Invalid P2LRN catalogue');
  sql("INSERT INTO catalog VALUES(?,?,?,?,?,?,?,?,?,'PUBLISHED',?) ON CONFLICT(tenant_id,sha) DO UPDATE SET title=excluded.title").run(c.id??randomUUID(),c.tenantId,c.title,c.packageId,c.contentRoot,c.sha,c.filename,c.bytes,J(c.entities),t());
  return sql('SELECT id FROM catalog WHERE tenant_id=? AND sha=?').get(c.tenantId,c.sha).id;
 }
 const getCatalog=(id,tenantId)=>sql("SELECT * FROM catalog WHERE id=? AND tenant_id=? AND status='PUBLISHED'").get(id,tenantId);
 const listCatalog=tenantId=>sql("SELECT * FROM catalog WHERE tenant_id=? AND status='PUBLISHED' ORDER BY created_at DESC").all(tenantId).map(r=>({id:r.id,tenantId:r.tenant_id,title:r.title,packageId:r.package_id,contentRoot:r.content_root,entities:P(r.entities_json)}));
 function createBinding({tenantId,registrationId,deploymentId,catalogId,entityId,id}){
  const c=getCatalog(catalogId,tenantId),r=getRegistrationById(registrationId);
  if(!c||!P(c.entities_json).some(x=>x.id===entityId)||r?.status!=='ACTIVE'||
     r.tenantId!==tenantId||!r.deployments.includes(deploymentId))throw new Error('Unapproved P2LRN selection or LMS deployment');
  const bindingId=id??(randomUUID().replaceAll('-','')+randomUUID().replaceAll('-',''));
  sql("INSERT INTO bindings VALUES(?,?,?,?,?,?,'PUBLISHED')").run(bindingId,tenantId,registrationId,deploymentId,catalogId,entityId);
  return bindingId;
 }
 function getBinding({id,tenantId,registrationId,deploymentId}){
  const r=sql("SELECT b.*,c.package_id,c.content_root,c.entities_json,c.filename,c.bytes FROM bindings b JOIN catalog c ON c.id=b.catalog_id WHERE b.id=? AND b.tenant_id=? AND b.registration_id=? AND b.deployment_id=? AND b.status='PUBLISHED' AND c.status='PUBLISHED'").get(id,tenantId,registrationId,deploymentId);
  if(!r||!P(r.entities_json).some(x=>x.id===r.entity_id))return null;
  return {id:r.id,tenantId:r.tenant_id,registrationId:r.registration_id,deploymentId:r.deployment_id,packageId:r.package_id,contentRoot:r.content_root,entityId:r.entity_id,status:'PUBLISHED',catalogId:r.catalog_id,entities:P(r.entities_json),filename:r.filename,bytes:r.bytes};
 }
 const createPicker=p=>sql('INSERT INTO pickers VALUES(?,?,?,?,?,?,?,NULL)').run(p.ticketHash,p.registrationId,p.tenantId,p.deploymentId,p.returnUrl,p.ltiData??null,p.expiresAt);
 const consumePicker=hash=>{let r=sql('UPDATE pickers SET consumed_at=? WHERE ticket_hash=? AND consumed_at IS NULL AND expires_at>? RETURNING *').get(t(),hash,t());return r?{registrationId:r.registration_id,tenantId:r.tenant_id,deploymentId:r.deployment_id,returnUrl:r.return_url,ltiData:r.lti_data}:null;};
 function attachLaunch({launch,ags,tokenHash,csrfHash,expiresAt}){
  const b=getBinding({id:launch.bindingId,tenantId:launch.tenantId,registrationId:launch.registrationId,deploymentId:launch.deploymentId});
  if(!b||b.packageId!==launch.packageId||b.contentRoot!==launch.contentRoot||b.entityId!==launch.entityId)throw new Error('P2LRN content authorization changed');
  db.exec('BEGIN IMMEDIATE');
  try{
   const id=randomUUID();
   const result=sql("INSERT INTO attempts(id,binding_id,tenant_id,learner_key,subject,context_id,resource_link_id,ags_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'IN_PROGRESS',?,?) ON CONFLICT(binding_id,learner_key,context_id) WHERE status='IN_PROGRESS' DO UPDATE SET subject=excluded.subject,resource_link_id=excluded.resource_link_id,ags_json=excluded.ags_json,updated_at=excluded.updated_at RETURNING id").get(id,launch.bindingId,launch.tenantId,launch.learnerKey,launch.platformSubject,launch.contextId??'',launch.resourceLinkId,J(ags??null),t(),t());
   sql('INSERT INTO sessions VALUES(?,?,?,?,NULL)').run(tokenHash,result.id,csrfHash,expiresAt);
   db.exec('COMMIT');return {attemptId:result.id,expiresAt};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function getSession(hash){
  const r=sql("SELECT s.csrf_hash,s.expires_at,a.*,b.entity_id,c.package_id,c.content_root,c.entities_json,c.filename,c.bytes FROM sessions s JOIN attempts a ON a.id=s.attempt_id JOIN bindings b ON b.id=a.binding_id JOIN catalog c ON c.id=b.catalog_id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND a.status='IN_PROGRESS' AND b.status='PUBLISHED' AND c.status='PUBLISHED'").get(hash,t());
  return r?{attemptId:r.id,tenantId:r.tenant_id,bindingId:r.binding_id,subject:r.subject,ags:P(r.ags_json),packageId:r.package_id,contentRoot:r.content_root,entityId:r.entity_id,entities:P(r.entities_json),filename:r.filename,bytes:r.bytes,csrfHash:r.csrf_hash,expiresAt:r.expires_at}:null;
 }
 const getState=(a,e,s)=>{const r=sql('SELECT value_json,revision FROM snapshots WHERE attempt_id=? AND entity_id=? AND surface=?').get(a,e,s);return r?{value:P(r.value_json),revision:r.revision}:{value:null,revision:0};};
 function saveState(a,e,s,v,expectedRevision){
  db.exec('BEGIN IMMEDIATE');
  try{
   const prev=getState(a,e,s);
   if(expectedRevision!==undefined&&prev.revision!==expectedRevision){db.exec('ROLLBACK');return {saved:false,conflict:true,revision:prev.revision};}
   sql('INSERT INTO snapshots VALUES(?,?,?,?,1,?) ON CONFLICT(attempt_id,entity_id,surface) DO UPDATE SET value_json=excluded.value_json,revision=revision+1,updated_at=excluded.updated_at').run(a,e,s,J(v),t());
   const revision=getState(a,e,s).revision;db.exec('COMMIT');return {saved:true,revision};
  }catch(err){try{db.exec('ROLLBACK');}catch{}throw err;}
 }
 const appendEvent=(a,id,e,v)=>({saved:sql('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?)').run(a,id,e,J(v),t()).changes>0,authoritative:false});
 const observeScore=(a,n,completed)=>{
  sql('INSERT INTO assessments VALUES(?,?,?,0,NULL,?) ON CONFLICT(attempt_id) DO UPDATE SET normalized=excluded.normalized,completed=excluded.completed,approved=0,approved_at=NULL,updated_at=excluded.updated_at').run(a,n,completed?1:0,t());
  return {received:true,authoritative:false,gradeSent:false};
 };
 function approveScore(attemptId,n,completed,scoreHash,payload){
  db.exec('BEGIN IMMEDIATE');
  try{
   if(!sql("SELECT id FROM attempts WHERE id=? AND status='IN_PROGRESS'").get(attemptId))throw new Error('Unknown active LTI attempt');
   sql('INSERT INTO assessments VALUES(?,?,?,1,?,?) ON CONFLICT(attempt_id) DO UPDATE SET normalized=excluded.normalized,completed=excluded.completed,approved=1,approved_at=excluded.approved_at,updated_at=excluded.updated_at').run(attemptId,n,completed?1:0,t(),t());
   sql("INSERT OR IGNORE INTO ags_outbox(id,attempt_id,score_hash,payload_json,status,tries,last_error,created_at,updated_at) VALUES(?,?,?,?,'PENDING',0,NULL,?,?)").run(randomUUID(),attemptId,scoreHash,J(payload),t(),t());
   const row=sql('SELECT id,status FROM ags_outbox WHERE attempt_id=? AND score_hash=?').get(attemptId,scoreHash);
   db.exec('COMMIT');return row;
  }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
 }
 function outboxById(id){
  const r=sql('SELECT o.*,a.ags_json,a.subject,p.token_url,p.client_id,p.issuer FROM ags_outbox o JOIN attempts a ON a.id=o.attempt_id JOIN bindings b ON b.id=a.binding_id JOIN platforms p ON p.id=b.registration_id WHERE o.id=?').get(id);
  return r?{id:r.id,attemptId:r.attempt_id,status:r.status,tries:r.tries,payload:P(r.payload_json),ags:P(r.ags_json),subject:r.subject,tokenUrl:r.token_url,clientId:r.client_id,issuer:r.issuer}:null;
 }
 const markOutbox=(id,status,error=null)=>sql('UPDATE ags_outbox SET status=?,tries=tries+1,last_error=?,updated_at=? WHERE id=?').run(status,error,t(),id);
 const listPending=()=>sql("SELECT id FROM ags_outbox WHERE status='PENDING' ORDER BY created_at LIMIT 50").all().map(r=>r.id);
 const count=name=>{if(!['platforms','catalog','bindings','attempts','sessions','ags_outbox'].includes(name))throw new TypeError('Unknown table');return Number(sql('SELECT count(*) AS n FROM '+name).get().n);};
 return Object.freeze({close:()=>db.close(),upsertPlatform,getRegistration,getRegistrationById,listPlatforms,transactions,
 publishPackage,getCatalog,listCatalog,createBinding,getBinding,createPicker,consumePicker,attachLaunch,getSession,
 getState,saveState,appendEvent,observeScore,approveScore,outboxById,markOutbox,listPending,count});
}
