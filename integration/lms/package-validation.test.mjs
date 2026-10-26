// Validate actual portable course files using the real P2LRN CLI, not a mock LMS.
// The same packages/Player are used when launched from Moodle, Sakai or Chamilo.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const validator=join(project,'packages/toolkit/dist/cli/validate.js');
const run=path=>spawnSync(process.execPath,[validator,path,'--profile-payloads'],{
  encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024
});
for(const filename of [
  'minimal-course.p2lrn','native-questionnaire-course.p2lrn',
  'quest-3d-course.p2lrn','external/scorm12-real.p2lrn',
  'external/h5p-crossword.p2lrn'
]){
  test('real P2LRN validator accepts '+filename,()=>{
    const path=join(project,'examples/canonical',filename);
    const r=run(path);
    assert.equal(r.error,undefined,String(r.error));
    assert.equal(r.status,0,'validator rejected '+filename+': '+r.stderr);
    const summary=JSON.parse(r.stdout);
    assert.ok(summary&&typeof summary==='object');
  });
}
test('real P2LRN validator rejects truncated published course bytes',()=>{
 const folder=mkdtempSync(join(tmpdir(),'p2lrn-lti-validation-'));
 try{
   const source=readFileSync(join(project,'examples/canonical/minimal-course.p2lrn'));
   const file=join(folder,'truncated.p2lrn');
   writeFileSync(file,source.subarray(0,source.length-60));
   const result=run(file);
   assert.equal(result.error,undefined,String(result.error));
   assert.notEqual(result.status,0,'corrupt package incorrectly accepted');
   assert.match(result.stderr,/INVALID:/);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
