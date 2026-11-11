import test from 'node:test';
import assert from 'node:assert/strict';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';

const toArrayBuffer=(bytes)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);

test('Studio creates a new valid course from zero and can grow its structure',async()=>{
  const doc=createP2LRNStudioDocument({title:'Curso nuevo',language:'es'});
  assert.equal(doc.entity(doc.rootId).type,'course');
  assert.equal(doc.children(doc.rootId).length,1);
  const firstUnit=doc.children(doc.rootId)[0];
  assert.equal(firstUnit.type,'unit');
  const firstLesson=doc.children(firstUnit.id)[0];
  assert.equal(firstLesson.type,'activity');
  const editable=await doc.readEditableText(firstLesson.id);
  assert.equal(editable.mediaType,'text/html');
  assert.match(editable.text,/Empieza a escribir aquí/);

  const extraUnit=doc.addUnit(doc.rootId,{title:'Unidad adicional',language:'es'});
  const extraLesson=doc.addLesson(extraUnit.id,{title:'Lección adicional',language:'es'});
  doc.setTitle(extraLesson.id,'Lección personalizada');
  const extraEditable=await doc.readEditableText(extraLesson.id);
  doc.setPayloadText(extraEditable.path,extraEditable.text.replace('Empieza a escribir aquí.','Contenido creado desde cero.'));

  const exported=await exportP2LRNPackage(doc);
  assert.equal(exported.filename,'curso-nuevo.p2lrn');
  const reopened=await openP2LRNPackageBytes(toArrayBuffer(exported.bytes));
  assert.equal(reopened.manifest.format,'P2LRN');
  assert.equal(reopened.manifest.formatVersion,'0.4.0');
  assert.equal(reopened.entities.get(doc.rootId).title.es,'Curso nuevo');
  assert.equal(reopened.entities.get(extraUnit.id).title.es,'Unidad adicional');
  assert.equal(reopened.entities.get(extraLesson.id).title.es,'Lección personalizada');
  const rep=reopened.entities.get(reopened.entities.get(extraLesson.id).resource).representations[0];
  const text=new TextDecoder().decode(await reopened.payload(rep.location.path).read());
  assert.match(text,/Contenido creado desde cero/);
});


test('New games require a learner answer before final submission',async()=>{
  const doc=createP2LRNStudioDocument({title:'Prueba',language:'es'});
  const unit=doc.children(doc.rootId)[0];
  const activity=doc.addGame(unit.id,{kind:'fill-blanks',title:'Completar huecos',language:'es'});
  const questionnaire=await doc.readQuestionnaire(activity.id);
  assert.equal(questionnaire.payload.questions.length,1);
  assert.equal(questionnaire.payload.questions[0].required,true);
});
