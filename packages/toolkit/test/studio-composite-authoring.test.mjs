import test from 'node:test';
import assert from 'node:assert/strict';

import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {
  compositeNavigationForMode,
  resolveCompositeChildren,
  validateNativeComposite,
} from '../web/native-composite-core.js';

const buffer=(bytes)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);

test('Studio puts lessons, games, files, and links inside the selected composite',async()=>{
  const doc=createP2LRNStudioDocument({title:'Curso con compuesto'});
  const unit=doc.children(doc.rootId)[0];
  const composite=doc.addComposite(unit.id,{title:'Repaso'});
  assert.equal(doc.parentId(composite.id),unit.id);
  assert.equal(doc.isCompositeActivity(composite.id),true);

  const draft=await doc.readStructuredJson(composite.id);
  assert.equal(draft.payload.mode,'sequence');
  assert.equal(draft.payload.navigation,'linear');
  assert.deepEqual(validateNativeComposite(draft.payload).navigation,'linear');
  assert.equal(composite.children?.length??0,0);

  const lesson=doc.addLesson(composite.id,{title:'Explicación'});
  const game=doc.addGame(composite.id,{kind:'word-search',title:'Sopa de letras'});
  const file=doc.addEmbeddedResource(composite.id,{
    title:'Documento',filename:'documento.txt',mediaType:'text/plain',
    bytes:new TextEncoder().encode('Contenido de prueba'),
  });
  const link=doc.addRemoteResource(composite.id,{
    title:'Sitio',url:'https://example.com/manual',mediaType:'text/html',
  });
  assert.equal(composite.activityType,'https://p2lrn.org/type/composite');
  assert.deepEqual(composite.children,[lesson.id,game.id,file.id,link.id]);
  for(const child of composite.children)assert.equal(doc.parentId(child),composite.id);
  assert(!unit.children.includes(game.id));

  const exported=await exportP2LRNPackage(doc);
  const pkg=await openP2LRNPackageBytes(buffer(exported.bytes));
  const restored=pkg.entities.get(composite.id);
  assert.deepEqual(restored.children,composite.children);
  assert.deepEqual(resolveCompositeChildren(restored,pkg).map(e=>e.id),composite.children);
  const savedConfig=await pkg.payload(draft.path).read();
  assert.equal(validateNativeComposite(JSON.parse(new TextDecoder().decode(savedConfig))).mode,'sequence');
});

test('Studio re-parents existing activities without losing their identity or content',async()=>{
  const doc=createP2LRNStudioDocument({title:'Repaso de unidad'});
  const unit=doc.children(doc.rootId)[0];
  const game=doc.addGame(unit.id,{kind:'matching',title:'Relacionar'});
  const original=await doc.readQuestionnaire(game.id);
  const composite=doc.addComposite(unit.id,{title:'Ejercicios agrupados'});
  const candidates=doc.movableActivitiesForComposite(composite.id);
  assert(candidates.some(item=>item.id===game.id));

  const returned=doc.moveActivityToComposite(game.id,composite.id);
  assert.strictEqual(returned,game);
  assert.equal(doc.parentId(game.id),composite.id);
  assert(!unit.children.includes(game.id));
  assert.equal(composite.activityType,'https://p2lrn.org/type/composite');
  assert.deepEqual((await doc.readQuestionnaire(game.id)).payload,original.payload);
  assert(!doc.movableActivitiesForComposite(composite.id).some(item=>item.id===game.id));
  assert.throws(()=>doc.moveActivityToComposite(game.id,composite.id));

  const nested=doc.addComposite(composite.id,{title:'Subgrupo'});
  const nestedLesson=doc.addLesson(nested.id,{title:'Actividad interna'});
  assert.equal(doc.parentId(nestedLesson.id),nested.id);
  assert.equal(nested.activityType,'https://p2lrn.org/type/composite');
  assert(!doc.movableActivitiesForComposite(nested.id).some(item=>item.id===composite.id));
  assert.throws(()=>doc.moveActivityToComposite(composite.id,nested.id));

  const pkg=await openP2LRNPackageBytes(buffer((await exportP2LRNPackage(doc)).bytes));
  assert.equal(pkg.entities.get(game.id).resource,game.resource);
  assert.deepEqual(pkg.entities.get(composite.id).children,[game.id,nested.id]);
  assert.deepEqual(pkg.entities.get(nested.id).children,[nestedLesson.id]);
});

