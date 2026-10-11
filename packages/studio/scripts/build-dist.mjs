import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const repo=resolve(root,'..','..');
const out=join(root,'dist');
await rm(out,{recursive:true,force:true});
await mkdir(join(out,'runtime'),{recursive:true});
const source=await readFile(join(root,'src','p2lrn-studio.js'),'utf8');
await writeFile(join(out,'p2lrn-studio.esm.js'),source);
await cp(join(root,'src','p2lrn-studio.loader.js'),join(out,'p2lrn-studio.js'));
await cp(join(repo,'packages','toolkit','web','studio','authoring-document.js'),join(out,'runtime','authoring-document.js'));
await cp(join(repo,'packages','toolkit','web','studio','package-export.js'),join(out,'runtime','package-export.js'));
await cp(join(repo,'packages','toolkit','web','studio','new-document.js'),join(out,'runtime','new-document.js'));
await cp(join(repo,'packages','toolkit','web','studio','questionnaire-editor.js'),join(out,'runtime','questionnaire-editor.js'));
await cp(join(repo,'packages','toolkit','web','studio','structured-editor.js'),join(out,'runtime','structured-editor.js'));
console.log(JSON.stringify({ok:true,output:out},null,2));
