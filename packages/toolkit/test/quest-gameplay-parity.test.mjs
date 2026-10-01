import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=(path)=>readFile(new URL(`../web/renderers/${path}`,import.meta.url),'utf8');

test('Quest 2D gameplay mirrors AulaP2P flow while staying standalone',async()=>{
  const [memory,ordering,trueFalse,crossword,rosco]=await Promise.all([
    read('questionnaire-memory.js'),
    read('questionnaire-ordering.js'),
    read('questionnaire-true-false.js'),
    read('questionnaire-crossword.js'),
    read('questionnaire-rosco.js'),
  ]);
  assert.match(memory,/3000/);
  assert.match(memory,/separationScore/);
  assert.match(memory,/700/);
  assert.match(ordering,/dragstart/);
  assert.match(ordering,/Mezclar de nuevo/);
  assert.match(ordering,/Todavía hay elementos fuera de posición/);
  assert.match(trueFalse,/Incorrecto: era/);
  assert.match(trueFalse,/Repetir ronda/);
  assert.match(crossword,/de .* letras están correctas/);
  assert.match(crossword,/Crucigrama reiniciado/);
  assert.match(rosco,/Respuesta esperada/);
  assert.match(rosco,/Letra aplazada/);
  assert.equal(/from ['"][^'"]*aulap2p/i.test([memory,ordering,trueFalse,crossword,rosco].join('\n')),false);
});
