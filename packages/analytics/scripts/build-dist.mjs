import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const out=join(root,'dist');
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await cp(join(root,'src','model.js'),join(out,'model.js'));
await cp(join(root,'src','locale.js'),join(out,'locale.js'));
await cp(join(root,'src','course-data-source.js'),join(out,'course-data-source.js'));
await cp(join(root,'src','p2lrn-analytics.js'),join(out,'p2lrn-analytics.esm.js'));
await cp(join(root,'src','p2lrn-analytics.loader.js'),join(out,'p2lrn-analytics.js'));
for(const file of ['model.js','locale.js','course-data-source.js','p2lrn-analytics.esm.js','p2lrn-analytics.js']){
  const value=await readFile(join(out,file),'utf8');
  if(!value.trim())throw new Error('Empty Analytics distribution file: '+file);
}
await writeFile(join(out,'release.json'),JSON.stringify({
  package:'@p2lrn/analytics',
  version:pkg.version,
  entrypoints:{classic:'p2lrn-analytics.js',module:'p2lrn-analytics.esm.js',model:'model.js'},
},null,2)+'\n');
console.log(JSON.stringify({ok:true,output:out,files:6},null,2));
