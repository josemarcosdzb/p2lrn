import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveP2LRNStudioPackage} from '../../studio/server/index.mjs';

test('npm Studio server helper creates course/ by default and blocks traversal',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-studio-'));
  try{
    const bytes=new TextEncoder().encode('P2LRN studio save test');
    const saved=await saveP2LRNStudioPackage(bytes,{root,filename:'demo.p2lrn'});
    assert.equal(saved.coursePath,'course');
    assert.equal(saved.filename,'demo.p2lrn');
    assert.equal((await stat(join(root,'course'))).isDirectory(),true);
    assert.deepEqual(new Uint8Array(await readFile(join(root,'course','demo.p2lrn'))),bytes);
    await assert.rejects(()=>saveP2LRNStudioPackage(bytes,{root,coursePath:'../outside',filename:'x.p2lrn'}),/Unsafe|escapes|Invalid/);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
