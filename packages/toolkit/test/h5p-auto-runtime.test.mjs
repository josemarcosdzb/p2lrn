import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

import {
  createOpaqueH5PRuntimeDocument,
  getAutomaticH5PRuntimeResources,
  hydrateH5PRuntimeCore,
  hydrateH5PStaticSession,
} from '../web/h5p-auto-runtime.js';

const encoder=new TextEncoder();
const bufferOf=(text)=>{const bytes=encoder.encode(text);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);};

function responseJson(value){return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});}
function responseBytes(text,type='application/octet-stream'){return new Response(bufferOf(text),{status:200,headers:{'content-type':type}});}

test('automatic H5P runtime builds an opaque srcdoc shell around local runtime assets',()=>{
  const resources=getAutomaticH5PRuntimeResources('https://app.example.invalid/player/runtime-host/');
  assert.equal(resources.hostScriptUrl,'https://app.example.invalid/player/runtime-host/h5p-host.js');
  assert.equal(resources.runtimeAssetsUrl,'https://app.example.invalid/player/runtime-host/assets/');
  const html=createOpaqueH5PRuntimeDocument(resources);
  assert.match(html,/startH5PRuntime/u);
  assert.doesNotMatch(html,/<script[^>]+src=/u);
  assert.match(html,/Content-Security-Policy/u);
  assert.doesNotMatch(html,/<iframe[^>]+allow-same-origin/u);
});

test('automatic H5P runtime hydrates missing shared libraries into the transferred static session',async()=>{
  const nested={
    names:()=>['h5p.json','content/content.json'],
    read:async(path)=>encoder.encode(path==='h5p.json'?JSON.stringify({mainLibrary:'H5P.Parent',preloadedDependencies:[{machineName:'H5P.Parent',majorVersion:1,minorVersion:0}]}):'{}'),
  };
  const inspection={
    names:nested.names(),
    required:[{machineName:'H5P.Parent',majorVersion:1,minorVersion:0}],
    content:{},
  };
  const session={
    files:[{path:'h5p.json',mediaType:'application/json',buffer:bufferOf('{}')},{path:'content/content.json',mediaType:'application/json',buffer:bufferOf('{}')}],
    transfers:[],
    totalBytes:4,
  };
  const catalog={libraries:[
    {folder:'H5P.Parent-1.0',machineName:'H5P.Parent',majorVersion:1,minorVersion:0,files:['library.json','parent.js','parent.css']},
    {folder:'H5P.Child-1.0',machineName:'H5P.Child',majorVersion:1,minorVersion:0,files:['library.json','child.js']},
  ]};
  const parentMetadata={machineName:'H5P.Parent',majorVersion:1,minorVersion:0,preloadedDependencies:[{machineName:'H5P.Child',majorVersion:1,minorVersion:0}]};
  const childMetadata={machineName:'H5P.Child',majorVersion:1,minorVersion:0,preloadedDependencies:[]};
  const seen=[];
  const fetchImpl=async(url)=>{
    seen.push(String(url));
    if(String(url).endsWith('/index.json'))return responseJson(catalog);
    if(String(url).endsWith('/H5P.Parent-1.0/library.json'))return responseJson(parentMetadata);
    if(String(url).endsWith('/H5P.Child-1.0/library.json'))return responseJson(childMetadata);
    if(String(url).endsWith('/H5P.Parent-1.0/parent.js'))return responseBytes('parent();','text/javascript');
    if(String(url).endsWith('/H5P.Parent-1.0/parent.css'))return responseBytes('.parent{}','text/css');
    if(String(url).endsWith('/H5P.Child-1.0/child.js'))return responseBytes('child();','text/javascript');
    return new Response('missing',{status:404});
  };
  const hydrated=await hydrateH5PStaticSession({session,nested,inspection,sharedLibrariesUrl:'https://app.example.invalid/runtime-host/h5p-libraries/',fetchImpl});
  const paths=hydrated.files.map((item)=>item.path);
  for(const path of ['H5P.Parent-1.0/library.json','H5P.Parent-1.0/parent.js','H5P.Parent-1.0/parent.css','H5P.Child-1.0/library.json','H5P.Child-1.0/child.js'])assert.ok(paths.includes(path),path);
  assert.ok(seen.some((url)=>url.endsWith('/index.json')));
  assert.ok(hydrated.totalBytes>4);
});

