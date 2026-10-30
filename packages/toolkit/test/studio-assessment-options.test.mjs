import test from 'node:test';
import assert from 'node:assert/strict';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {scoreQuestionnaire, validateQuestionnaire} from '../web/questionnaire-core.js';

const toArrayBuffer=(bytes)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const PROGRESSION='https://p2lrn.org/profile/progression';

test('Studio persists attempts, timing, scoring penalty and progression gating',async()=>{
  const doc=createP2LRNStudioDocument({title:'Evaluación',language:'es'});
  const activity=doc.addQuestionnaire(doc.rootId,{title:'Cuestionario',language:'es'});
  const q=await doc.readQuestionnaire(activity.id);
  q.payload.attemptPolicy={maxAttempts:3};
  Object.assign(q.payload.questions[0],{
    points:4,
    timeLimitSeconds:25,
    scoring:'partial-with-penalty',
    penalty:1,
  });
  doc.setQuestionnaire(activity.id,q.payload);
  doc.setActivityProgression(activity.id,{mode:'passed',minScore:70});
  validateQuestionnaire(q.payload);

  const exported=await exportP2LRNPackage(doc);
  const reopened=await openP2LRNPackageBytes(toArrayBuffer(exported.bytes));
  const restored=reopened.entities.get(activity.id);
  const progression=restored.extensions?.[PROGRESSION];
  assert.deepEqual(progression,{required:true,gateFollowing:true,completionRequirement:'passed',minScore:70});
  const profile=reopened.manifest.profiles.find((item)=>item.id===PROGRESSION);
  assert.equal(profile?.requirement,'required');
  const resource=reopened.entities.get(restored.resource);
  const rep=resource.representations[0];
  const payload=JSON.parse(new TextDecoder().decode(await reopened.payload(rep.location.path).read()));
  assert.equal(payload.attemptPolicy.maxAttempts,3);
  assert.equal(payload.questions[0].timeLimitSeconds,25);
  assert.equal(payload.questions[0].points,4);
  assert.equal(payload.questions[0].scoring,'partial-with-penalty');
  assert.equal(payload.questions[0].penalty,1);
});

test('Studio can require completion without a score threshold and remove the gate',()=>{
  const doc=createP2LRNStudioDocument({title:'Evaluación',language:'es'});
  const activity=doc.addGame(doc.rootId,{kind:'matching',title:'Relacionar',language:'es'});
  const rule=doc.setActivityProgression(activity.id,{mode:'completed'});
  assert.deepEqual(rule,{required:true,gateFollowing:true,completionRequirement:'completed'});
  assert.equal(doc.progressionForActivity(activity.id)?.minScore,undefined);
  assert.equal(doc.setActivityProgression(activity.id,{mode:'none'}),null);
  assert.equal(doc.progressionForActivity(activity.id),null);
});


test('wrong answers can subtract from the questionnaire total without going below zero',()=>{
  const payload={schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title:'Penalización',grading:{mode:'embedded-key'},questions:[
    {id:'q1',type:'single-choice',prompt:'Correcta',points:1,choices:[{id:'a',text:'A'},{id:'b',text:'B'}],solution:{choiceIds:['a']}},
    {id:'q2',type:'single-choice',prompt:'Resta',points:1,scoring:'partial-with-penalty',penalty:0.25,choices:[{id:'a2',text:'A'},{id:'b2',text:'B'}],solution:{choiceIds:['a2']}},
  ]};
  const score=scoreQuestionnaire(payload,{q1:{choiceIds:['a']},q2:{choiceIds:['b2']}});
  assert.equal(score.questions[0].pointsAwarded,1);
  assert.equal(score.questions[1].pointsAwarded,-0.25);
  assert.equal(score.raw,0.75);
  const floor=scoreQuestionnaire(payload,{q1:{choiceIds:['b']},q2:{choiceIds:['b2']}});
  assert.equal(floor.raw,0);
});

test('new Studio questionnaires and games default to hidden student feedback',async()=>{
  const doc=createP2LRNStudioDocument({title:'Privacidad de la evaluación',language:'es'});
  const questionnaire=doc.addQuestionnaire(doc.rootId,{title:'Prueba'});
  const q=await doc.readQuestionnaire(questionnaire.id);
  assert.equal(q.payload.presentation.showFeedback,'never');
  const game=doc.addGame(doc.rootId,{kind:'matching',title:'Juego'});
  const g=await doc.readQuestionnaire(game.id);
  assert.equal(g.payload.presentation.showFeedback,'never');
});
