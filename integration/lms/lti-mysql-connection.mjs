// Real MariaDB and MySQL connections using their native Node.js client drivers.
// No local SQLite intermediary or data mirroring is involved.
import {mysqlSchemas,mysqlTranslate} from './lti-mysql-dialect.mjs';

export async function createMysqlEngine(engine,connectionString){
 if(engine!=='mysql'&&engine!=='mariadb')throw new TypeError('Invalid MySQL family engine');
 const uri=new URL(connectionString);
 if(!['mysql:','mariadb:'].includes(uri.protocol)||!uri.hostname||
    !uri.pathname||uri.pathname==='/')throw new Error('LTI_MYSQL_INVALID_CONNECTION');
 const config={
  host:uri.hostname,port:Number(uri.port||3306),
  user:decodeURIComponent(uri.username),password:decodeURIComponent(uri.password),
  database:decodeURIComponent(uri.pathname.slice(1)),connectTimeout:15000,
  charset:'utf8mb4'
 };
 const withTls=uri.searchParams.get('ssl')==='true';
 if(withTls)config.ssl={rejectUnauthorized:true};
 // Avoid relying on a vendor-specific compatibility mode. Both connectors
 // return driver-native affected-row metadata, normalized below.
 let conn,kind=engine;
 if(engine==='mysql'){
  const driver=await import('mysql2/promise');
  conn=await driver.createConnection(config);
 }else{
  const driver=(await import('mariadb')).default;
  conn=await driver.createConnection({...config,
   multipleStatements:false,bigIntAsNumber:true});
 }
 const columnsByTable=new Map();
 const query=async(statement,args=[])=>{
  const result=await conn.query(statement,args);
  if(kind==='mysql'){
   const [rows]=result;
   return Array.isArray(rows)?{rows,changes:0}:
    {rows:[],changes:Number(rows.affectedRows??0)};
  }
  return Array.isArray(result)?{rows:Array.from(result),changes:0}:
   {rows:[],changes:Number(result.affectedRows??0)};
 };
 let inTransaction=false,lockHeld=false;
 async function releaseLock(){
  if(!lockHeld)return;
  lockHeld=false;
  await query("SELECT RELEASE_LOCK('p2lrn_lti_store_write')");
 }
 return {
  async exec(sql){
   const statement=sql.trim();
   if(/^PRAGMA (?:journal_mode|foreign_keys|busy_timeout)/i.test(statement))return;
   if(/^CREATE TABLE IF NOT EXISTS platforms\(/i.test(statement)){
    const ddl=mysqlSchemas(statement,columnsByTable);
    for(const create of ddl)await query(create);
    return;
   }
   if(/^CREATE TABLE IF NOT EXISTS canvas_dynamic_platforms\(/i.test(statement)){
    for(const create of mysqlSchemas(statement,columnsByTable))await query(create);
    return;
   }
   if(/^BEGIN IMMEDIATE$/i.test(statement)){
    if(inTransaction)throw new Error('LTI_SQL_NESTED_TRANSACTION');
    const lock=await query("SELECT GET_LOCK('p2lrn_lti_store_write',15) AS locked");
    if(Number(lock.rows[0]?.locked)!==1)throw new Error('LTI_SQL_LOCK_TIMEOUT');
    lockHeld=true;
    try{await conn.beginTransaction();inTransaction=true;}
    catch(e){await releaseLock();throw e;}
    return;
   }
   if(/^COMMIT$/i.test(statement)){
    try{await conn.commit();inTransaction=false;}
    finally{await releaseLock()}
    return;
   }
   if(/^ROLLBACK$/i.test(statement)){
    try{if(inTransaction)await conn.rollback();inTransaction=false;}
    finally{await releaseLock()}
    return;
   }
   if(/^DROP INDEX IF EXISTS attempts_active$/i.test(statement)||
      /^CREATE UNIQUE INDEX IF NOT EXISTS attempts_active_role /i.test(statement))
    return; // Native generated-column unique index enforces the same invariant.
   const alter=/^ALTER TABLE (\w+) ADD COLUMN (\w+) (.+)$/i.exec(statement);
   if(alter){
    let type=alter[3];
    if(alter[2]==='access_profile')type="VARCHAR(64) NOT NULL DEFAULT 'legacy'";
    await query('ALTER TABLE '+alter[1]+' ADD COLUMN '+alter[2]+' '+type);
    return;
   }
   await query(statement);
  },
  async query(action,statement,args){
   if(/^PRAGMA table_info\(([a-z_]+)\)$/i.test(statement)){
    const table=/^PRAGMA table_info\(([a-z_]+)\)$/i.exec(statement)[1];
    const meta=await query('SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
    return action==='all'?meta.rows:action==='get'?meta.rows[0]??null:{changes:0};
   }
   const consuming=/^UPDATE (oidc|pickers) SET consumed_at=\? WHERE ([a-z_]+)=\? AND consumed_at IS NULL AND expires_at>\? RETURNING \*$/i.exec(statement);
   if(consuming){
    const [stamp,hash,expires]=args;
    const [table,key]=[consuming[1],consuming[2]];
    const update=await query('UPDATE '+table+' SET consumed_at=? WHERE '+key+'=? AND consumed_at IS NULL AND expires_at>?',[stamp,hash,expires]);
    if(update.changes!==1)return null;
    return (await query('SELECT * FROM '+table+' WHERE '+key+'=? AND consumed_at=?',[hash,stamp])).rows[0]??null;
   }
   const attemptReturn=/^INSERT INTO attempts\b[\s\S]* RETURNING id$/i.test(statement);
   let translated=mysqlTranslate(statement,columnsByTable);
   if(attemptReturn)translated=translated.replace(/ RETURNING id$/i,'');
   const result=await query(translated,args);
   if(attemptReturn){
    const [binding,learner,context,profile]=[args[1],args[3],args[5],args[10]];
    return (await query("SELECT id FROM attempts WHERE binding_id=? AND learner_key=? AND context_id=? AND access_profile=? AND status='IN_PROGRESS'",[binding,learner,context,profile])).rows[0]??null;
   }
   if(action==='run')return {changes:result.changes};
   if(action==='get')return result.rows[0]??null;
   if(action==='all')return result.rows;
   throw new Error('LTI_SQL_INVALID_ACTION');
  },
  async close(){
   try{if(inTransaction)await conn.rollback();}
   finally{await releaseLock();await conn.end();}
  }
 };
}
