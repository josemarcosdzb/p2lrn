// Reports media references and integrity of existing H5P demo packages.
// Read-only: does not download remote content or bypass CSP.
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {openP2LRNPackageBytes} from '../packages/toolkit/web/p2lrn-player.js';
import {ZipArchive} from '../packages/toolkit/dist/core/zip.js';
const root=resolve(import.meta.dirname,'..');
const dir=join(root,'examples/canonical/external/free');
const prov=JSON.parse(await readFile(join(dir,'provenance.json'),'utf8'));
const videoExt=/\.(?:mp4|webm|ogg|mp3|wav)(?:[?#]|$)/iu;
for(const item of prov.samples.filter(s=>s.kind==='h5p')){
  const bytes=await readFile(join(dir,item.slug+'.p2lrn'));
  const p=await openP2LRNPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const original=p.manifest.files.find(x=>x.mediaType==='application/zip');
  const zip=ZipArchive.open(await p.payload(original.path).read());
  const names=zip.names();
  const content=JSON.parse(new TextDecoder().decode(zip.read('content/content.json')));
  const external=[];
  const stack=[{path:'content',val:content}],visited=new Set();
  while(stack.length){
    const {path,val}=stack.pop();
    if(val&&typeof val==='object'){
      if(visited.has(val))continue;visited.add(val);
      for(const [key,value] of Object.entries(val))stack.push({path:path+'.'+key,val:value});
    }else if(typeof val==='string'&&(/^(?:https?:)?\/\//iu.test(val)||videoExt.test(val))){
      external.push({path,value:val.slice(0,240)});
    }
  }
  console.log('H5P_MEDIA_AUDIT='+JSON.stringify({
    slug:item.slug,
    mediaMembers:names.filter(n=>videoExt.test(n)).slice(0,120),
    remoteMedia:external.filter(x=>/^(?:https?:)?\/\//iu.test(x.value)).slice(0,40),
    sourceFileRefs:external.slice(0,80),
    librarySounds:names.filter(n=>/sounds\/.*\.(ogg|wav|mp3)$/iu.test(n)).slice(0,40),
    files:names.length
  }));
}
