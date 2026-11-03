import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlayerAnalyticsSession,createHttpResultHost} from '../../toolkit/web/result-bridge.js';
import {createP2LRNResultsHttpHandler} from '../server/results-http.mjs';
import {loadAnalyticsResultSource} from '../../analytics/src/model.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const courseId='urn:p2lrn:test:course-one';
const root='sha256:'+'a'.repeat(64);
const players=()=>Object.assign(new EventTarget(),{packageId:courseId,contentRoot:root});
const emit=(player,type,detail)=>{const event=new Event(type);event.detail=detail;player.dispatchEvent(event);};
const identities={
 alice:{mode:'platform',issuer:'qa.academy',subjectId:'alice',label:'Alice QA'},
 bob:{mode:'platform',issuer:'qa.academy',subjectId:'bob',label:'Bob QA'},
};
async function setup(){
 const directory=await mkdtemp(join(tmpdir(),'p2lrn-results-contract-'));
 const principals={
  alice:{mode:'platform',tenantId:'school',issuer:'qa.academy',subjectId:'alice'},
  bob:{mode:'platform',tenantId:'school',issuer:'qa.academy',subjectId:'bob'},
  teacher:{mode:'platform',tenantId:'school',issuer:'qa.academy',subjectId:'teacher'}
 };
 const allow=({principal,action,courseId:course})=>{
  if(course!==courseId)return false;
  if(action==='read-course')return principal.subjectId==='teacher';
  return ['alice','bob'].includes(principal.subjectId);
 };
 const handler=createP2LRNResultsHttpHandler({
  directory,basePath:'/api/p2lrn/results',
  authenticate:req=>principals[String(req.headers.authorization||'').replace(/^Bearer /,'')]??null,
  authorize:allow,
  checkCsrf:req=>req.headers['x-p2lrn-csrf']==='qa-csrf',
 });
 const server=createServer((req,res)=>handler(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const baseURL='http://127.0.0.1:'+server.address().port+'/';
 const fetchAs=token=>(url,options={})=>fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+token}});
 const host=who=>createHttpResultHost({baseUrl:baseURL+'api/p2lrn/results',
   pageURL:baseURL,fetchImpl:fetchAs(who),csrfToken:'qa-csrf'});
 return {directory,server,baseURL,fetchAs,host,async cleanup(){
  await new Promise(resolve=>server.close(resolve));
  await rm(directory,{recursive:true,force:true});
 }};
}
test('Player, secure file Host and Analytics: auto checkpoints, resume and final results for two learners',async()=>{
 const t=await setup();
 try{
  const first=players();
  let preservedSaves=0;
  first.adapter={version:'1',async saveState(){preservedSaves++;},async loadState(){return null;},
    resolveResourceUrl:async()=>({url:'https://resources.example/cached',verified:true})};
  const a=await createPlayerAnalyticsSession(first,{
   identity:identities.alice,courseId,courseTitle:'Course 1',host:t.host('alice'),autoSaveDelayMs:0,
  });
  assert.equal(a.resumed,false);
  emit(first,'p2lrn:statechange',{answers:{q1:'A'}});
  await first.adapter.saveState({answers:{q1:'A'},progress:0.4},{entityId:'question-one'});
  assert.equal(preservedSaves,1,'Existing LMS adapter must retain its saveState capability');
  assert.equal((await first.adapter.resolveResourceUrl({path:'media/a.png'})).verified,true);
  const progress=await a.checkpoint();
  assert.equal(progress.attempt.status,'in_progress');
  assert.equal(progress.submission.states.length,2);
  const saveAgain=await t.host('alice').saveResult(progress);
  assert.equal(saveAgain.saved,true);
  assert.equal(saveAgain.unchanged,true);
  a.stop();

  const before=await t.host('alice').loadCurrent({courseId});
  assert.equal(before.attempt.id,progress.attempt.id);
  const anotherDevice=players();
  const resumed=await createPlayerAnalyticsSession(anotherDevice,{
   identity:identities.alice,courseId,host:t.host('alice'),autoSaveDelayMs:0,
  });
  assert.equal(resumed.resumed,true);
  assert.equal(resumed.attemptId,progress.attempt.id);
  assert.deepEqual(await anotherDevice.adapter.loadState({entityId:'question-one'}),
    {answers:{q1:'A'},progress:0.4},'Player must recover activity state, not just Analytics events');
  emit(anotherDevice,'p2lrn:score',{score:8,maxScore:10});
  const final=await resumed.finish();
  assert.equal(final.attempt.id,progress.attempt.id);
  assert.equal(final.attempt.status,'submitted');
  assert.equal(final.analytics.events.length,3);
  assert.equal((await t.host('alice').loadCurrent({courseId})),null);
  await assert.rejects(t.host('alice').saveResult(progress),/HTTP 409/);
  resumed.stop();

  const bobPlayer=players();
  const bob=await createPlayerAnalyticsSession(bobPlayer,{identity:identities.bob,courseId,host:t.host('bob')});
  emit(bobPlayer,'p2lrn:score',{score:5,maxScore:10});
  await bob.finish();
  bob.stop();

  const resultsSrc=t.host('teacher').indexUrl(courseId);
  assert(resultsSrc.endsWith('courseId='+encodeURIComponent(courseId)));
  const dataset=await loadAnalyticsResultSource(resultsSrc,{baseURL:t.baseURL,fetcher:t.fetchAs('teacher')});
  assert.equal(dataset.learners.length,2);
  assert.equal(dataset.attempts.length,2);
  assert.equal(dataset.grades.length,2);
  assert.equal(dataset.attempts.find(x=>x.learnerId.includes('alice')).id,progress.attempt.id);
  const forbidden=await t.fetchAs('alice')(resultsSrc);
  assert.equal(forbidden.status,403);
  const wrongCourse=await t.fetchAs('teacher')(t.host('teacher').indexUrl('urn:other'));
  assert.equal(wrongCourse.status,403);
 }finally{await t.cleanup();}
});
test('Host denies forged identity, missing CSRF, corrupted digests and unsafe course access',async()=>{
 const t=await setup();
 try{
  const player=players();
  const recorder=await createPlayerAnalyticsSession(player,{identity:identities.alice,courseId,host:t.host('alice')});
  emit(player,'p2lrn:score',{score:4,maxScore:10});
  const progress=await recorder.checkpoint();
  recorder.stop();
  const end=t.baseURL+'api/p2lrn/results';
  const fetchWith=(token,obj,csrf)=>t.fetchAs(token)(end,{
   method:'PUT',headers:{'Content-Type':'application/vnd.p2lrn-result+json',
    ...(csrf?{'X-P2LRN-CSRF':'qa-csrf'}:{})},
   body:JSON.stringify(obj),
  });
  assert.equal((await fetchWith('bob',progress,true)).status,403);
  assert.equal((await fetchWith('alice',progress,false)).status,403);
  const changed=structuredClone(progress);changed.submission.scores[0]?.value&&(changed.submission.scores[0].value.score=11);
  changed.identity.label='FAKE';
  assert.equal((await fetchWith('alice',changed,true)).status,422);
  assert.equal((await fetchWith('alice',{...progress,assignment:{...progress.assignment,packageId:'other'}},true)).status,422);
  assert.equal((await t.fetchAs('bob')(end+'/current?courseId='+encodeURIComponent('urn:other'))).status,403);
 }finally{await t.cleanup();}
});
