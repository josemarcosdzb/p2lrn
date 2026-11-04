import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,mkdtemp,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {createPlayerAnalyticsSession,createHttpResultHost} from '../../toolkit/web/result-bridge.js';
import {createResultRecorder} from '../../toolkit/web/result-recorder.js';
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

test('Results Host isolates delimiter-colliding learners, bounds attempts and rejects deeply nested records',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'p2lrn-security-results-'));
 const identities={
  a:{mode:'platform',tenantId:'school',issuer:'org:group',subjectId:'learner'},
  b:{mode:'platform',tenantId:'school',issuer:'org',subjectId:'group:learner'},
  teacher:{mode:'platform',tenantId:'school',issuer:'org',subjectId:'teacher'}
 };
 assert.equal(['platform',identities.a.issuer,identities.a.subjectId].join(':'),
   ['platform',identities.b.issuer,identities.b.subjectId].join(':'));
 const handler=createP2LRNResultsHttpHandler({
  directory,authenticate:req=>identities[String(req.headers.authorization||'').replace('Bearer ','')]??null,
  authorize:()=>true,checkCsrf:()=>true,maxAttemptsPerLearner:1,
 });
 const server=createServer((req,res)=>handler(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/api/p2lrn/results';
 const request=(token,endpoint=url,options={})=>fetch(endpoint,{
  ...options,headers:{Authorization:'Bearer '+token,...options.headers},
 });
 const put=(token,value)=>request(token,url,{method:'PUT',
  headers:{'Content-Type':'application/vnd.p2lrn-result+json','X-P2LRN-CSRF':'test'},
  body:JSON.stringify(value)});
 async function checkpoint(actor,id){
  const player=players();
  const recorder=createResultRecorder(player,{identity:{
   mode:'platform',issuer:actor.issuer,subjectId:actor.subjectId},courseId,attemptId:id});
  const result=await recorder.checkpoint();
  recorder.stop();
  return result;
 }
 try{
  const first=await checkpoint(identities.a,'same-id');
  const second=await checkpoint(identities.b,'same-id');
  const [ra,rb]=await Promise.all([put('a',first),put('b',second)]);
  assert.deepEqual([ra.status,rb.status],[200,200],'Two actors may not share one result slot');
  const a=await request('a',url+'/current?courseId='+encodeURIComponent(courseId));
  const b=await request('b',url+'/current?courseId='+encodeURIComponent(courseId));
  assert.equal((await a.json()).result.identity.issuer,'org:group');
  assert.equal((await b.json()).result.identity.issuer,'org');
  const index=await request('teacher',url+'/index?courseId='+encodeURIComponent(courseId));
  assert.equal((await index.json()).results.length,2);
  const overflow=await checkpoint(identities.a,'second-attempt');
  assert.equal((await put('a',overflow)).status,429);
  const nested=structuredClone(first);
  let value={value:'safe'};
  for(let i=0;i<150;i++)value={value};
  nested.submission.states.push({id:'nested',value});
  const tooDeep=await put('a',nested);
  assert.equal(tooDeep.status,422);
  assert.equal((await tooDeep.json()).error,'RESULT_COMPLEXITY_LIMIT');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  await rm(directory,{recursive:true,force:true});
 }
});

test('Results Host recovers a verified legacy checkpoint without mixing actors or losing its file',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'p2lrn-results-legacy-'));
 const who={mode:'platform',tenantId:'school',issuer:'org:group',subjectId:'learner'};
 const other={mode:'platform',tenantId:'school',issuer:'org',subjectId:'group:learner'};
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const recorder=createResultRecorder(players(),{identity:{
  mode:'platform',issuer:who.issuer,subjectId:who.subjectId},courseId,attemptId:'legacy-attempt'});
 const legacy=await recorder.checkpoint();
 recorder.stop();
 const filename=hash(legacy.attempt.id)+'.p2lrn-result';
 const legacyFile=join(directory,hash('school'),hash(courseId),
  hash('platform:org:group:learner'),filename);
 const modernFile=join(directory,hash('school'),hash(courseId),
  hash(JSON.stringify(['platform',who.issuer,who.subjectId])),filename);
 await mkdir(dirname(legacyFile),{recursive:true});
 await writeFile(legacyFile,JSON.stringify(legacy)+'\n');
 const handler=createP2LRNResultsHttpHandler({
  directory,authenticate:req=>String(req.headers.authorization||'').includes('other')?other:who,
  authorize:()=>true,checkCsrf:()=>true,maxAttemptsPerLearner:1,
 });
 const server=createServer((req,res)=>handler(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api/p2lrn/results';
 const get=actor=>fetch(base+'/current?courseId='+encodeURIComponent(courseId),{
  headers:{Authorization:'Bearer '+actor}
 });
 try{
  const recovered=await get('owner');
  assert.equal(recovered.status,200);
  assert.equal((await recovered.json()).result.attempt.id,'legacy-attempt');
  assert.equal((await get('other')).status,204,
   'A colliding historical directory must not disclose another learner');
  const written=await fetch(base,{method:'PUT',headers:{
   Authorization:'Bearer owner','Content-Type':'application/vnd.p2lrn-result+json',
   'X-P2LRN-CSRF':'test'},body:JSON.stringify(legacy)});
  assert.equal(written.status,200);
  assert.equal((await written.json()).unchanged,true);
  await stat(modernFile);
  await assert.rejects(stat(legacyFile),{code:'ENOENT'});
  assert.equal((await get('owner')).status,200);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  await rm(directory,{recursive:true,force:true});
 }
});
