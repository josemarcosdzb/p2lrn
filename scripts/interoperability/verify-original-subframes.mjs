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
   if(!descendants.length){result.status='FRAME_NOT_FOUND';continue;}
   // A valid Player activity has one top-level sandbox iframe.
   const frame=descendants[0];
   const context=await browser.send('Page.createIsolatedWorld',{frameId:frame.id,worldName:'p2lrn-interop-qa'});
   const contextId=context.executionContextId;
   const evaluate=async expression=>{
    const answer=await browser.send('Runtime.evaluate',{contextId,expression,returnByValue:true,awaitPromise:true});
    if(answer.exceptionDetails)throw new Error(String(answer.exceptionDetails.exception?.description||answer.exceptionDetails.text));
    return answer.result?.value;
   };
   await new Promise(ok=>setTimeout(ok,400));
   result.initial=await evaluate("(()=>({title:document.title,text:document.body?.innerText?.slice(0,1400)||'',inputs:document.querySelectorAll('input').length,buttons:[...document.querySelectorAll('button,input[type=button],input[type=submit]')].map(x=>x.textContent?.trim()||x.value||x.getAttribute('aria-label')).filter(Boolean).slice(0,30),links:document.querySelectorAll('a').length,h5p:Boolean(document.querySelector('.h5p-content')),scormApi:Boolean(window.API||window.API_1484_11),dragItems:document.querySelectorAll('[data-p2lrn-dnd-item]').length,dragZones:document.querySelectorAll('[data-p2lrn-dnd-zone]').length}))()");
   result.screenshot=await browser.screenshot('before-'+target.kind);
   if(target.kind==='html-drag-drop'){
    if(result.initial.dragItems<2||result.initial.dragZones<2)throw Error('Drag-drop interaction is absent inside actual iframe');
    result.action=await evaluate("(()=>{const activity=document.querySelector('[data-p2lrn-dnd=\"1\"]');const items=[...activity.querySelectorAll('[data-p2lrn-dnd-item]')];const zones=[...activity.querySelectorAll('[data-p2lrn-dnd-zone]')];const before=items.length;for(const item of items){const zone=zones.find(z=>z.dataset.p2lrnDndAccept===item.dataset.p2lrnDndItem);if(!zone)throw Error('Missing answer zone');item.click();zone.click();}return {answerCount:before,completed:activity.dataset.p2lrnDndCompleted==='true',placed:zones.filter(z=>z.querySelector('[data-p2lrn-dnd-item]')).length,status:activity.querySelector('[data-p2lrn-dnd-status]')?.textContent}})()");
    result.verifiedInteraction=result.action.completed&&result.action.placed===result.action.answerCount;
    result.status=result.verifiedInteraction?'PASS_REAL_DRAG_DROP':'FAIL_DRAG_DROP';
   }else{
    result.action=await evaluate("(()=>{const relevant=[...document.querySelectorAll('button,input[type=button],input[type=submit],a')].filter(x=>!x.disabled&&getComputedStyle(x).display!=='none');const before=document.body?.innerText?.slice(0,350)||'';const matching=relevant.find(x=>/(?:start|comenzar|check|comprobar|begin|continue|siguiente|next|submit|enviar)/i.test(x.textContent||x.value||''));if(matching){matching.click();return {clicked:(matching.textContent||matching.value).trim().slice(0,110),before,after:document.body?.innerText?.slice(0,350)||''};}return {clicked:null,before,after:before};})()");
    await new Promise(ok=>setTimeout(ok,350));
    result.after=await evaluate("(()=>({text:document.body?.innerText?.slice(0,1200)||'',buttons:[...document.querySelectorAll('button,input[type=button]')].map(x=>x.textContent?.trim()||x.value).filter(Boolean).slice(0,24)}))()");
    result.verifiedInteraction=Boolean(result.action.clicked);
    result.status=result.verifiedInteraction?'UI_INTERACTION_ONLY_NO_COMPLETION_GRADE':'RENDER_ONLY_NO_ACTION_AVAILABLE';
   }
   result.screenshotAfter=await browser.screenshot('after-'+target.kind);
   result.playerEvents=await browser.evaluate("window.__subframeEvents.slice("+before+").slice(-40)");
  }catch(error){result.status='FAIL_OR_UNAVAILABLE';result.error=String(error?.message||error).slice(0,1000);}
  await persist();
  console.log('P2LRN_INTEROP_SUBFRAME='+JSON.stringify({kind:target.kind,status:result.status,interaction:result.action,errors:result.error}));
 }
 report.status=report.activities.every(x=>x.status!=='FAIL_DRAG_DROP'&&x.status!=='FAIL_OR_UNAVAILABLE')?'PARTIAL_REAL_EVIDENCE':'FAILED_SUBFRAME_TEST';
 report.resultEvents=await browser.evaluate("window.__subframeEvents.slice(-55)");
}catch(error){
 report.status='TEST_HARNESS_FAILED';report.error=String(error?.message||error).slice(0,1200);
}finally{
 report.finishedAt=new Date().toISOString();await persist();
 if(browser)await browser.close();
 if(server)await server.close();
}
console.log('P2LRN_INTEROP_SUBFRAMES_REPORT='+JSON.stringify(report));
if(report.status==='TEST_HARNESS_FAILED'||report.status==='FAILED_SUBFRAME_TEST')process.exitCode=1;
