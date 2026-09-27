import test from 'node:test';
import assert from 'node:assert/strict';
import {createXapiActivityDeclaration,validateXapiActivityDeclaration,XAPI_PROFILE} from '../dist/core/index.js';
import {createHostAdapter} from '../web/host-adapter.js';
import {createRuntimeEvent} from '../web/runtime-events.js';
import {runtimeEventToXapiStatementIntent} from '../web/xapi-intent.js';

const declaration=createXapiActivityDeclaration({
  activityId:'https://learning.example.invalid/activities/lesson-1',
  profileId:'https://w3id.org/xapi/adl/v1.0',
});

function event(type,payload={}){
  return createRuntimeEvent(type,payload,{
    packageId:'urn:uuid:00000000-0000-4000-8000-000000000001',
    contentRoot:'sha256:'+'a'.repeat(64),
    entityId:'urn:p2lrn:activity:1',
    resourceId:'urn:p2lrn:resource:1',
    xapi:declaration,
  },{clock:()=>Date.parse('2026-09-27T12:00:00Z')});
}

test('xAPI declaration accepts absolute IRIs and rejects credentials/relative identifiers',()=>{
  assert.equal(declaration.version,'2.0');
  assert.equal(declaration.activityId,'https://learning.example.invalid/activities/lesson-1');
  assert.deepEqual(validateXapiActivityDeclaration(declaration),declaration);
  assert.throws(()=>createXapiActivityDeclaration({activityId:'/relative'}),/absolute IRI/);
  assert.throws(()=>createXapiActivityDeclaration({activityId:'https://user:secret@example.invalid/a'}),/embedded credentials/);
});

test('runtime initialized event maps to an actor-free xAPI statement intent',()=>{
  const intent=runtimeEventToXapiStatementIntent(event('p2lrn:activityready',{runtime:'questionnaire'}));
  assert.equal(intent.verb.id,'http://adlnet.gov/expapi/verbs/initialized');
  assert.equal(intent.object.objectType,'Activity');
  assert.equal(intent.object.id,declaration.activityId);
  assert.equal(intent.timestamp,'2026-09-27T12:00:00.000Z');
  assert.equal(intent.profileId,'https://w3id.org/xapi/adl/v1.0');
  assert.equal('actor' in intent,false);
  assert.equal('authority' in intent,false);
  assert.equal('endpoint' in intent,false);
});

test('answered, scored and completed events carry only portable result data',()=>{
  const answered=runtimeEventToXapiStatementIntent(event('p2lrn:answer',{response:['A','C'],correct:true}));
  assert.equal(answered.verb.id,'http://adlnet.gov/expapi/verbs/answered');
  assert.equal(answered.result.response,'["A","C"]');
  assert.equal(answered.result.success,true);

  const scored=runtimeEventToXapiStatementIntent(event('p2lrn:score',{raw:8,max:10,normalized:0.8,passed:true}));
  assert.equal(scored.verb.id,'http://adlnet.gov/expapi/verbs/scored');
  assert.deepEqual(scored.result.score,{raw:8,max:10,scaled:0.8});
  assert.equal(scored.result.success,true);

  const completed=runtimeEventToXapiStatementIntent(event('p2lrn:complete',{score:{raw:9,max:10,normalized:0.9,passed:true}}));
  assert.equal(completed.verb.id,'http://adlnet.gov/expapi/verbs/completed');
  assert.equal(completed.result.completion,true);
  assert.equal(completed.result.success,true);
  assert.equal(completed.result.score.scaled,0.9);
});

test('xAPI verb overrides are explicit per activity and validated as IRIs',()=>{
  const custom=createXapiActivityDeclaration({
    activityId:'urn:example:activity:1',
    verbs:{completed:'https://example.invalid/xapi/verbs/finished'},
  });
  const e=createRuntimeEvent('p2lrn:complete',{}, {xapi:custom},{clock:()=>0});
  assert.equal(runtimeEventToXapiStatementIntent(e).verb.id,'https://example.invalid/xapi/verbs/finished');
  assert.throws(()=>createXapiActivityDeclaration({activityId:'urn:example:a',verbs:{completed:'not-an-iri'}}),/absolute IRI/);
});

test('cmi5 runtime events never generate generic xAPI intents and risk duplicate statements',()=>{
  assert.equal(runtimeEventToXapiStatementIntent(event('p2lrn:complete',{runtime:'cmi5'})),null);
});

test('activities without explicit xAPI declaration produce no statement intent',()=>{
  const e=createRuntimeEvent('p2lrn:complete',{}, {entityId:'urn:p2lrn:activity:1'},{clock:()=>0});
  assert.equal(runtimeEventToXapiStatementIntent(e),null);
});

test('Host Adapter retains the xAPI statement-intent callback',async()=>{
  const received=[];
  const adapter=createHostAdapter({emitXapiStatementIntent(intent,context){received.push({intent,context});}});
  await adapter.emitXapiStatementIntent(runtimeEventToXapiStatementIntent(event('p2lrn:activityready')),event('p2lrn:activityready').context);
  assert.equal(received.length,1);
  assert.equal(received[0].intent.object.id,declaration.activityId);
});
