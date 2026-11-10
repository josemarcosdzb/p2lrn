// MySQL 8.4 / MariaDB 11+ SQL normalization for the canonical LTI relational
// store. No SQLite runtime or JSON snapshot database is used for persistence.
// All values are bound by native drivers; only authored SQL is transformed.
const GROUP_KEYS={
 platforms:['issuer','client_id'],
 snapshots:['attempt_id','entity_id','surface'],
 nrps_contexts:['registration_id','deployment_id','context_id']
};
const MIGRATED={
 platforms:"jwks_url TEXT",
 attempts:"access_profile VARCHAR(64) NOT NULL DEFAULT 'legacy'",
 sessions:"can_read_roster INTEGER NOT NULL DEFAULT 0, can_receive_grades INTEGER NOT NULL DEFAULT 0"
};
const HASHED=new Set(['platforms','snapshots','nrps_contexts']);
const PK_TEXT=new Set([
 'id','state_hash','token_hash','ticket_hash','attempt_id','registration_id',
 'tenant_id','binding_id','learner_key','deployment_id','catalog_id','nonce_hash',
 'bucket_hash','sha','score_hash','event_id','consumer_key','access_profile'
]);

export function splitSqlParts(source){
 const items=[];let level=0,quote='',start=0;
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(quote){
   if(ch===quote){
    if(source[i+1]===quote){i++;continue}
    quote='';
   }
  }else if(ch==="'"){quote=ch;}
  else if(ch==='(')level++;
  else if(ch===')')level--;
  else if(ch===','&&level===0){items.push(source.slice(start,i).trim());start=i+1}
 }
 if(level!==0||quote)throw new Error('LTI_SQL_INVALID_SCHEMA_DEFINITION');
 items.push(source.slice(start).trim());
 return items;
}
const quoteId=word=>{
 if(!/^[a-z][a-z0-9_]{0,127}$/i.test(word))throw new Error('LTI_SQL_UNSAFE_IDENTIFIER');
 return String.fromCharCode(96)+word+String.fromCharCode(96);
};
function typedColumn(clause){
 const m=/^([a-z_][a-z0-9_]*) TEXT\b/i.exec(clause);
 if(!m)return clause;
 const name=m[1];
 const sqlType=name.endsWith('_json')?'LONGTEXT':
  PK_TEXT.has(name)?'VARCHAR(191)':'LONGTEXT';
 return clause.replace(/\bTEXT\b/i,sqlType);
}
function hashedKey(keys){
 return "UNHEX(SHA2(CONCAT("+keys.map(name=>
  "LENGTH("+quoteId(name)+"),':',"+quoteId(name)).join(",")+"),256))";
}
export function mysqlSchemas(bootstrap,columnsByTable){
 const definitions=bootstrap.split(/;\s*\n/).map(v=>v.trim().replace(/;$/,'')).filter(Boolean);
 const statements=[];
 for(const definition of definitions){
  const match=/^CREATE TABLE IF NOT EXISTS (\w+)\(([\s\S]*)\)$/i.exec(definition);
  if(!match)throw new Error('LTI_SQL_INVALID_SCHEMA');
  const table=match[1],parts=splitSqlParts(match[2]);
  const columnNames=parts.filter(item=>/^[a-z_][a-z0-9_]* (TEXT|INTEGER|REAL)\b/i.test(item))
   .map(item=>item.split(/\s+/)[0]);
  columnsByTable.set(table,columnNames);
  let converted=parts.map(item=>typedColumn(item));
  if(HASHED.has(table))
   converted=converted.filter(item=>
    !(table==='platforms'&&/^UNIQUE\(issuer,client_id\)$/i.test(item))&&
    !((table==='snapshots'||table==='nrps_contexts')&&/^PRIMARY KEY\(/i.test(item)));
  if(MIGRATED[table])
   converted.push(...splitSqlParts(MIGRATED[table]));
  if(HASHED.has(table)){
   const keys=GROUP_KEYS[table];
   converted.push('group_hash BINARY(32) GENERATED ALWAYS AS ('+hashedKey(keys)+') STORED');
   converted.push('UNIQUE KEY unique_'+table+'_group_hash (group_hash)');
  }
  if(table==='attempts'){
   const keys=['binding_id','learner_key','context_id','access_profile'];
   converted.push("active_hash BINARY(32) GENERATED ALWAYS AS (CASE WHEN status='IN_PROGRESS' THEN "+
    hashedKey(keys)+" ELSE NULL END) STORED");
   converted.push('UNIQUE KEY unique_attempts_active_hash (active_hash)');
  }
  statements.push('CREATE TABLE IF NOT EXISTS '+quoteId(table)+' ('+
   converted.join(', ')+') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
 }
 return statements;
}
export function mysqlInsert(sql,columnsByTable){
 let text=sql,ignored=/^INSERT OR IGNORE INTO\b/i.test(text);
 if(ignored)text=text.replace(/^INSERT OR IGNORE INTO\b/i,'INSERT IGNORE INTO');
 // Inserts without a column list must not target generated key columns.
 text=text.replace(/^INSERT( IGNORE)? INTO ([a-z_]+) VALUES\(/i,(whole,ignore,table)=>{
  const cols=columnsByTable.get(table);
  if(!cols)throw new Error('LTI_SQL_UNKNOWN_INSERT_TABLE');
  return 'INSERT'+(ignore||'')+' INTO '+quoteId(table)+'('+
   cols.map(quoteId).join(',')+') VALUES(';
 });
 text=text.replace(/\s+ON CONFLICT\([^)]*\)(?: WHERE [\s\S]*?)? DO NOTHING$/i,()=>{
  ignored=true;return '';
 });
 const upsert=/\s+ON CONFLICT\([^)]*\)(?: WHERE [\s\S]*?)? DO UPDATE SET ([\s\S]*?)(?: RETURNING id)?$/i.exec(text);
 if(upsert){
  const conditional=/\bWHERE assessments\.approved=0\b/i.test(upsert[0]);
  const columns=splitSqlParts(upsert[1]).map(item=>{
   const m=/^(\w+)=([\s\S]+)$/.exec(item);
   if(!m)throw new Error('LTI_SQL_INVALID_UPSERT');
   let expr=m[2].replace(/\bexcluded\.(\w+)\b/gi,'VALUES($1)');
   if(conditional)expr="IF(approved=0,"+expr+','+m[1]+')';
   return quoteId(m[1])+'='+expr;
  });
  text=text.slice(0,upsert.index)+' ON DUPLICATE KEY UPDATE '+columns.join(',');
 }else if(/\s+RETURNING id$/i.test(text)){
  throw new Error('LTI_SQL_UNSUPPORTED_RETURNING');
 }
 if(ignored)text=text.replace(/^INSERT INTO\b/i,'INSERT IGNORE INTO');
 return text;
}
export function mysqlTranslate(statement,columnsByTable){
 const source=statement.trim();
 if(/^INSERT\b/i.test(source))return mysqlInsert(source,columnsByTable);
 return source;
}
