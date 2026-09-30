import test from 'node:test';
import assert from 'node:assert/strict';

import {validateProgression} from '../dist/core/progression.js';
import {
  PROGRESSION_PROFILE,
  createProgressionModel,
  normalizeProgressionState,
  updateProgressionState,
  validateProgressionGraph,
} from '../web/progression-core.js';

const course='urn:test:course';
const a='urn:test:a';
const b='urn:test:b';
const c='urn:test:c';
const unit='urn:test:unit';

function manifest(requirement='required'){
  return {
    format:'P2LRN',
    formatVersion:'0.4.0',
    packageId:'urn:test:package',
    entrypoints:[{id:course,type:'course',role:'primary'}],
    graph:{path:'content/graph.json',schema:'https://p2lrn.org/schema/graph/0.4.0',mediaType:'application/json',size:0,byteDigest:'sha256:'+'0'.repeat(64),contentDigest:'sha256:'+'0'.repeat(64)},
    profiles:[
      {id:'https://p2lrn.org/profile/course',version:'0.4.0',requirement:'required'},
      {id:PROGRESSION_PROFILE,version:'0.4.0',requirement},
    ],
    files:[],
    integrity:{algorithm:'sha256',contentRoot:'sha256:'+'0'.repeat(64)},
  };
}
function graph(entities){
  return {graphVersion:'0.4.0',entities,relations:[]};
}
function activity(id, rule=null){
  return {
    id,type:'activity',activityType:'urn:test:lesson',title:{en:id},resource:'urn:test:resource',
    ...(rule?{extensions:{[PROGRESSION_PROFILE]:rule}}:{}),
  };
}
function courseEntity(children){
  return {id:course,type:'course',revision:1,title:{en:'Course'},children};
}

test('required metadata alone never locks following content',()=>{
  const g=graph([courseEntity([a,b]),activity(a,{required:true}),activity(b)]);
  validateProgression(g,manifest('optional'));
  validateProgressionGraph(g,manifest('optional'));
  const entities=new Map(g.entities.map((entity)=>[entity.id,entity]));
  const model=createProgressionModel(course,entities);
  assert.equal(model.isRequired(a),true);
  assert.equal(model.isLocked(b,normalizeProgressionState(null)),false);
});

test('gateFollowing is explicit and unlocks after completion',()=>{
  const g=graph([courseEntity([a,b]),activity(a,{required:true,gateFollowing:true,completionRequirement:'completed'}),activity(b)]);
  validateProgression(g,manifest('required'));
  validateProgressionGraph(g,manifest('required'));
  const entities=new Map(g.entities.map((entity)=>[entity.id,entity]));
  const model=createProgressionModel(course,entities);
  let state=normalizeProgressionState(null);
  assert.equal(model.isLocked(a,state),false);
  assert.equal(model.isLocked(b,state),true);
  ({state}=updateProgressionState(state,{type:'p2lrn:complete',detail:{context:{entityId:a}}}));
  assert.equal(model.isLocked(b,state),false);
});

test('navigation gates cannot be declared optional',()=>{
  const g=graph([courseEntity([a,b]),activity(a,{gateFollowing:true}),activity(b)]);
  assert.throws(()=>validateProgression(g,manifest('optional')),/requirement "required"/);
  assert.throws(()=>validateProgressionGraph(g,manifest('optional')),/requirement "required"/i);
});

test('explicit unlockWhen supports pass and score thresholds',()=>{
  const g=graph([
    courseEntity([a,b]),
    activity(a,{required:true,completionRequirement:'passed',minScore:80}),
    activity(b,{unlockWhen:{all:[{entity:a,status:'passed',minScore:80}]}}),
  ]);
  validateProgression(g,manifest('required'));
  const entities=new Map(g.entities.map((entity)=>[entity.id,entity]));
  const model=createProgressionModel(course,entities);
  let state=normalizeProgressionState(null);
  assert.equal(model.isLocked(b,state),true);
  ({state}=updateProgressionState(state,{type:'p2lrn:score',detail:{normalized:.79,context:{entityId:a}}}));
  assert.equal(model.isLocked(b,state),true);
  ({state}=updateProgressionState(state,{type:'p2lrn:score',detail:{normalized:.82,context:{entityId:a}}}));
  assert.equal(model.isLocked(b,state),true);
  ({state}=updateProgressionState(state,{type:'p2lrn:complete',detail:{score:{normalized:.82},context:{entityId:a}}}));
  assert.equal(model.isLocked(b,state),false);
});

test('unit gate uses required descendants and locks later siblings',()=>{
  const unitEntity={id:unit,type:'unit',role:'module',title:{en:'Module'},children:[a,b],extensions:{[PROGRESSION_PROFILE]:{required:true,gateFollowing:true}}};
  const g=graph([
    courseEntity([unit,c]),
    unitEntity,
    activity(a,{required:true,completionRequirement:'viewed'}),
    activity(b),
    activity(c),
  ]);
  validateProgression(g,manifest('required'));
  const entities=new Map(g.entities.map((entity)=>[entity.id,entity]));
  const model=createProgressionModel(course,entities);
  let state=normalizeProgressionState(null);
  assert.equal(model.isLocked(c,state),true);
  ({state}=updateProgressionState(state,{type:'p2lrn:rendered',detail:{context:{entityId:a}}}));
  assert.equal(model.isLocked(c,state),false);
});

test('dependency cycles are rejected',()=>{
  const g=graph([
    courseEntity([a,b]),
    activity(a,{unlockWhen:{all:[{entity:b,status:'completed'}]}}),
    activity(b,{unlockWhen:{all:[{entity:a,status:'completed'}]}}),
  ]);
  assert.throws(()=>validateProgression(g,manifest('required')),/dependency cycle/);
  assert.throws(()=>validateProgressionGraph(g,manifest('required')),/dependency cycle/i);
});
