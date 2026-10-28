import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const out=join(root,'dist');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await cp(join(root,'src','model.js'),join(out,'model.js'));
await cp(join(root,'src','p2lrn-analytics.js'),join(out,'p2lrn-analytics.esm.js'));
await cp(join(root,'src','p2lrn-analytics.loader.js'),join(out,'p2lrn-analytics.js'));
for(const file of ['model.js','p2lrn-analytics.esm.js','p2lrn-analytics.js']){
  const value=await readFile(join(out,file),'utf8');
  if(!value.trim())throw new Error('Empty Analytics distribution file: '+file);
}
await writeFile(join(out,'release.json'),JSON.stringify({
  package:'@p2lrn/analytics',
  version:'0.5.0-alpha.11',
  entrypoints:{classic:'p2lrn-analytics.js',module:'p2lrn-analytics.esm.js',model:'model.js'},
},null,2)+'\n');
console.log(JSON.stringify({ok:true,output:out,files:4},null,2));
