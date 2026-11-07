// Teacher version 2: open the original course in REAL Studio, edit precisely
// one assessment prompt, export exactly once and verify on standalone Player.
// The original result/course stays immutable; no LMS grade history is simulated.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,stat,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {openP2LRNPackageBytes} from '../../packages/toolkit/web/p2lrn-player.js';
import {createInteropStudioServer} from './studio-lab-server.mjs';
import {launchInteropChrome} from './chrome-visual.mjs';

const ORIGINAL_SHA='cce43503ea425ec4f1e6203c8ef6556beb999e71c08e59d5511091a6b931a380';
const UPDATED_PROMPT='¿Cuál es la primera medida segura ante un correo que solicita tu contraseña de trabajo?';
const args=process.argv.slice(2),arg=name=>{let i=args.indexOf(name);return i>=0?args[i+1]:null;};
const sourcePath=resolve(arg('--course')||'seguridad-informatica.p2lrn');
const siteRoot=resolve(arg('--site')||'.netlify-cdn');
const repoRoot=resolve(arg('--repo')||process.cwd());
const output=resolve(arg('--output')||'.interop-evidence');
const version2=join(output,'seguridad-informatica-v2.p2lrn');
const downloads=join(output,'version-two-downloads');
const screenshots=join(output,'version-two-screenshots');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output,{recursive:true});await mkdir(downloads,{recursive:true});
const report={schema:'https://p2lrn.org/schema/interoperability-real-qa/1',
 kind:'COURSE_VERSION_UPDATE_WITH_REAL_STUDIO_UI',originalSha256:ORIGINAL_SHA,
 updatedSha256:null,versions:2,perDestinationAdaptations:0,
 changedAssessmentPrompt:null,untouchedOldCourse:true,entityIdRetention:null,
 previousHostGradeHistory:'NOT_TESTED_NO_LMS_HOST',status:'IN_PROGRESS',
 stages:[],startedAt:new Date().toISOString()};
