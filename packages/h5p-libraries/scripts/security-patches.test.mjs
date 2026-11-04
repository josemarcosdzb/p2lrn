import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SECURITY_PATCH,applyPinnedH5pSecurityPatches} from './security-patches.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('Built H5P catalog includes the verified upstream checkboxradio XSS fix',async()=>{
  const manifest=JSON.parse(await readFile(join(root,'dist','index.json'),'utf8'));
  const record=manifest.securityPatches?.find(p=>p.advisory===SECURITY_PATCH.advisory);
  assert(record,'Missing CVE security patch metadata in H5P manifest');
  assert.equal(record.upstreamCommit,SECURITY_PATCH.upstreamCommit);
  const source=await readFile(join(root,'dist',...SECURITY_PATCH.file.split('/')));
  assert.equal(createHash('sha256').update(source).digest('hex'),SECURITY_PATCH.patchedSha256);
  const code=source.toString('utf8');
  assert(!code.includes('that.originalLabel += this.nodeType === 3 ? $( this ).text() : this.outerHTML;'));
  assert(code.includes('labelContents = this.label.contents().not( this.element[ 0 ] );'));
});
test('H5P patch fails closed on different upstream bytes',async()=>{
  const work=await mkdtemp(join(tmpdir(),'p2lrn-h5p-security-'));
  try{
    const file=join(work,...SECURITY_PATCH.file.split('/'));
    await mkdir(join(work,'jQuery.ui-1.10'),{recursive:true});
    await writeFile(file,'fake unverified jquery ui');
    await assert.rejects(applyPinnedH5pSecurityPatches(work),/source hash mismatch/);
    assert.equal(await readFile(file,'utf8'),'fake unverified jquery ui');
  }finally{await rm(work,{force:true,recursive:true});}
});
