// The public example gallery is backed by real, immutable, licensed packages.
// This is package inspection only; it does NOT claim browser playback passed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openP2LRNPackageBytes} from '../packages/toolkit/web/p2lrn-player.js';
import {ZipArchive} from '../packages/toolkit/dist/core/zip.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const dir=join(root,'examples','canonical','external','free');
const schema='https://p2lrn.org/schema/community-samples/1';
const provenance=JSON.parse(await readFile(join(dir,'provenance.json'),'utf8'));
assert.equal(provenance.schema,schema);
assert.equal(provenance.version,1);
assert(Array.isArray(provenance.samples)&&provenance.samples.length>0&&provenance.samples.length<=80);
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const expected=new Set();
const results=[];
for(const sample of provenance.samples){
  assert.match(sample.slug,/^[a-z0-9][a-z0-9-]*$/);
  assert(!expected.has(sample.slug),'Duplicate community sample slug');
  expected.add(sample.slug);
  assert(['scorm','h5p','qti','cmi5','imscc'].includes(sample.kind));
  assert(['MIT','Apache-2.0','CC-BY-4.0'].includes(sample.license));
  assert.equal(sample.browserVerified,false,'Only a real browser test may mark a new sample verified');
  // A small interoperability fixture must not be advertised as a course.
  if(sample.kind==='imscc'){
    assert.equal(sample.sampleRole,'technical-fixture',sample.slug+' must disclose its limited scope');
    for(const note of [sample.sampleNoteEs,sample.sampleNoteEn])
      assert(typeof note==='string'&&note.length>=30&&note.length<=400,
        sample.slug+' requires bilingual fixture context');
  }

  assert.match(sample.sourceUrl,/^https:\/\/[^\s]+$/);
  assert.match(sample.sourceSha256,/^sha256:[a-f0-9]{64}$/);
  assert.match(sample.packageSha256,/^sha256:[a-f0-9]{64}$/);
  const filename=sample.slug+'.p2lrn',path=join(dir,filename);
  const metadata=await stat(path);
  assert(metadata.isFile()&&metadata.size<64*1024*1024,'Oversized or invalid package');
  const bytes=new Uint8Array(await readFile(path));
  assert.equal(digest(bytes),sample.packageSha256,filename+' differs from pinned package digest');
  const pkg=await openP2LRNPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const profile='https://p2lrn.org/profile/'+(sample.kind==='imscc'?'common-cartridge':sample.kind);
  assert(pkg.manifest.profiles.some(x=>x.id===profile),'Wrong profile for '+filename);
  const originals=pkg.manifest.files.filter(f=>f.mediaType==='application/zip');
  assert.equal(originals.length,1,'Original archive must be preserved byte for byte');
  const original=await pkg.payload(originals[0].path).read();
  assert.equal(digest(original),sample.sourceSha256,'Original source changed: '+filename);
  assert.equal(pkg.graph.extensions?.['org.p2lrn.import']?.sourceSha256,sample.sourceSha256);
  const inner=ZipArchive.open(original);
  if(sample.kind==='scorm')assert(inner.names().includes('imsmanifest.xml'));
  if(sample.kind==='cmi5')assert(inner.names().includes('cmi5.xml'));
  results.push({slug:sample.slug,format:sample.kind,bytes:bytes.byteLength,source:sample.sourceSha256,entities:pkg.graph.entities.length});
}
const publicFiles=(await readdir(dir)).filter(name=>name.endsWith('.p2lrn'));
assert.equal(publicFiles.length,expected.size,'Unlisted public examples must not be distributed');
for(const name of publicFiles)assert(expected.has(name.slice(0,-6)),'Unapproved public package');
console.log(JSON.stringify({ok:true,formatCount:new Set(results.map(x=>x.format)).size,total:results.length,results},null,2));