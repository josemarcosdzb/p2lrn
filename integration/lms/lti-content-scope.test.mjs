import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveLtiContentScope} from './lti-content-scope.mjs';

const course=[
 {id:'course',type:'course',children:['unit-a','unit-b']},
 {id:'unit-a',type:'unit',children:['lesson-a','sublesson-a']},
 {id:'lesson-a',type:'activity',children:['quiz-a']},
 {id:'quiz-a',type:'activity'},
 {id:'sublesson-a',type:'activity'},
 {id:'unit-b',type:'unit',children:['quiz-b']},
 {id:'quiz-b',type:'activity'},
 {id:'image',type:'resource'}
];
test('activity links never authorize sibling or ancestor learning state',()=>{
 assert.deepEqual([...deriveLtiContentScope(course,'lesson-a')].sort(),['lesson-a','quiz-a']);
 assert.equal(deriveLtiContentScope(course,'unit-a').has('quiz-b'),false);
 assert.equal(deriveLtiContentScope(course,'quiz-b').has('course'),false);
 assert.equal(deriveLtiContentScope(course,'quiz-b').has('unit-b'),false);
});
test('course links retain all authored descendants and composite child activities',()=>{
 assert.deepEqual([...deriveLtiContentScope(course,'course')].sort(),
  ['course','lesson-a','quiz-a','quiz-b','sublesson-a','unit-a','unit-b']);
});
test('invalid graph references and non-content bindings fail closed',()=>{
 assert.throws(()=>deriveLtiContentScope(course,'image'),/UNAUTHORIZED/);
 assert.throws(()=>deriveLtiContentScope(course,'unknown'),/UNAUTHORIZED/);
 assert.throws(()=>deriveLtiContentScope([{id:'a',type:'course',children:['missing']}],'a'),/INVALID_P2LRN_GRAPH/);
 assert.throws(()=>deriveLtiContentScope([{id:'a',type:'course'},{id:'a',type:'activity'}],'a'),/INVALID_P2LRN_GRAPH/);
});
