import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const exec=promisify(execFile);
const cli=fileURLToPath(new URL('../bin/p2lrn-studio.mjs',import.meta.url));

test('setup auto detects Next.js, creates route and course directory',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-next-'));
  try{
    await writeFile(join(root,'package.json'),JSON.stringify({dependencies:{next:'16.0.0'}}));
    const {stdout}=await exec(process.execPath,[cli,'setup','--cwd',root]);
    const out=JSON.parse(stdout);
    assert.equal(out.target,'next');
    assert.equal((await stat(join(root,'course'))).isDirectory(),true);
    assert.match(await readFile(join(root,'app','api','p2lrn','studio','save','route.ts'),'utf8'),/handleP2LRNStudioSave/);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('setup auto detects FastAPI from requirements',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-fastapi-'));
  try{
    await writeFile(join(root,'requirements.txt'),'fastapi==0.120.0\n');
    const {stdout}=await exec(process.execPath,[cli,'setup','--cwd',root]);
    const out=JSON.parse(stdout);
    assert.equal(out.target,'fastapi');
    assert.match(await readFile(join(root,'p2lrn_studio.py'),'utf8'),/APIRouter/);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('setup supports custom course path and substitutes it',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-custom-'));
  try{
    const {stdout}=await exec(process.execPath,[cli,'setup','next','--cwd',root,'--course-path','data/courses']);
    const out=JSON.parse(stdout);
    assert.equal(out.coursePath,'data/courses');
    assert.equal((await stat(join(root,'data','courses'))).isDirectory(),true);
    assert.match(await readFile(join(root,'app','api','p2lrn','studio','save','route.ts'),'utf8'),/data\/courses/);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('setup refuses overwrite unless --force is used',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-safe-'));
  try{
    await exec(process.execPath,[cli,'setup','next','--cwd',root]);
    await assert.rejects(()=>exec(process.execPath,[cli,'setup','next','--cwd',root]),/File already exists/);
    const {stdout}=await exec(process.execPath,[cli,'setup','next','--cwd',root,'--force']);
    assert.equal(JSON.parse(stdout).ok,true);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('generic target provides a backend-neutral contract',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-generic-'));
  try{
    await exec(process.execPath,[cli,'setup','generic','--cwd',root]);
    const text=await readFile(join(root,'p2lrn-setup','GENERIC.md'),'utf8');
    assert.match(text,/POST \/api\/p2lrn\/studio\/save/);
    assert.match(text,/reject path traversal/i);
  }finally{await rm(root,{recursive:true,force:true})}
});
