import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';

const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const source=path=>readFile(join(root,path),'utf8');

test('Studio distribution copies all direct localized editor module imports',async()=>{
  const build=await source('packages/studio/scripts/build-dist.mjs');
  const editorSources=[
    'packages/toolkit/web/studio/questionnaire-editor.js',
    'packages/toolkit/web/studio/structured-editor.js',
    'packages/toolkit/web/studio/lesson-images.js',
  ];
  const imports=new Set();
  for(const path of editorSources){
    const code=await source(path);
    for(const match of code.matchAll(/from\\s+['"]\\.\\/(studio-ui-i18n\\.js)['"]/g))imports.add(match[1]);
  }
  assert.deepEqual([...imports],['studio-ui-i18n.js'],
    'UI editor module graph must include the localized module');
  for(const file of imports){
    const marker="join(out,'runtime','"+file+"')";
    assert.ok(build.includes(marker),'Studio dist must copy runtime dependency '+file);
    await source('packages/toolkit/web/studio/'+file);
  }
});
