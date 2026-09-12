import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {upgradeProjectWorkspace} from '../dist/creator/project.js';

const legacyProject=resolve('../../examples/legacy-alpha15/creator-project/p2rln.project.json');

test('workspace upgrade replaces the legacy P2RLN project filename with the canonical P2LRN filename',()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-project-name-'));
  try{
    const root=join(dir,'workspace'),legacy=join(root,'p2rln.project.json'),canonical=join(root,'p2lrn.project.json');
    mkdirSync(root,{recursive:true});
    copyFileSync(legacyProject,legacy);
    const result=upgradeProjectWorkspace(root);
    assert.equal(result.sourcePath,legacy);
    assert.equal(result.projectPath,canonical);
    assert.equal(existsSync(canonical),true);
    assert.equal(existsSync(legacy),false);
    assert.equal(JSON.parse(readFileSync(canonical,'utf8')).projectVersion,'0.3.0');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
