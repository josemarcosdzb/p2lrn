// Contracts for REAL classroom verification, never a simulated LMS.
export const LMS_NAMES=Object.freeze(['moodle','canvas','chamilo','sakai','openedx']);
export const STAGES=Object.freeze([
 ['teacher-publish-a','teacher'],['teacher-publish-b','teacher'],
 ['learner1-complete-a','learner1'],['learner1-resume-a','learner1'],
 ['learner1-complete-b','learner1'],['learner2-complete-a','learner2'],
 ['learner2-complete-b','learner2'],['teacher-gradebook','teacher']
]);
const ACTIONS=new Set(['goto','click','fillEnv','select','uploadCourse',
 'waitVisible','waitText','assertPublished','assertPlayerCourse','assertCompletion','assertResume','assertGrade']);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const fail=code=>{throw new Error(code);};
const nonblank=(s,n=256)=>typeof s==='string'&&s.length>0&&s.length<=n;
const safeSelector=s=>nonblank(s,600)&&!/script|javascript:|data:/i.test(s);
const courseId=s=>s==='A'||s==='B';
export function validateClassroomPlan(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||p.schema!=='p2lrn-lms-real-classroom/1')
  fail('INVALID_REAL_CLASSROOM_SCHEMA');
 if(!LMS_NAMES.includes(p.lms))fail('INVALID_REAL_LMS');
 let base;
 try{base=new URL(p.lmsBase);}catch{fail('INVALID_LMS_ORIGIN');}
 if(base.protocol!=='http:'||base.username||base.password||
    base.search||base.hash||base.pathname!=='/'||
    !(base.hostname==='localhost'||base.hostname.endsWith('.localhost')))
  fail('LMS_MUST_USE_LOCAL_QA_ORIGIN');
 if(p.qaOnly!==true)fail('LMS_REAL_E2E_REQUIRES_QA_ONLY');
 if(!p.courses||typeof p.courses!=='object'||!own(p.courses,'A')||!own(p.courses,'B'))
  fail('TWO_REAL_COURSES_REQUIRED');
 for(const id of ['A','B']){
  const c=p.courses[id];
  if(!c||!nonblank(c.title,180)||!nonblank(c.file,2048)||!(/^[a-f0-9]{64}$/i).test(c.sha256)||
     !c.file.toLowerCase().endsWith('.p2lrn'))fail('INVALID_REAL_COURSE_'+id);
 }
 if(p.courses.A.sha256===p.courses.B.sha256||
    p.courses.A.title.trim().toLowerCase()===p.courses.B.title.trim().toLowerCase())
  fail('DISTINCT_COURSES_REQUIRED');
 if(!Array.isArray(p.stages)||p.stages.length!==STAGES.length)fail('INVALID_REAL_STAGES');
 const allGrade=new Set();
 for(let i=0;i<STAGES.length;i++){
  const stage=p.stages[i],[name,actor]=STAGES[i];
  if(!stage||stage.id!==name||stage.actor!==actor||
     !Array.isArray(stage.actions)||stage.actions.length<2||stage.actions.length>80)
   fail('INVALID_REAL_STAGE_'+name);
  let evidenceCount=0,uploaded=0,completed=0,resumed=0,published=0,playerCourse=0;
  let lastUpload=-1,lastSaveClick=-1,lastPublish=-1,interactions=0;
  for(let actionIndex=0;actionIndex<stage.actions.length;actionIndex++){
   const a=stage.actions[actionIndex];
   if(!a||!ACTIONS.has(a.type))fail('INVALID_REAL_ACTION');
   if(a.type==='goto'){
    if(!nonblank(a.path,1024)||!a.path.startsWith('/')||
       a.path.startsWith('//')||a.path.includes('#'))fail('INVALID_REAL_NAVIGATION');
    const destination=new URL(a.path,base);
    if(destination.origin!==base.origin)fail('CROSS_ORIGIN_NAVIGATION_DENIED');
   }else{
    if(!safeSelector(a.selector))fail('REAL_UI_SELECTOR_REQUIRED');
    if(a.frame!==undefined&&(!safeSelector(a.frame)||a.frame===a.selector))
     fail('INVALID_REAL_FRAME_SELECTOR');
   }
   if(a.type==='fillEnv'){
    if(!(/^P2LRN_QA_[A-Z0-9_]{1,72}$/).test(a.env||''))fail('INVALID_QA_SECRET_REFERENCE');
    if(own(a,'value'))fail('HARDCODED_CREDENTIAL_FORBIDDEN');
   }
   if(a.type==='select'&&!nonblank(a.value,256))fail('INVALID_REAL_SELECTION');
   if(a.type==='uploadCourse'){
    if(actor!=='teacher'||!courseId(a.course))fail('REAL_UPLOAD_MUST_BE_TEACHER');
    if(name!=='teacher-publish-'+a.course.toLowerCase())fail('COURSE_UPLOAD_WRONG_STAGE');
    uploaded++;lastUpload=actionIndex;
   }
   if(a.type==='click'||a.type==='select'){
    interactions++;
    if(lastUpload>=0&&actionIndex>lastUpload)lastSaveClick=actionIndex;
   }
   if(a.type==='assertPublished'){
    if(actor!=='teacher'||!courseId(a.course)||
       name!=='teacher-publish-'+a.course.toLowerCase()||a.frame!==undefined||
       a.text!==p.courses[a.course].title||
       !nonblank(a.pagePath,400)||!a.pagePath.startsWith('/')||
       a.pagePath.startsWith('//')||a.pagePath.startsWith('/lti/'))
     fail('INVALID_LMS_PUBLICATION_PROOF');
    published++;lastPublish=actionIndex;evidenceCount++;
   }
   if(a.type==='assertPlayerCourse'){
    const expected=name.includes('-a')?'A':'B';
    if(actor==='teacher'||!courseId(a.course)||a.course!==expected)
     fail('INVALID_LMS_PLAYER_COURSE');
    playerCourse++;evidenceCount++;
   }
   if(a.type==='waitText'||a.type==='assertCompletion'){
    if(!nonblank(a.text,300))fail('REAL_UI_ASSERTION_REQUIRED');
    evidenceCount++;
    if(a.type==='assertCompletion')completed++;
   }
   if(a.type==='waitVisible')evidenceCount++;
   if(a.type==='assertResume'){
    if(!nonblank(a.expected,300)||!['text','value','checked'].includes(a.mode))
     fail('INVALID_REAL_RESUME_ASSERTION');
    resumed++;evidenceCount++;
   }
   if(a.type==='assertGrade'){
    if(name!=='teacher-gradebook'||!courseId(a.course)||
       !['learner1','learner2'].includes(a.learner)||
       !safeSelector(a.gradeSelector)||!nonblank(a.studentText,200)||
       !safeSelector(a.courseHeaderSelector)||
       a.courseHeaderText!==p.courses[a.course].title||
       typeof a.expected!=='number'||!Number.isFinite(a.expected)||
       a.expected<0||a.expected>100||
       (a.tolerance!==undefined&&(!Number.isFinite(a.tolerance)||a.tolerance<0||a.tolerance>0.01)))
     fail('INVALID_OFFICIAL_GRADE_ASSERTION');
    const key=a.learner+':'+a.course;
    if(allGrade.has(key))fail('DUPLICATE_GRADE_ASSERTION');
    allGrade.add(key);evidenceCount++;
   }
  }
  if(evidenceCount<1)fail('NO_REAL_UI_ASSERTION_'+name);
  if(name==='teacher-publish-a'||name==='teacher-publish-b'){
   if(uploaded!==1||published!==1||!(lastUpload<lastSaveClick&&lastSaveClick<lastPublish))
    fail('MISSING_REAL_LMS_PUBLICATION_'+name);
  }
  if(name.includes('complete')&&(completed<1||playerCourse!==1||interactions<2))
   fail('MISSING_REAL_LEARNER_COMPLETION_'+name);
  if(name==='learner1-resume-a'&&(resumed<1||playerCourse!==1))fail('MISSING_REAL_REENTRY_CHECK');
 }
 if(allGrade.size!==4)fail('FOUR_OFFICIAL_GRADES_REQUIRED');
 return Object.freeze({lms:p.lms,stageCount:STAGES.length,
  teacherUploads:2,learnerCompletions:4,gradeChecks:4});
}
