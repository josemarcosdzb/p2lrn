import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {computeContentRoot, contentDigest, sha256} from '../dist/core/integrity.js';
import {PROFILE} from '../dist/core/constants.js';
import {validatePackageFile} from '../dist/core/validator.js';
import {writeZip} from '../dist/core/zip.js';
import {createMultipartPackage} from '../dist/tools/multipart.js';
import {representationPayload} from '../web/package-member.js';

const enc = new TextEncoder();
function json(value) { return enc.encode(JSON.stringify(value, null, 2) + '\n'); }

function createSource(path) {
  const payload = new Uint8Array(3 * 1024 * 1024 + 123);
  for (let i = 0; i < payload.length; i += 1) payload[i] = (i * 31 + 7) & 0xff;

  const payloadPath = 'assets/large.bin';
  const graph = {
    graphVersion:'0.4.0',
    entities:[
      {id:'urn:test:course', type:'course', revision:1, title:{en:'Multipart test'}, children:['urn:test:activity']},
      {id:'urn:test:activity', type:'activity', activityType:'urn:test:binary', title:{en:'Binary'}, resource:'urn:test:resource'},
      {id:'urn:test:resource', type:'resource', representations:[
        {id:'urn:test:rep', role:'primary', mediaType:'application/octet-stream', location:{type:'embedded', path:payloadPath}},
      ]},
    ],
    relations:[],
  };
  const graphBytes = json(graph);
  const manifest = {
    format:'P2LRN',
    formatVersion:'0.4.0',
    packageId:'urn:test:multipart-source',
    entrypoints:[{id:'urn:test:course', type:'course', role:'primary'}],
    graph:{
      path:'content/graph.json',
      schema:'https://p2lrn.org/schema/graph/0.4.0',
      mediaType:'application/json',
      size:graphBytes.byteLength,
      byteDigest:sha256(graphBytes),
      contentDigest:contentDigest(graphBytes,'application/json','content/graph.json'),
    },
    profiles:[{id:PROFILE.course,version:'0.4.0',requirement:'required'}],
    files:[{
      path:payloadPath,
      mediaType:'application/octet-stream',
      size:payload.byteLength,
      byteDigest:sha256(payload),
      contentDigest:sha256(payload),
    }],
    integrity:{algorithm:'sha256',contentRoot:'sha256:'+'0'.repeat(64)},
  };
  manifest.integrity.contentRoot = computeContentRoot(manifest);
  const bytes = writeZip([
    {path:'META-INF/manifest.json',data:json(manifest),mediaType:'application/json',method:8},
    {path:'content/graph.json',data:graphBytes,mediaType:'application/json',method:8},
    {path:payloadPath,data:payload,mediaType:'application/octet-stream',method:0},
  ]);
  writeFileSync(path, bytes);
  return payload;
}

