// Inspect exact library scripts in the pinned H5P package for base-uri changes.
// Read-only static analysis; no eval, no DOM execution, no remote fetch.
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {ZipArchive} from '../packages/toolkit/dist/core/zip.js';
import {openP2LRNPackageBytes} from '../packages/toolkit/web/p2lrn-player.js';
const dir=join(resolve(import.meta.dirname,'..'),'examples/canonical/external/free');
const p=await readFile(join(dir,'h5p-interactive-video.p2lrn'));
const pkg=await openP2LRNPackageBytes(p.buffer.slice(p.byteOffset,p.byteOffset+p.byteLength));
const original=pkg.manifest.files.find(x=>x.mediaType==='application/zip');
const zip=ZipArchive.open(await pkg.payload(original.path).read());
const names=zip.names().filter(x=>/\.(?:js|html|htm)$/iu.test(x));
const regex=/(?:<base\b|createElement\s*\(\s*['"]base['"]|baseUri\b|baseURI\b|insertAdjacentHTML|document\.write\s*\(|\.innerHTML\s*=)/giu;
for(const name of names){
  const b=zip.read(name);if(b.byteLength>3*1024*1024)continue;
  const s=new TextDecoder().decode(b);const hits=[...s.matchAll(regex)];
  if(!hits.length)continue;
  const snippets=hits.slice(0,15).map(m=>s.slice(Math.max(0,m.index-100),Math.min(s.length,m.index+150)).replace(/\s+/g,' '));
  console.log('H5P_BASE_AUDIT='+JSON.stringify({name,bytes:b.length,hits:hits.length,snippets}));
}
console.log('H5P_BASE_FILES_SCANNED='+names.length);
