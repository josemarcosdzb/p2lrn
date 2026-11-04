import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,lstat,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeZip,unpackP2LRNArchive} from '../dist/core/zip.js';

const encoder=new TextEncoder();
async function fixture(fn){
  const dir=await mkdtemp(join(tmpdir(),'p2lrn-safe-unpack-'));
  try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}
}
async function run(dir,entries,options){
  const zip=join(dir,'course.p2lrn');
  await writeFile(zip,writeZip(entries));
  return unpackP2LRNArchive(zip,join(dir,'extracted'),options);
}
test('safe unpack extracts regular files only into a fresh private directory',()=>fixture(async dir=>{
  const result=await run(dir,[
    {path:'payload/one.txt',data:encoder.encode('lesson')},
    {path:'manifest.json',data:encoder.encode('{}')},
  ]);
  assert.equal(result.files,2);
  assert.equal(result.totalBytes,8);
  assert.equal(await readFile(join(result.directory,'payload','one.txt'),'utf8'),'lesson');
  assert.equal(await readFile(join(result.directory,'manifest.json'),'utf8'),'{}');
  await assert.rejects(unpackP2LRNArchive(join(dir,'course.p2lrn'),result.directory),/existing extraction target/);
}));
test('ZIP traversal never creates files outside extraction destination',()=>fixture(async dir=>{
  const bytes=Buffer.from(writeZip([{path:'aa/evil.txt',data:encoder.encode('attack')}]));
  const original=Buffer.from('aa/evil.txt'),modified=Buffer.from('../evil.txt');
  assert.equal(original.length,modified.length);
  for(let i=0;i<bytes.length-original.length;i++){
    if(bytes.subarray(i,i+original.length).equals(original)){
      modified.copy(bytes,i);i+=original.length-1;
    }
  }
  const zip=join(dir,'course.p2lrn');
  await writeFile(zip,bytes);
  await assert.rejects(unpackP2LRNArchive(zip,join(dir,'extracted')),/unsafe ZIP path|unsafe ZIP path component/);
  await assert.rejects(lstat(join(dir,'evil.txt')),{code:'ENOENT'});
}));
test('unsafe Windows device and ADS paths are refused even on Linux',()=>fixture(async dir=>{
  for(const bad of ['payload/CON.txt','payload/resource:ads','payload/note.','payload/COM1']){
    const zip=join(dir,'course.p2lrn');
    await writeFile(zip,writeZip([{path:bad,data:encoder.encode('x')}]));
    await assert.rejects(unpackP2LRNArchive(zip,join(dir,'extracted')),/unsafe ZIP filesystem component/);
    await assert.rejects(lstat(join(dir,'extracted')),{code:'ENOENT'});
  }
}));
test('ZIP symlink entries and existing destination symlink cannot be followed',()=>fixture(async dir=>{
  const data=Buffer.from(writeZip([{path:'payload/link',data:encoder.encode('elsewhere')}]));
  const idx=data.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
  assert(idx>0);
  data.writeUInt32LE((0o120777<<16)>>>0,idx+38);
  const zip=join(dir,'course.p2lrn');
  await writeFile(zip,data);
  await assert.rejects(unpackP2LRNArchive(zip,join(dir,'extracted')),/symbolic links|non-regular/);
  await writeFile(zip,writeZip([{path:'payload/file.txt',data:encoder.encode('safe')}]));
  const external=join(dir,'external');
  await writeFile(external,'do not touch');
  try{await symlink(external,join(dir,'extracted'),'file');}catch(e){
    if(['EPERM','EACCES','ENOTSUP'].includes(e.code))return;throw e;
  }
  await assert.rejects(unpackP2LRNArchive(zip,join(dir,'extracted')),/existing extraction target/);
  assert.equal(await readFile(external,'utf8'),'do not touch');
}));
test('input archive cap rejects oversized input before allocation',()=>fixture(async dir=>{
  const zip=join(dir,'huge.p2lrn');
  await writeFile(zip,writeZip([{path:'payload/a',data:encoder.encode('a')}]));
  await assert.rejects(unpackP2LRNArchive(zip,join(dir,'extracted'),{maxArchiveBytes:23}),/archive exceeds safety limit/);
}));