test('automatic H5P runtime refuses a shared-library catalog without file manifests',async()=>{
  const nested={names:()=>[],read:async()=>{throw new Error('unexpected');}};
  const session={files:[],transfers:[],totalBytes:0};
  const inspection={names:[],required:[{machineName:'H5P.Test',majorVersion:1,minorVersion:0}],content:{}};
  const fetchImpl=async(url)=>{
    if(String(url).endsWith('/index.json'))return responseJson({libraries:[{folder:'H5P.Test-1.0',machineName:'H5P.Test',majorVersion:1,minorVersion:0}]});
    return responseJson({machineName:'H5P.Test',majorVersion:1,minorVersion:0,preloadedDependencies:[]});
  };
  await assert.rejects(()=>hydrateH5PStaticSession({session,nested,inspection,sharedLibrariesUrl:'https://app.example.invalid/runtime-host/h5p-libraries/',fetchImpl}),error=>error?.code==='P2LRN_H5P_LIBRARY_CATALOG_INCOMPLETE');
});
test('automatic H5P runtime hydrates the H5P core script, stylesheet and fonts into the opaque session',async()=>{
  const session={files:[],transfers:[],totalBytes:0};
  const fetchImpl=async(url)=>{
    const value=String(url);
    if(value.endsWith('/styles/h5p.css'))return responseBytes("@font-face{font-family:'H5P';src:url('../fonts/h5p-core.woff2') format('woff2')}body{font-family:H5P}",'text/css');
    if(value.endsWith('/frame.bundle.js'))return responseBytes('window.H5P={init(){}};','text/javascript');
    if(value.endsWith('/fonts/h5p-core.woff2'))return responseBytes('font-bytes','font/woff2');
    return new Response('missing',{status:404});
  };
  const hydrated=await hydrateH5PRuntimeCore({session,runtimeAssetsUrl:'https://app.example.invalid/runtime-host/assets/',fetchImpl});
  assert.deepEqual(hydrated.files.map((file)=>file.path).sort(),[
    '__p2lrn_runtime__/fonts/h5p-core.woff2',
    '__p2lrn_runtime__/frame.bundle.js',
    '__p2lrn_runtime__/styles/h5p.css',
  ]);
  assert.equal(hydrated.transfers.length,3);
});

test('legacy eval permission is restricted to the H5P opaque sandbox, never the ordinary package runtime',()=>{
  const runtimeHtml=readFileSync(new URL('../web/runtime-host/h5p-opaque.html',import.meta.url),'utf8');
  const genericHtml=readFileSync(new URL('../web/runtime-host/package-opaque.html',import.meta.url),'utf8');
  assert.match(runtimeHtml,/script-src 'self' blob: 'unsafe-eval'/u);
  assert.match(runtimeHtml,/connect-src blob:; frame-src about: blob:/u);
  assert.match(runtimeHtml,/form-action 'none'; base-uri 'none'/u);
  assert.doesNotMatch(runtimeHtml,/allow-same-origin|connect-src https?:/u);
  assert.doesNotMatch(genericHtml,/(?:^|\s)'unsafe-eval'(?:\s|;)/u);
  const fallback=createOpaqueH5PRuntimeDocument();
  assert.match(fallback,/script-src 'unsafe-inline' blob:/u);
  assert.doesNotMatch(fallback,/script-src [^;]*'unsafe-eval'/u,'srcdoc fallback must never allow arbitrary evaluation');
  assert.doesNotMatch(fallback,/connect-src https?:/u);
});
