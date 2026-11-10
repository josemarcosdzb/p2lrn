import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {STUDIO_RUNTIME_SHARED_FILES} from '../../../deploy/netlify/studio-runtime-assets.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const repo=resolve(root,'..','..');
const out=join(root,'dist');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});

const source=await readFile(join(root,'src','p2lrn-studio.js'),'utf8');
await writeFile(join(out,'p2lrn-studio.esm.js'),source);
await cp(join(root,'src','p2lrn-studio.loader.js'),join(out,'p2lrn-studio.js'));

// Publish every Studio browser runtime module, not a hand-picked subset.
// This is the exact canonical tree used by the public /studio/runtime/ app.
await cp(join(repo,'packages','toolkit','web','studio'),join(out,'runtime'),{recursive:true});
for(const relative of STUDIO_RUNTIME_SHARED_FILES){
  const destination=join(out,...relative.split('/'));
  await mkdir(dirname(destination),{recursive:true});
  await cp(join(repo,'packages','toolkit','web',...relative.split('/')),destination);
}
console.log(JSON.stringify({ok:true,output:out,runtime:'complete canonical studio runtime'},null,2));