test('multipart splitter emits adjacent verified parts and web payload reconstructs them', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p2lrn-multipart-'));
  const source = join(dir, 'source.p2lrn');
  const output = join(dir, 'course.p2lrn');
  const original = createSource(source);

  const result = createMultipartPackage(source, output, {partSize:1024*1024});
  assert.equal(result.parts.length, 4);
  assert.ok(result.outerBytes < 100000);

  const validated = validatePackageFile(output, {strictProfiles:true, validateProfilePayloads:true});
  assert.ok(validated.manifest.profiles.some((profile) => profile.id === PROFILE.multipart));
  const resource = validated.graph.entities.find((entity) => entity.id === 'urn:test:resource');
  const representation = resource.representations[0];
  assert.equal(representation.location.type, 'embedded');
  assert.equal(representation.extensions[PROFILE.multipart].version, '1');

  const descriptorFile = validated.manifest.files.find((file) => file.path === representation.location.path);
  const pkg = {
    sourceUrl:'https://academy.example/courses/course.p2lrn',
    payload(path) {
      assert.equal(path, representation.location.path);
      return {
        path,
        mediaType:descriptorFile.mediaType,
        size:descriptorFile.size,
        byteDigest:descriptorFile.byteDigest,
        contentDigest:descriptorFile.contentDigest,
        read:async()=>validated.archive.read(path),
      };
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const name = new URL(String(url)).pathname.split('/').at(-1);
    const bytes = readFileSync(join(dir, name));
    return new Response(bytes, {status:200});
  };
  try {
    const payload = await representationPayload(pkg, representation);
    const rebuilt = await payload.read();
    assert.deepEqual(rebuilt, original);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const corrupt = join(dir, result.parts[1].href);
  const damaged = new Uint8Array(readFileSync(corrupt));
  damaged[0] ^= 0xff;
  writeFileSync(corrupt, damaged);

  globalThis.fetch = async (url) => {
    const name = new URL(String(url)).pathname.split('/').at(-1);
    return new Response(readFileSync(join(dir, name)), {status:200});
  };
  try {
    const payload = await representationPayload(pkg, representation);
    await assert.rejects(() => payload.read(), /SHA-256 mismatch/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('multipart preserves package-member views used by SCORM/cmi5/IMS style packages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p2lrn-multipart-member-'));
  const source = join(dir, 'source.p2lrn');
  const output = join(dir, 'course.p2lrn');

  const asset = new Uint8Array(2 * 1024 * 1024 + 321);
  for (let i = 0; i < asset.length; i += 1) asset[i] = (i * 17 + (i >>> 8) * 29 + 11) & 0xff;
  const indexHtml = enc.encode('<!doctype html><html><body><h1>Launch OK</h1><script>window.__P2LRN_TEST__=1;</script></body></html>');
  const nestedZip = writeZip([
    {path:'index.html', data:indexHtml, mediaType:'text/html', method:8},
    {path:'assets/data.bin', data:asset, mediaType:'application/octet-stream', method:0},
  ]);
  const packageDigest = sha256(nestedZip);
  const hex = packageDigest.slice(7);
  const packagePath = 'packages/sha256/' + hex.slice(0,2) + '/' + hex.slice(2,4) + '/' + hex;

  const graph = {
    graphVersion:'0.4.0',
    entities:[
      {id:'urn:test:course-member', type:'course', revision:1, title:{en:'Multipart member test'}, children:['urn:test:activity-member']},
      {id:'urn:test:activity-member', type:'activity', activityType:'urn:test:package', title:{en:'Package'}, resource:'urn:test:resource-member'},
      {id:'urn:test:resource-member', type:'resource', representations:[
        {id:'urn:test:rep-package', role:'original-package', mediaType:'application/zip', location:{type:'embedded', path:packagePath}},
        {id:'urn:test:rep-member', role:'primary', mediaType:'text/html', location:{type:'package-member', package:packagePath, member:'index.html'}},
      ]},
    ],
    relations:[],
  };
  const graphBytes = json(graph);
  const manifest = {
    format:'P2LRN',
    formatVersion:'0.4.0',
    packageId:'urn:test:multipart-member-source',
    entrypoints:[{id:'urn:test:course-member', type:'course', role:'primary'}],
    graph:{
      path:'content/graph.json',
      schema:'https://p2lrn.org/schema/graph/0.4.0',
      mediaType:'application/json',
      size:graphBytes.byteLength,
      byteDigest:sha256(graphBytes),
      contentDigest:contentDigest(graphBytes,'application/json','content/graph.json'),
    },
    profiles:[{id:PROFILE.course,version:'0.4.0',requirement:'required'}],
    files:[{
      path:packagePath,
      mediaType:'application/zip',
      size:nestedZip.byteLength,
      byteDigest:packageDigest,
      contentDigest:packageDigest,
    }],
    integrity:{algorithm:'sha256',contentRoot:'sha256:'+'0'.repeat(64)},
  };
  manifest.integrity.contentRoot = computeContentRoot(manifest);
  writeFileSync(source, writeZip([
    {path:'META-INF/manifest.json',data:json(manifest),mediaType:'application/json',method:8},
    {path:'content/graph.json',data:graphBytes,mediaType:'application/json',method:8},
    {path:packagePath,data:nestedZip,mediaType:'application/zip',method:0},
  ]));

  const result = createMultipartPackage(source, output, {partSize:1024*1024});
  assert.ok(result.parts.length >= 2);
  const validated = validatePackageFile(output, {strictProfiles:true, validateProfilePayloads:true});
  const resource = validated.graph.entities.find((entity) => entity.id === 'urn:test:resource-member');
  const wholeRep = resource.representations.find((rep) => rep.id === 'urn:test:rep-package');
  const memberRep = resource.representations.find((rep) => rep.id === 'urn:test:rep-member');

  assert.equal(wholeRep.location.type, 'embedded');
  assert.equal(memberRep.location.type, 'embedded');
  assert.equal(wholeRep.location.path, memberRep.location.path);
  assert.equal(wholeRep.extensions[PROFILE.multipart].version, '1');
  assert.equal(memberRep.extensions[PROFILE.multipart].member, 'index.html');

  const descriptorFile = validated.manifest.files.find((file) => file.path === wholeRep.location.path);
  const pkg = {
    sourceUrl:'https://academy.example/courses/course.p2lrn',
    payload(path) {
      assert.equal(path, wholeRep.location.path);
      return {
        path,
        mediaType:descriptorFile.mediaType,
        size:descriptorFile.size,
        byteDigest:descriptorFile.byteDigest,
        contentDigest:descriptorFile.contentDigest,
        read:async()=>validated.archive.read(path),
      };
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const name = new URL(String(url)).pathname.split('/').at(-1);
    return new Response(readFileSync(join(dir, name)), {status:200});
  };
  try {
    const whole = await representationPayload(pkg, wholeRep);
    assert.deepEqual(await whole.read(), nestedZip);

    const member = await representationPayload(pkg, memberRep);
    assert.equal(member.member, 'index.html');
    assert.deepEqual(await member.read(), indexHtml);
    assert.ok(member.nested.has('assets/data.bin'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
