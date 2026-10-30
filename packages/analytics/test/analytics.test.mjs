import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAnalyticsDataset,computeAnalyticsSnapshot,filterAnalyticsDataset,createAnalyticsStore,createHttpAnalyticsDataSource,analyticsToCsv,analyticsDatasetFromOfflineResult} from '../src/model.js';

const seed={
  generatedAt:'2026-10-28T10:00:00Z',
  learners:[{id:'ana',name:'Ana Ruiz',email:'ana@example.test',group:'A'},{id:'leo',name:'Leo Martín',group:'B'}],
  courses:[{id:'math',title:'Matemáticas'},{id:'science',title:'Ciencias'}],
  enrollments:[{learnerId:'ana',courseId:'math',progress:.75,startedAt:'2026-10-20T10:00:00Z'},{learnerId:'leo',courseId:'math',progress:1,completedAt:'2026-10-26T10:00:00Z'}],
  attempts:[{id:'a1',learnerId:'ana',courseId:'math',status:'started',progress:.75,startedAt:'2026-10-20T10:00:00Z',activeTimeMs:120000},{id:'l1',learnerId:'leo',courseId:'math',status:'completed',progress:1,startedAt:'2026-10-22T10:00:00Z',completedAt:'2026-10-26T10:00:00Z',activeTimeMs:300000}],
  grades:[{id:'ga',learnerId:'ana',courseId:'math',value:58,maxValue:100,authoritative:true,updatedAt:'2026-10-25T10:00:00Z'},{id:'gl',learnerId:'leo',courseId:'math',value:88,maxValue:100,authoritative:true,passed:true,updatedAt:'2026-10-26T10:00:00Z'},{id:'informative',learnerId:'ana',courseId:'science',value:100,maxValue:100,authoritative:false,updatedAt:'2026-10-27T10:00:00Z'},{id:'activity-grade',learnerId:'ana',courseId:'math',entityId:'quiz-1',value:100,maxValue:100,authoritative:true,updatedAt:'2026-10-27T11:00:00Z'}],
  events:[{id:'e1',type:'p2lrn:interaction',category:'assessment',timestamp:'2026-10-27T09:00:00Z',learnerId:'ana',courseId:'math',attemptId:'a1',payload:{action:'answer-change'}},{id:'e2',type:'p2lrn:active-time',category:'attention',timestamp:'2026-10-27T09:05:00Z',learnerId:'ana',courseId:'math',attemptId:'a1',payload:{totalActiveMs:240000}}],
};

test('normalizes datasets',()=>{const data=normalizeAnalyticsDataset(seed);assert.equal(data.schema,'https://p2lrn.org/schema/analytics-dataset/1');assert.equal(data.learners.length,2);});
test('computes authoritative metrics',()=>{const snap=computeAnalyticsSnapshot(seed,{now:Date.parse('2026-10-28T12:00:00Z')});assert.equal(snap.overview.learners,2);assert(Math.abs(snap.overview.averageGrade-.73)<.001);assert.equal(snap.courses.find(x=>x.id==='math').completed,1);assert.equal(snap.learners.find(x=>x.id==='ana').activeTimeMs,240000);assert.equal(snap.learners.find(x=>x.id==='ana').risk.level,'watch');});
test('ignores non-authoritative grades',()=>{const snap=computeAnalyticsSnapshot(seed);assert(Math.abs(snap.overview.averageGrade-.73)<.001);assert.equal(snap.gradeDistribution.reduce((sum,x)=>sum+x.count,0),2);});
test('filters learner and course',()=>{const filtered=filterAnalyticsDataset(seed,{learnerId:'ana',courseId:'math'});assert.equal(filtered.learners.length,1);assert.equal(filtered.courses.length,1);assert(filtered.attempts.every(x=>x.learnerId==='ana'&&x.courseId==='math'));});
test('store updates and snapshots',()=>{const store=createAnalyticsStore(seed);store.upsertLearner({id:'ana',name:'Ana R.','email':'ana@example.test'});assert.equal(store.data.learners.find(x=>x.id==='ana').name,'Ana R.');store.addEvent({id:'e3',type:'p2lrn:progress',category:'progress',timestamp:'2026-10-28T11:00:00Z',learnerId:'ana',courseId:'math'});assert.equal(store.snapshot().overview.events,3);});
test('CSV exports grades',()=>{const csv=analyticsToCsv(seed,{kind:'grades'});assert.match(csv,/autoritativa/);assert.match(csv,/Ana Ruiz/);assert.match(csv,/true/);});
test('HTTP datasource sends filters',async()=>{let called='';const source=createHttpAnalyticsDataSource({url:'https://host.example/api/analytics',fetch:async(url)=>{called=url;return {ok:true,json:async()=>seed};}});const result=await source.load({courseId:'math'});assert.match(called,/courseId=math/);assert.equal(result.learners.length,2);});

test('course filter excludes unrelated learners',()=>{
  const filtered=filterAnalyticsDataset(seed,{courseId:'science'});
  assert.deepEqual(filtered.learners.map(x=>x.id),['ana']);
});
test('learner filter excludes unrelated courses',()=>{
  const filtered=filterAnalyticsDataset(seed,{learnerId:'leo'});
  assert.deepEqual(filtered.courses.map(x=>x.id),['math']);
});
test('activity grades do not alter course-level averages',()=>{
  const snap=computeAnalyticsSnapshot(seed);
  assert(Math.abs(snap.overview.averageGrade-.73)<.001);
  assert.equal(snap.gradeDistribution.reduce((sum,x)=>sum+x.count,0),2);
});

