import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {validatePackageFile} from '../dist/core/validator.js';
import {rebuildExample} from '../dist/tools/rebuild-examples.js';

for(const name of ['minimal','web']){
  test(`generated toolkit example ${name} is canonical P2LRN and does not require stored courses`,()=>{
    const dir=mkdtempSync(join(tmpdir(),'p2lrn-distributed-fixture-'));
    try{
      const result=rebuildExample(resolve('.'),name,dir);
      const validated=validatePackageFile(result.output,{strictProfiles:true,validateProfilePayloads:true});
      assert.equal(validated.manifest.format,'P2LRN');
      const manifest=readFileSync(result.output);
      assert.ok(manifest.byteLength>0);
      assert.ok(result.validation.contentRoot);
      assert.ok(validated.graph.entities.some((entity)=>entity.type==='activity'));
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
}
