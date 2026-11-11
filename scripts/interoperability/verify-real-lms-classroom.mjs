// REAL UI E2E only. This script never calls the LMS/Provider grade APIs,
// injects a forged JWT, or treats a successful page load as course completion.
// All actions use Chrome/Edge's real DOM. A run is PASS only after teacher
// uploads, learners complete/return and the LMS gradebook is inspected.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,basename} from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {freemem} from 'node:os';
import {request as httpRequest} from 'node:http';
import {launchInteropChrome} from './chrome-visual.mjs';
import {validateClassroomPlan,STAGES} from './real-lms-classroom-contract.mjs';

const MIN_FREE_BYTES=4*1024*1024*1024;
const MAX_COURSE_BYTES=8*1024*1024;
const MAX_RUN_MS=12*60*1000;
// Reuse the SAME official Toolkit validator used by the actual Provider.
// Restrict expansion to a small bounded QA course, never inspect opaque ZIPs.
const toolkitValidator=resolve(fileURLToPath(new URL('../../',import.meta.url)),
 'packages/toolkit/dist/core/validator.js');
const {validatePackageBytes}=await import(existsSync(toolkitValidator)?
 pathToFileURL(toolkitValidator).href:'@p2lrn/toolkit/core');
const flags=process.argv.slice(2);
const arg=key=>{const p=flags.indexOf(key);return p<0?null:flags[p+1];};
const executing=flags.includes('--execute-real');
const planPath=arg('--plan');
if(!planPath||!planPath.endsWith('.json'))
 throw Error('LMS_REAL_PLAN_REQUIRED');
const plan=JSON.parse(await readFile(resolve(planPath),'utf8'));
const contract=validateClassroomPlan(plan);
const courses={};
for(const id of ['A','B']){
 const file=resolve(plan.courses[id].file);
 const info=await stat(file);
 if(!info.isFile()||info.size<1||info.size>MAX_COURSE_BYTES)
  throw Error('LMS_REAL_COURSE_SIZE_UNSAFE_'+id);
 const buf=await readFile(file);
 const digest=createHash('sha256').update(buf).digest('hex');
 if(digest.toLowerCase()!==plan.courses[id].sha256.toLowerCase())
  throw Error('LMS_REAL_COURSE_INTEGRITY_'+id);
 let parsed;
 try{
  parsed=validatePackageBytes(buf,{
   strictProfiles:true,validateProfilePayloads:true,
   zipLimits:{entries:1200,entryBytes:8*1024*1024,
    totalUncompressedBytes:32*1024*1024,
    centralDirectoryBytes:2*1024*1024,compressionRatio:30},
   nestedZipLimits:{entries:1200,entryBytes:8*1024*1024,
    totalUncompressedBytes:64*1024*1024,
    centralDirectoryBytes:2*1024*1024,compressionRatio:30}
  });
 }catch{throw Error('INVALID_OFFICIAL_P2LRN_PACKAGE_'+id);}
 if(!parsed?.graph?.entities?.some(e=>e.type==='course')||
    !parsed.manifest?.integrity?.contentRoot)
  throw Error('COURSE_ENTITY_OR_INTEGRITY_MISSING_'+id);
 courses[id]={buf,sha256:digest,filename:basename(file),
  contentRoot:parsed.manifest.integrity.contentRoot};

}
if(courses.A.contentRoot===courses.B.contentRoot)
 throw Error('DISTINCT_REAL_COURSE_CONTENT_REQUIRED');
if(!executing){
 console.log(JSON.stringify({status:'PLAN_VALIDATED_NOT_EXECUTED',
  lms:plan.lms,stages:contract.stageCount,courses:{
   A:{sha256:courses.A.sha256,contentRoot:courses.A.contentRoot},
   B:{sha256:courses.B.sha256,contentRoot:courses.B.contentRoot}}}));
 process.exit(0);
}
if(process.env.P2LRN_LMS_REAL_E2E!=='YES')
 throw Error('REAL_LMS_E2E_EXPLICIT_OPT_IN_REQUIRED');
