import assert from 'node:assert/strict';
import test from 'node:test';
import {scoreQuestion,scoreQuestionnaire,validateQuestionnaire} from '../web/questionnaire-core.js';
import {readFile} from 'node:fs/promises';

const wrap=(question)=>({
  schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
  version:'0.4.0',
  title:'Auditoría',
  grading:{mode:'embedded-key'},
  questions:[question],
});

const cases=[
  {
    name:'single-choice',
    question:{id:'q1',type:'single-choice',prompt:'Una',points:2,choices:[{id:'a',text:'A'},{id:'b',text:'B'}],solution:{choiceIds:['a']}},
    correct:{choiceIds:['a']},wrong:{choiceIds:['b']},
  },
  {
    name:'multiple-choice',
    question:{id:'q1',type:'multiple-choice',prompt:'Varias',points:2,choices:[{id:'a',text:'A'},{id:'b',text:'B'},{id:'c',text:'C'}],solution:{choiceIds:['a','b']}},
    correct:{choiceIds:['a','b']},wrong:{choiceIds:['a','b','c']},
  },
  {
    name:'true-false',
    question:{id:'q1',type:'true-false',prompt:'Verdadero',points:2,choices:[{id:'t',text:'Verdadero'},{id:'f',text:'Falso'}],solution:{choiceIds:['t']}},
    correct:{choiceIds:['t']},wrong:{choiceIds:['f']},
  },
  {
    name:'text',
    question:{id:'q1',type:'text',prompt:'Texto',points:2,solution:{acceptedAnswers:['Madrid']}},
    correct:{text:' madrid '},wrong:{text:'Barcelona'},
  },
  {
    name:'fill-blanks',
    question:{id:'q1',type:'fill-blanks',prompt:'Completa',body:'Capital: {{b1}}',inputMode:'text',points:2,blanks:[{id:'b1'}],solution:{answers:{b1:['Madrid']}}},
    correct:{blanks:{b1:'Madrid'}},wrong:{blanks:{b1:'Barcelona'}},
  },
  {
    name:'ordering',
    question:{id:'q1',type:'ordering',prompt:'Ordena',points:2,items:[{id:'a',text:'A'},{id:'b',text:'B'}],solution:{order:['a','b']}},
    correct:{order:['a','b']},wrong:{order:['b','a']},
  },
  {
    name:'matching',
    question:{id:'q1',type:'matching',prompt:'Relaciona',points:2,left:[{id:'l1',text:'L1'},{id:'l2',text:'L2'}],right:[{id:'r1',text:'R1'},{id:'r2',text:'R2'}],solution:{pairs:[{left:'l1',right:'r1'},{left:'l2',right:'r2'}]}},
    correct:{pairs:{l1:'r1',l2:'r2'}},wrong:{pairs:{l1:'r2',l2:'r1'}},
  },
  {
    name:'classification',
    question:{id:'q1',type:'classification',prompt:'Clasifica',points:2,items:[{id:'i1',text:'I1'},{id:'i2',text:'I2'}],categories:[{id:'c1',text:'C1'},{id:'c2',text:'C2'}],solution:{assignments:[{item:'i1',category:'c1'},{item:'i2',category:'c2'}]}},
    correct:{classifications:{i1:'c1',i2:'c2'}},wrong:{classifications:{i1:'c2',i2:'c1'}},
  },
];

for(const entry of cases){
  test('question type '+entry.name+' validates and distinguishes correct from wrong answers',()=>{
    validateQuestionnaire(wrap(structuredClone(entry.question)));
    const ok=scoreQuestion(entry.question,entry.correct);
    const bad=scoreQuestion(entry.question,entry.wrong);
    assert.equal(ok.correct,true);
    assert.equal(ok.pointsAwarded,entry.question.points);
    assert.ok(bad.pointsAwarded<entry.question.points,entry.name+' wrong answer must not receive full points');
  });
}

test('multiple choice cannot earn full credit by selecting every option',()=>{
  const question=cases.find((entry)=>entry.name==='multiple-choice').question;
  const score=scoreQuestion(question,{choiceIds:['a','b','c']});
  assert.equal(score.correct,false);
  assert.ok(score.pointsAwarded<question.points);
});

test('true-false multiple statements validate and score each statement independently',()=>{
  const question={
    id:'qtfm',type:'true-false',trueFalseMode:'multiple',prompt:'Indica si cada afirmación es verdadera o falsa',points:3,
    statements:[{id:'s1',text:'La Tierra gira alrededor del Sol'},{id:'s2',text:'2 + 2 = 5'},{id:'s3',text:'El agua es H2O'}],
    solution:{answers:{s1:true,s2:false,s3:true}},
  };
  validateQuestionnaire(wrap(structuredClone(question)));
  const all=scoreQuestion(question,{booleans:{s1:true,s2:false,s3:true}});
  assert.equal(all.correct,true);
  assert.equal(all.pointsAwarded,3);
  const partial=scoreQuestion(question,{booleans:{s1:true,s2:true,s3:true}});
  assert.equal(partial.correct,false);
  assert.equal(partial.hits,2);
  assert.equal(partial.errors,1);
  assert.equal(partial.pointsAwarded,2);
});

test('true-false multiple requires an answer for every statement',()=>{
  const question={
    id:'qtfm',type:'true-false',trueFalseMode:'multiple',prompt:'Clasifica',points:2,
    statements:[{id:'s1',text:'A'},{id:'s2',text:'B'}],
    solution:{answers:{s1:true}},
  };
  assert.throws(()=>validateQuestionnaire(wrap(question)),/every true-false statement requires an answer/);
});


test('game renderer totals use the questionnaire-wide raw/max contract',async()=>{
  const question=cases.find(({name})=>name==='single-choice').question;
  const graded=scoreQuestionnaire(wrap(structuredClone(question)),{q1:{choiceIds:['a']}});
  assert.equal(graded.raw,2);
  assert.equal(graded.max,2);
  assert.equal(graded.normalized,1);
  const renderers=['game-common.js','questionnaire-memory.js','questionnaire-matching.js',
    'questionnaire-crossword.js','questionnaire-rosco.js','questionnaire-word-search.js'];
  for(const renderer of renderers){
    const source=await readFile(new URL('../web/renderers/'+renderer,import.meta.url),'utf8');
    assert.doesNotMatch(source,/score\.pointsEarned|score\.pointsPossible/,renderer+' uses a question-level contract for whole-game score');
    assert.match(source,/score\.raw/,renderer+' must display awarded total');
    assert.match(source,/score\.max/,renderer+' must display possible total');
  }
});