const persist=()=>writeFile(join(output,'version-two-evidence.json'),JSON.stringify(report,null,2)+'\n');
const stage=async(name,fn)=>{
 const row={name,status:'IN_PROGRESS'};report.stages.push(row);
 try{const out=await fn();row.status='PASS';row.details=out;await persist();return out;}
 catch(e){row.status='FAIL';row.error=String(e?.message||e).slice(0,900);await persist();throw e;}
};
let server=null,chrome=null;
try{
 const before=await readFile(sourcePath);
 assert.equal(sha(before),ORIGINAL_SHA,'Original course has been modified');
 server=await createInteropStudioServer({siteRoot,repoRoot,coursePath:sourcePath,versionTwoPath:version2});
 chrome=await launchInteropChrome({downloadDir:downloads,evidenceDir:screenshots});
 await stage('01-open-unchanged-v1-in-studio',async()=>{
  await chrome.navigate(server.base+'/studio/');
  await chrome.wait("document.documentElement.dataset.p2lrnStudioReady==='true'",{timeout:45000,label:'Studio ready'});
  const url=server.base+'/interop/seguridad-informatica.p2lrn';
  await chrome.evaluate("(()=>{const el=document.querySelector('[data-url]');if(!el)throw Error('No Studio URL import field');el.value="+JSON.stringify(url)+";document.querySelector('[data-open-url]').click();return true})()");
  await chrome.wait("document.querySelectorAll('[data-tree] button[data-entity-id]').length>=11",{timeout:40000,label:'Course outline imported'});
  const layout=await chrome.evaluate("(()=>{const list=[...document.querySelectorAll('[data-tree] button[data-entity-id]')];return {count:list.length,courseTitles:list.filter(x=>x.querySelector('.type')?.textContent==='course').map(x=>x.textContent)}})()");
  return {...layout,screenshot:await chrome.screenshot('version-2-original-opened')};
 });
 await stage('02-update-one-real-quiz-question',async()=>{
  await chrome.evaluate("(()=>{const buttons=[...document.querySelectorAll('[data-tree] button[data-entity-id]')];const target=buttons.find(x=>x.querySelector('.type')?.textContent==='activity'&&x.querySelector('.title')?.textContent==='Cuestionario');if(!target)throw Error('Original Studio questionnaire not found');target.click();return true})()");
  await chrome.wait("Boolean(document.querySelector('.questionnaire-visual-editor .q-prompt-input'))",{timeout:14000,label:'question editor'});
  const oldPrompt=await chrome.evaluate("document.querySelector('.questionnaire-visual-editor .q-prompt-input').value");
  if(!oldPrompt?.includes('contraseña'))throw new Error('Unexpected original question; refusing to modify another one');
  await chrome.evaluate("(()=>{const el=document.querySelector('.questionnaire-visual-editor .q-prompt-input');el.focus();el.select();return true})()");
  await chrome.send('Input.insertText',{text:UPDATED_PROMPT});
  await chrome.evaluate("(()=>{const el=document.querySelector('.questionnaire-visual-editor .q-prompt-input');el.dispatchEvent(new Event('input',{bubbles:true}));return el.value})()");
  const current=await chrome.evaluate("document.querySelector('.questionnaire-visual-editor .q-prompt-input').value");
  assert.equal(current,UPDATED_PROMPT,'Real Studio editor did not update the prompt');
  report.changedAssessmentPrompt={before:oldPrompt,after:current};
  return {original:oldPrompt,updated:current,screenshot:await chrome.screenshot('version-2-one-question-updated')};
 });
 await stage('03-export-one-v2-without-altering-v1',async()=>{
  const prior=await readdir(downloads);
  await chrome.evaluate("(()=>{const b=document.querySelector('[data-export]');if(!b)throw Error('Real Studio Export unavailable');b.click();return true})()");
  await chrome.wait("document.querySelector('[data-studio-status]')?.textContent.includes('Paquete exportado y verificado')",{timeout:45000,label:'Studio version 2 exported'});
  let downloaded=null;
  for(let k=0;k<140;k++){
   const names=(await readdir(downloads)).filter(name=>name.endsWith('.p2lrn')&&!name.endsWith('.crdownload')&&!prior.includes(name));
   if(names.length){const candidate=join(downloads,names.sort().at(-1));if((await stat(candidate)).size>20000){downloaded=candidate;break;}}
   await new Promise(done=>setTimeout(done,90));
  }
  if(!downloaded)throw new Error('Studio did not export version 2 .p2lrn');
  await rename(downloaded,version2);
  const updated=await readFile(version2);
  report.updatedSha256=sha(updated);
  assert.notEqual(report.updatedSha256,ORIGINAL_SHA,'Question update did not change package bytes');
  assert.equal(sha(await readFile(sourcePath)),ORIGINAL_SHA,'Source v1 was modified during v2 export');
  return {version2Path:version2,sha256:report.updatedSha256,bytes:updated.length};
 });
 await stage('04-verify-source-identity-and-question-change',async()=>{
  const open=async bytes=>openP2LRNPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const v1=await open(before),v2=await open(await readFile(version2));
  const ids1=[...v1.entities.keys()].sort(),ids2=[...v2.entities.keys()].sort();
  if(JSON.stringify(ids1)!==JSON.stringify(ids2))
    throw new Error('Studio v2 unexpectedly removed or regenerated entities instead of updating one question');
  const extract=async pkg=>{
   let matches=[];
   for(const entity of pkg.entities.values()){
     if(entity.type!=='resource')continue;
     for(const representation of entity.representations??[]){
       if(!String(representation.mediaType).includes('questionnaire+json'))continue;
       const path=representation.location?.path;
       if(!path)continue;
       const bytes=await pkg.payload(path).read();
       const data=JSON.parse(new TextDecoder().decode(bytes));
       matches.push({resourceId:entity.id,prompts:data.questions?.map(x=>x.prompt)});
     }
   }
   return matches;
  };
  const beforeQuizzes=await extract(v1),afterQuizzes=await extract(v2);
  const oldSet=new Set(beforeQuizzes.flatMap(x=>x.prompts||[]));
  const newSet=new Set(afterQuizzes.flatMap(x=>x.prompts||[]));
  if(newSet.has(report.changedAssessmentPrompt.before)&&!newSet.has(UPDATED_PROMPT))
    throw new Error('Studio changed the textbox but not the exported quiz payload');
  if(!newSet.has(UPDATED_PROMPT))throw new Error('Updated assessment question missing in v2');
  if(!oldSet.has(report.changedAssessmentPrompt.before))throw new Error('Original quiz question not found in v1');
  report.entityIdRetention={sameEntityIds:true,count:ids1.length,oldRoot:v1.manifest.integrity.contentRoot,newRoot:v2.manifest.integrity.contentRoot};
  if(report.entityIdRetention.oldRoot===report.entityIdRetention.newRoot)
    throw new Error('New question did not update course contentRoot');
  return {sameEntityIds:true,oldAndNewRootsDifferent:true,updatedQuestionPresent:true};
 });
 await stage('05-open-the-v2-on-the-same-independent-player',async()=>{
  const served=Buffer.from(await (await fetch(server.base+'/interop/seguridad-informatica-v2.p2lrn')).arrayBuffer());
  assert.equal(sha(served),report.updatedSha256,'Website changed the version-2 course bytes');
  await chrome.navigate(server.base+'/demo/?src='+encodeURIComponent('/interop/seguridad-informatica-v2.p2lrn'));
  await chrome.wait("document.querySelector('#demo-player')?.shadowRoot?.querySelectorAll('.p2lrn-nav button:not([disabled])').length>=7",{timeout:45000,label:'v2 real Player course'});
  await chrome.evaluate("(()=>{const root=document.querySelector('#demo-player')?.shadowRoot;const quiz=[...root.querySelectorAll('.p2lrn-nav button:not(:disabled)')].find(x=>x.textContent.includes('Cuestionario'));if(!quiz)throw Error('Version 2 questionnaire missing');quiz.click();return true})()");
  await chrome.wait("document.querySelector('#demo-player')?.shadowRoot?.querySelector('.p2lrn-q-prompt')?.textContent?.includes('primera medida segura')",{timeout:18000,label:'updated question in actual v2 Player'});
  return {samePackageSha256:sha(served),updatedPromptVisible:true,screenshot:await chrome.screenshot('version-2-reopened-in-player')};
 });
 report.status='V2_CREATED_AND_WEB_LOADED_NO_HOST_HISTORY_TEST';
}catch(error){
 report.status='VERSION_TWO_FAILED';report.error=String(error?.message||error).slice(0,900);
 console.error('P2LRN_REAL_VERSION_TWO_ERROR='+report.error);
 process.exitCode=1;
}finally{
 report.endedAt=new Date().toISOString();
 await persist();
 if(chrome)await chrome.close();
 if(server)await server.close();
}
console.log('P2LRN_REAL_VERSION_TWO_REPORT='+JSON.stringify(report));
