// Inspect genuine opaque-origin subframes through Chrome DevTools and interact
// with the original embedded HTML activity, H5P and SCORM without model stubs.
// CDP's per-frame execution context is used for QA only, not as a Player API.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createInteropStudioServer} from './studio-lab-server.mjs';
import {launchInteropChrome} from './chrome-visual.mjs';
const SHA='cce43503ea425ec4f1e6203c8ef6556beb999e71c08e59d5511091a6b931a380';
const sha=x=>createHash('sha256').update(x).digest('hex');
const argv=process.argv.slice(2),arg=x=>{let i=argv.indexOf(x);return i>=0?argv[i+1]:null;};
const coursePath=resolve(arg('--course')||'seguridad-informatica.p2lrn');
const siteRoot=resolve(arg('--site')||'.netlify-cdn');
const repoRoot=resolve(arg('--repo')||process.cwd());
const output=resolve(arg('--output')||'.interop-evidence');
await mkdir(output,{recursive:true});
const report={
 schema:'https://p2lrn.org/schema/interoperability-real-qa/1',
 kind:'REAL_ORIGINAL_SUBFRAME_INTERACTIONS',sha256:SHA,
 activities:[],firstPartyCourseModified:false,resultEvents:[],status:'IN_PROGRESS',
};
const persist=()=>writeFile(join(output,'real-subframe-interactions.json'),JSON.stringify(report,null,2)+'\n');
let browser=null,server=null;
try{
 assert.equal(sha(await readFile(coursePath)),SHA,'Cannot test modified course');
 server=await createInteropStudioServer({siteRoot,repoRoot,coursePath});
 browser=await launchInteropChrome({downloadDir:join(output,'frame-downloads'),evidenceDir:join(output,'frame-captures')});
 await browser.navigate(server.base+'/demo/?src='+encodeURIComponent('/interop/seguridad-informatica.p2lrn'));
 await browser.wait("document.querySelector('#demo-player')?.shadowRoot?.querySelectorAll('.p2lrn-nav button:not(:disabled)').length>=7",{timeout:45000,label:'course with seven activities'});
 await browser.evaluate("(()=>{const p=document.getElementById('demo-player');window.__subframeEvents=[];for(const name of ['p2lrn:statechange','p2lrn:score','p2lrn:complete','p2lrn:rendered'])p.addEventListener(name,e=>window.__subframeEvents.push({name,entityId:e.detail?.entityId??e.detail?.context?.entityId??null}));return true})()");
 const targets=[
  {index:0,kind:'html-drag-drop'},
  {index:4,kind:'real-h5p'},
  {index:5,kind:'real-scorm'},
 ];
 for(const target of targets){
  const result={index:target.index,kind:target.kind,verifiedInteraction:false,status:'NOT_TESTED'};
  report.activities.push(result);
  try{
   const before=await browser.evaluate("window.__subframeEvents.length");
   await browser.evaluate("(()=>{const root=document.querySelector('#demo-player')?.shadowRoot;const nav=[...root.querySelectorAll('.p2lrn-nav button:not(:disabled)')];nav["+target.index+"].click();return true})()");
   await browser.wait("Boolean(document.querySelector('#demo-player')?.shadowRoot?.querySelector('.p2lrn-stage iframe'))",{timeout:22000,label:'inner activity iframe '+target.kind});
   await new Promise(ok=>setTimeout(ok,470));
   let descendants=[];
   for(let n=0;n<30;n++){
    const tree=(await browser.send('Page.getFrameTree')).frameTree;
    descendants=[];
    const visit=node=>{for(const child of node.childFrames??[]){descendants.push(child.frame);visit(child);}};
    visit(tree);
    if(descendants.length)break;
    await new Promise(ok=>setTimeout(ok,150));
   }
   result.frames=descendants.map(x=>({id:x.id,url:x.url,securityOrigin:x.securityOrigin||null}));
   let evaluate;
   if(descendants.length){
     const frame=descendants[0];
     const context=await browser.send('Page.createIsolatedWorld',{frameId:frame.id,worldName:'p2lrn-interop-qa'});
     const contextId=context.executionContextId;
     evaluate=async expression=>{
       const answer=await browser.send('Runtime.evaluate',{contextId,expression,returnByValue:true,awaitPromise:true});
       if(answer.exceptionDetails)throw new Error(String(answer.exceptionDetails.exception?.description||answer.exceptionDetails.text));
       return answer.result?.value;
     };
   }else{
     // Chromium may place opaque srcdoc frames in a different renderer process
     // (OOPIF). Enumerate and attach to their true Chrome target, never clone
     // the HTML into a same-origin fake iframe.
     const all=await browser.send('Target.getTargets');
     const candidates=(all.targetInfos??[]).filter(x=>x.type==='iframe');
     result.frameTargets=candidates.map(x=>({id:x.targetId,url:x.url,attached:x.attached}));
     const frameTarget=candidates.find(x=>/about:srcdoc|about:blank|blob:/i.test(x.url))??candidates.at(-1);
     if(!frameTarget){result.status='FRAME_NOT_FOUND_AND_NO_OOPIF_TARGET';continue;}
     const attachment=await browser.send('Target.attachToTarget',{targetId:frameTarget.targetId,flatten:true});
     const sessionId=attachment.sessionId;
     await browser.send('Runtime.enable',{},sessionId);
     evaluate=async expression=>{
       const answer=await browser.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
       if(answer.exceptionDetails)throw new Error(String(answer.exceptionDetails.exception?.description||answer.exceptionDetails.text));
       return answer.result?.value;
     };
   }
   await new Promise(ok=>setTimeout(ok,400));
   result.initial=await evaluate("(()=>({title:document.title,text:document.body?.innerText?.slice(0,1400)||'',inputs:document.querySelectorAll('input').length,buttons:[...document.querySelectorAll('button,input[type=button],input[type=submit]')].map(x=>x.textContent?.trim()||x.value||x.getAttribute('aria-label')).filter(Boolean).slice(0,30),links:document.querySelectorAll('a').length,h5p:Boolean(document.querySelector('.h5p-content')),scormApi:Boolean(window.API||window.API_1484_11),dragItems:document.querySelectorAll('[data-p2lrn-dnd-item]').length,dragZones:document.querySelectorAll('[data-p2lrn-dnd-zone]').length}))()");
   result.screenshot=await browser.screenshot('before-'+target.kind);
   if(target.kind==='html-drag-drop'){
    if(result.initial.dragItems<2||result.initial.dragZones<2)throw Error('Drag-drop interaction is absent inside actual iframe');
    result.action=await evaluate("(()=>{const activity=document.querySelector('[data-p2lrn-dnd=\"1\"]');const items=[...activity.querySelectorAll('[data-p2lrn-dnd-item]')];const zones=[...activity.querySelectorAll('[data-p2lrn-dnd-zone]')];const before=items.length;for(const item of items){const zone=zones.find(z=>z.dataset.p2lrnDndAccept===item.dataset.p2lrnDndItem);if(!zone)throw Error('Missing answer zone');item.click();zone.click();}return {answerCount:before,completed:activity.dataset.p2lrnDndCompleted==='true',placed:zones.filter(z=>z.querySelector('[data-p2lrn-dnd-item]')).length,status:activity.querySelector('[data-p2lrn-dnd-status]')?.textContent}})()");
    result.verifiedInteraction=result.action.completed&&result.action.placed===result.action.answerCount;
    result.status=result.verifiedInteraction?'PASS_REAL_DRAG_DROP':'FAIL_DRAG_DROP';
   }else if(target.kind==='real-scorm'){
    const progress=[];
    const current=()=>evaluate("(()=>({"+
      "text:document.body?.innerText?.slice(0,1500)||'',"+
      "step:document.body?.innerText?.match(/Step\\s+(\\d+)\\s+of\\s+(\\d+)/i)?.slice(1).map(Number)||null,"+
      "controls:[...document.querySelectorAll('button,input[type=button],input[type=submit]')].map(x=>({label:(x.textContent||x.value||'').trim(),disabled:x.disabled})).filter(x=>x.label).slice(0,25),"+
      "lessonStatus:typeof window.API?.LMSGetValue==='function'?window.API.LMSGetValue('cmi.core.lesson_status'):null,"+
      "lessonScore:typeof window.API?.LMSGetValue==='function'?window.API.LMSGetValue('cmi.core.score.raw'):null"+
      "}))()");
    for(let n=0;n<12;n++){
      const beforeState=await current();
      const clickResult=await evaluate("(()=>{"+
        "const options=[...document.querySelectorAll('button,input[type=button],input[type=submit]')].filter(x=>!x.disabled);"+
        "const next=options.find(x=>/^(?:next|siguiente|continue|continuar|finish|complete|terminar|finalizar)/i.test((x.textContent||x.value||'').trim()));"+
        "if(!next)return {clicked:false};"+
        "const label=(next.textContent||next.value||'').trim();next.click();return {clicked:true,label};"+
        "})()");
      if(!clickResult.clicked)break;
      await new Promise(ok=>setTimeout(ok,220));
      const afterState=await current();
      progress.push({clicked:clickResult.label,stepBefore:beforeState.step,stepAfter:afterState.step,
        lessonStatus:afterState.lessonStatus,score:afterState.lessonScore,
        controls:afterState.controls});
      const done=['completed','passed'].includes(String(afterState.lessonStatus??'').toLowerCase());
      const advanced=JSON.stringify(afterState.step)!==JSON.stringify(beforeState.step)||
        beforeState.lessonStatus!==afterState.lessonStatus||beforeState.text!==afterState.text;
      if(done||!advanced)break;
    }
    const final=await current();
    result.formControls=await evaluate("(()=>({inputNodes:[...document.querySelectorAll('input,select')].map(x=>({tag:x.tagName,type:x.type,value:x.value,name:x.name,id:x.id,outer:x.outerHTML.slice(0,350),parent:x.parentElement?.outerHTML.slice(0,420)})).slice(0,35),labels:[...document.querySelectorAll('label')].map(x=>x.outerHTML.slice(0,420)).slice(0,35),buttons:[...document.querySelectorAll('button')].map(x=>x.outerHTML.slice(0,300)).slice(0,15)}))()");
    result.action={realUIActions:progress,finalStep:final.step,finalLessonStatus:final.lessonStatus,
      finalRawScore:final.lessonScore,remainingControls:final.controls};
    const completed=final.step?.[0]===final.step?.[1]&&
      ['completed','passed'].includes(String(final.lessonStatus??'').toLowerCase());
    result.verifiedInteraction=progress.length>0;
    result.status=completed?'SCORM_FINAL_STEP_AND_RUNTIME_COMPLETION':
      progress.length>0?'SCORM_REAL_UI_ADVANCED_NOT_GRADE_CERTIFIED':'SCORM_NO_ACTION_AVAILABLE';
    result.after=final;
   }else if(target.kind==='real-h5p'){
    result.action=await evaluate("(()=>{const start=[...document.querySelectorAll('button,input[type=button]')]"+
      ".find(x=>/^(?:start|comenzar|iniciar)$/i.test((x.textContent||x.value||'').trim()));"+
      "if(!start)return {clicked:false};start.click();return {clicked:true,label:(start.textContent||start.value||'').trim()};})()");
    await new Promise(ok=>setTimeout(ok,5300));
    const state=await evaluate("(()=>({"+
      "text:document.body?.innerText?.slice(0,1800)||'',"+
      "buttons:[...document.querySelectorAll('button,input[type=button],input[type=submit]')].map(x=>({text:(x.textContent||x.value||'').trim(),disabled:x.disabled})).filter(x=>x.text).slice(0,25),"+
      "inputControls:[...document.querySelectorAll('input')].map(x=>({type:x.type,placeholder:x.placeholder,valueLength:x.value.length})).slice(0,20),"+
      "completed:Boolean(document.querySelector('.h5p-question-finished,.h5p-score-bar')),"+
      "h5pChildren:document.querySelector('.h5p-content')?.children?.length??0"+
      "}))()");
    result.after=state;
    result.visibleAnswers=await evaluate("(()=>[...document.querySelectorAll('*')].filter(el=>el.children.length===0&&/^(?:[0-9]{1,4}|−?[0-9]{1,4})$/.test(el.textContent?.trim()||'')&&el.getBoundingClientRect().width>0).slice(0,35).map(el=>({text:el.textContent.trim(),node:el.outerHTML.slice(0,350),parent:el.parentElement?.outerHTML.slice(0,600),grandparent:el.parentElement?.parentElement?.outerHTML.slice(0,600)})))()");
    result.verifiedInteraction=Boolean(result.action.clicked);
    result.status=state.completed?'H5P_RUNTIME_COMPLETION_NEEDS_GRADE_VALIDATION':
      result.verifiedInteraction?'H5P_REAL_START_AND_TIMED_ACTIVITY':'H5P_NO_START_ACTION';
   }
   result.screenshotAfter=await browser.screenshot('after-'+target.kind);
   result.playerEvents=await browser.evaluate("window.__subframeEvents.slice("+before+").slice(-40)");
  }catch(error){result.status='FAIL_OR_UNAVAILABLE';result.error=String(error?.message||error).slice(0,1000);}
  await persist();
  console.log('P2LRN_INTEROP_SUBFRAME='+JSON.stringify({kind:target.kind,status:result.status,interaction:result.action,errors:result.error}));
 }
 report.verifiedInteractions=report.activities.filter(x=>x.verifiedInteraction).length;
 report.status=report.activities.some(x=>x.status==='FAIL_DRAG_DROP'||x.status==='FAIL_OR_UNAVAILABLE')?'FAILED_SUBFRAME_TEST':
   report.verifiedInteractions===0?'NO_SUBFRAME_INTERACTIONS_VERIFIED':'PARTIAL_REAL_EVIDENCE';
 report.resultEvents=await browser.evaluate("window.__subframeEvents.slice(-55)");
}catch(error){
 report.status='TEST_HARNESS_FAILED';report.error=String(error?.message||error).slice(0,1200);
}finally{
 report.finishedAt=new Date().toISOString();await persist();
 if(browser)await browser.close();
 if(server)await server.close();
}
console.log('P2LRN_INTEROP_SUBFRAMES_REPORT='+JSON.stringify(report));
if(!['PARTIAL_REAL_EVIDENCE'].includes(report.status))process.exitCode=1;
