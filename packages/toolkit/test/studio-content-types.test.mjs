import test from 'node:test';
import assert from 'node:assert/strict';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {buildQuestionnaireGame} from '../web/questionnaire-games-core.js';
import {validateQuestionnaire} from '../web/questionnaire-core.js';

const toArrayBuffer=(bytes)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const HINT='https://p2lrn.org/ext/renderer-preference/1';

for(const kind of ['memory','matching','ordering','classification','true-false','fill-blanks','word-search','crossword','rosco','3d','3d-matching','3d-classification']){
  test(`Studio creates a fully compatible ${kind} game`,async()=>{
    const doc=createP2LRNStudioDocument({title:'Juegos Studio',language:'es'});
    const activity=doc.addGame(doc.rootId,{kind,title:'Juego '+kind,language:'es'});
    const q=await doc.readQuestionnaire(activity.id);
    assert.ok(q?.payload);
    validateQuestionnaire(q.payload);
    const renderer=activity.extensions?.[HINT]?.preferred;
    assert.ok(renderer);
    const result=buildQuestionnaireGame(q.payload,renderer,{seedSource:'studio-test'});
    assert.equal(result.compatible,true,JSON.stringify(result.reasons));
    const exported=await exportP2LRNPackage(doc);
    const reopened=await openP2LRNPackageBytes(toArrayBuffer(exported.bytes));
    const restored=reopened.entities.get(activity.id);
    assert.equal(restored.extensions?.[HINT]?.preferred,renderer);
  });
}


test('3D games share one renderer but offer ordering, matching, classification and mixed questions',async()=>{
  const doc=createP2LRNStudioDocument({title:'Tres juegos 3D'});
  const cases=[
    {kind:'3d',type:'ordering',trial:'ordering-3d'},
    {kind:'3d-matching',type:'matching',trial:'matching-3d'},
    {kind:'3d-classification',type:'classification',trial:'classification-3d'},
  ];
  const games=[];
  for(const entry of cases){
    const activity=doc.addGame(doc.rootId,{kind:entry.kind,title:'Modalidad '+entry.kind});
    const data=await doc.readQuestionnaire(activity.id);
    assert.equal(data.payload.questions[0].type,entry.type);
    assert.equal(activity.extensions?.[HINT]?.preferred,'https://p2lrn.org/renderer/questionnaire/3d-order-match');
    const built=buildQuestionnaireGame(data.payload,activity.extensions[HINT].preferred,{seedSource:'3d-editor'});
    assert.equal(built.compatible,true,JSON.stringify(built.reasons));
    assert.equal(built.data.trials[0].type,entry.trial);
    games.push({activity,data});
  }
  const mixed=structuredClone(games[0].data.payload);
  mixed.questions.push({...structuredClone(games[1].data.payload.questions[0]),id:'q2'});
  mixed.questions.push({...structuredClone(games[2].data.payload.questions[0]),id:'q3'});
  validateQuestionnaire(mixed);
  const mixedResult=buildQuestionnaireGame(mixed,games[0].activity.extensions[HINT].preferred,{seedSource:'mixed-3d'});
  assert.equal(mixedResult.compatible,true,JSON.stringify(mixedResult.reasons));
  assert.deepEqual(mixedResult.data.trials.map(trial=>trial.type),
    ['ordering-3d','matching-3d','classification-3d']);
  doc.setQuestionnaire(games[0].activity.id,mixed);
  const exported=await exportP2LRNPackage(doc);
  const reopened=await openP2LRNPackageBytes(toArrayBuffer(exported.bytes));
  for(const {activity} of games){
    const entity=reopened.entities.get(activity.id);
    assert.equal(entity.extensions?.[HINT]?.preferred,'https://p2lrn.org/renderer/questionnaire/3d-order-match');
    const representation=reopened.entities.get(entity.resource).representations[0];
    const bytes=await reopened.payload(representation.location.path).read();
    const data=JSON.parse(new TextDecoder().decode(bytes));
    const result=buildQuestionnaireGame(data,entity.extensions[HINT].preferred,{seedSource:'reopened'});
    assert.equal(result.compatible,true,JSON.stringify(result.reasons));
  }
});

test('Studio creates a valid standard questionnaire resource',async()=>{
  const doc=createP2LRNStudioDocument({title:'Quiz Studio',language:'es'});
  const activity=doc.addQuestionnaire(doc.rootId,{title:'Cuestionario',language:'es'});
  const q=await doc.readQuestionnaire(activity.id);
  validateQuestionnaire(q.payload);
  assert.equal(activity.activityType,'https://p2lrn.org/type/assessment');
  assert.equal(q.representation.profile,'https://p2lrn.org/profile/native-questionnaire');
});
