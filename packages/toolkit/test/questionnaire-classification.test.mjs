import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateQuestionnaire as validateBrowserQuestionnaire,
  scoreQuestion as scoreBrowserQuestion,
} from '../web/questionnaire-core.js';
import {buildQuestionnaireGame, mergeAnswerPatch} from '../web/questionnaire-games-core.js';
import {THREE_D_RENDERER} from '../web/renderer-registry.js';
import {
  appendUniqueConnection,
  assignClassification,
  classificationIsCorrect,
  connectionKey,
  orderingIsCorrect,
  placeOrderedObject,
  releaseActorObjects,
  reserveObject,
  validateConnection,
} from '../web/game-3d-mechanics.js';
import {
  validateQuestionnaire as validateNodeQuestionnaire,
  scoreQuestion as scoreNodeQuestion,
} from '../dist/core/native-questionnaire.js';

const payload={
  schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
  version:'0.4.0',
  title:'Clasificación 3D',
  grading:{mode:'embedded-key'},
  questions:[
    {
      id:'q-class',
      type:'classification',
      prompt:'Clasifica cada elemento',
      points:3,
      items:[
        {id:'perro',text:'Perro'},
        {id:'gato',text:'Gato'},
        {id:'roble',text:'Roble'},
      ],
      categories:[
        {id:'animal',text:'Animal'},
        {id:'planta',text:'Planta'},
      ],
      solution:{
        assignments:[
          {item:'perro',category:'animal'},
          {item:'gato',category:'animal'},
          {item:'roble',category:'planta'},
        ],
      },
    },
  ],
};

test('native questionnaire accepts and scores classification in Node and browser cores',()=>{
  assert.doesNotThrow(()=>validateNodeQuestionnaire(payload));
  assert.doesNotThrow(()=>validateBrowserQuestionnaire(payload));
  const answer={classifications:{perro:'animal',gato:'animal',roble:'planta'}};
  assert.equal(scoreNodeQuestion(payload.questions[0],answer).pointsAwarded,3);
  assert.equal(scoreBrowserQuestion(payload.questions[0],answer).pointsAwarded,3);
});

test('3D game compiler converts classification without AulaP2P dependencies',()=>{
  const game=buildQuestionnaireGame(payload,THREE_D_RENDERER,{seedSource:'test'});
  assert.equal(game.compatible,true);
  assert.equal(game.data.trials.length,1);
  const trial=game.data.trials[0];
  assert.equal(trial.type,'classification-3d');
  assert.deepEqual(new Set(trial.categories.map((item)=>item.id)),new Set(['animal','planta']));
  assert.deepEqual(
    new Map(trial.assignments.map((item)=>[item.itemId,item.categoryId])),
    new Map([['perro','animal'],['gato','animal'],['roble','planta']]),
  );
});

test('classification patch merges into questionnaire answers',()=>{
  const first=mergeAnswerPatch({}, {kind:'classification-set',itemId:'perro',categoryId:'animal'});
  const second=mergeAnswerPatch(first,{kind:'classification-set',itemId:'roble',categoryId:'planta'});
  assert.deepEqual(second,{classifications:{perro:'animal',roble:'planta'}});
});

test('standalone 3D mechanics cover order, connect, classify and ownership',()=>{
  const placed0=[null,null,null];
  const placed1=placeOrderedObject(placed0,'a',1);
  assert.equal(placed1.ok,true);
  assert.deepEqual(placed1.placed,[null,'a',null]);
  assert.equal(orderingIsCorrect(['a','b','c'],['a','b','c']),true);

  const expectedConnections=new Set([connectionKey('l1','r1')]);
  assert.equal(validateConnection('l1','r1',expectedConnections,new Set()).ok,true);
  assert.equal(validateConnection('l1','r2',expectedConnections,new Set()).ok,false);
  assert.deepEqual(
    appendUniqueConnection([{leftId:'l1',rightId:'r1'}],{leftId:'l1',rightId:'r1'}),
    [{leftId:'l1',rightId:'r1'}],
  );

  const classified=assignClassification(
    {},
    'perro',
    'animal',
    new Set(['perro']),
    new Set(['animal','planta']),
  );
  assert.equal(classified.ok,true);
  assert.equal(classificationIsCorrect(classified.classifications,new Map([['perro','animal']])),true);

  const reserved=reserveObject({},'obj','actor-a');
  assert.equal(reserved.ok,true);
  assert.equal(reserveObject(reserved.ownership,'obj','actor-b').ok,false);
  assert.deepEqual(releaseActorObjects(reserved.ownership,'actor-a'),{obj:null});
});
