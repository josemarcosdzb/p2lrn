import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {normalizeRuntimeBaseUrl, resolveH5pRuntimeUrl, resolvePackageRuntimeUrl, resolveScormRuntimeUrl} from '../web/runtime-host-config.js';
import {extractVirtualTarget, MAX_ROUTE_RESOURCES, routeSourceMayPersist, trustedWorkerMessageSource, validateRouteConfig} from '../web/p2lrn-sw.js';
import {readResponseBounded} from '../web/zip-source.js';

const root=resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function route(sourceUrl='https://example.invalid/course.p2lrn'){
  return {
    version:'2',
    routeId:'a'.repeat(32),
    capability:'d'.repeat(32),
    sourceUrl,
    contentRoot:'sha256:'+'b'.repeat(64),
    resources:{
      'video.mp4':{
        embeddedPath:'payload/video.mp4',
        mediaType:'video/mp4',
        size:1,
        byteDigest:'sha256:'+'c'.repeat(64),
        archiveEntry:{localOffset:0,method:0,compressedSize:1,uncompressedSize:1},
        rangeIntegrity:null,
      },
    },
  };
}

test('runtime hosts require HTTPS outside loopback development',()=>{
  assert.equal(normalizeRuntimeBaseUrl('https://cdn.example/runtime/'),'https://cdn.example/runtime/');
  assert.equal(normalizeRuntimeBaseUrl('http://localhost:8080/runtime/'),'http://localhost:8080/runtime/');
  assert.equal(normalizeRuntimeBaseUrl('http://127.0.0.1:8080/runtime/'),'http://127.0.0.1:8080/runtime/');
  assert.throws(()=>normalizeRuntimeBaseUrl('http://example.com/runtime/'),/requires HTTPS/i);
});

