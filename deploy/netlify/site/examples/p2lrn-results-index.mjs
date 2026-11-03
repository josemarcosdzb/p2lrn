#!/usr/bin/env node
/**
 * Build or refresh a static P2LRN Analytics result index.
 *
 * Usage: node p2lrn-results-index.mjs ./resultados
 * No database, npm dependency, upload or network access. Only lists validated
 * .p2lrn-result files already present in the specified local directory.
 */
import {readdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const RESULT_SCHEMA='https://p2lrn.org/schema/offline-result/1';
const INDEX_SCHEMA='https://p2lrn.org/schema/analytics-results-index/1';
const MAX_FILES=500;

function canonical(value){
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'){
    if(!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value))
      throw new Error('Invalid JSON number');
    return JSON.stringify(value);
  }
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')
    return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  throw new Error('Invalid JSON value');
}
async function main(){
  const dir=resolve(process.argv[2]||'./resultados');
  const files=(await readdir(dir,{withFileTypes:true}))
    .filter(entry=>entry.isFile()&&entry.name.endsWith('.p2lrn-result'))
    .map(entry=>entry.name).sort((a,b)=>a.localeCompare(b,'en'));
  if(!files.length)throw new Error('There are no .p2lrn-result files in '+dir);
  if(files.length>MAX_FILES)throw new Error('Index limit: '+MAX_FILES+' result files');
  for(const filename of files){
    const result=JSON.parse(await readFile(join(dir,filename),'utf8'));
    if(result?.schema!==RESULT_SCHEMA||String(result.version)!=='1')
      throw new Error('Not a compatible P2LRN result: '+filename);
    const declared=String(result.integrity?.payloadDigest??'').toLowerCase();
    const body={...result};delete body.integrity;
    const actual='sha256:'+createHash('sha256').update(canonical(body)).digest('hex');
    if(!/^sha256:[a-f0-9]{64}$/.test(declared)||declared!==actual)
      throw new Error('SHA-256 check failed: '+filename);
  }
  const index={schema:INDEX_SCHEMA,results:files};
  const target=join(dir,'index.p2lrn-results.json');
  const temporary=target+'.tmp-'+process.pid;
  try{
    await writeFile(temporary,JSON.stringify(index,null,2)+'\n',{encoding:'utf8',flag:'wx'});
    await rename(temporary,target);
  }finally{await unlink(temporary).catch(()=>{});}
  console.log('Index ready: '+target+' ('+files.length+' valid result files)');
}
main().catch(error=>{console.error('Cannot update index: '+error.message);process.exitCode=1;});
