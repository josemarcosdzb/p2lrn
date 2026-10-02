import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {P2LRNStudioDocument} from '../web/studio/authoring-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';

const toArrayBuffer=(bytes)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);

test('Studio edits a copy and exports a new valid P2LRN package',async()=>{
  const originalBytes=new Uint8Array(await readFile(resolve('../../examples/canonical/creator-course.p2lrn')));
  const original=await openP2LRNPackageBytes(toArrayBuffer(originalBytes));
  const doc=new P2LRNStudioDocument(original,{sourceName:'creator-course.p2lrn'});
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
