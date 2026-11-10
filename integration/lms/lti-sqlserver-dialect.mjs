// Native SQL Server 2022 relational schema and parameter-safe statement mapping.
// The source SQL is authored by P2LRN; all learner / platform data stay bound.
import {splitSqlParts} from './lti-mysql-dialect.mjs';

const GROUP_KEYS={
 platforms:['issuer','client_id'],
 snapshots:['attempt_id','entity_id','surface'],
 nrps_contexts:['registration_id','deployment_id','context_id']
};
const MIGRATED={
 platforms:"jwks_url NVARCHAR(MAX)",
 attempts:"access_profile NVARCHAR(64) NOT NULL DEFAULT 'legacy'",
 sessions:"can_read_roster INT NOT NULL DEFAULT 0,can_receive_grades INT NOT NULL DEFAULT 0"
};
const PK_TEXT=new Set([
 'id','state_hash','token_hash','ticket_hash','attempt_id','registration_id',
 'tenant_id','binding_id','learner_key','deployment_id','catalog_id','nonce_hash',
 'bucket_hash','sha','score_hash','event_id','consumer_key','access_profile'
]);
const IGNORE_KEYS={
 legacy_nonces:['registration_id','nonce_hash'],
 events:['attempt_id','event_id'],
 ags_outbox:['attempt_id','score_hash']
};
const quote=id=>{
 if(!/^[a-z_][a-z0-9_]{0,127}$/i.test(id))throw new Error('LTI_SQL_UNSAFE_IDENTIFIER');
 return '['+id+']';
};
function toColumn(clause){
 return clause.replace(/^([a-z_][a-z0-9_]*) (TEXT|INTEGER|REAL)\b/i,(_,name,type)=>
  quote(name)+' '+(type==='INTEGER'?'INT':type==='REAL'?'FLOAT':
  PK_TEXT.has(name)?'NVARCHAR(191)':'NVARCHAR(MAX)'));
}
function groupHash(keys){
 return "CONVERT(binary(32),HASHBYTES('SHA2_256',CONCAT("+
  keys.map(name=>"DATALENGTH("+quote(name)+"),':',"+quote(name)).join(',')+
  ")))";
}
export function sqlserverSchemas(sql,columnsByTable){
 const stmts=[];
 for(const statement of sql.split(/;\s*\n/).map(v=>v.trim().replace(/;$/,'')).filter(Boolean)){
  const match=/^CREATE TABLE IF NOT EXISTS (\w+)\(([\s\S]+)\)$/i.exec(statement);
  if(!match)throw new Error('LTI_SQL_INVALID_SCHEMA');
  const table=match[1],raw=splitSqlParts(match[2]);
  columnsByTable.set(table,raw.filter(item=>/^[a-z_][a-z0-9_]* (TEXT|INTEGER|REAL)\b/i.test(item))
   .map(item=>item.split(/\s+/)[0]));
  let parts=raw.map(toColumn);
  if(GROUP_KEYS[table]){
   parts=parts.filter(item=>!(table==='platforms'&&/^UNIQUE\(issuer,client_id\)$/i.test(item))&&
    !((table==='snapshots'||table==='nrps_contexts')&&/^PRIMARY KEY\(/i.test(item)));
  }
  if(MIGRATED[table])parts.push(...splitSqlParts(MIGRATED[table]));
  if(GROUP_KEYS[table])parts.push(quote('group_hash')+' AS '+groupHash(GROUP_KEYS[table])+' PERSISTED');
  if(table==='attempts'){
   parts.push(quote('active_hash')+
    " AS (CASE WHEN [status]='IN_PROGRESS' THEN "+
    groupHash(['binding_id','learner_key','context_id','access_profile'])+
    " ELSE NULL END) PERSISTED");
  }
  const source="IF OBJECT_ID(N'dbo."+table+"',N'U') IS NULL BEGIN "+
   'CREATE TABLE dbo.'+quote(table)+' ('+parts.join(', ')+'); END';
  stmts.push(source);
  if(GROUP_KEYS[table]){
   const key='uq_'+table+'_group_hash';
   stmts.push("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo."+
    table+"') AND name=N'"+key+"') CREATE UNIQUE INDEX "+quote(key)+
    ' ON dbo.'+quote(table)+'([group_hash])');
  }
  if(table==='attempts'){
   stmts.push("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.attempts') "+
    "AND name=N'uq_attempts_active_hash') CREATE UNIQUE INDEX [uq_attempts_active_hash] "+
    "ON dbo.[attempts]([active_hash]) WHERE [status]='IN_PROGRESS' AND [active_hash] IS NOT NULL");
  }
 }
 return stmts;
}
function placeholders(text,args){
 let i=0;
 const output=text.replace(/\?/g,()=> '@p'+i++);
 if(i!==args.length)throw new Error('LTI_SQL_PARAMETER_MISMATCH');
 return output;
}
function expandInsert(statement,columnsByTable){
 const regex=/^INSERT( OR IGNORE)? INTO (\w+)(?:\(([^)]*)\))? VALUES\(([^)]*)\)([\s\S]*)$/i;
 const match=regex.exec(statement);
 if(!match)throw new Error('LTI_SQL_UNKNOWN_INSERT_SHAPE');
 const table=match[2];
 const cols=match[3]?match[3].split(',').map(x=>x.trim()):
  columnsByTable.get(table);
 if(!cols)throw new Error('LTI_SQL_UNKNOWN_INSERT_TABLE');
 const values=splitSqlParts(match[4]);
 if(cols.length!==values.length)throw new Error('LTI_SQL_COLUMN_MISMATCH');
 return {ignore:Boolean(match[1]),table,cols,values,trailer:match[5].trim(),
  valuesByColumn:new Map(cols.map((name,i)=>[name,values[i]]))};
}
function conditions(keys,map){
 return keys.map(key=>{
  if(!map.has(key))throw new Error('LTI_SQL_MISSING_CONFLICT_COLUMN');
  return quote(key)+'='+map.get(key);
 }).join(' AND ');
}
function insertStatement(data){
 return 'INSERT INTO dbo.'+quote(data.table)+' ('+
  data.cols.map(quote).join(',')+') VALUES ('+data.values.join(',')+')';
}
function translateInsert(statement,columnsByTable){
 const data=expandInsert(statement,columnsByTable),insert=insertStatement(data);
 let trailer=data.trailer;
 const returning=/ RETURNING id$/i.test(trailer);
 if(returning)trailer=trailer.replace(/ RETURNING id$/i,'');
 const onConflict=/^ON CONFLICT\(([^)]*)\)(?: WHERE ([\s\S]*?))? DO (NOTHING|UPDATE SET ([\s\S]+))$/i.exec(trailer);
 if(!onConflict&&!data.ignore){
  if(trailer)throw new Error('LTI_SQL_UNSUPPORTED_INSERT');
  return insert;
 }
 const keys=onConflict?onConflict[1].split(',').map(x=>x.trim()):
  IGNORE_KEYS[data.table];
 if(!keys)throw new Error('LTI_SQL_UNKNOWN_IGNORE_KEYS');
 const base=conditions(keys,data.valuesByColumn);
 const predicate=base+(onConflict?.[2]?" AND ("+onConflict[2]+")":"");
 const table='dbo.'+quote(data.table);
 const exists='EXISTS (SELECT 1 FROM '+table+' WITH (UPDLOCK,HOLDLOCK) WHERE '+predicate+')';
 if(!onConflict||onConflict[3]==='NOTHING'){
  if(returning)throw new Error('LTI_SQL_UNSUPPORTED_RETURNING');
  return 'IF NOT '+exists+' '+insert;
 }
 let assignments=onConflict[4];
 const approvalGuard=/ WHERE assessments\.approved=0$/i.test(assignments);
 if(approvalGuard)assignments=assignments.replace(/ WHERE assessments\.approved=0$/i,'');
 const updates=splitSqlParts(assignments).map(item=>{
  const m=/^(\w+)=([\s\S]+)$/.exec(item);
  if(!m)throw new Error('LTI_SQL_INVALID_UPDATE');
  const expr=m[2].replace(/\bexcluded\.(\w+)\b/gi,(_,col)=>{
   if(!data.valuesByColumn.has(col))throw new Error('LTI_SQL_MISSING_INSERT_COLUMN');
   return data.valuesByColumn.get(col);
  });
  return quote(m[1])+'='+expr;
 });
 const where=predicate+(approvalGuard?" AND [approved]=0":"");
 let command='UPDATE '+table+' WITH (UPDLOCK,HOLDLOCK) SET '+updates.join(',')+
  ' WHERE '+where+'; IF @@ROWCOUNT=0 AND NOT '+exists+' '+insert;
 if(returning)command+='; SELECT [id] FROM '+table+' WHERE '+predicate;
 return command;
}
function translateSelect(text){
 const limit=/ LIMIT (\d+)$/i.exec(text);
 if(!limit)return text;
 return text.slice(0,limit.index).replace(/^SELECT /i,
  'SELECT TOP ('+Number(limit[1])+') ');
}
export function sqlserverTranslate(statement,args,columnsByTable){
 const s=placeholders(statement.trim(),args);
 if(/^INSERT\b/i.test(s))return translateInsert(s,columnsByTable);
 const update=/^UPDATE (\w+) SET ([\s\S]+?) WHERE ([\s\S]+) RETURNING \*$/i.exec(s);
 if(update)return 'UPDATE dbo.'+quote(update[1])+' SET '+update[2]+
  ' OUTPUT INSERTED.* WHERE '+update[3];
 if(/^SELECT\b/i.test(s))return translateSelect(s);
 return s;
}
