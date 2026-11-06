import test from 'node:test';
import assert from 'node:assert/strict';
import {STUDIO_SHAPES,STUDIO_SHAPE_IDS,getStudioShape} from '../web/studio/studio-shapes.js';
import {setStudioDropBackground,createStudioDropActivity,addStudioDropPair} from '../web/studio/studio-drop-activity.js';
import {studioDropRuntimeSource} from '../web/renderers/lesson-drop-runtime.js';

test('Every reference palette form is unique, scalable and safe without inline SVG',()=>{
  assert.equal(STUDIO_SHAPES.length,23);
  assert.equal(new Set(STUDIO_SHAPE_IDS).size,23);
  for(const id of [
    'line','curve','wave','ellipse','square','rectangle','parallelogram',
    'triangle','right-triangle','diamond','pentagon','hexagon',
    'arrow-right','arrow-left','arrow-up','arrow-down',
    'star-4','star-5','star-6','star-8','speech-rect','speech-oval','thought',
  ])assert.ok(getStudioShape(id),'Missing editable form: '+id);
  for(const def of STUDIO_SHAPES){
    assert.equal(typeof def.label,'string');
    assert.ok(def.clip||def.radius||def.kind,'Shape is not drawable: '+def.id);
    assert.doesNotMatch(def.clip??'',/url|script|javascript|<svg|<path/i);
  }
  assert.equal(getStudioShape('not-a-shape'),null);
});

test('Authoring rejects untrusted and oversized drop-scene images',async()=>{
  const activity={matches:()=>true};
  await assert.rejects(
    ()=>setStudioDropBackground(activity,{type:'image/svg+xml',size:100,arrayBuffer:async()=>new ArrayBuffer(100)}),
    /PNG, JPEG, WebP, GIF o AVIF/,
  );
  await assert.rejects(
    ()=>setStudioDropBackground(activity,{type:'image/png',size:6*1024*1024,arrayBuffer:async()=>new ArrayBuffer(1)}),
    /hasta 5 MB/,
  );
});

test('Drag authoring includes matching zone and item APIs, not arbitrary scripts',()=>{
  const create=String(createStudioDropActivity);
  const add=String(addStudioDropPair);
  assert.match(create,/data-p2lrn-dnd/);
  assert.match(add,/data-p2lrn-dnd-accept/);
  assert.match(add,/data-p2lrn-dnd-item/);
  assert.match(add,/percent\(x\)/);
  assert.match(studioDropRuntimeSource,/data-p2lrn-dnd/);
  assert.match(studioDropRuntimeSource,/pointerdown/);
  assert.match(studioDropRuntimeSource,/keydown/);
  assert.match(studioDropRuntimeSource,/place\(item,zone\)/);
});
