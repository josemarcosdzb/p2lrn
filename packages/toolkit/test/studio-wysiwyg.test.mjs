import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=(path)=>readFile(new URL(`../../..${path}`,import.meta.url),'utf8');

test('viewer Studio reuses the Player as an inline WYSIWYG editor',async()=>{
  const [player,passive,viewer,html]=await Promise.all([
    read('/packages/toolkit/web/p2lrn-player.js'),
    read('/packages/toolkit/web/renderers/passive-text.js'),
    read('/deploy/netlify/site/demo/viewer.js'),
    read('/deploy/netlify/site/demo/index.html'),
  ]);
  assert.match(player,/['"]editable['"]/);
  assert.match(player,/applyEditCommand/);
  assert.match(player,/setEditDraft/);
  assert.match(player,/shadowRoot\?\.activeElement/);
  assert.match(player,/p2lrn:edit/);
  assert.match(passive,/p2lrn-wysiwyg-surface/);
  assert.match(passive,/contentEditable='true'/);
  assert.match(viewer,/data-edit-command/);
  assert.match(viewer,/localStorage\.setItem/);
  assert.match(viewer,/localStorage\.getItem/);
  assert.match(html,/data-studio-toolbar/);
  assert.doesNotMatch(viewer,/aulap2p/i);
});
