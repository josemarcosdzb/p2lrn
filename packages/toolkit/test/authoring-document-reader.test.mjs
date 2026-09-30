import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {P2LRNAuthoringWorkspace} from '../dist/authoring/index.js';

test('authoring workspace reader resolves relative paths and does not mutate the project',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-authoring-reader-'));
  try{
    const root=join(dir,'workspace');
    const workspace=P2LRNAuthoringWorkspace.create(root,{title:'Curso Reader',language:'es'});
    const before=workspace.summary();

    const source=join(root,'tema.md');
    writeFileSync(source,'# Tema 1\n\nContenido principal\n');

    const document=await workspace.reader('tema.md');

    assert.equal(document.version,'p2lrn.document-reader.v1');
    assert.equal(document.source.name,'tema.md');
    assert.equal(document.source.detectedType,'MARKDOWN');
    assert.ok(document.blocks.some((block)=>block.text.includes('Tema 1')));

    const after=workspace.summary();
    assert.deepEqual(after.counts,before.counts);
    assert.equal(after.projectId,before.projectId);
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});

test('authoring workspace reader accepts an absolute path',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-authoring-reader-absolute-'));
  try{
    const root=join(dir,'workspace');
    const workspace=P2LRNAuthoringWorkspace.create(root,{title:'Curso Reader',language:'es'});
    const source=join(dir,'material.txt');
    writeFileSync(source,'Primera linea\nSegunda linea\n');

    const document=await workspace.reader(source);

    assert.equal(document.source.name,'material.txt');
    assert.equal(document.source.detectedType,'TXT');
    assert.ok(document.blocks.length>=1);
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});
