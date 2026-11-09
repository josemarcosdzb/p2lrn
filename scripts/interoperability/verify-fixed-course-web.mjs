// Independent-web student journey using the EXACT byte-locked course created by
// Studio. This script does not modify the course, issue grades, or simulate LMS.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createInteropStudioServer} from './studio-lab-server.mjs';
import {launchInteropChrome} from './chrome-visual.mjs';

const sha=data=>createHash('sha256').update(data).digest('hex');
const COURSE_SHA='cce43503ea425ec4f1e6203c8ef6556beb999e71c08e59d5511091a6b931a380';
const args=process.argv.slice(2);
const arg=name=>{const at=args.indexOf(name);return at>=0?args[at+1]:null;};
const coursePath=resolve(arg('--course')||'seguridad-informatica.p2lrn');
const siteRoot=resolve(arg('--site')||'.netlify-cdn');
const output=resolve(arg('--output')||'.interop-evidence');
const repoRoot=resolve(arg('--repo')||process.cwd());
await mkdir(output,{recursive:true});
const evidenceDir=join(output,'web-student-evidence');
const report={
  schema:'https://p2lrn.org/schema/interoperability-real-qa/1',kind:'INDEPENDENT_WEB_STUDENT',
  testedAt:new Date().toISOString(),originalSha256:COURSE_SHA,
  coursePath,packageVariantsCreated:0,contentAdaptations:0,
  studentActivities:[],errors:[],verifiedAsStudent:0,
  officialLmsGradesVerified:0,resultsResumeVerified:false,
  fullAcceptance:false,status:'NOT_FINISHED',
};
const save=()=>writeFile(join(output,'independent-web-student-report.json'),JSON.stringify(report,null,2)+'\n');
const click=async selector=>chrome.evaluate("(()=>{const node=document.getElementById('demo-player')?.shadowRoot?.querySelector("+JSON.stringify(selector)+");if(!node)throw Error('Missing player control: '+ "+JSON.stringify(selector)+");node.click();return true})()");
let chrome=null,server=null;
try{
  const course=await readFile(coursePath);
  assert.equal(sha(course),COURSE_SHA,'The source course is NOT the SHA-locked original');
  report.originalSizeBytes=course.length;
  const source=await stat(siteRoot);assert(source.isDirectory(),'Compiled Player site missing');
  server=await createInteropStudioServer({siteRoot,repoRoot,coursePath});
  chrome=await launchInteropChrome({downloadDir:join(output,'web-downloads'),evidenceDir});
  report.browser=chrome.executable;
  const served=Buffer.from(await (await fetch(server.base+'/interop/seguridad-informatica.p2lrn')).arrayBuffer());
  assert.equal(sha(served),COURSE_SHA,'Host served a different course byte sequence');
  await chrome.navigate(server.base+'/demo/?src='+encodeURIComponent('/interop/seguridad-informatica.p2lrn'));
  await chrome.wait("document.querySelector('#demo-player')?.shadowRoot?.querySelectorAll('.p2lrn-nav button:not(:disabled)').length>=7",{timeout:45000,label:'seven real Player activities'});
  const loaded=await chrome.evaluate("(()=>{const root=document.querySelector('#demo-player')?.shadowRoot;const nav=[...root.querySelectorAll('.p2lrn-nav button:not(:disabled)')].map((x,index)=>({index,title:x.textContent.trim(),locked:x.getAttribute('aria-disabled')}));return {stage:root.querySelector('.p2lrn-stage')?.textContent?.slice(0,200),nav,head:root.querySelector('.p2lrn-status')?.textContent}})()");
  report.nav=loaded.nav;report.playerStatus=loaded.head;
  await chrome.evaluate("(()=>{const p=document.querySelector('#demo-player');window.__interopEvents=[];for(const n of ['p2lrn:rendered','p2lrn:score','p2lrn:complete','p2lrn:statechange','p2lrn:progressionchange','p2lrn:error'])p.addEventListener(n,e=>window.__interopEvents.push({event:n,entityId:e.detail?.entityId??e.detail?.context?.entityId??null,grade:e.detail?.score?.normalized??e.detail?.normalized??null,at:Date.now()}));return true})()");
  console.log('P2LRN_WEB_STUDENT_NAV='+JSON.stringify(loaded.nav));
  for(const activity of loaded.nav){
    const row={index:activity.index,title:activity.title,status:'NOT_TESTED',events:[],activityBehavior:'NOT_TESTED'};
    report.studentActivities.push(row);
    try{
      const before=await chrome.evaluate("window.__interopEvents.length");
      const index=activity.index;
      await chrome.evaluate("(()=>{const nav=document.querySelector('#demo-player')?.shadowRoot?.querySelectorAll('.p2lrn-nav button:not(:disabled)');const item=nav["+index+"];if(!item)throw Error('Nav disappeared');item.click();return true})()");
      await chrome.wait("window.__interopEvents.slice("+before+").some(e=>e.event==='p2lrn:rendered' || e.event==='p2lrn:error')",{timeout:25000,label:'render '+activity.title});
      await new Promise(done=>setTimeout(done,330));
      const details=await chrome.evaluate("(()=>{const root=document.querySelector('#demo-player')?.shadowRoot,stage=root?.querySelector('.p2lrn-stage');if(!stage)return null;const frame=stage.querySelector('iframe');const body=frame?.getAttribute('srcdoc')||'';return {classNames:[...stage.querySelectorAll('[class]')].map(x=>x.className).filter(x=>typeof x==='string').slice(0,30),iframeCount:stage.querySelectorAll('iframe').length,frameSrc:frame?.getAttribute('src')||null,frameSandbox:frame?.getAttribute('sandbox')??null,htmlLesson:{hasTable:body.includes('<table'),hasImage:body.includes('<img'),hasVideo:body.includes('<video'),hasDrag:body.includes('data-p2lrn-dnd')},isQuestionnaire:Boolean(stage.querySelector('.p2lrn-q-shell')),isMatching:Boolean(stage.querySelector('[data-p2lrn-match-left]')),stageText:stage.textContent.slice(0,1100),error:Boolean(stage.querySelector('.p2lrn-error,.p2lrn-message'))}})()");
      row.display=details;
      row.screenshot=await chrome.screenshot('activity-'+String(index+1).padStart(2,'0'));
      if(details?.error){
        row.status='FAIL';row.activityBehavior='RENDERER_ERROR';continue;
      }
      if(details?.isQuestionnaire){
        const response=await chrome.evaluate("(()=>{const root=document.querySelector('#demo-player')?.shadowRoot;const radio=root.querySelector('.p2lrn-q-card input[type=radio]:not(:disabled)');if(!radio)throw Error('Student cannot answer the question');radio.click();const finish=[...root.querySelectorAll('.p2lrn-q-shell button')].find(x=>x.textContent.trim()==='Finalizar');if(!finish)throw Error('Student cannot submit');finish.click();return {answerInput:radio.value}})()");
        await chrome.wait("document.querySelector('#demo-player')?.shadowRoot?.querySelector('.p2lrn-q-result')!=null",{timeout:16000,label:'questionnaire result '+activity.title});
        row.activityBehavior='STUDENT_SUBMITTED';
        row.response=response;
        row.result=await chrome.evaluate("(()=>{const root=document.querySelector('#demo-player')?.shadowRoot;return {text:root.querySelector('.p2lrn-q-result')?.textContent?.slice(0,420),visibleGrade:Boolean(root.querySelector('.p2lrn-q-score'))}})()");
        const hostDeferred=activity.title.toLowerCase().includes('evaluación final');
        if(hostDeferred&&row.result?.visibleGrade)throw new Error('Final host-graded assessment exposed a client grade');
        row.status='PASS_STUDENT_INTERACTION';
        row.screenshotAfter=await chrome.screenshot('activity-'+String(index+1).padStart(2,'0')+'-submitted');
      }else if(details?.isMatching){
        row.activityBehavior='MATCHING_IN_PROGRESS';
        const pairs=await chrome.evaluate("(()=>{const root=document.querySelector('#demo-player')?.shadowRoot;const left=[...root.querySelectorAll('[data-p2lrn-match-left]')];for(const source of left){const id=source.dataset.p2lrnMatchLeft;const target=root.querySelector('[data-p2lrn-match-right=\"'+id+'\"]');if(!target)throw Error('Missing matching partner for '+id);source.click();target.click();}const finish=[...root.querySelectorAll('.p2lrn-game-shell button')].find(x=>x.textContent.includes('Finalizar actividad'));if(!finish)throw Error('Matching submission missing');finish.click();return {pairs:left.length}})()");
        await chrome.wait("(()=>{const root=document.querySelector('#demo-player')?.shadowRoot;return root?.querySelector('.p2lrn-game-actions button')?.disabled===true && root?.querySelector('.p2lrn-game-status')?.textContent?.includes('Actividad enviada')})()",{timeout:16000,label:'matching completion without displaying answer key'});
        row.pairs=pairs.pairs;
        row.status='PASS_STUDENT_INTERACTION';
        row.activityBehavior='MATCHING_COMPLETED';
        row.screenshotAfter=await chrome.screenshot('activity-'+String(index+1).padStart(2,'0')+'-completed');
      }else if(details?.htmlLesson?.hasTable&&details.htmlLesson.hasImage&&details.htmlLesson.hasVideo&&details.htmlLesson.hasDrag){
        row.status='RENDERED_ONLY';row.activityBehavior='HTML_MEDIA_AND_DRAG_ELEMENTS_PRESENT_NOT_INTERACTED';
      }else if(details?.iframeCount>0){
        row.status='RENDERED_ONLY';row.activityBehavior='IFRAME_LOADED_NOT_FULLY_EXERCISED';
      }else if(details?.stageText?.trim()){
        row.status='RENDERED_ONLY';row.activityBehavior='CONTENT_RENDERED_NOT_FULLY_EXERCISED';
      }else{row.status='FAIL';row.activityBehavior='EMPTY_STAGE';}
      row.events=await chrome.evaluate("window.__interopEvents.slice("+before+").slice(-20)");
    }catch(error){
      row.status='FAIL';row.error=String(error?.message||error).slice(0,900);
    }
    console.log('P2LRN_WEB_STUDENT_ACTIVITY='+JSON.stringify({title:row.title,status:row.status,activityBehavior:row.activityBehavior,error:row.error??null}));
    await save();
  }
  report.verifiedAsStudent=report.studentActivities.filter(x=>x.status==='PASS_STUDENT_INTERACTION').length;
  report.renderedOnly=report.studentActivities.filter(x=>x.status==='RENDERED_ONLY').length;
  report.failed=report.studentActivities.filter(x=>x.status==='FAIL').length;
  report.hostAdapterPresent=await chrome.evaluate("Boolean(document.querySelector('#demo-player')?.adapter)");
  report.resultsResumeVerified=false;
  report.status=report.failed?'ACTIVITY_FAILURES':'PARTIAL_REAL_EVIDENCE';
  report.fullAcceptance=false;
}catch(error){
  report.status='TEST_HARNESS_FAILURE';report.errors.push(String(error?.message||error).slice(0,1300));
  process.exitCode=1;
}finally{
  report.completedAt=new Date().toISOString();
  await save();
  if(chrome)await chrome.close();
  if(server)await server.close();
}
console.log('P2LRN_INDEPENDENT_WEB_STUDENT_REPORT='+JSON.stringify(report));
if(report.failed||report.errors.length)process.exitCode=1;
