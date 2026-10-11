import test from 'node:test';
import assert from 'node:assert/strict';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {buildQuestionnaireGame} from '../web/questionnaire-games-core.js';
import {validateQuestionnaire} from '../web/questionnaire-core.js';

const toArrayBuffer=(bytes)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const HINT='https://p2lrn.org/ext/renderer-preference/1';

for(const kind of ['memory','matching','ordering','classification','true-false','word-search','crossword','rosco','3d']){
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

test('Studio creates a valid standard questionnaire resource',async()=>{
  const doc=createP2LRNStudioDocument({title:'Quiz Studio',language:'es'});
  const activity=doc.addQuestionnaire(doc.rootId,{title:'Cuestionario',language:'es'});
  const q=await doc.readQuestionnaire(activity.id);
  validateQuestionnaire(q.payload);
  assert.equal(activity.activityType,'https://p2lrn.org/type/assessment');
  assert.equal(q.representation.profile,'https://p2lrn.org/profile/native-questionnaire');
});
