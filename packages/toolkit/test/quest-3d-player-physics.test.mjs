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

import {createDefaultDependencyRegistry,DOM_DEPENDENCY,WEBGL2_DEPENDENCY} from '../web/dependency-registry.js';
import {RendererRegistry,THREE_D_RENDERER} from '../web/renderer-registry.js';
import {registerBuiltInRenderers} from '../web/built-in-renderers.js';

test('3D retains its own accessible renderer without WebGL2, without weakening hard dependencies',async()=>{
  const dependencies=createDefaultDependencyRegistry();
  const registry=registerBuiltInRenderers(new RendererRegistry({dependencies}));
  const three=registry.get(THREE_D_RENDERER);
  assert.deepEqual(three.dependencies,[DOM_DEPENDENCY,{id:WEBGL2_DEPENDENCY,optional:true}]);
  const oldDocument=globalThis.document,oldHTMLElement=globalThis.HTMLElement;
  globalThis.document={createElement:()=>({getContext:()=>null})};
  globalThis.HTMLElement=class {};
  try{
    await assert.doesNotReject(()=>dependencies.resolve(three.dependencies));
    await assert.rejects(()=>dependencies.resolve([DOM_DEPENDENCY,WEBGL2_DEPENDENCY]),
      {code:'P2LRN_DEPENDENCY_UNAVAILABLE'});
    delete globalThis.document;
    await assert.rejects(()=>dependencies.resolve(three.dependencies),
      {code:'P2LRN_DEPENDENCY_UNAVAILABLE'});
  }finally{
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
    if(oldHTMLElement===undefined)delete globalThis.HTMLElement;else globalThis.HTMLElement=oldHTMLElement;
  }
});

test('fallback room prevents dynamic boxes from leaving playable floor',async()=>{
  const world=await createNoPhysicsWorld();
  world.createBox({id:'bounded',position:[10,0.7,10],halfExtents:[0.75,0.45,0.75]});
  for(let i=0;i<20;i++)world.applyImpulse('bounded',[100,0,100]);
  let pos=world.transform('bounded').translation;
  assert.ok(pos.x<=11&&pos.z<=12,'box stayed inside perimeter');
  world.setTranslation('bounded',[999,-20,-999]);
  pos=world.transform('bounded').translation;
  assert.ok(pos.x<=11&&pos.z>=-12&&pos.y>=0.45,'teleport stays confined');
  world.destroy();
});
