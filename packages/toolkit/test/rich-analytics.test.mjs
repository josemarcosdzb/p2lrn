import test from 'node:test';
import assert from 'node:assert/strict';
import {QuestionnaireSession} from '../web/questionnaire-session.js';

const payload={
  schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
  version:'0.4.0',
  title:'Analítica',
  grading:{mode:'embedded-key'},
  questions:[
    {id:'q1',type:'single-choice',prompt:'Una',points:1,required:true,choices:[{id:'a',text:'A'},{id:'b',text:'B'}],solution:{choiceIds:['a']}},
  ],
};

const flush=()=>new Promise((resolve)=>setTimeout(resolve,0));

test('native questionnaire emits explicit attempt lifecycle without raw answers in attempt events',async()=>{
  const events=[];
  const adapter={emitEvent:async(event)=>{events.push(event);}};
  const session=new QuestionnaireSession(structuredClone(payload),{adapter,context:{contentRoot:'sha256:'+'1'.repeat(64),entityId:'urn:test:analytics'}});
  await session.mount();
  session.replaceAnswer('q1',{choiceIds:['b']});
  session.replaceAnswer('q1',{choiceIds:['a']});
  await session.finish();
  await flush();

  const attempts=events.filter((event)=>event.type==='p2lrn:attempt');
  assert.equal(attempts[0].payload.phase,'started');
  assert.equal(attempts.at(-1).payload.phase,'submitted');
  assert.equal(attempts.at(-1).payload.attemptNumber,1);
  assert.equal('answers' in attempts.at(-1).payload,false);

  const changes=events.filter((event)=>event.type==='p2lrn:interaction'&&event.payload.action==='answer-change');
  assert.equal(changes.length,1);
  assert.equal(changes[0].payload.questionId,'q1');
  assert.equal(changes[0].payload.questionType,'single-choice');
  assert.equal('answer' in changes[0].payload,false);
});

test('unfinished loaded questionnaire state is reported as resumed rather than a new attempt',async()=>{
  const events=[];
  const saved={
    version:'p2lrn-questionnaire-state/0.2',
    currentQuestion:0,
    questionOrder:['q1'],
    answers:{q1:{choiceIds:['b']}},
    completed:false,
    attemptsCompleted:0,
    completionReason:null,
    gameState:{},
    timing:{attemptStartedAt:null,attemptDeadlineAt:null,questionStartedAt:{},questionDeadlineAt:{},expiredQuestions:[]},
  };
  const adapter={loadState:async()=>saved,emitEvent:async(event)=>{events.push(event);}};
  const session=new QuestionnaireSession(structuredClone(payload),{adapter,context:{entityId:'urn:test:resume'}});
  await session.mount();
  await flush();
  const attempt=events.find((event)=>event.type==='p2lrn:attempt');
  assert.equal(attempt.payload.phase,'resumed');
  assert.equal(attempt.payload.attemptNumber,1);
  assert.equal(attempt.payload.answered,1);
});
