import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,renameSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {upgradeProjectWorkspace} from '../dist/creator/project.js';
import {P2LRNAuthoringWorkspace} from '../dist/authoring/index.js';

test('workspace upgrade replaces a legacy P2RLN filename with the canonical P2LRN filename',()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-project-name-'));
  try{
    const root=join(dir,'workspace');
    const legacy=join(root,'p2rln.project.json'),canonical=join(root,'p2lrn.project.json');
    const workspace=P2LRNAuthoringWorkspace.create(root,{title:'Migración de proyecto',language:'es'});
    workspace.addUrl({key:'first',title:'Primera lección',url:'https://example.invalid/lesson'});
    renameSync(workspace.projectFile,legacy);
    const result=upgradeProjectWorkspace(root);
    assert.equal(result.sourcePath,legacy);
    assert.equal(result.projectPath,canonical);
    assert.equal(existsSync(canonical),true);
    assert.equal(existsSync(legacy),false);
    assert.equal(JSON.parse(readFileSync(canonical,'utf8')).projectVersion,'0.3.0');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
