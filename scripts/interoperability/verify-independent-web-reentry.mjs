// Actual same-SHA original course with same-origin Host draft persistence and
// an adversarial grade-spoof request. This is NOT LMS AGS certification.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createInteropStudioServer} from './studio-lab-server.mjs';
import {launchInteropChrome} from './chrome-visual.mjs';
const ORIGINAL_SHA='cce43503ea425ec4f1e6203c8ef6556beb999e71c08e59d5511091a6b931a380';
const ORIGINAL_ROOT='sha256:e0fb13f5092e0d1d9cf6cf552632279b30bf89c6364662b1dbdf5cfe80804323';
const arg=x=>{const i=process.argv.indexOf(x);return i<0?null:process.argv[i+1];};
const siteRoot=resolve(arg('--site')||'.netlify-cdn'),output=resolve(arg('--output')||'.interop-evidence');
const coursePath=resolve(arg('--course')||'seguridad-informatica.p2lrn'),repoRoot=resolve(arg('--repo')||process.cwd());
const sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(output,{recursive:true});
const report={schema:'https://p2lrn.org/schema/interoperability-real-qa/1',
 kind:'REAL_INDEPENDENT_WEB_HOST_REENTRY',sourceSha256:ORIGINAL_SHA,
 hostType:'LOOPBACK_QA_STUDENT_DRAFT_ONLY',authoritativeGradeProvider:false,
 courseVariations:0,learnerDraftSaved:false,learnerDraftRestored:false,crossLearnerIsolation:false,
 spoofedOfficialGradeRejected:false,completedResultRecordedAsUntrusted:false,
 status:'IN_PROGRESS',startedAt:new Date().toISOString()};
