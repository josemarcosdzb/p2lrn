import test from 'node:test';
import assert from 'node:assert/strict';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {createDefaultComponentRegistry, CALLOUT_COMPONENT, TIMELINE_COMPONENT, CAPABILITY_ACTION_COMPONENT} from '../web/component-registry.js';
import {validateNativeComponent} from '../web/native-component-core.js';
import {validateNativeComposite} from '../web/native-composite-core.js';

const toArrayBuffer=(bytes)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);

test('Studio creates registered native components from the component registry',async()=>{
  const doc=createP2LRNStudioDocument({title:'Componentes Studio',language:'es'});
  const catalog=doc.componentCatalog();
  assert.deepEqual(catalog.map((entry)=>entry.id),[CALLOUT_COMPONENT,TIMELINE_COMPONENT,CAPABILITY_ACTION_COMPONENT]);
  const registry=createDefaultComponentRegistry();

  const callout=doc.addNativeComponent(doc.rootId,{componentId:CALLOUT_COMPONENT,language:'es'});
  assert.equal(callout.activityType,'https://p2lrn.org/type/component');
  const calloutJson=await doc.readStructuredJson(callout.id);
  validateNativeComponent(calloutJson.payload);
  await registry.prepare(calloutJson.payload);
  assert.equal(calloutJson.payload.data.tone,'info');

  const timeline=doc.addNativeComponent(doc.rootId,{componentId:TIMELINE_COMPONENT,language:'es'});
  const timelineJson=await doc.readStructuredJson(timeline.id);
  validateNativeComponent(timelineJson.payload);
  await registry.prepare(timelineJson.payload);
  assert.ok(timelineJson.payload.data.items[0].id);

  const connected=doc.addNativeComponent(doc.rootId,{componentId:CAPABILITY_ACTION_COMPONENT,language:'es'});
  const connectedJson=await doc.readStructuredJson(connected.id);
  validateNativeComponent(connectedJson.payload);
  await registry.prepare(connectedJson.payload);
  assert.equal(connectedJson.payload.data.capability,'ai.tutor');
  assert.equal(connectedJson.payload.data.operation,'hint');
  assert.deepEqual(doc.hostCapabilitiesForEntity(connected.id).map(({id,required,operations})=>({id,required,operations})),[{id:'ai.tutor',required:false,operations:['hint']}]);
});

test('Studio activity groups are valid nested activity containers',async()=>{
  const doc=createP2LRNStudioDocument({title:'Grupos Studio',language:'es'});
  const group=doc.addNativeComposite(doc.rootId,{title:'Grupo de actividades'});
  assert.equal(doc.isCompositeActivity(group.id),true);
  assert.equal(group.activityType,'https://p2lrn.org/type/resource');
  const json=await doc.readStructuredJson(group.id);
  assert.deepEqual(validateNativeComposite(json.payload),{...json.payload,navigation:'open'});
  await assert.rejects(()=>exportP2LRNPackage(doc),/vacío/);

  const a=doc.addLesson(group.id,{title:'Actividad A',language:'es'});
  const b=doc.addQuestionnaire(group.id,{title:'Actividad B',language:'es'});
  assert.equal(group.activityType,'https://p2lrn.org/type/composite');
  assert.deepEqual(group.children,[a.id,b.id]);

  doc.reorderChild(group.id,b.id,0);
  assert.deepEqual(group.children,[b.id,a.id]);

  const policy=await doc.setCompositePolicy(group.id,{mode:'sequence',completion:'any'});
  assert.equal(policy.mode,'sequence');
  assert.equal(policy.navigation,'linear');
  assert.equal(policy.completion,'any');
  validateNativeComposite(policy);

  const exported=await exportP2LRNPackage(doc);
  const reopened=await openP2LRNPackageBytes(toArrayBuffer(exported.bytes));
  assert.deepEqual(reopened.entities.get(group.id).children,[b.id,a.id]);
});

test('Studio can move activities into and out of a group without duplicating them',async()=>{
  const doc=createP2LRNStudioDocument({title:'Mover Studio',language:'es'});
  const group=doc.addNativeComposite(doc.rootId,{title:'Grupo'});
  const outside=doc.addLesson(doc.rootId,{title:'Fuera'});
  doc.moveActivity(outside.id,group.id);
  assert.deepEqual(group.children,[outside.id]);
  assert.equal(doc.parentId(outside.id),group.id);
  doc.removeActivityFromComposite(group.id,outside.id);
  assert.equal(doc.parentId(outside.id),doc.rootId);
  assert.equal(group.children.length,0);
});