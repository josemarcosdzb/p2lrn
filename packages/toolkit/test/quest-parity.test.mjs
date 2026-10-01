import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=(path)=>readFile(new URL(`../web/${path}`,import.meta.url),'utf8');

test('Quest standalone renderers keep AulaP2P interaction parity without importing AulaP2P', async()=>{
  const [matching,classification,wordSearch,three,renderer3d]=await Promise.all([
    read('renderers/questionnaire-matching.js'),
    read('renderers/questionnaire-classification.js'),
    read('renderers/questionnaire-word-search.js'),
    read('game-3d/three-runtime.js'),
    read('renderers/questionnaire-3d.js'),
  ]);
  const all=[matching,classification,wordSearch,three,renderer3d].join('\n');
  assert.equal(/aulap2p/i.test(all),false);
  assert.match(matching,/p2lrn-match-connections/);
  assert.match(classification,/dragstart/);
  assert.match(classification,/pointermove/);
  assert.match(wordSearch,/pointermove/);
  assert.match(wordSearch,/normalizeWord/);
  assert.match(three,/simulateRope/);
  assert.match(three,/new THREE\.BoxGeometry/);
  assert.match(renderer3d,/randomRoomPositions/);
});
