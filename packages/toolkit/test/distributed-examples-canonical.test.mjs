import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {writeZip} from '../dist/core/zip.js';
import {validatePackageBytes} from '../dist/core/validator.js';

function walkFiles(root){
  const out=[];
  for(const name of readdirSync(root)){
    const path=join(root,name),stat=statSync(path);
    if(stat.isDirectory())out.push(...walkFiles(path));
    else if(stat.isFile())out.push(path);
  }
  return out.sort();
}

for(const name of ['minimal','web']){
  test(`distributed toolkit example ${name} is canonical P2LRN`,()=>{
    const root=resolve('examples',name);
    const entries=walkFiles(root).map((path)=>({
      path:relative(root,path).split('\\').join('/'),
      data:readFileSync(path),
    }));
    const validated=validatePackageBytes(writeZip(entries),{strictProfiles:true,validateProfilePayloads:true});
    assert.equal(validated.manifest.format,'P2LRN');
    const manifest=readFileSync(join(root,'META-INF/manifest.json'),'utf8');
    const graph=readFileSync(join(root,'content/graph.json'),'utf8');
    assert.doesNotMatch(`${manifest}\n${graph}`,/P2RLN|p2rln\.org/);
  });
}
