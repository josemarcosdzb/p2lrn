// Existing SQLite API, backed by a dedicated SQL worker when an external
// database is selected. No SQL engine is silently mapped back to SQLite.
import {DatabaseSync} from 'node:sqlite';
import {Worker,MessageChannel,receiveMessageOnPort} from 'node:worker_threads';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

const ENGINES=new Set(['sqlite','postgres','mysql','mariadb','sqlserver']);
const WAIT_LIMIT=30000;

export function openLtiDatabase(filename,{
 engine=process.env.P2LRN_LTI_DB_ENGINE||'sqlite',
 connectionString=process.env.P2LRN_LTI_DB_URL
}={}){
 if(!ENGINES.has(engine))throw new Error('Unsupported P2LRN LTI database engine: '+engine);
 if(engine==='sqlite'){
  if(typeof filename!=='string'||!filename.trim())throw new TypeError('Missing SQLite file');
  mkdirSync(dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename,{timeout:5000});
  return db;
 }
 if(typeof connectionString!=='string'||!connectionString.trim())
  throw new Error('P2LRN_LTI_DB_URL must be set for '+engine);
 // A worker owns one physical SQL connection. All queries and transactions
 // execute in order, preserving BEGIN/COMMIT boundaries in the current store.
 const {port1,port2}=new MessageChannel();
 const ready=new Int32Array(new SharedArrayBuffer(4));
 const worker=new Worker(new URL('./lti-database-worker.mjs',import.meta.url),{
  workerData:{engine,connectionString,port:port2,readyBuffer:ready.buffer},
  transferList:[port2]
 });
 let sequence=0,closed=false;
 const exchange=(action,statement,args=[])=>{
  if(closed)throw new Error('LTI_DB_CLOSED');
  if(args.length>128)throw new Error('LTI_DB_PARAMETER_LIMIT');
  const flag=new Int32Array(new SharedArrayBuffer(4));
  const id=++sequence;
  port1.postMessage({id,action,statement,args,flagBuffer:flag.buffer});
  const result=Atomics.wait(flag,0,0,WAIT_LIMIT);
  if(result==='timed-out'){
   closed=true;worker.terminate();port1.close();
   throw new Error('LTI_DATABASE_TIMEOUT');
  }
  const reply=receiveMessageOnPort(port1)?.message;
  if(!reply||reply.id!==id){
   closed=true;worker.terminate();port1.close();
   throw new Error('LTI_DATABASE_PROTOCOL_ERROR');
  }
  if(!reply.ok){
   const error=new Error(reply.message||'LTI database operation failed');
   error.code=reply.code||'LTI_DATABASE_ERROR';
   throw error;
  }
  return reply.value;
 };
 // The startup is a real network handshake, not a backend capability flag.
 const state=Atomics.wait(ready,0,0,WAIT_LIMIT);
 if(state==='timed-out'){
  closed=true;worker.terminate();port1.close();
  throw new Error('LTI_DATABASE_CONNECT_TIMEOUT');
 }
 const greeting=receiveMessageOnPort(port1)?.message;
 if(!greeting?.ready||greeting.engine!==engine){
  closed=true;worker.terminate();port1.close();
  throw new Error('LTI_DATABASE_CONNECT_FAILED'+(greeting?.code?': '+greeting.code:''));
 }
 return Object.freeze({
  exec(sql){exchange('exec',sql)},
  prepare(sql){
   if(typeof sql!=='string'||sql.length>20000)throw new TypeError('Invalid SQL statement');
   return Object.freeze({
    run(...args){return exchange('run',sql,args)},
    get(...args){return exchange('get',sql,args)},
    all(...args){return exchange('all',sql,args)}
   });
  },
  close(){
   if(closed)return;
   try{exchange('close','');}finally{
    closed=true;port1.close();worker.terminate();
   }
  },
  engine
 });
}
