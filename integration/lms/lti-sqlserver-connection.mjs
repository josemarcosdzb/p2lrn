// Native Microsoft SQL Server transport, using node-mssql/Tedious and a
// dedicated connection pool. Values are always bound as TDS parameters.
import {sqlserverSchemas,sqlserverTranslate} from './lti-sqlserver-dialect.mjs';

export async function createSqlserverEngine(connectionString){
 const uri=new URL(connectionString);
 if(uri.protocol!=='sqlserver:'||!uri.hostname||!uri.pathname||uri.pathname==='/')
  throw new Error('LTI_SQLSERVER_INVALID_CONNECTION');
 const sql=(await import('mssql')).default;
 const pool=new sql.ConnectionPool({
  server:uri.hostname,port:Number(uri.port||1433),
  user:decodeURIComponent(uri.username),password:decodeURIComponent(uri.password),
  database:decodeURIComponent(uri.pathname.slice(1)),
  options:{
   encrypt:uri.searchParams.get('encrypt')!=='false',
   trustServerCertificate:uri.searchParams.get('trustServerCertificate')==='true',
   enableArithAbort:true
  },
  pool:{min:0,max:3,idleTimeoutMillis:15000},
  connectionTimeout:15000,requestTimeout:20000
 });
 await pool.connect();
 const columnsByTable=new Map();
 let transaction=null;
 function request(args=[]){
  const r=new sql.Request(transaction||pool);
  for(let i=0;i<args.length;i++){
   // The driver infers NVARCHAR/INT/FLOAT from the actual parameter values.
   // Never inline values in SQL or interpolate user-supplied identifiers.
   r.input('p'+i,args[i]??null);
  }
  return r;
 }
 async function run(command,args=[]){
  const result=await request(args).query(command);
  return {
   rows:result.recordset||[],
   changes:Array.isArray(result.rowsAffected)?
    result.rowsAffected.reduce((a,b)=>a+Number(b||0),0):0
  };
 }
 return {
  async exec(command){
   const text=command.trim();
   if(/^PRAGMA (?:journal_mode|foreign_keys|busy_timeout)/i.test(text))return;
   if(/^CREATE TABLE IF NOT EXISTS platforms\(/i.test(text)||
      /^CREATE TABLE IF NOT EXISTS canvas_dynamic_platforms\(/i.test(text)){
    const ddl=sqlserverSchemas(text,columnsByTable);
    for(const statement of ddl)await run(statement);
    return;
   }
   if(/^BEGIN IMMEDIATE$/i.test(text)){
    if(transaction)throw new Error('LTI_SQL_NESTED_TRANSACTION');
    const tx=new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    transaction=tx;
    try{
     await run("DECLARE @lock_result INT; EXEC @lock_result = sp_getapplock "+
      "@Resource='p2lrn_lti_store_write',@LockMode='Exclusive',"+
      "@LockOwner='Transaction',@LockTimeout=15000; "+
      "IF @lock_result<0 THROW 50001,'LTI_SQL_LOCK_TIMEOUT',1");
    }catch(err){transaction=null;await tx.rollback();throw err;}
    return;
   }
   if(/^COMMIT$/i.test(text)){
    if(!transaction)throw new Error('LTI_SQL_NO_TRANSACTION');
    const tx=transaction;transaction=null;
    await tx.commit();return;
   }
   if(/^ROLLBACK$/i.test(text)){
    if(!transaction)throw new Error('LTI_SQL_NO_TRANSACTION');
    const tx=transaction;transaction=null;
    await tx.rollback();return;
   }
   if(/^DROP INDEX IF EXISTS attempts_active$/i.test(text)||
      /^CREATE UNIQUE INDEX IF NOT EXISTS attempts_active_role /i.test(text))
    return; // Native filtered/hash unique index enforces this constraint.
   const alter=/^ALTER TABLE (\w+) ADD COLUMN (\w+) (.+)$/i.exec(text);
   if(alter){
    let type=alter[3].replace(/\bTEXT\b/gi,'NVARCHAR(MAX)').replace(/\bINTEGER\b/gi,'INT');
    if(alter[2]==='access_profile')type="NVARCHAR(64) NOT NULL DEFAULT 'legacy'";
    await run('ALTER TABLE dbo.['+alter[1]+'] ADD ['+alter[2]+'] '+type);
    return;
   }
   await run(text);
  },
  async query(action,statement,args){
   const pragma=/^PRAGMA table_info\(([a-z_]+)\)$/i.exec(statement);
   if(pragma){
    const rows=(await run('SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=N'+
     "'dbo' AND TABLE_NAME=@p0",[pragma[1]])).rows;
    return action==='all'?rows:action==='get'?rows[0]??null:{changes:0};
   }
   const sqlCommand=sqlserverTranslate(statement,args,columnsByTable);
   const result=await run(sqlCommand,args);
   if(action==='run')return {changes:result.changes};
   if(action==='get')return result.rows[0]??null;
   if(action==='all')return result.rows;
   throw new Error('LTI_SQL_INVALID_ACTION');
  },
  async close(){
   if(transaction){
    const tx=transaction;transaction=null;
    await tx.rollback();
   }
   await pool.close();
  }
 };
}