test('executable runtimes must be isolated from the application origin',()=>{
  const options={applicationOrigin:'https://app.example.invalid'};
  assert.throws(
    ()=>resolveH5pRuntimeUrl('https://app.example.invalid/runtime-host/',options),
    /must be isolated/i,
  );
  assert.throws(
    ()=>resolveScormRuntimeUrl('https://app.example.invalid/runtime-host/',options),
    /must be isolated/i,
  );
  assert.throws(
    ()=>resolvePackageRuntimeUrl('https://app.example.invalid/runtime-host/',options),
    /must be isolated/i,
  );
  assert.match(resolveH5pRuntimeUrl('https://runtime.example.invalid/runtime-host/',options),/^https:\/\/runtime\.example\.invalid\//u);
});

test('static resource bridge rejects non-local HTTP package sources',()=>{
  assert.equal(validateRouteConfig(route()).sourceUrl,'https://example.invalid/course.p2lrn');
  assert.equal(validateRouteConfig(route('http://localhost:3000/course.p2lrn')).sourceUrl,'http://localhost:3000/course.p2lrn');
  assert.throws(()=>validateRouteConfig(route('http://example.com/course.p2lrn')),/requires HTTPS/i);
});

test('all isolated runtime shells bind MessageChannel handshakes to their direct parent',async()=>{
  for(const relative of [
    'packages/toolkit/web/h5p-runtime-shell.js',
    'packages/toolkit/web/runtime-host/scorm-host.js',
    'packages/toolkit/web/package-runtime-shell.js',
  ]){
    const content=await readFile(resolve(root,relative),'utf8');
    assert.match(content,/event\.source\s*!==\s*parent/u,relative);
  }
});

test('distribution source contains no sandbox escape token',async()=>{
  const files=[
    'packages/toolkit/web/renderers/h5p-runtime.js',
    'packages/toolkit/web/renderers/scorm-runtime.js',
    'packages/toolkit/web/renderers/package-runtime.js',
    'packages/toolkit/web/h5p-runtime-shell.js',
    'packages/toolkit/web/runtime-host/scorm-host.js',
    'packages/toolkit/web/package-runtime-shell.js',
  ];
  for(const relative of files){
    const content=await readFile(resolve(root,relative),'utf8');
    assert.equal(content.includes('allow-popups-to-escape-sandbox'),false,relative);
  }
});

test('only audited P2LRN workflows remain; no hidden deploy or publish jobs',async()=>{
  const dir=resolve(root,'.github/workflows');
  const names=(await readdir(dir)).filter(name=>/\.ya?ml$/i.test(name)).sort();
  // Main's canonical CI and Studio's community/live QA are deliberately
  // retained; new or renamed workflows require explicit security review.
  const allowed=[
      "p2lrn-ci.yml",
      "p2lrn-community-browser-hosted.yml",
      "p2lrn-community-browser-qa.yml",
      "p2lrn-community-examples-qa.yml",
      "p2lrn-community-live-audit.yml",
      "p2lrn-community-production-preview.yml",
      "p2lrn-community-publish.yml",
      "p2lrn-embed-community-video.yml",
      "p2lrn-enrich-community-imscc.yml",
      "p2lrn-external-fixture-audit.yml",
      "p2lrn-grading-modes-qa.yml",
      "p2lrn-import-community-formats.yml",
      "p2lrn-interoperability-real.yml",
      "p2lrn-license-design-qa.yml",
      "p2lrn-native-offline-windows.yml",
      "p2lrn-npm-release-publish.yml",
      "p2lrn-player-i18n.yml",
      "p2lrn-portable-verification.yml",
      "p2lrn-pr-safe.yml",
      "p2lrn-site-i18n.yml",
      "p2lrn-universal-runtime-qa.yml",
      "studio-local-preview.yml",
      "studio-mejorastudio-qa.yml"
  ];
  assert.deepEqual(names,allowed);
  const npmRelease=await readFile(resolve(dir,'p2lrn-npm-release-publish.yml'),'utf8');
  assert.match(npmRelease,/if:\s*github\.event_name == 'workflow_dispatch'/,
    'npm staging must be explicitly dispatched, never triggered by site updates');
  assert.match(npmRelease,/permissions:\s*\n\s*contents: read/,
    'npm staging must not obtain repository write permissions');
  assert.doesNotMatch(npmRelease,/\bnetlify\s+deploy\b|\bnetlify\s+build\b/i,
    'npm staging workflow must not deploy the site');
  for(const name of names){
    const yaml=await readFile(resolve(dir,name),'utf8');
    assert.doesNotMatch(yaml,/\bnetlify\s+deploy\b|\bnpm\s+publish\b/i,
      'Unexpected direct production publish action in '+name);
    if(name!=='p2lrn-site-i18n.yml'&&name!=='p2lrn-community-publish.yml')
      assert.doesNotMatch(yaml,/git\s+push\s+origin\s+HEAD:(?:refs\/heads\/)?main\b/i,
        'Unexpected ability to write main in '+name);
  }
});



test('virtual Service Worker routes require an unguessable capability token',()=>{
  const valid=route();
  assert.equal(validateRouteConfig(valid).capability,'d'.repeat(32));
  const missing={...valid};
  delete missing.capability;
  assert.throws(()=>validateRouteConfig(missing),/capability/i);
  const weak={...valid,capability:'abcd'};
  assert.throws(()=>validateRouteConfig(weak),/capability/i);

  const target=extractVirtualTarget(`https://example.invalid/__p2lrn__/v1/${valid.routeId}/${valid.capability}/video.mp4`);
  assert.deepEqual(target,{routeId:valid.routeId,capability:valid.capability,logical:'video.mp4'});
  assert.equal(extractVirtualTarget(`https://example.invalid/__p2lrn__/v1/${valid.routeId}/video.mp4`),null);
});

test('static bridge no longer falls back to a root Service Worker controller',async()=>{
  const content=await readFile(resolve(root,'packages/toolkit/web/static-resource-bridge.js'),'utf8');
  assert.equal(content.includes('container.controller'),false);
  assert.match(content,/DEFAULT_SERVICE_WORKER_SCOPE\s*=\s*'\/__p2lrn__\/'/u);
});

test('H5P runtime exposes only the canonical protocol and blocks popup capability',async()=>{
  for(const relative of [
    'packages/toolkit/web/h5p-runtime-shell.js',
    'packages/toolkit/web/renderers/h5p-runtime.js',
  ]){
    const content=await readFile(resolve(root,relative),'utf8');
    assert.equal(content.includes('p2rln-h5p-runtime/1'),false,relative);
    assert.equal(content.includes('allow-popups'),false,relative);
  }
});

test('static resource bridge rejects traversal and oversized route registries',()=>{
  const traversal=route();
  traversal.resources={'../asset.bin':traversal.resources['video.mp4']};
  assert.throws(()=>validateRouteConfig(traversal),/Invalid P2LRN virtual logical path/);

  const embedded=route();
  embedded.resources['video.mp4']={...embedded.resources['video.mp4'],embeddedPath:'../payload.bin'};
  assert.throws(()=>validateRouteConfig(embedded),/Invalid embedded path/i);

  const many=route();
  many.resources={};
  for(let i=0;i<MAX_ROUTE_RESOURCES+1;i++){
    many.resources[`asset-${i}.bin`]={
      embeddedPath:`payload/asset-${i}.bin`,
      mediaType:'application/octet-stream',
      size:1,
      byteDigest:'sha256:'+'c'.repeat(64),
      archiveEntry:{localOffset:0,method:0,compressedSize:1,uncompressedSize:1},
      rangeIntegrity:null,
    };
  }
  assert.throws(()=>validateRouteConfig(many),/too many resources/i);
});


test('Service Worker source URL policy rejects credentials and avoids persisting signed URLs',()=>{
  assert.throws(()=>validateRouteConfig(route('https://user:pass@example.invalid/course.p2lrn')),/must not contain credentials/i);
  assert.throws(()=>validateRouteConfig(route('https://example.invalid/course.p2lrn#secret')),/must not contain a fragment/i);
  const signed=validateRouteConfig(route('https://example.invalid/course.p2lrn?token=secret'));
  assert.equal(signed.sourceUrl,'https://example.invalid/course.p2lrn?token=secret');
  assert.equal(routeSourceMayPersist(signed.sourceUrl),false);
  assert.equal(routeSourceMayPersist('https://example.invalid/course.p2lrn'),true);
});

test('Service Worker only accepts messages from the expected origin',()=>{
  assert.equal(trustedWorkerMessageSource({url:'https://example.invalid/page'},'https://example.invalid'),true);
  assert.equal(trustedWorkerMessageSource({url:'https://attacker.invalid/page'},'https://example.invalid'),false);
  assert.equal(trustedWorkerMessageSource(null,'https://example.invalid'),false);
});

test('bounded HTTP reader cancels oversized bodies before full buffering',async()=>{
  const oversized=new Response(new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array([1,2]));controller.close();}
  }));
  await assert.rejects(
    ()=>readResponseBounded(oversized,1,{exact:true,label:'test response'}),
    /exceeds safe limit/i,
  );

  const truncated=new Response(new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array([1]));controller.close();}
  }));
  await assert.rejects(
    ()=>readResponseBounded(truncated,2,{exact:true,label:'test response'}),
    /body length mismatch/i,
  );
});