const output=resolve(arg('--output')||'.interop-evidence/real-lms-classroom');
const runId=String(process.env.GITHUB_RUN_ID||new Date().toISOString().replace(/[^0-9]/g,'')).slice(0,32);
const evidence=join(output,plan.lms,runId);
await mkdir(evidence,{recursive:true});
const reportPath=join(evidence,'real-classroom-results.json');
const report={schema:'p2lrn-lms-real-classroom-result/1',
 lms:plan.lms,status:'BLOQUEADA',startedAt:new Date().toISOString(),
 commit:process.env.GITHUB_SHA||null,
 courses:{A:{sha256:courses.A.sha256,contentRoot:courses.A.contentRoot},
  B:{sha256:courses.B.sha256,contentRoot:courses.B.contentRoot}},
 stages:[],
 teacherUploads:0,learnerCompletions:0,officialGradeCells:0,
 note:'PASS requires Chrome/Edge interactions with genuine QA LMS UI and official gradebook'};
const persist=()=>writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
const ensureMemory=()=>{
 if(freemem()<MIN_FREE_BYTES)throw Error('QA_LOW_FREE_MEMORY');
};
const loopback=async(hostname,path)=>{
 const host=new URL(hostname).host;
 return new Promise((ok,fail)=>{
  const req=httpRequest({hostname:'127.0.0.1',port:80,path,method:'GET',
   headers:{Host:host,Accept:'application/json,text/html;q=0.8'},
   timeout:4000},res=>{
    const bytes=[];let n=0;
    res.on('data',c=>{
     n+=c.length;
     if(n>1024*1024){req.destroy(Error('QA_RESPONSE_TOO_LARGE'));return;}
     bytes.push(c);
    });
    res.on('end',()=>ok({status:res.statusCode,body:Buffer.concat(bytes).toString('utf8'),
     type:String(res.headers['content-type']||'')}));
  });
  req.on('timeout',()=>req.destroy(Error('QA_PROXY_TIMEOUT')));
  req.on('error',fail);req.end();
 });
};
const preflight=async()=>{
 ensureMemory();
 const ui=await loopback(plan.lmsBase,'/');
 if(!(ui.status>=200&&ui.status<400)||
   (ui.status===200&&ui.body.length===0))
  throw Error('QA_LMS_UI_UNAVAILABLE');
 const health=await loopback(plan.lmsBase,'/lti/health');
 let obj=null;try{obj=JSON.parse(health.body);}catch{}
 if(health.status!==200||obj?.provider!=='P2LRN LTI 1.3'||
    obj?.status!=='ok'||obj?.standalone!==true)
  throw Error('QA_PROVIDER_ROUTE_UNAVAILABLE');
 const keys=await loopback(plan.lmsBase,'/lti/jwks');
 let jwks=null;try{jwks=JSON.parse(keys.body);}catch{}
 if(keys.status!==200||!Array.isArray(jwks?.keys)||!jwks.keys.length)
  throw Error('QA_PROVIDER_KEYS_UNAVAILABLE');
};
const J=JSON.stringify;
function rootFor(action){
 if(!action.frame)return 'const root=document;';
 return 'const frame=document.querySelector('+J(action.frame)+');'+
  'if(!frame||!frame.contentDocument)throw Error("QA_FRAME_CROSS_ORIGIN_OR_MISSING");'+
  'const root=frame.contentDocument;';
}
const findFor=a=>rootFor(a)+'const node=root.querySelector('+J(a.selector)+');'+
 'if(!node)throw Error("QA_UI_SELECTOR_MISSING");';
const visible='node.getClientRects().length>0&&'+
 'node.ownerDocument.defaultView.getComputedStyle(node).visibility!=="hidden"';
