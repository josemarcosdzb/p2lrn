import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startP2LRNRuntimeHost} from '../server/runtime-host.mjs';
import {createH5PSessionRegistry} from '../server/h5p-session.mjs';

const MAGIC=0x50324835;
const ORIGIN='https://app.example.invalid';

function sessionBody(files,{protocol='p2lrn-h5p-session/1'}={}){
  const descriptors=[],chunks=[];let offset=0;
  for(const [path,value] of files){
    const bytes=Buffer.isBuffer(value)?value:Buffer.from(String(value));
    descriptors.push({path,offset,length:bytes.length});chunks.push(bytes);offset+=bytes.length;
  }
  const manifest=Buffer.from(JSON.stringify({protocol,files:descriptors}));
  const header=Buffer.alloc(8);header.writeUInt32BE(MAGIC,0);header.writeUInt32BE(manifest.length,4);
  return Buffer.concat([header,manifest,...chunks]);
}
function validFiles(){
  return[
    ['h5p.json',JSON.stringify({
      title:'Gate H5P',mainLibrary:'H5P.Example',embedTypes:['iframe'],
      preloadedDependencies:[{machineName:'H5P.Example',majorVersion:1,minorVersion:0}]
    })],
    ['content/content.json',JSON.stringify({text:'hola'})],
    ['H5P.Example-1.0/library.json',JSON.stringify({
      machineName:'H5P.Example',majorVersion:1,minorVersion:0,patchVersion:0,runnable:1,
      preloadedJs:[{path:'script.js'}],preloadedCss:[{path:'style.css'}]
    })],
    ['H5P.Example-1.0/script.js','globalThis.__h5pGate=true;'],
    ['H5P.Example-1.0/style.css','.h5p{display:block}']
  ];
}
function standalone(root){
  mkdirSync(join(root,'styles'),{recursive:true});
  writeFileSync(join(root,'main.bundle.js'),'globalThis.H5PStandalone={H5P:class {}};');
  writeFileSync(join(root,'frame.bundle.js'),'');
  writeFileSync(join(root,'styles/h5p.css'),'.h5p{}');
}
async function postSession(host,body,type='application/vnd.p2lrn.h5p-session'){
  const response=await fetch(host.baseUrl+'h5p/session',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':type},body});
  let json=null;try{json=await response.json();}catch{}
  return{response,json};
}

test('H5P runtime host creates, serves and deletes a bundled-library session',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-h5p-host-')),standaloneDir=join(dir,'standalone');standalone(standaloneDir);
  const host=await startP2LRNRuntimeHost({basePath:'/runtime',allowedParentOrigins:[ORIGIN],h5pStandaloneDir:standaloneDir});
  try{
    const {response,json}=await postSession(host,sessionBody(validFiles()));
    assert.equal(response.status,201,JSON.stringify(json));
    assert.equal(json.ok,true);
    assert.equal(json.mainLibrary,'H5P.Example');
    assert.equal(json.dependencies,1);

    const h5p=await fetch(new URL('h5p.json',new URL(json.sessionUrl,host.origin)));
    assert.equal(h5p.status,200);
    assert.equal((await h5p.json()).mainLibrary,'H5P.Example');
    assert.match(h5p.headers.get('etag')||'',/^"/);

    const js=await fetch(new URL('H5P.Example-1.0/script.js',new URL(json.sessionUrl,host.origin)));
    assert.equal(js.status,200);
    assert.match(js.headers.get('content-type')||'',/javascript/);
    assert.match(await js.text(),/__h5pGate/);

    const del=await fetch(new URL(json.sessionUrl,host.origin),{method:'DELETE',headers:{Origin:ORIGIN}});
    assert.equal(del.status,204);
    assert.equal((await fetch(new URL('h5p.json',new URL(json.sessionUrl,host.origin)))).status,404);
  }finally{await host.close();rmSync(dir,{recursive:true,force:true});}
});

test('H5P runtime rejects missing libraries and missing preloaded assets',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-h5p-missing-')),standaloneDir=join(dir,'standalone');standalone(standaloneDir);
  const host=await startP2LRNRuntimeHost({basePath:'/runtime',allowedParentOrigins:[ORIGIN],h5pStandaloneDir:standaloneDir});
  try{
    const missingLibrary=validFiles().filter(([path])=>!path.startsWith('H5P.Example-1.0/'));
    let result=await postSession(host,sessionBody(missingLibrary));
    assert.equal(result.response.status,409);
    assert.equal(result.json.code,'P2LRN_H5P_LIBRARIES_MISSING');

    const missingAsset=validFiles().filter(([path])=>!path.endsWith('/script.js'));
    result=await postSession(host,sessionBody(missingAsset));
    assert.equal(result.response.status,409);
    assert.equal(result.json.code,'P2LRN_H5P_LIBRARY_ASSETS_MISSING');
  }finally{await host.close();rmSync(dir,{recursive:true,force:true});}
});

test('H5P runtime rejects unsafe session paths, wrong media type and denied origins',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-h5p-sec-')),standaloneDir=join(dir,'standalone');standalone(standaloneDir);
  const host=await startP2LRNRuntimeHost({basePath:'/runtime',allowedParentOrigins:[ORIGIN],h5pStandaloneDir:standaloneDir});
  try{
    let result=await postSession(host,sessionBody([['../evil.js','x']]));
    assert.equal(result.response.status,400);
    assert.equal(result.json.code,'P2LRN_H5P_SESSION_INVALID');

    result=await postSession(host,sessionBody(validFiles()),'application/octet-stream');
    assert.equal(result.response.status,415);
    assert.equal(result.json.code,'P2LRN_H5P_SESSION_MEDIA_TYPE');

    const denied=await fetch(host.baseUrl+'h5p/session',{method:'POST',headers:{Origin:'https://evil.example.invalid','Content-Type':'application/vnd.p2lrn.h5p-session'},body:sessionBody(validFiles())});
    assert.equal(denied.status,403);
    assert.equal((await denied.json()).code,'P2LRN_H5P_ORIGIN_DENIED');
  }finally{await host.close();rmSync(dir,{recursive:true,force:true});}
});

test('H5P session registry enforces aggregate byte capacity',()=>{
  const registry=createH5PSessionRegistry({maxH5pSessionBytesTotal:10,maxH5pPackageBytes:1024});
  const result=registry.create(sessionBody(validFiles()));
  assert.equal(result.ok,false);
  assert.equal(result.code,'P2LRN_H5P_SESSION_CAPACITY');
});

test('H5P runtime health reports configured runtime and active session accounting',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-h5p-health-')),standaloneDir=join(dir,'standalone');standalone(standaloneDir);
  const host=await startP2LRNRuntimeHost({basePath:'/runtime',allowedParentOrigins:[ORIGIN],h5pStandaloneDir:standaloneDir});
  try{
    let health=await (await fetch(host.baseUrl+'health')).json();
    assert.equal(health.h5p.configured,true);
    assert.equal(health.h5p.activeSessions,0);
    const created=await postSession(host,sessionBody(validFiles()));
    assert.equal(created.response.status,201);
    health=await (await fetch(host.baseUrl+'health')).json();
    assert.equal(health.h5p.activeSessions,1);
    assert.ok(health.h5p.activeSessionBytes>0);
  }finally{await host.close();rmSync(dir,{recursive:true,force:true});}
});
