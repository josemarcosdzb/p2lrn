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
  assert.match(html,/<strong data-save-state>No guardado<\/strong>/,
    'The unsaved draft must be visually identified before any edit');
  assert.match(studio,/saveState\.textContent=studioUiText\('No guardado'\)/,
    'Unsaved changes must retain a localized, explicit status');
  assert.match(html,/Guardar borrador/);
  assert.match(html,/Eliminar borrador/);
  assert.match(studio,/confirm\(/);
  assert.doesNotMatch(studio+drafts,/method\s*:\s*['"](?:PUT|PATCH|DELETE)['"]/i);
  const posts=[...(studio.matchAll(/method\s*:\s*['"]POST['"]/gi))];
  assert.equal(posts.length,2);
  assert.match(studio,/async function addReaderFile[\s\S]*method\s*:\s*['"]POST['"]/i);
  assert.match(studio,/async function importExternalFile[\s\S]*method\s*:\s*['"]POST['"]/i);
  assert.match(studio,/readerEndpoint|studio\/read/);
  assert.match(studio,/importEndpoint|studio\/import/);

  assert.doesNotMatch(studio+drafts,/navigator\.sendBeacon/i);
  assert.match(studio,/anchor\.download/);
});
