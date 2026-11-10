// One owned connection per LTI store, with SQL transactions preserved across
// the legacy synchronous store interface. External engines never fall back.
import {workerData} from 'node:worker_threads';

const {engine,connectionString,port,readyBuffer}=workerData;
const readyFlag=new Int32Array(readyBuffer);
let closed=false;

function signal(message,flag){
 port.postMessage(message);
 Atomics.store(flag,0,1);
 Atomics.notify(flag,0);
}
function asDbError(error){
 // Connection strings/credentials never cross the worker boundary.
 return {code:String(error?.code||'LTI_SQL_ERROR').slice(0,80),
  message:String(error?.message||'SQL request failed')
   .replaceAll(connectionString,'[DATABASE_URL_REDACTED]').slice(0,600)};
}
function postgresQuery(sql,args=[]){
 let i=0;
 // SQL in this module is authored by the Provider and all user values are
 // supplied separately, never concatenated into the statement.
 const transformed=sql.replace(/\?/g,()=>'$'+(++i));
 if(i!==args.length)throw new Error('LTI_SQL_PARAMETER_MISMATCH');
 return transformed.replace(/^INSERT OR IGNORE INTO\b/i,'INSERT INTO')
  .replace(/^INSERT INTO ([\s\S]+)$/i,(whole,tail)=>
   /^INSERT OR IGNORE INTO\b/i.test(sql)?'INSERT INTO '+tail+' ON CONFLICT DO NOTHING':whole);
}
async function postgresEngine(){
 const module=await import('pg');
 const {Client}=module.default||module;
 const url=new URL(connectionString);
 if(!['postgresql:','postgres:'].includes(url.protocol)||!url.hostname||
    !url.pathname||url.pathname==='/')throw new Error('LTI_INVALID_POSTGRES_URL');
 const client=new Client({connectionString,connectionTimeoutMillis:15000,
  statement_timeout:20000,query_timeout:25000,application_name:'p2lrn-lti'});
 await client.connect();
 return {
  async exec(statement){
   const stmt=statement.trim();
   if(/^PRAGMA (?:journal_mode|foreign_keys|busy_timeout)/i.test(stmt))return;
   if(/^BEGIN IMMEDIATE$/i.test(stmt)){
    await client.query('BEGIN');
    try{
     // Serialize critical read-modify-write sequences across all P2LRN
     // processes sharing this PostgreSQL database.
     await client.query('SELECT pg_advisory_xact_lock(842173019)');
    }catch(e){await client.query('ROLLBACK');throw e;}
    return;
   }
   await client.query(stmt);
  },
  async query(action,statement,args){
   if(/^PRAGMA table_info\(([a-z_]+)\)$/i.test(statement)){
    const table=/^PRAGMA table_info\(([a-z_]+)\)$/i.exec(statement)[1];
    const result=await client.query(
     'SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',
     [table]);
    return action==='all'?result.rows:action==='get'?result.rows[0]||null:{changes:0};
   }
   const prepared=postgresQuery(statement,args);
   const result=await client.query(prepared
    .replace('revision=revision+1','revision=snapshots.revision+1')
    .replace('requests=requests+1','requests=security_buckets.requests+1'),args);
   if(action==='run')return {changes:result.rowCount??0};
   if(action==='get')return result.rows[0]??null;
   if(action==='all')return result.rows;
   throw new Error('LTI_SQL_INVALID_ACTION');
  },
  async close(){await client.end()}
 };
}

let database;
try{
 if(engine==='postgres')database=await postgresEngine();
 else if(engine==='mysql'||engine==='mariadb'){
  const {createMysqlEngine}=await import('./lti-mysql-connection.mjs');
  database=await createMysqlEngine(engine,connectionString);
 }else if(engine==='sqlserver'){
  const {createSqlserverEngine}=await import('./lti-sqlserver-connection.mjs');
  database=await createSqlserverEngine(connectionString);
 }else throw new Error('LTI_UNIMPLEMENTED_SQL_DIALECT');
 signal({ready:true,engine},readyFlag);
}catch(err){
 signal({ready:false,...asDbError(err)},readyFlag);
 port.close();
}

if(database){
 port.on('message',async ({id,action,statement,args,flagBuffer})=>{
  const flag=new Int32Array(flagBuffer);
  try{
   if(closed)throw new Error('LTI_DATABASE_ALREADY_CLOSED');
   let value=null;
   if(action==='exec')await database.exec(statement);
   else if(action==='close'){closed=true;await database.close();}
   else if(['run','get','all'].includes(action)){
    value=await database.query(action,statement,args||[]);
   }else throw new Error('LTI_SQL_INVALID_ACTION');
   signal({id,ok:true,value},flag);
   if(action==='close')port.close();
  }catch(e){signal({id,ok:false,...asDbError(e)},flag);}
 });
}
