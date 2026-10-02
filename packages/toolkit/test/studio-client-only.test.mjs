import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

test('Studio export is client-only and non-persistent',async()=>{
  const studio=await readFile(resolve('../../deploy/netlify/site/studio/studio.js'),'utf8');
  assert.doesNotMatch(studio,/localStorage|sessionStorage|indexedDB|IDBDatabase/i);
  assert.doesNotMatch(studio,/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
  assert.doesNotMatch(studio,/navigator\.sendBeacon/i);
  assert.match(studio,/URL\.createObjectURL/);
  assert.match(studio,/anchor\.download/);
  assert.match(studio,/openPackageBytes/);
});
