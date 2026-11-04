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
await cp(join(repo,'packages','toolkit','web','studio','lesson-images.js'),join(out,'runtime','lesson-images.js'));
// Required by questionnaire, structured and lesson-image editors at module load.
// Omitting it leaves the published Studio Web Component unregistered in browsers.
await cp(join(repo,'packages','toolkit','web','studio','studio-ui-i18n.js'),join(out,'runtime','studio-ui-i18n.js'));
await cp(join(repo,'packages','toolkit','web','studio','offline-assignment.js'),join(out,'runtime','offline-assignment.js'));
for(const file of ['native-composite-core.js','component-registry.js','identifiers.js','renderer-registry.js','fill-blanks-core.js','capability-broker.js','course-rights.js']){
  await cp(join(repo,'packages','toolkit','web',file),join(out,file));
}
console.log(JSON.stringify({ok:true,output:out},null,2));
