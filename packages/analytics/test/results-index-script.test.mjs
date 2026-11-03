import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createResultRecorder} from '../../toolkit/web/result-recorder.js';
import {analyticsDatasetFromResultFiles} from '../src/model.js';

const run=promisify(execFile);
const script=resolve(dirname(fileURLToPath(import.meta.url)),'../../../deploy/netlify/site/examples/p2lrn-results-index.mjs');
async function result(id,code){
  const player=new EventTarget();
  player.packageId='course-1';
  player.contentRoot='sha256:'+'a'.repeat(64);
  const recorder=createResultRecorder(player,{
    identity:{mode:'code',issuer:'teacher',code},attemptId:id
  });
  recorder.record({type:'p2lrn:score',detail:{score:7,maxScore:10}});
  return recorder.finish();
}
test('index generator creates and refreshes a verifiable static index',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'p2lrn-results-index-qa-'));
  try{
    const first=await result('attempt-1','student-1');
    await writeFile(join(dir,'01.p2lrn-result'),JSON.stringify(first),'utf8');
    await run(process.execPath,[script,dir]);
    const target=join(dir,'index.p2lrn-results.json');
    let index=JSON.parse(await readFile(target,'utf8'));
    assert.equal(index.schema,'https://p2lrn.org/schema/analytics-results-index/1');
    assert.deepEqual(index.results,['01.p2lrn-result']);
    const second=await result('attempt-2','student-2');
    await writeFile(join(dir,'02.p2lrn-result'),JSON.stringify(second),'utf8');
    await run(process.execPath,[script,dir]);
    index=JSON.parse(await readFile(target,'utf8'));
    assert.deepEqual(index.results,['01.p2lrn-result','02.p2lrn-result']);
    const dataset=await analyticsDatasetFromResultFiles([first,second]);
    assert.equal(dataset.learners.length,2);
    const lastGood=await readFile(target,'utf8');
    await writeFile(join(dir,'03.p2lrn-result'),JSON.stringify({...second,identity:{...second.identity,code:'changed'}}),'utf8');
    await assert.rejects(()=>run(process.execPath,[script,dir]),/SHA-256 check failed/);
    assert.equal(await readFile(target,'utf8'),lastGood,'invalid results must not replace a valid index');
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
