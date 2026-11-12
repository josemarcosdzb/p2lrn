import test from 'node:test';
import assert from 'node:assert/strict';
import {VISUAL_LAYOUT_BLOCKS,mountVisualLayoutTools} from '../web/studio/visual-layout.js';

test('Studio visual layout exposes semantic, distinct insertion tools',()=>{
  assert.deepEqual(VISUAL_LAYOUT_BLOCKS.map(item=>item.id),['section','columns','three-columns','diagram-canvas','callout','table','text-box','shape','dropdown','drag-drop','divider']);
  assert.equal(new Set(VISUAL_LAYOUT_BLOCKS.map(item=>item.id)).size,11);
});

test('Studio visual editor refuses missing editable surfaces',()=>{
  assert.throws(()=>mountVisualLayoutTools({}),/require host and editable surface/);
});

test('Studio learner preview uses the Player source transaction and tracks lesson navigation',async()=>{
 const hosted=await readFile(new URL('../../../deploy/netlify/site/studio/studio.js',import.meta.url),'utf8');
 const english=await readFile(new URL('../../../deploy/netlify/site/en/studio/studio.js',import.meta.url),'utf8');
 for(const text of [hosted,english]){
  assert.match(text,/player\.loadSource\(next,\{node:selectedId\}\)/);
  assert.match(text,/player\.addEventListener\('p2lrn:nodechange'/);
  assert.match(text,/selectedId=id;\s*renderTree\(\)/);
  assert.match(text,/details\.studio-tree-module/);
 }
});
