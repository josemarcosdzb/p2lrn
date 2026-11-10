import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {publishPackageCorrespondingSource,verifyPackageCorrespondingSource} from '../corresponding-source.mjs';
import {publishNativeCorrespondingSource} from '../native-corresponding-source.mjs';

const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const version='0.5.0-alpha.12';

test('source manifests cover all three first-party packages with SHA-256',async()=>{
  const out=await mkdtemp(join(tmpdir(),'p2lrn-source-'));
  try{
    for(const name of ['toolkit','studio','analytics']){
      const {manifest}=await publishPackageCorrespondingSource({root,outputRoot:out,name,version,sourceRef:'qa'});
      const verified=await verifyPackageCorrespondingSource({outputRoot:out,name,version});
      assert.equal(manifest.sourceRef,'qa');
      assert.equal(verified.valid,true);
      assert(verified.fileCount>5);
      const declared=JSON.parse(await readFile(join(root,'packages',name,'package.json'),'utf8'));
      const entries=manifest.files.map(entry=>entry.path);
      for(const file of declared.files){
        const path=file.replace(/\/+$/,'');
        if(path==='dist')continue; // Built JavaScript is covered by the binary distribution.
        const prefix='packages/'+name+'/'+path;
        assert(entries.some(entry=>entry===prefix||entry.startsWith(prefix+'/')),
          'Corresponding Source omitted a published npm input: '+prefix);
      }
      assert(entries.includes('packages/'+name+'/package.json'));
      const target=join(out,name,version,'source','packages',name,'LICENSE');
      const original=await readFile(join(root,'LICENSE'));
      assert((await readFile(target)).equals(original));
      const current=manifest.files[0];
      const file=join(out,name,version,'source',...current.path.split('/'));
      const raw=await readFile(file);
      await writeFile(file,Buffer.concat([raw,Buffer.from('X')]));
      await assert.rejects(()=>verifyPackageCorrespondingSource({outputRoot:out,name,version}),/hash mismatch/);
    }
  }finally{await rm(out,{recursive:true,force:true,maxRetries:5});}
});

test('native Windows launcher publishes a downloadable source archive and exact manifest',async()=>{
  const out=await mkdtemp(join(tmpdir(),'p2lrn-native-source-'));
  try{
    const source=await publishNativeCorrespondingSource({root,outputRoot:out,version,sourceRef:'qa'});
    assert.equal(source.manifest.component,'p2lrn-offline-launcher');
    assert.equal(source.manifest.version,version);
    assert.equal(source.manifest.files.length,8);
    assert.match(source.archive.sha256,/^sha256:[0-9a-f]{64}$/);
    assert((await stat(join(out,'downloads','p2lrn-offline-launcher-source.tar.gz'))).size>0);
    assert((await readFile(join(out,'downloads','source','LICENSE'))).equals(await readFile(join(root,'LICENSE'))));
  }finally{await rm(out,{recursive:true,force:true,maxRetries:5});}
});
