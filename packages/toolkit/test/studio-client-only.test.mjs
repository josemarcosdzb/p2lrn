import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

test('Studio persists drafts only in the client browser and never uploads them',async()=>{
  const [studio,drafts]=await Promise.all([
    readFile(resolve('../../deploy/netlify/site/studio/studio.js'),'utf8'),
    readFile(new URL('../web/studio/browser-drafts.js',import.meta.url),'utf8'),
  ]);
  assert.doesNotMatch(studio,/localStorage|sessionStorage/i);
  assert.match(drafts,/indexedDB\.open/);
  assert.match(drafts,/saveLatestDraft/);
  assert.match(drafts,/loadLatestDraft/);
  assert.match(studio,/scheduleAutosave/);
  assert.match(studio,/Recuperar borrador local/);
  assert.doesNotMatch(studio+drafts,/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
  assert.doesNotMatch(studio+drafts,/navigator\.sendBeacon/i);
  assert.match(studio,/URL\.createObjectURL/);
  assert.match(studio,/anchor\.download/);
});
