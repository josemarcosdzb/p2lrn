import assert from 'node:assert/strict';
import test from 'node:test';
import {buildQuestionnaireGame,mergeAnswerPatch} from '../web/questionnaire-games-core.js';
import {TRUE_FALSE_RENDERER} from '../web/renderer-registry.js';

const payload={
  schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
  version:'0.4.0',
  title:'Varias afirmaciones',
  grading:{mode:'embedded-key'},
  questions:[{
    id:'q1',type:'true-false',trueFalseMode:'multiple',prompt:'Indica verdadero o falso',points:3,
    statements:[{id:'s1',text:'Afirmación A'},{id:'s2',text:'Afirmación B'},{id:'s3',text:'Afirmación C'}],
    solution:{answers:{s1:true,s2:false,s3:true}},
  }],
};

test('true-false game expands one multiple question into independent rounds',()=>{
  const game=buildQuestionnaireGame(payload,TRUE_FALSE_RENDERER);
  assert.equal(game.compatible,true);
  assert.equal(game.data.questions.length,3);
  assert.deepEqual(game.data.questions.map((item)=>item.prompt),['Afirmación A','Afirmación B','Afirmación C']);
  assert.deepEqual(game.data.questions.map((item)=>item.correct),[true,false,true]);
});

test('boolean-set patches accumulate answers for the same multiple true-false question',()=>{
  let answer=mergeAnswerPatch({}, {kind:'boolean-set',statementId:'s1',value:true});
  answer=mergeAnswerPatch(answer,{kind:'boolean-set',statementId:'s2',value:false});
  assert.deepEqual(answer,{booleans:{s1:true,s2:false}});
});
