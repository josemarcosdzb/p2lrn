import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=(path)=>readFile(new URL(`../web/${path}`,import.meta.url),'utf8');

test('Quest 3D preserves camera and physics while offering direct taps and analog mobile movement',async()=>{
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
  assert.match(runtime,/applyImpulse/);
  assert.match(runtime,/function carry\(/);
  assert.match(runtime,/syncCarried/);
  assert.match(runtime,/connectToPlayer/);
  assert.match(runtime,/setMovementVector/);
  assert.match(renderer,/Haz clic en la escena para entrar/);
  assert.match(renderer,/Haz clic en una caja azul/);
  assert.match(renderer,/createVirtualJoystick/);
  assert.doesNotMatch(renderer,/if\(scene\.playerDistanceTo\(/);
  assert.match(renderer,/scene\.carry/);
  assert.match(renderer,/scene\.connectToPlayer/);
  assert.equal(/aulap2p/i.test(runtime+renderer),false);
});