const persist=()=>writeFile(join(output,'independent-web-reentry.json'),JSON.stringify(report,null,2)+'\n');
async function attachHostAdapter(){
 const host='/interop/host';
 const student=document.querySelector('#demo-player');
 if(!student)throw Error('P2LRN Player missing');
 student.adapter={
  version:'1',
  async loadState(context){
    const url=host+'/state?contentRoot='+encodeURIComponent(context.contentRoot)+
      '&entityId='+encodeURIComponent(context.entityId);
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});
    if(r.status===404)return null;
    if(!r.ok)throw Error('QA host read state HTTP '+r.status);
    return (await r.json()).state;
  },
  async saveState(state,context){
    const url=host+'/state?contentRoot='+encodeURIComponent(context.contentRoot)+
      '&entityId='+encodeURIComponent(context.entityId);
    const r=await fetch(url,{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({state})});
    if(!r.ok)throw Error('QA Host draft save HTTP '+r.status);
  },
  async reportScore(score,context){
    const r=await fetch(host+'/untrusted-score',{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({score,context})});
    if(r.status!==202)throw Error('Only untrusted score notifications should be recorded');
  },
 };
 await student.reload();
 return {adapterInstalled:true,originalContentRoot:student.contentRoot};
}
async function chooseQuiz(){
 const player=document.querySelector('#demo-player'),root=player.shadowRoot;
 const buttons=[...root.querySelectorAll('.p2lrn-nav button:not(:disabled)')];
 const quiz=buttons.find(x=>x.textContent==='Cuestionario');
 if(!quiz)throw Error('Original Studio self-assessment missing');
 const event=new Promise(resolve=>{
  let finished=false;
  const handler=e=>{if(finished)return;finished=true;player.removeEventListener('p2lrn:rendered',handler);
    resolve(e.detail?.entityId||e.detail?.context?.entityId||null);};
  player.addEventListener('p2lrn:rendered',handler);
  setTimeout(()=>{if(!finished){finished=true;player.removeEventListener('p2lrn:rendered',handler);resolve(null);}},5000);
 });
 quiz.click();
 const entityId=await event;
 const start=Date.now();
 while(!root.querySelector('.p2lrn-q-card input[type=radio]')){
  if(Date.now()-start>10000)throw Error('Real self-assessment not loaded');
  await new Promise(ok=>setTimeout(ok,80));
 }
 return {entityId,checked:[...root.querySelectorAll('.p2lrn-q-card input[type=radio]')].map(x=>x.checked)};
}
let server=null,browser=null;
try{
 const data=await readFile(coursePath);
 assert.equal(sha(data),ORIGINAL_SHA,'Unexpected course bytes: never adapt the package');
 server=await createInteropStudioServer({siteRoot,repoRoot,coursePath,stateHost:true});
 browser=await launchInteropChrome({downloadDir:join(output,'web-resume-downloads'),evidenceDir:join(output,'web-resume-screenshots')});
 const courseUrl=server.base+'/demo/?src='+encodeURIComponent('/interop/seguridad-informatica.p2lrn');
 await browser.navigate(courseUrl);
 const nav="document.querySelector('#demo-player')?.shadowRoot?.querySelectorAll('.p2lrn-nav button:not(:disabled)').length>=7";
 await browser.wait(nav,{timeout:45000,label:'standalone original course'});
 const login=await browser.evaluate("(async()=>{const r=await fetch('/interop/host/login',{method:'POST',credentials:'same-origin'});if(!r.ok)throw Error('QA host login failed');return r.json()})()");
 assert.equal(login.gradeAuthority,false);
 report.firstSessionNoGradeAuthority=true;
 const attached=await browser.evaluate('('+attachHostAdapter.toString()+')()');
 assert.equal(attached.originalContentRoot,ORIGINAL_ROOT,'Host attached a different course');
 let activity=await browser.evaluate('('+chooseQuiz.toString()+')()');
 assert(activity.entityId?.startsWith('urn:uuid:'),'Questionnaire identity not reported');
 report.entityId=activity.entityId;
 assert(activity.checked.every(flag=>!flag),'Fresh learner already has an answer');
 await browser.evaluate("(()=>{const root=document.querySelector('#demo-player')?.shadowRoot;const input=root?.querySelector('.p2lrn-q-card input[type=radio]');input.click();return true})()");
 const audit=()=>browser.evaluate("(async()=>{const r=await fetch('/interop/host/audit',{credentials:'same-origin'});if(!r.ok)throw Error('QA host audit unavailable');return r.json()})()");
 await browser.wait("(async()=>{const r=await fetch('/interop/host/audit',{credentials:'same-origin'});return r.ok&&(await r.json()).draftWrites>=1})()",{timeout:15000,label:'server-side draft write'});
 const before=await audit();
 assert(before.draftCount>=1,'Learner draft missing from independent Host');
 report.learnerDraftSaved=true;report.preReloadAudit=before;
 report.screenshotBeforeReload=await browser.screenshot('learner-answered-before-leaving');
 await browser.navigate(courseUrl);
 await browser.wait(nav,{timeout:45000,label:'same learner returns'});
 await browser.evaluate('('+attachHostAdapter.toString()+')()');
 activity=await browser.evaluate('('+chooseQuiz.toString()+')()');
 assert.equal(activity.entityId,report.entityId,'Learner resumed another activity');
 report.learnerDraftRestored=activity.checked.some(Boolean);
 if(!report.learnerDraftRestored)throw Error('Returning learner did not recover the selected answer');
 report.screenshotAfterReload=await browser.screenshot('same-learner-answer-restored');
 const completed=await browser.evaluate("(()=>{const root=document.querySelector('#demo-player')?.shadowRoot;const b=[...root.querySelectorAll('.p2lrn-q-shell button')].find(x=>x.textContent.trim()==='Finalizar');if(!b)throw Error('Submit missing');b.click();return true})()");
 assert(completed);
 await browser.wait("document.querySelector('#demo-player')?.shadowRoot?.querySelector('.p2lrn-q-result')!=null",{timeout:15000,label:'resumed quiz completion'});
 await browser.wait("(async()=>{const r=await fetch('/interop/host/audit',{credentials:'same-origin'});return r.ok&&(await r.json()).scoreNotifications>=1})()",{timeout:12000,label:'untrusted score notification'});
 report.completedResultRecordedAsUntrusted=true;
 const attack=await browser.evaluate("(async()=>{const r=await fetch('/interop/host/official-grade',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({score:100,verified:true,origin:'student-browser'})});return {status:r.status,body:await r.text()}})()");
 const after=await audit();
 report.spoofedOfficialGradeRejected=attack.status===403&&after.rejectedGradeSpoofs>0&&after.verifiedGrades===0;
 if(!report.spoofedOfficialGradeRejected)throw Error('Client wrote an authoritative grade');
 report.postAttackAudit=after;
 await browser.evaluate("(async()=>{const r=await fetch('/interop/host/login',{method:'POST',credentials:'same-origin'});if(!r.ok)throw Error('Second learner login failed');return true})()");
 const isolated=await audit();
 report.crossLearnerIsolation=isolated.draftCount===0&&isolated.scoreNotifications===0;
 if(!report.crossLearnerIsolation)throw Error('Second learner sees first learner draft');
 report.status='INDEPENDENT_WEB_DRAFT_RESUME_AND_SPOOF_REJECTION_PASS';
}catch(error){
 report.status='INDEPENDENT_WEB_HOST_TEST_FAILED';report.error=String(error?.message||error).slice(0,1100);
 process.exitCode=1;
}finally{
 report.finishedAt=new Date().toISOString();await persist();
 if(browser)await browser.close();
 if(server)await server.close();
}
console.log('P2LRN_INDEPENDENT_WEB_HOST_REPORT='+JSON.stringify(report));
