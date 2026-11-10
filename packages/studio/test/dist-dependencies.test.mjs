import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const source=path=>readFile(join(root,path));
const execute=promisify(execFile);
let buildPromise;
const ensureBuild=()=>buildPromise??=execute(process.execPath,
 ['packages/studio/scripts/build-dist.mjs'],{cwd:root,timeout:90000});
async function mirrored(input,output){
 const [expected,actual]=await Promise.all([
  source('packages/toolkit/web/'+input),
  source('packages/studio/dist/'+output),
 ]);
 assert.deepEqual(actual,expected,'npm Studio distribution does not preserve '+input);
}

test('Studio distribution preserves every imported editor module, manual grading and geometry',async()=>{
 const editorSources=[
  'questionnaire-editor.js','structured-editor.js','lesson-images.js',
  'package-export.js','authoring-document.js'
 ];
 const imports=new Set();
 for(const file of editorSources){
  const code=(await source('packages/toolkit/web/studio/'+file)).toString('utf8');
  for(const match of code.matchAll(/from\s+['"]\.\/([a-z0-9-]+\.js)['"]/g))imports.add(match[1]);
 }
 assert.deepEqual([...imports].sort(),[
  'assembly-3d-editor.js','questionnaire-grading.js','studio-ui-i18n.js','visual-layout.js'
 ]);
 await ensureBuild();
 for(const file of imports)await mirrored('studio/'+file,'runtime/'+file);
 await mirrored('studio/manual-grading.js','runtime/manual-grading.js');
 await mirrored('assembly-3d-core.js','assembly-3d-core.js');
});

test('npm Studio includes the exact renderer locale and course rights modules',async()=>{
 const rights=(await source('packages/toolkit/web/course-rights.js')).toString('utf8');
 assert.match(rights,/from\s+['"]\.\/renderers\/ui-i18n\.js['"]/);
 await ensureBuild();
 await mirrored('renderers/ui-i18n.js','renderers/ui-i18n.js');
 await mirrored('course-rights.js','course-rights.js');
});

test('npm Studio copies actual history, object geometry and contextual table tools',async()=>{
 const bar=(await source('packages/toolkit/web/studio/command-bar.js')).toString('utf8');
 assert.match(bar,/studio-advanced-tools\.js/);
 await ensureBuild();
 for(const file of ['studio-history.js','studio-object-tools.js','studio-advanced-tools.js'])
  await mirrored('studio/'+file,'runtime/'+file);
});
