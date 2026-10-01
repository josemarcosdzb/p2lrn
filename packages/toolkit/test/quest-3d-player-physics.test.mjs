import assert from 'node:assert/strict';
import test from 'node:test';
import {createNoPhysicsWorld} from '../web/game-3d/physics/no-physics.js';

test('Quest 3D fallback physics lets player contact move standalone blocks',async()=>{
  const world=await createNoPhysicsWorld();
  world.createBox({id:'block',position:[0,0.7,0]});
  const before=world.transform('block').translation;
  assert.equal(world.applyImpulse('block',[2,0,1]),true);
  const after=world.transform('block').translation;
  assert.ok(after.x>before.x);
  assert.ok(after.z>before.z);
  world.destroy();
});
