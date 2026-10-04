import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

test('Studio saves local drafts only on explicit user action and warns about unsaved changes',async()=>{
  const [studio,drafts,html]=await Promise.all([
    readFile(resolve('../../deploy/netlify/site/studio/studio.js'),'utf8'),
    readFile(new URL('../web/studio/browser-drafts.js',import.meta.url),'utf8'),
    readFile(resolve('../../deploy/netlify/site/studio/index.html'),'utf8'),
  ]);
  assert.match(drafts,/indexedDB\.open/);
  assert.match(studio,/saveDraftButton.*addEventListener/);
  assert.doesNotMatch(studio,/scheduleAutosave/);
  assert.doesNotMatch(studio,/setTimeout\([^\n]*persistDraft/);
  assert.match(studio,/beforeunload/);
  assert.match(studio,/event\.returnValue/);
  assert.match(html,/Cambios sin guardar/);
  assert.match(html,/Guardar borrador/);
  assert.match(html,/Eliminar borrador/);
  assert.match(studio,/confirm\(/);
  assert.doesNotMatch(studio+drafts,/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
  assert.doesNotMatch(studio+drafts,/navigator\.sendBeacon/i);
  assert.match(studio,/anchor\.download/);
});
