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
