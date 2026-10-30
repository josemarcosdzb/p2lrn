import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourseAnalyticsDataSource} from '../src/course-data-source.js';

test('course datasource isolates course and keeps Player scores non-authoritative',async()=>{
 const r={assignment:{packageId:'course-1',participantToken:'learner-1',participantLabel:'Ana'},attempt:{id:'attempt-1',startedAt:'2026-10-29T10:00:00Z',finishedAt:'2026-10-29T10:20:00Z'},analytics:{activeTimeMs:1000,events:[{id:'evt1',value:{type:'p2lrn:attention',timestamp:'2026-10-29T10:01:00Z',payload:{active:true}}}]},submission:{scores:[{value:{score:6,maxScore:10},context:{entityId:'quiz-1'}}]}};
 const ds=createCourseAnalyticsDataSource({courseId:'course-1',title:'Course',results:[r,{...r,assignment:{...r.assignment,packageId:'another-course'}}]});
 const data=await ds.load({courseId:'course-1'});
 assert.equal(data.courses.length,1);
 assert.equal(data.attempts.length,1);
 assert.equal(data.events.length,1);
 assert.equal(data.grades.length,1);
 assert.equal(data.grades[0].authoritative,false);
 assert.equal((await ds.load({courseId:'other'})).courses.length,0);
});
