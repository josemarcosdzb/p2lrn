import test from 'node:test';
import assert from 'node:assert/strict';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {P2LRNStudioDocument} from '../web/studio/authoring-document.js';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';
import {HOST_CAPABILITY_EXTENSION} from '../web/capability-broker.js';

const toArrayBuffer=(bytes)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
async function freshOriginal(){
  const draft=createP2LRNStudioDocument({title:'Curso original generado',language:'es'});
  draft.addLesson(draft.rootId,{title:'Primera lección',language:'es'});
  const bytes=(await exportP2LRNPackage(draft)).bytes;
  return openP2LRNPackageBytes(toArrayBuffer(bytes));
}

test('Studio edits a copy and exports a new valid P2LRN package',async()=>{
  const original=await freshOriginal();
  const doc=new P2LRNStudioDocument(original,{sourceName:'course.p2lrn'});
  const root=doc.rootId;
  assert.ok(root);
  doc.setTitle(root,'Curso editado en Studio');
  const exported=await exportP2LRNPackage(doc);
  assert.match(exported.filename,/\.p2lrn$/);
  const reopened=await openP2LRNPackageBytes(toArrayBuffer(exported.bytes));
  const edited=reopened.entities.get(root);
  assert.equal(edited.title.es,'Curso editado en Studio');
  assert.notEqual(reopened.manifest.integrity.contentRoot,original.manifest.integrity.contentRoot);
  assert.notEqual(reopened.manifest.packageId,original.manifest.packageId);
});

test('Studio preserves host capability extensions without changing Core 0.4.0',async()=>{
  const original=await freshOriginal();
  const doc=new P2LRNStudioDocument(original,{sourceName:'course.p2lrn'});
  const root=doc.entity(doc.rootId);
  const activity=[...doc.entities.values()].find((entity)=>entity.type==='activity');
  assert.ok(root);assert.ok(activity);
  doc.setHostCapabilities(root.id,[{id:'ai.tutor',operations:['explain'],required:false,fallback:'static-content'}]);
  doc.setHostCapabilities(activity.id,[{id:'ai.tutor',operations:['hint'],required:false,context:['current_question']}]);
  assert.deepEqual(doc.hostCapabilitiesForEntity(activity.id),[{id:'ai.tutor',required:false,operations:['hint'],context:['current_question'],description:null,fallback:null}]);
  doc.setDescription(doc.rootId,'round-trip marker');
  const exported=await exportP2LRNPackage(doc);
  const reopened=await openP2LRNPackageBytes(toArrayBuffer(exported.bytes));
  assert.equal(reopened.manifest.formatVersion,'0.4.0');
  assert.equal(Object.prototype.hasOwnProperty.call(reopened.manifest,'capabilities'),false);
  assert.deepEqual(reopened.entities.get(root.id).extensions[HOST_CAPABILITY_EXTENSION],root.extensions[HOST_CAPABILITY_EXTENSION]);
  assert.deepEqual(reopened.entities.get(activity.id).extensions[HOST_CAPABILITY_EXTENSION],activity.extensions[HOST_CAPABILITY_EXTENSION]);
});
