// Read-only audit of licensed cmi5 fixture to diagnose CSP-compatible handlers.
// Never executes imported HTML or scripts.
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {openP2LRNPackageBytes} from '../packages/toolkit/web/p2lrn-player.js';
import {ZipArchive} from '../packages/toolkit/dist/core/zip.js';
const root=resolve(import.meta.dirname,'..');
const input=join(root,'examples/canonical/external/cmi5-catapult-pre-post.p2lrn');
const bytes=await readFile(input);
const pkg=await openP2LRNPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const original=pkg.manifest.files.find(f=>f.mediaType==='application/zip');
if(!original)throw Error('Original embedded cmi5 zip missing');
const zip=ZipArchive.open(await pkg.payload(original.path).read());
const names=zip.names();
let total=0;
for(const path of names.filter(x=>/\.(?:html?|xhtml|js)$/iu.test(x)).slice(0,500)){
  const file=zip.read(path);
  if(file.byteLength>2*1024*1024)continue;
  const html=new TextDecoder().decode(file);
  const attributes=[...html.matchAll(/\s(on[a-z][a-z0-9]*)\s*=\s*(["'])([\s\S]*?)\2/giu)];
  const scripts=path.endsWith('.js')
    ?[...html.matchAll(/\b(?:document\.write(?:ln)?|\.innerHTML\s*=|\.setAttribute\(\s*['"]on[a-z]+|new\s+Function\s*\(|eval\s*\()/giu)]
    :[...html.matchAll(/\b(?:document\.write(?:ln)?|\.innerHTML\s*=|\.setAttribute\(\s*['"]on[a-z]+)/giu)];
  const iframes=[...html.matchAll(/<iframe\b[^>]*>/giu)].slice(0,3).map(x=>x[0].slice(0,200));
  if(attributes.length||scripts.length||iframes.length){
    total+=attributes.length+scripts.length;
    console.log('CMI5_HANDLER_AUDIT='+JSON.stringify({
      path,
      inlineAttributes:attributes.length,
      attributeTypes:[...new Set(attributes.map(x=>x[1]))].slice(0,20),
      attributes:attributes.slice(0,6).map(x=>({attr:x[1],body:x[3].slice(0,145)})),
      dynamicScriptMarkers:scripts.length,
      sourceLines:scripts.slice(0,6).map(x=>html.slice(Math.max(0,x.index-45),Math.min(html.length,x.index+130)).replace(/\s+/g,' ')),
      iframeMarkup:iframes,
      fileBytes:file.length
    }));
  }
}
console.log('CMI5_HANDLER_AUDIT_SUMMARY='+JSON.stringify({files:names.length,patterns:total}));
