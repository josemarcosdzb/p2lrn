import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

test('public Player and demo stay read-only; Studio is a separate authoring surface',async()=>{
  const [player,passive,demo]=await Promise.all([
    readFile(new URL('../web/p2lrn-player.js',import.meta.url),'utf8'),
    readFile(new URL('../web/renderers/passive-text.js',import.meta.url),'utf8'),
    readFile(resolve('../../deploy/netlify/site/demo/index.html'),'utf8'),
  ]);
  assert.doesNotMatch(player,/applyEditCommand|setEditDraft|p2lrn:edit/);
  assert.doesNotMatch(passive,/contentEditable|commitEdit|editOverride/);
  assert.doesNotMatch(demo,/data-edit-mode|data-studio-toolbar/);
});
