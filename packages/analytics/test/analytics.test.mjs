import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAnalyticsDataset,computeAnalyticsSnapshot,filterAnalyticsDataset,createAnalyticsStore,createHttpAnalyticsDataSource,analyticsToCsv} from '../src/model.js';

const seed={
  generatedAt:'2026-10-28T10:00:00Z',
  learners:[{id:'ana',name:'Ana Ruiz',email:'ana@example.test',group:'A'},{id:'leo',name:'Leo Martín',group:'B'}],
  courses:[{id:'math',title:'Matemáticas'},{id:'science',title:'Ciencias'}],
  enrollments:[{learnerId:'ana',courseId:'math',progress:.75,startedAt:'2026-10-20T10:00:00Z'},{learnerId:'leo',courseId:'math',progress:1,completedAt:'2026-10-26T10:00:00Z'}],
  attempts:[{id:'a1',learnerId:'ana',courseId:'math',status:'started',progress:.75,startedAt:'2026-10-20T10:00:00Z',activeTimeMs:120000},{id:'l1',learnerId:'leo',courseId:'math',status:'completed',progress:1,startedAt:'2026-10-22T10:00:00Z',completedAt:'2026-10-26T10:00:00Z',activeTimeMs:300000}],
  grades:[{id:'ga',learnerId:'ana',courseId:'math',value:58,maxValue:100,authoritative:true,updatedAt:'2026-10-25T10:00:00Z'},{id:'gl',learnerId:'leo',courseId:'math',value:88,maxValue:100,authoritative:true,passed:true,updatedAt:'2026-10-26T10:00:00Z'},{id:'informative',learnerId:'ana',courseId:'science',value:100,maxValue:100,authoritative:false,updatedAt:'2026-10-27T10:00:00Z'}],
  events:[{id:'e1',type:'p2lrn:interaction',category:'assessment',timestamp:'2026-10-27T09:00:00Z',learnerId:'ana',courseId:'math',attemptId:'a1',payload:{action:'answer-change'}},{id:'e2',type:'p2lrn:active-time',category:'attention',timestamp:'2026-10-27T09:05:00Z',learnerId:'ana',courseId:'math',attemptId:'a1',payload:{totalActiveMs:240000}}],
};

test('normalizes datasets',()=>{const data=normalizeAnalyticsDataset(seed);assert.equal(data.schema,'https://p2lrn.org/schema/analytics-dataset/1');assert.equal(data.learners.length,2);});
test('computes authoritative metrics',()=>{const snap=computeAnalyticsSnapshot(seed,{now:Date.parse('2026-10-28T12:00:00Z')});assert.equal(snap.overview.learners,2);assert(Math.abs(snap.overview.averageGrade-.73)<.001);assert.equal(snap.courses.find(x=>x.id==='math').completed,1);assert.equal(snap.learners.find(x=>x.id==='ana').activeTimeMs,240000);assert.equal(snap.learners.find(x=>x.id==='ana').risk.level,'watch');});
test('ignores non-authoritative grades',()=>{const snap=computeAnalyticsSnapshot(seed);assert(Math.abs(snap.overview.averageGrade-.73)<.001);assert.equal(snap.gradeDistribution.reduce((sum,x)=>sum+x.count,0),2);});
test('filters learner and course',()=>{const filtered=filterAnalyticsDataset(seed,{learnerId:'ana',courseId:'math'});assert.equal(filtered.learners.length,1);assert.equal(filtered.courses.length,1);assert(filtered.attempts.every(x=>x.learnerId==='ana'&&x.courseId==='math'));});
test('store updates and snapshots',()=>{const store=createAnalyticsStore(seed);store.upsertLearner({id:'ana',name:'Ana R.','email':'ana@example.test'});assert.equal(store.data.learners.find(x=>x.id==='ana').name,'Ana R.');store.addEvent({id:'e3',type:'p2lrn:progress',category:'progress',timestamp:'2026-10-28T11:00:00Z',learnerId:'ana',courseId:'math'});assert.equal(store.snapshot().overview.events,3);});
test('CSV exports grades',()=>{const csv=analyticsToCsv(seed,{kind:'grades'});assert.match(csv,/autoritativa/);assert.match(csv,/Ana Ruiz/);assert.match(csv,/true/);});
test('HTTP datasource sends filters',async()=>{let called='';const source=createHttpAnalyticsDataSource({url:'https://host.example/api/analytics',fetch:async(url)=>{called=url;return {ok:true,json:async()=>seed};}});const result=await source.load({courseId:'math'});assert.match(called,/courseId=math/);assert.equal(result.learners.length,2);});
