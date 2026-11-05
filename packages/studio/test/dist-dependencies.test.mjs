import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const source=path=>readFile(join(root,path),'utf8');

test('Studio distribution copies localized UI and deferred-grading editor modules',async()=>{
  const build=await source('packages/studio/scripts/build-dist.mjs');
  const editorSources=[
    'packages/toolkit/web/studio/questionnaire-editor.js',
    'packages/toolkit/web/studio/structured-editor.js',
    'packages/toolkit/web/studio/lesson-images.js',
    'packages/toolkit/web/studio/package-export.js',
    'packages/toolkit/web/studio/authoring-document.js',
  ];
  const imports=new Set();
  for(const path of editorSources){
    const code=await source(path);
    for(const match of code.matchAll(/from\s+['"]\.\/([a-z0-9-]+\.js)['"]/g))imports.add(match[1]);
  }
  assert.deepEqual([...imports].sort(),['questionnaire-grading.js','studio-ui-i18n.js'],
    'UI editor module graph must include both shared modules');
  for(const file of imports){
    const marker="join(out,'runtime','"+file+"')";
    assert.ok(build.includes(marker),'Studio dist must copy runtime dependency '+file);
    await source('packages/toolkit/web/studio/'+file);
  }
});

// Ensure dependencies of copied root modules are not omitted from the npm release.
test('Studio npm build includes renderer localization required by course rights',async()=>{
  const rights=await source('packages/toolkit/web/course-rights.js');
  assert.match(rights,/from\s+['"]\.\/renderers\/ui-i18n\.js['"]/);
  const build=await source('packages/studio/scripts/build-dist.mjs');
  assert.ok(build.includes("join(out,'renderers','ui-i18n.js')"),
    'The npm Studio dist must preserve the transitive renderers/ui-i18n.js import');
  await source('packages/toolkit/web/renderers/ui-i18n.js');
});

test('Studio dist build copies the shared history, geometry and contextual table tools',async()=>{
  const build=await source('packages/studio/scripts/build-dist.mjs');
  const bar=await source('packages/toolkit/web/studio/command-bar.js');
  assert.match(bar,/studio-advanced-tools\.js/);
  for(const name of ['studio-history.js','studio-object-tools.js','studio-advanced-tools.js']){
    assert.ok(build.includes(name),'Missing runtime asset in build: '+name);
    await source('packages/toolkit/web/studio/'+name);
  }
});
