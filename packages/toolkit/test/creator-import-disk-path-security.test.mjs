import test from 'node:test';
import assert from 'node:assert/strict';
import {workspacePath} from '../dist/creator/import-project.js';

test('Creator import extracts only portable regular workspace member paths',()=>{
  assert.equal(workspacePath('assets/lesson.png'),'package-files/assets/lesson.png');
  assert.equal(workspacePath('slides/tema 1.pptx'),'package-files/slides/tema 1.pptx');
});

test('Creator import refuses Windows ADS and reserved device or ambiguous filename aliases',()=>{
  for(const path of [
    'documents/exam.txt:payload', 'CON','folder/aux.xml','folder/COM1.txt',
    'folder/LPT2','folder/name.','folder/part ','C:/Windows/system.ini',
    '/etc/passwd','../../outside.txt','folder/../secret.txt',
    'folder\\..\\outside.txt','folder/thing?query','folder/thing|pipe',
    'folder/thing*wildcard', 'folder/bad\u0001control',
  ]){
    assert.throws(()=>workspacePath(path),/unsafe|Unsafe|not allowed|ZIP path|import/i,path);
  }
});
