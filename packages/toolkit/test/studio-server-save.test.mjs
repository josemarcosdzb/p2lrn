import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,symlink} from 'node:fs/promises';
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

test('Studio rejects oversized streaming uploads before writing any files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-studio-limit-'));let cancelled=false;
  try{
    const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2,3,4]));controller.enqueue(new Uint8Array([5]));},cancel(){cancelled=true;}});
    const request=new Request('http://local/api/p2lrn/studio/save',{method:'POST',body:stream,duplex:'half'});
    const {handleP2LRNStudioSave}=await import('../../studio/server/index.mjs');
    const response=await handleP2LRNStudioSave(request,{root,maxBytes:3});
    assert.equal(response.status,413);assert.equal(cancelled,true);
    await assert.rejects(()=>stat(join(root,'course','course.p2lrn')));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('all Studio upload endpoints reject oversized declared content length',async()=>{
  const routes=await import('../../studio/server/index.mjs');
  for(const [handler,label] of [[routes.handleP2LRNStudioSave,'save'],[routes.handleP2LRNStudioReader,'read'],[routes.handleP2LRNStudioExternalImport,'import']]){
    const request=new Request('http://local/api/p2lrn/studio/'+label,{method:'POST',headers:{'content-length':'9999'},body:new Uint8Array([1])});
    const response=await handler(request,{maxBytes:2});assert.equal(response.status,413,label);
  }
});
test('Studio rejects symlink directories pointing outside authorized storage',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'p2lrn-studio-safe-root-'));
  const elsewhere=await mkdtemp(join(tmpdir(),'p2lrn-studio-safe-outside-'));
  try{
    try{await symlink(elsewhere,join(root,'link'),'dir');}
    catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error?.code)){t.skip('Symlink creation requires Windows developer privileges');return;}throw error;}
    await assert.rejects(()=>import('../../studio/server/index.mjs').then(m=>m.saveP2LRNStudioPackage(new Uint8Array([1]),{root,coursePath:'link'})),/symbolic link|escapes/i);
  }finally{await rm(root,{recursive:true,force:true});await rm(elsewhere,{recursive:true,force:true});}
});