test('Studio keeps adding into the same composite after selecting one of its children',()=>{
  const doc=createP2LRNStudioDocument();
  const unit=doc.children(doc.rootId)[0];
  const group=doc.addComposite(unit.id,{title:'Actividades'});
  const first=doc.addLesson(group.id,{title:'Lección del grupo'});
  // Studio resolves the insertion parent from the currently selected child.
  const second=doc.addGame(doc.parentId(first.id),{kind:'word-search',title:'Sopa del grupo'});
  assert.equal(doc.parentId(second.id),group.id);
  assert.deepEqual(group.children,[first.id,second.id]);
  assert.equal(doc.entity(unit.id).children.includes(second.id),false);
});

test('Studio refuses invalid nesting and composite mode/navigation conflicts',()=>{
  const doc=createP2LRNStudioDocument();
  const unit=doc.children(doc.rootId)[0];
  const composite=doc.addComposite(unit.id);
  const regular=doc.children(unit.id).find(entity=>entity.id!==composite.id);
  assert.equal(doc.isCompositeActivity(regular.id),false);
  assert.throws(()=>doc.addLesson(regular.id));
  assert.throws(()=>doc.addUnit(composite.id));
  assert.throws(()=>doc.moveActivityToComposite(composite.id,composite.id));
  assert.equal(compositeNavigationForMode('sequence'),'linear');
  assert.equal(compositeNavigationForMode('free'),'open');
  assert.throws(()=>compositeNavigationForMode('parallel'));
  const invalid={schema:'https://p2lrn.org/schema/native-composite/0.1',version:'0.1',mode:'sequence',completion:'all',navigation:'open'};
  assert.throws(()=>validateNativeComposite(invalid));
});


test('Same-page authored placement reuses the original lesson and survives a complete package export',async()=>{
  const doc=createP2LRNStudioDocument({title:'Curso con actividades en una pagina'});
  const unit=doc.children(doc.rootId)[0];
  const initial=doc.children(unit.id)[0];
  const original=await doc.readEditableText(initial.id);
  const target=await doc.samePageInsertionParent(initial.id);
  const group=doc.entity(target);
  const policy=await doc.readStructuredJson(target);
  assert.equal(policy.payload.presentation,'stack');
  assert.equal(policy.payload.mode,'free');
  assert.equal(validateNativeComposite(policy.payload).presentation,'stack');
  assert.equal(doc.parentId(initial.id),target);
  assert.equal(doc.children(target)[0].id,initial.id);
  assert.equal((await doc.readEditableText(initial.id)).text,original.text);
  const second=doc.addGame(target,{kind:'matching',title:'Arrastrar con puntuacion'});
  const question=await doc.readQuestionnaire(second.id);
  const scored=structuredClone(question.payload);
  scored.questions[0].points=5;
  doc.setQuestionnaire(second.id,scored);
  assert.equal((await doc.samePageInsertionParent(second.id)),target);
  assert.deepEqual(doc.entity(target).children,[initial.id,second.id]);
  const third=doc.addLesson(doc.pageInsertionParent(second.id),{title:'Pagina siguiente'});
  assert.equal(doc.parentId(third.id),unit.id);
  assert.notEqual(doc.parentId(third.id),target);
  const output=await exportP2LRNPackage(doc);
  const reopened=await openP2LRNPackageBytes(buffer(output.bytes));
  assert.deepEqual(reopened.entities.get(target).children,[initial.id,second.id]);
  const blob=await reopened.payload(policy.path).read();
  assert.equal(JSON.parse(new TextDecoder().decode(blob)).presentation,'stack');
  const scoredPath=doc.representationForActivity(second.id).representation.location.path;
  const scoredBlob=await reopened.payload(scoredPath).read();
  assert.equal(JSON.parse(new TextDecoder().decode(scoredBlob)).questions[0].points,5);
});
