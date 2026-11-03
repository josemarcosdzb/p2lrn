import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {playerUiText,playerDiagnosticText,PLAYER_UI_TRANSLATIONS} from '../web/renderers/ui-i18n.js';
import {COURSE_RIGHTS_EXTENSION,renderCourseRights} from '../web/course-rights.js';

const es={documentElement:{lang:'es'}};
const en={documentElement:{lang:'en'}};

test('Player translates only UI labels; user-authored content is untouched',()=>{
  assert.equal(playerUiText('Finalizar actividad',en),'Finish activity');
  assert.equal(playerUiText('Finalizar actividad',es),'Finalizar actividad');
  assert.equal(playerUiText('¿Cuál es la capital de España?',en),'¿Cuál es la capital de España?');
  assert.equal(playerUiText('Pregunta 2 de 5',en),'Question 2 of 5');
  assert.equal(playerUiText('Progreso: pregunta 2 de 5',en),'Progress: question 2 of 5');
  assert.equal(playerUiText('Faltan 2 preguntas obligatorias.',en),'2 required questions are missing.');
  assert.equal(playerUiText('Faltan 1 pregunta obligatoria.',en),'1 required question is missing.');
  assert.equal(playerUiText('Intentos agotados (3/3).',en),'Attempts exhausted (3/3).');
  assert.equal(playerUiText('Respuesta encontrada. 2/5.',en),'Answer found. 2/5.');
  assert.equal(playerUiText('Tiempo restante: 35s',en),'Time remaining: 35s');
  assert.equal(playerUiText('Pareja correcta. 2/4 parejas.',en),'Correct match. 2/4 pairs.');
  assert.equal(playerUiText('3 participantes conectados',en),'3 participants connected');
  assert.equal(playerUiText('1 participante conectado',en),'1 participant connected');
  assert.equal(playerUiText('Crucigrama entregado: 2/3 puntos.',en),'Crossword submitted: 2/3 points.');
  assert.equal(playerUiText('Esta actividad ya está finalizada.',es),'Esta actividad ya está finalizada.');
  assert.ok(PLAYER_UI_TRANSLATIONS>=242);
});

test('incompatible game diagnostics are localized without changing question IDs',()=>{
  assert.equal(playerDiagnosticText('q1: el rosco necesita exactamente un reto por pregunta.',en),
    'q1: the word wheel requires exactly one challenge per question.');
  assert.equal(playerDiagnosticText('q1: el rosco necesita exactamente un reto por pregunta.',es),
    'q1: el rosco necesita exactamente un reto por pregunta.');
  assert.equal(playerDiagnosticText('Sólo se pudieron colocar 4 de 5 respuestas; no se genera una versión parcial.',en),
    'Only 4 of 5 answers could be placed; a partial version is not generated.');
  assert.equal(playerDiagnosticText('q1: texto privado sin traducir',en),'q1: texto privado sin traducir');
});

test('Player rights metadata keeps authored names and licenses unmodified',()=>{
  const original=globalThis.document;
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.hidden=false;}
    replaceChildren(...nodes){this.children=[...nodes];}
    append(...nodes){this.children.push(...nodes);}
  }
  const fakeDoc={documentElement:{lang:'en'},createElement(tag){return new Element(tag);}};
  try{
    globalThis.document=fakeDoc;
    const target=new Element('section');
    renderCourseRights(target,{type:'course',extensions:{
      [COURSE_RIGHTS_EXTENSION]:{author:'La profesora Ana',license:'Licencia CC BY 4.0'}
    }});
    assert.equal(target.hidden,false);
    assert.equal(target.children[0].textContent,'Authorship and rights');
    const fields=target.children[1].children;
    assert.deepEqual(fields.map(node=>node.textContent),[
      'Content author','La profesora Ana','License · Terms of use and distribution','Licencia CC BY 4.0'
    ]);
    fakeDoc.documentElement.lang='es';
    renderCourseRights(target,{type:'course',extensions:{
      [COURSE_RIGHTS_EXTENSION]:{author:'La profesora Ana'}
    }});
    assert.equal(target.children[0].textContent,'Autoría y derechos');
  }finally{globalThis.document=original;}
});

test('game renderers route fixed statuses through language keys',async()=>{
  const paths=[
    'questionnaire-memory.js','questionnaire-true-false.js',
    'questionnaire-crossword.js','questionnaire-3d.js','component-collaboration.js'
  ];
  for(const path of paths){
    const src=await readFile(new URL('../web/renderers/'+path,import.meta.url),'utf8');
    assert.match(src,/playerUiText/);
    assert.doesNotMatch(src,/status\.textContent\s*=\s*['"](?:Pareja correcta|Elige verdadero|Crucigrama reiniciado|Ronda terminada)/);
  }
  const q=await readFile(new URL('../web/questionnaire-runtime.js',import.meta.url),'utf8');
  assert.match(q,/playerUiText\(\x60Pregunta \$\{/);
  assert.match(q,/playerUiText\('Respuesta escrita'\)/);
  const p=await readFile(new URL('../web/p2lrn-player.js',import.meta.url),'utf8');
  assert.match(p,/title\.en \?\? title\.es/);
});
