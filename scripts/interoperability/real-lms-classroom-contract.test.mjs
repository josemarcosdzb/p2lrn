import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,validateClassroomPlan} from './real-lms-classroom-contract.mjs';
function plan(){
 const a='a'.repeat(64),b='b'.repeat(64);
 return {schema:'p2lrn-lms-real-classroom/1',lms:'moodle',
  lmsBase:'http://qa-moodle.localhost/',qaOnly:true,
  courses:{A:{title:'QA Course A',file:'qa-course-a.p2lrn',sha256:a},
   B:{title:'QA Course B',file:'qa-course-b.p2lrn',sha256:b}},
  stages:STAGES.map(([id,actor])=>{
   const actions=[{type:'goto',path:'/course/view.php?id=1'}];
   if(id.startsWith('teacher-publish')){
    actions.push({type:'uploadCourse',course:id.endsWith('a')?'A':'B',selector:'input[type=file]'});
    actions.push({type:'click',selector:'button.save'});
    const course=id.endsWith('a')?'A':'B';
    actions.push({type:'assertPublished',course,selector:'.lms-activity',
     pagePath:'/course/view.php',text:'QA Course '+course});
   }else if(id.endsWith('gradebook')){
    for(const learner of ['learner1','learner2'])
     for(const course of ['A','B'])
      actions.push({type:'assertGrade',selector:'.grade-row',gradeSelector:'.grade',
       learner,course,studentText:'Test learner',expected:80,
       courseHeaderSelector:'.gradebook-course-heading',courseHeaderText:'QA Course '+course});
   }else if(id.includes('resume')){
    actions.push({type:'assertPlayerCourse',selector:'p2lrn-player',course:'A'});
    actions.push({type:'assertResume',selector:'input:checked',mode:'checked',expected:'true'});
   }else{
    actions.push({type:'assertPlayerCourse',selector:'p2lrn-player',course:id.endsWith('a')?'A':'B'});
    actions.push({type:'click',selector:'input.answer'});
    actions.push({type:'click',selector:'button.submit'});
    actions.push({type:'assertCompletion',selector:'.result',text:'Completado'});
   }
   return {id,actor,actions};
  })};
}
test('contract requires real UI for two distinct courses and four authoritative grade cells',()=>{
 const valid=plan(),result=validateClassroomPlan(valid);
 assert.deepEqual(result,{lms:'moodle',stageCount:8,teacherUploads:2,learnerCompletions:4,gradeChecks:4});
});
test('no fake HTTP, skipped gradebook, same course or student-only score can pass',()=>{
 for(const change of [
  p=>{p.courses.B.sha256=p.courses.A.sha256;},
  p=>{p.stages[0].actions=p.stages[0].actions.filter(a=>a.type!=='uploadCourse');},
  p=>{p.stages[3].actions=p.stages[3].actions.filter(a=>a.type!=='assertResume');},
  p=>{p.stages.at(-1).actions.pop();},
  p=>{p.stages[2].actions=[{type:'goto',path:'/course'}, {type:'request',selector:'#submit'}];},
  p=>{p.lmsBase='https://production.example.edu/';},
  p=>{p.stages[0].actions.push({type:'fillEnv',selector:'input',env:'P2LRN_QA_LOGIN_PASSWORD',value:'password'});},
 ]){
  const p=plan();change(p);
  assert.throws(()=>validateClassroomPlan(p));
 }
});
test('only explicit secrets from QA environment, no hardcoded credentials or arbitrary origins',()=>{
 const p=plan();
 p.stages[0].actions.splice(1,0,{type:'fillEnv',selector:'#password',env:'P2LRN_QA_TEACHER_PASSWORD'});
 assert.equal(validateClassroomPlan(p).lms,'moodle');
 p.stages[0].actions[1].env='PASSWORD';assert.throws(()=>validateClassroomPlan(p));
 p.stages[0].actions[1].env='P2LRN_QA_TEACHER_PASSWORD';
 p.stages[0].actions[0].path='//external.example.net/';assert.throws(()=>validateClassroomPlan(p));
});
