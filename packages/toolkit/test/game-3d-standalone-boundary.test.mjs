import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const standaloneFiles=[
  'web/game-3d-mechanics.js',
  'web/game-3d/three-runtime.js',
  'web/game-3d/physics/rapier-adapter.js',
  'web/game-3d/physics/no-physics.js',
  'web/renderers/questionnaire-3d.js',
];

test('P2LRN 3D runtime remains independent from AulaP2P, React and Next',()=>{
  for(const relative of standaloneFiles){
    const source=readFileSync(resolve(root,relative),'utf8');
    assert.doesNotMatch(source,/aulap2p/iu,relative);
    assert.doesNotMatch(source,/@react-three|react-three|from\s+['"]react['"]|from\s+['"]next\//iu,relative);
  }
});

test('P2LRN 3D runtime only references locally distributed rendering/physics modules',()=>{
  const three=readFileSync(resolve(root,'web/game-3d/three-runtime.js'),'utf8');
  const rapier=readFileSync(resolve(root,'web/game-3d/physics/rapier-adapter.js'),'utf8');
  assert.match(three,/\.\.\/vendor\/three\.module\.js/u);
  assert.match(rapier,/\.\.\/\.\.\/vendor\/rapier3d\.mjs/u);
  assert.doesNotMatch(three,/https?:\/\//u);
  assert.doesNotMatch(rapier,/https?:\/\//u);
});
