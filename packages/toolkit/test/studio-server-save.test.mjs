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


test('server route uses configured coursePath and ignores client path by default',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-studio-route-'));
  try{
    const request=new Request('http://local/api/p2lrn/studio/save',{
      method:'POST',
      headers:{
        'content-type':'application/vnd.p2lrn+zip',
        'x-p2lrn-path':'other/place',
        'x-p2lrn-filename':'safe.p2lrn',
      },
      body:new Uint8Array([1,2,3]),
    });
    const {handleP2LRNStudioSave}=await import('../../studio/server/index.mjs');
    const response=await handleP2LRNStudioSave(request,{root,coursePath:'course'});
    assert.equal(response.status,200);
    assert.equal((await stat(join(root,'course','safe.p2lrn'))).isFile(),true);
    await assert.rejects(()=>stat(join(root,'other','place','safe.p2lrn')));
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('server route accepts client path only when explicitly enabled',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-studio-client-path-'));
  try{
    const request=new Request('http://local/api/p2lrn/studio/save',{
      method:'POST',
      headers:{
        'content-type':'application/vnd.p2lrn+zip',
        'x-p2lrn-path':'profesores/jose',
        'x-p2lrn-filename':'safe.p2lrn',
      },
      body:new Uint8Array([4,5,6]),
    });
    const {handleP2LRNStudioSave}=await import('../../studio/server/index.mjs');
    const response=await handleP2LRNStudioSave(request,{root,allowClientPath:true});
    assert.equal(response.status,200);
    assert.equal((await stat(join(root,'profesores','jose','safe.p2lrn'))).isFile(),true);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
