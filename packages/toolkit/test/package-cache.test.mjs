import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import test from 'node:test';
import {cacheP2LRNPackageURL,openCachedP2LRNPackage,openP2LRNPackageURL} from '../web/p2lrn-player.js';
import {createMemoryPackageCache,createPackageCacheFetch} from '../web/package-cache.js';

const here=dirname(fileURLToPath(import.meta.url));
const fixture=join(here,'..','..','..','examples','canonical','minimal-course.p2lrn');

test('verified package cache reopens the same package with network unavailable',async()=>{
  const sourceUrl='https://courses.example.test/minimal.p2lrn';
  const bytes=await readFile(fixture);
  const store=createMemoryPackageCache();
  let downloads=0;
  const cached=await cacheP2LRNPackageURL(sourceUrl,{store,fetchImpl:async()=>{downloads++;return new Response(bytes,{status:200,headers:{'Content-Length':String(bytes.byteLength)}});}});
  assert.equal(downloads,1);
  assert.match(cached.contentRoot,/^sha256:[0-9a-f]{64}$/);
  const offlineFetch=async()=>{throw new TypeError('offline');};
  const reopened=await openP2LRNPackageURL(sourceUrl,{packageCache:store,fetchImpl:offlineFetch});
  assert.equal(reopened.manifest.integrity.contentRoot,cached.contentRoot);
  assert.equal(reopened.sourceUrl,sourceUrl);
  const byRoot=await openCachedP2LRNPackage(cached.contentRoot,{store});
  assert.equal(byRoot.manifest.packageId,cached.packageId);
  assert.equal(byRoot.sourceUrl,sourceUrl);
});

test('package cache fetch serves exact HTTP ranges from verified cached bytes',async()=>{
  const sourceUrl='https://courses.example.test/range.p2lrn';
  const bytes=await readFile(fixture);
  const store=createMemoryPackageCache();
  const verified=await cacheP2LRNPackageURL(sourceUrl,{store,fetchImpl:async()=>new Response(bytes,{status:200})});
  const fetchCached=createPackageCacheFetch({store,networkFetch:null});
  const response=await fetchCached(sourceUrl,{headers:{Range:'bytes=0-0'}});
  assert.equal(response.status,206);
  assert.equal(response.headers.get('Content-Range'),`bytes 0-0/${bytes.byteLength}`);
  const body=new Uint8Array(await response.arrayBuffer());
  assert.equal(body.byteLength,1);
  assert.equal(body[0],bytes[0]);
  assert.equal((await store.getByContentRoot(verified.contentRoot)).size,bytes.byteLength);
});

test('cached packages are revalidated on open instead of trusting cache metadata',async()=>{
  const sourceUrl='https://courses.example.test/tampered.p2lrn';
  const bytes=await readFile(fixture);
  const store=createMemoryPackageCache();
  const cached=await cacheP2LRNPackageURL(sourceUrl,{store,fetchImpl:async()=>new Response(bytes,{status:200})});
  const corrupted=Uint8Array.from(bytes);
  corrupted[0]^=0xff;
  await store.put({sourceUrl,contentRoot:cached.contentRoot,packageId:cached.packageId,bytes:corrupted.buffer});
  await assert.rejects(()=>openCachedP2LRNPackage(cached.contentRoot,{store}));
});
