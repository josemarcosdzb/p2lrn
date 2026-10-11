import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';

const here=dirname(fileURLToPath(import.meta.url));
const toArrayBuffer=(bytes)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);

test('Studio merges an external converted P2LRN course into the current course without losing profile payloads',async()=>{
  const sourceBytes=new Uint8Array(await readFile(resolve(here,'../../../examples/canonical/external/h5p-crossword.p2lrn')));
  const source=await openP2LRNPackageBytes(toArrayBuffer(sourceBytes));
  const doc=createP2LRNStudioDocument({title:'Curso contenedor',language:'es'});
  const wrapper=await doc.importPackage(source,doc.rootId,{title:'H5P importado',language:'es'});
  assert.equal(wrapper.type,'unit');
  assert.ok(wrapper.children.length>0);
  assert.ok(doc.manifest.profiles.some((p)=>p.id==='https://p2lrn.org/profile/h5p'));
  const sourceFiles=new Map(source.manifest.files.map((f)=>[f.path,f.byteDigest]));
  for(const [path,digest] of sourceFiles){const imported=doc.manifest.files.find((f)=>f.path===path);assert.ok(imported,path);assert.equal(imported.byteDigest,digest);}
  const exported=await exportP2LRNPackage(doc);
  const reopened=await openP2LRNPackageBytes(toArrayBuffer(exported.bytes));
  assert.ok(reopened.manifest.profiles.some((p)=>p.id==='https://p2lrn.org/profile/h5p'));
  const importedActivities=[...reopened.entities.values()].filter((e)=>e.type==='activity'&&e.id!==doc.rootId);
  assert.ok(importedActivities.some((activity)=>{const resource=reopened.entities.get(activity.resource);return resource?.representations?.some((rep)=>rep.profile==='https://p2lrn.org/profile/h5p');}));
});


test('Studio can import the same external package twice without duplicate internal ids',async()=>{
  const sourceBytes=new Uint8Array(await readFile(resolve(here,'../../../examples/canonical/external/h5p-crossword.p2lrn')));
  const source=await openP2LRNPackageBytes(toArrayBuffer(sourceBytes));
  const doc=createP2LRNStudioDocument({title:'Duplicados',language:'es'});
  await doc.importPackage(source,doc.rootId,{title:'H5P 1',language:'es'});
  await doc.importPackage(source,doc.rootId,{title:'H5P 2',language:'es'});
  const exported=await exportP2LRNPackage(doc);
  const reopened=await openP2LRNPackageBytes(toArrayBuffer(exported.bytes));
  const entityIds=reopened.graph.entities.map((entity)=>entity.id);
  const representationIds=reopened.graph.entities.filter((entity)=>entity.type==='resource').flatMap((entity)=>entity.representations??[]).map((representation)=>representation.id);
  const relationIds=(reopened.graph.relations??[]).map((relation)=>relation.id).filter(Boolean);
  assert.equal(new Set(entityIds).size,entityIds.length);
  assert.equal(new Set(representationIds).size,representationIds.length);
  assert.equal(new Set(relationIds).size,relationIds.length);
  assert.equal(reopened.manifest.profiles.filter((profile)=>profile.id==='https://p2lrn.org/profile/h5p').length,1);
  assert.equal(reopened.manifest.profiles.find((profile)=>profile.id==='https://p2lrn.org/profile/h5p')?.requirement,'required');
});
