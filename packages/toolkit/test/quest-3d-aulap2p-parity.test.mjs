import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=(path)=>readFile(new URL(`../web/${path}`,import.meta.url),'utf8');

test('Quest 3D mirrors AulaP2P movement, camera and proximity mechanics without dependencies',async()=>{
  const [runtime,renderer]=await Promise.all([
    read('game-3d/three-runtime.js'),
    read('renderers/questionnaire-3d.js'),
  ]);
  assert.match(runtime,/KeyW/);
  assert.match(runtime,/ArrowUp/);
  assert.match(runtime,/cameraYaw/);
  assert.match(runtime,/pointermove/);
  assert.match(runtime,/playerDistanceTo/);
  assert.match(runtime,/nudgePlayer/);
  assert.match(renderer,/Acércate al bloque/);
  assert.match(renderer,/Acércate al bloque de origen/);
  assert.match(renderer,/WASD\/flechas/);
  assert.equal(/aulap2p/i.test(runtime+renderer),false);
});