const expression=(a,body)=>'(()=>{'+findFor(a)+body+'})()';
async function runAction(browser,a){
 switch(a.type){
 case 'goto': {
  const url=new URL(a.path,plan.lmsBase);
  if(url.origin!==new URL(plan.lmsBase).origin)throw Error('QA_NAVIGATION_DENIED');
  await browser.navigate(url.toString());
  return;
 }
 case 'click':{
  const found=await browser.evaluate(expression(a,
   'if(node.disabled)throw Error("QA_UI_DISABLED");'+
   'node.scrollIntoView({block:"center"});node.click();return true;'));
  if(found!==true)throw Error('QA_CLICK_FAILED');
  return;
 }
 case 'fillEnv':{
  const value=process.env[a.env];
  if(typeof value!=='string'||!value)throw Error('QA_SECRET_ENV_UNAVAILABLE');
  await browser.evaluate(expression(a,
   'if(!("value" in node))throw Error("QA_INVALID_INPUT");'+
   'node.focus();const proto=Object.getPrototypeOf(node);'+
   'const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;'+
   'if(setter)setter.call(node,'+J(value)+');else node.value='+J(value)+';'+
   'node.dispatchEvent(new Event("input",{bubbles:true}));'+
   'node.dispatchEvent(new Event("change",{bubbles:true}));return true;'));
  return;
 }
 case 'select':{
  await browser.evaluate(expression(a,
   'if(node.tagName!=="SELECT")throw Error("QA_NOT_SELECT");'+
   'node.value='+J(a.value)+';'+
   'if(node.value!=='+J(a.value)+')throw Error("QA_OPTION_NOT_FOUND");'+
   'node.dispatchEvent(new Event("input",{bubbles:true}));'+
   'node.dispatchEvent(new Event("change",{bubbles:true}));return true;'));
  return;
 }
 case 'uploadCourse':{
  const file=courses[a.course];
  const payload=file.buf.toString('base64');
  const loaded=await browser.evaluate(expression(a,
   'if(node.type!=="file")throw Error("QA_REAL_FILE_INPUT_REQUIRED");'+
   'const binary=atob('+J(payload)+');'+
   'const bytes=Uint8Array.from(binary,x=>x.charCodeAt(0));'+
   'const dt=new DataTransfer();'+
   'dt.items.add(new File([bytes],'+J(file.filename)+',{type:"application/vnd.p2lrn+zip"}));'+
   'node.files=dt.files;node.dispatchEvent(new Event("change",{bubbles:true}));'+
   'return node.files.length===1&&node.files[0].size==='+file.buf.length+';'));
  if(loaded!==true)throw Error('QA_COURSE_NOT_SELECTED_IN_BROWSER');
  return;
 }
 case 'assertPublished':
  await browser.wait(expression(a,
   'if(!location.pathname.startsWith('+J(a.pagePath)+'))return false;'+
   'return '+visible+'&&node.textContent.includes('+J(a.text)+');'),
   {timeout:20000,label:'course published inside actual LMS course page'});
  return;
 case 'assertPlayerCourse':{
  const expected=courses[a.course].contentRoot;
  await browser.wait(expression(a,
   'if(node.tagName.toLowerCase()!=="p2lrn-player")return false;'+
   'return String(node.contentRoot||"")==='+J(expected)+';'),
   {timeout:25000,label:'real Player loaded verified course contentRoot'});
  return;
 }
 case 'waitVisible':
  await browser.wait(expression(a,'return Boolean('+visible+');'),
   {timeout:20000,label:'real visible LMS element'});
  return;
 case 'waitText':
 case 'assertCompletion':
  await browser.wait(expression(a,
   'return '+visible+'&&node.textContent.includes('+J(a.text)+');'),
   {timeout:20000,label:'real LMS UI result'});
  return;
 case 'assertResume':{
  const actual=await browser.evaluate(expression(a,
   'return '+(a.mode==='checked'?'String(Boolean(node.checked))':
   a.mode==='value'?'String(node.value)':'String(node.textContent)')+';'));
  if(a.mode==='text'?!String(actual).includes(a.expected):actual!==a.expected)
   throw Error('QA_PROGRESS_NOT_RESTORED');
  return;
 }
 case 'assertGrade':{
  const test=expression(a,
   'const header=root.querySelector('+J(a.courseHeaderSelector)+');'+
   'if(!header||!header.textContent.includes('+J(a.courseHeaderText)+'))'+
   'throw Error("QA_GRADE_COURSE_HEADER_MISSING");'+
   'const rows=[...root.querySelectorAll('+J(a.selector)+')].filter(r=>'+
   'r.textContent.includes('+J(a.studentText)+'));'+
   'if(rows.length!==1)throw Error("QA_GRADE_STUDENT_ROW_AMBIGUOUS");'+
   'const grade=rows[0].querySelector('+J(a.gradeSelector)+');'+
   'if(!grade)throw Error("QA_GRADE_CELL_NOT_FOUND");'+
   'const raw=grade.textContent.trim().replace(/\\u00a0/g," ");'+
   'if(!/^\\d+(?:[.,]\\d+)?\\s*%?$/.test(raw))throw Error("QA_GRADE_NOT_NUMERIC");'+
   'return Number.parseFloat(raw.replace(",", "."));');
  const number=await browser.evaluate(test);
  if(!Number.isFinite(number)||Math.abs(number-a.expected)>(a.tolerance??0.01))
   throw Error('QA_LMS_GRADEBOOK_MISMATCH');
  return;
 }
 default:throw Error('QA_UNKNOWN_ACTION');
 }
}
let browser=null,actor=null,started=Date.now();
try{
 await preflight();
 for(const stage of plan.stages){
  if(Date.now()-started>MAX_RUN_MS)throw Error('QA_REAL_RUN_TIME_BUDGET_EXCEEDED');
  if(stage.actor!==actor){
   if(browser){await browser.close();browser=null;}
   ensureMemory();
   browser=await launchInteropChrome({downloadDir:join(evidence,'downloads'),
    evidenceDir:evidence,localHostResolver:true});
   actor=stage.actor;
  }
  const outcome={id:stage.id,actor:stage.actor,status:'IN_PROGRESS'};
  report.stages.push(outcome);await persist();
  try{
   for(const action of stage.actions){
    if(Date.now()-started>MAX_RUN_MS)throw Error('QA_REAL_RUN_TIME_BUDGET_EXCEEDED');
    await runAction(browser,action);
   }
   outcome.screenshot=await browser.screenshot(stage.id);
   outcome.status='PASS';
   if(stage.id.startsWith('teacher-publish'))report.teacherUploads++;
   if(stage.id.includes('complete'))report.learnerCompletions++;
   if(stage.id==='teacher-gradebook')report.officialGradeCells=4;
   await persist();
  }catch(error){
   outcome.status='FAIL';
   outcome.code=/^QA_[A-Z_]+$/.test(error.message)?error.message:'QA_BROWSER_STAGE_FAILED';
   await persist();throw error;
  }
 }
 if(report.stages.length!==STAGES.length||report.stages.some(x=>x.status!=='PASS')||
   report.teacherUploads!==2||report.learnerCompletions!==4||report.officialGradeCells!==4)
  throw Error('QA_REAL_CLASSROOM_INCOMPLETE');
 report.status='PASS_REAL_CLASSROOM';
}catch(error){
 report.status=error.message==='QA_LOW_FREE_MEMORY'?'BLOQUEADA_RECURSOS':
   error.message==='QA_SECRET_ENV_UNAVAILABLE'?'BLOQUEADA_CREDENCIALES':
   report.stages.some(x=>x.status==='FAIL')?'FAIL_REAL_CLASSROOM':'BLOQUEADA';
 report.blocker=/^QA_[A-Z_]+$/.test(error.message)?error.message:'QA_REAL_E2E_PRECONDITION_FAILED';
 process.exitCode=1;
}finally{
 if(browser)await browser.close().catch(()=>{});
 report.finishedAt=new Date().toISOString();
 await persist();
}
console.log('P2LRN_REAL_LMS_CLASSROOM='+JSON.stringify({
 status:report.status,lms:report.lms,stagesPassed:report.stages.filter(s=>s.status==='PASS').length,
 teacherUploads:report.teacherUploads,learnerCompletions:report.learnerCompletions,
 officialGradeCells:report.officialGradeCells,blocker:report.blocker??null,
 report:reportPath
}));
