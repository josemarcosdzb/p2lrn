import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {normalizeRuntimeBaseUrl} from '../web/runtime-host-config.js';
import {validateRouteConfig} from '../web/p2lrn-sw.js';

const root=resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function route(sourceUrl='https://example.invalid/course.p2lrn'){
  return {
    version:'1',
    routeId:'a'.repeat(32),
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

test('static resource bridge rejects non-local HTTP package sources',()=>{
  assert.equal(validateRouteConfig(route()).sourceUrl,'https://example.invalid/course.p2lrn');
  assert.equal(validateRouteConfig(route('http://localhost:3000/course.p2lrn')).sourceUrl,'http://localhost:3000/course.p2lrn');
  assert.throws(()=>validateRouteConfig(route('http://example.com/course.p2lrn')),/requires HTTPS/i);
});

test('distribution source contains no sandbox escape token',async()=>{
  const files=[
    'packages/toolkit/web/renderers/h5p-runtime.js',
    'packages/toolkit/web/renderers/scorm-runtime.js',
    'packages/toolkit/web/renderers/package-runtime.js',
    'packages/toolkit/web/runtime-host/h5p-host.js',
    'packages/toolkit/web/runtime-host/scorm-host.js',
    'packages/toolkit/web/runtime-host/package-host.js',
  ];
  for(const relative of files){
    const content=await readFile(resolve(root,relative),'utf8');
    assert.equal(content.includes('allow-popups-to-escape-sandbox'),false,relative);
  }
});

test('only the canonical P2LRN CI workflow remains',async()=>{
  const dir=resolve(root,'.github/workflows');
  const names=(await readdir(dir)).filter(name=>/\.ya?ml$/i.test(name)).sort();
  assert.deepEqual(names,['p2lrn-ci.yml']);
});