test('CSV neutralizes spreadsheet formulas',()=>{
  const csv=analyticsToCsv({...seed,learners:[{id:'evil',name:'=2+2',email:'@cmd',group:'+group'}]},{kind:'learners'});
  assert.match(csv,/'=2\+2/);
  assert.match(csv,/'@cmd/);
  assert.match(csv,/'\+group/);
});
test('root component module exposes datasource and store helpers',async()=>{
  const mod=await import('../src/p2lrn-analytics.js');
  assert.equal(typeof mod.createHttpAnalyticsDataSource,'function');
  assert.equal(typeof mod.createAnalyticsStore,'function');
  assert.equal(typeof mod.createMemoryAnalyticsDataSource,'function');
  assert.equal(typeof mod.analyticsDatasetFromOfflineResult,'function');
  assert.equal(typeof mod.P2LRNAnalyticsElement.prototype.importOfflineResult,'function');
});

test('failed attempts never complete a course by status alone',()=>{
  const snap=computeAnalyticsSnapshot({
    learners:[{id:'u',name:'U'}],courses:[{id:'c',title:'C'}],
    enrollments:[{learnerId:'u',courseId:'c',progress:.2}],
    attempts:[{id:'a',learnerId:'u',courseId:'c',status:'failed',progress:.2}],
    grades:[],events:[]
  });
  assert.equal(snap.learners[0].progress,.2);
  assert.equal(snap.courses[0].completed,0);
});
test('completed activity attempts do not complete the whole course',()=>{
  const snap=computeAnalyticsSnapshot({
    learners:[{id:'u',name:'U'}],courses:[{id:'c',title:'C'}],
    enrollments:[{learnerId:'u',courseId:'c',progress:.4}],
    attempts:[{id:'a',learnerId:'u',courseId:'c',entityId:'quiz-1',status:'completed'}],
    grades:[],events:[]
  });
  assert.equal(snap.learners[0].progress,.4);
  assert.equal(snap.courses[0].completed,0);
});
test('course-level completed attempts may complete a course',()=>{
  const snap=computeAnalyticsSnapshot({
    learners:[{id:'u',name:'U'}],courses:[{id:'c',title:'C'}],
    enrollments:[{learnerId:'u',courseId:'c',progress:.4}],
    attempts:[{id:'a',learnerId:'u',courseId:'c',status:'completed'}],
    grades:[],events:[]
  });
  assert.equal(snap.learners[0].progress,1);
  assert.equal(snap.courses[0].completed,1);
});

test('offline results become Analytics datasets with openings and informative grades',()=>{
  const result={
    schema:'https://p2lrn.org/schema/offline-result/1',version:'1',
    assignment:{assignmentId:'urn:uuid:a',packageId:'course-offline',contentRoot:'sha256:'+'a'.repeat(64),title:'Curso entregado',participantToken:'learner-token',participantLabel:'Alumno 1',policy:{expiresAfterFirstOpenDays:30}},
    attempt:{id:'attempt-1',number:1,status:'submitted',startedAt:'2026-10-01T09:00:00Z',finishedAt:'2026-10-01T10:00:00Z',elapsedSeconds:3600},
    usage:{firstOpenedAt:'2026-10-01T08:55:00Z',lastOpenedAt:'2026-10-02T08:55:00Z',openCount:2,expiresAt:'2026-10-31T08:55:00Z',deviceBindingId:'device-abc',sessions:[{id:'s1',openedAt:'2026-10-01T08:55:00Z',source:'windows-native'},{id:'s2',openedAt:'2026-10-02T08:55:00Z',source:'windows-native'}]},
    summary:{latestScore:{normalized:.8},activeTimeMs:1800000,openings:2},
    analytics:{activeTimeMs:1800000,events:[{type:'event',value:{type:'p2lrn:active-time',payload:{totalActiveMs:1800000}},timestamp:'2026-10-01T09:30:00Z'}]},
    audit:{anomalies:[]},integrity:{algorithm:'sha256',payloadDigest:'sha256:'+'b'.repeat(64)},
  };
  const dataset=analyticsDatasetFromOfflineResult(result);
  assert.equal(dataset.metadata.offlineResult,true);
  assert.equal(dataset.learners[0].name,'Alumno 1');
  assert.equal(dataset.courses[0].title,'Curso entregado');
  assert.equal(dataset.attempts[0].metadata.openings,2);
  assert.equal(dataset.attempts[0].metadata.deviceBindingId,'device-abc');
  assert.equal(dataset.events.filter(event=>event.type==='p2lrn:offline-open').length,2);
  assert.equal(dataset.grades.length,1);
  assert.equal(dataset.grades[0].authoritative,false);
  const snapshot=computeAnalyticsSnapshot(dataset,{now:Date.parse('2026-10-02T12:00:00Z')});
  assert.equal(snapshot.overview.learners,1);
  assert.equal(snapshot.overview.averageGrade,null,'offline informational scores must not become official grades');
});
