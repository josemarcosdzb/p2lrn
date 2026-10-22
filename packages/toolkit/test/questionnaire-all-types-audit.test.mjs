import assert from 'node:assert/strict';
import test from 'node:test';
import {scoreQuestion,validateQuestionnaire} from '../web/questionnaire-core.js';

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
