import assert from 'node:assert/strict';
import test from 'node:test';
import {fillBlankDistractors,fillBlankInputMode,fillBlankParts,fillBlankTemplate,fillBlankWordBank} from '../web/fill-blanks-core.js';
import {validateQuestionnaire,scoreQuestion} from '../web/questionnaire-core.js';

const base=(overrides={})=>({
  schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
  version:'0.4.0',
  title:'Huecos',
  grading:{mode:'embedded-key'},
  questions:[{
    id:'q1',type:'fill-blanks',
    prompt:'En JavaScript, function declara una función y string representa texto.',
    points:2,
    blanks:[{id:'b1'},{id:'b2'}],
    solution:{answers:{b1:['function'],b2:['string']}},
    ...overrides,
  }],
});

test('legacy fill blanks masks known answers inline instead of revealing them',()=>{
  const question=base().questions[0];
  const built=fillBlankTemplate(question);
  assert.equal(built.usesPrompt,true);
  assert.equal(built.template.includes('function'),false);
  assert.equal(built.template.includes('string'),false);
  assert.match(built.template,/\{\{b1\}\}/);
  assert.match(built.template,/\{\{b2\}\}/);
  const parts=fillBlankParts(question);
  assert.deepEqual(parts.parts.filter((part)=>part.type==='blank').map((part)=>part.id),['b1','b2']);
});

test('fill blanks supports explicit typing and drag modes without changing scoring',()=>{
  const payload=base({
    prompt:'Completa el código',
    body:'const valor = {{b1}}(dato); // tipo {{b2}}',
    inputMode:'drag',
    blanks:[
      {id:'b1',options:['function','string','number']},
      {id:'b2',options:['function','string','number']},
    ],
  });
  validateQuestionnaire(payload);
  const question=payload.questions[0];
  assert.equal(fillBlankInputMode(question),'drag');
  assert.deepEqual(fillBlankWordBank(question).map((entry)=>entry.text),['function','string','number']);
  assert.deepEqual(fillBlankDistractors(question),['number']);
  const score=scoreQuestion(question,{blanks:{b1:'function',b2:'string'}});
  assert.equal(score.correct,true);
  assert.equal(score.pointsAwarded,2);
  question.inputMode='text';
  validateQuestionnaire(payload);
  assert.equal(fillBlankInputMode(question),'text');
});

test('fill blanks rejects unknown interaction modes',()=>{
  const payload=base({inputMode:'select'});
  assert.throws(()=>validateQuestionnaire(payload),/inputMode/);
});

test('underscore placeholders place draggable answers inline, not after the sentence',()=>{
  const q=base({
    prompt:'El ___ es una estrella y la ___ es un planeta.',
    inputMode:'drag',
    solution:{answers:{b1:['Sol'],b2:['Tierra']}},
  }).questions[0];
  const built=fillBlankTemplate(q);
  assert.equal(built.template,'El {{b1}} es una estrella y la {{b2}} es un planeta.');
  assert.deepEqual(fillBlankParts(q).parts.filter(item=>item.type==='blank').map(item=>item.id),['b1','b2']);
});
