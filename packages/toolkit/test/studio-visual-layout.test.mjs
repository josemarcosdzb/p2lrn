import test from 'node:test';
import assert from 'node:assert/strict';
import {VISUAL_LAYOUT_BLOCKS,mountVisualLayoutTools} from '../web/studio/visual-layout.js';

test('Studio visual layout exposes semantic, distinct insertion tools',()=>{
  assert.deepEqual(VISUAL_LAYOUT_BLOCKS.map(item=>item.id),['section','columns','callout','table','text-box','shape','divider']);
  assert.equal(new Set(VISUAL_LAYOUT_BLOCKS.map(item=>item.id)).size,7);
});

test('Studio visual editor refuses missing editable surfaces',()=>{
  assert.throws(()=>mountVisualLayoutTools({}),/require host and editable surface/);
});
