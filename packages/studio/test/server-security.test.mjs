import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveP2LRNStudioPackage} from '../server/index.mjs';

test('Studio package writes are atomic, allow legitimate replacement, and reject traversal',async()=>{
 const root=await mkdtemp(join(tmpdir(),'p2lrn-studio-save-security-'));
 try{
  const original=new Uint8Array([1,2,3,4]),replacement=new Uint8Array([5,6,7]);
  const first=await saveP2LRNStudioPackage(original,{
   root,coursePath:'institute/course-one',filename:'course.p2lrn'
  });
  assert.deepEqual(new Uint8Array(await readFile(first.path)),original);
  const second=await saveP2LRNStudioPackage(replacement,{
   root,coursePath:'institute/course-one',filename:'course.p2lrn'
  });
  assert.equal(second.path,first.path);
  assert.deepEqual(new Uint8Array(await readFile(first.path)),replacement);
  await assert.rejects(
   saveP2LRNStudioPackage(original,{root,coursePath:'../outside',filename:'course.p2lrn'}),
   /Unsafe|escapes|Invalid/
  );
  const names=await readdir(join(root,'institute','course-one'));
  assert.deepEqual(names,['course.p2lrn'],'No failed or successful write should leave temp files');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Studio package writer never follows a preexisting symlink to overwrite outside storage',async(t)=>{
 const root=await mkdtemp(join(tmpdir(),'p2lrn-studio-root-'));
 const outside=await mkdtemp(join(tmpdir(),'p2lrn-studio-outside-'));
 try{
  const outsideFile=join(outside,'external.p2lrn');
  await writeFile(outsideFile,new Uint8Array([11,22,33]));
  const inside=join(root,'course');
  await mkdir(inside);
  try{await symlink(outsideFile,join(inside,'course.p2lrn'));}
  catch(error){
   if(['EPERM','EACCES','ENOTSUP'].includes(error?.code)){t.diagnostic('Symlink creation unavailable on runner');return;}
   throw error;
  }
  await assert.rejects(saveP2LRNStudioPackage(new Uint8Array([1,2]),{
   root,coursePath:'course',filename:'course.p2lrn'
  }),/symbolic link|escapes/);
  assert.deepEqual(new Uint8Array(await readFile(outsideFile)),new Uint8Array([11,22,33]));
 }finally{
  await rm(root,{recursive:true,force:true});
  await rm(outside,{recursive:true,force:true});
 }
});
