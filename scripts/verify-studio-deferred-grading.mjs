// Browser E2E: test the actual WYSIWYG questionnaire editor, persisted
// payload and exported P2LRN archive, not a mocked settings component.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const root=resolve('packages/toolkit/web');
function chromePath(){
 const paths=[
   process.env.P2LRN_CHROME,
   'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
   'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
   'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
   '/usr/bin/chromium','/usr/bin/google-chrome',
 ].filter(Boolean);
 return paths.find(existsSync)??null;
}
async function scenario(){
 const check=(value,message)=>{if(!value)throw new Error(message);};
 const {createP2LRNStudioDocument}=await import('/studio/new-document.js');
 const {renderQuestionnaireVisualEditor}=await import('/studio/questionnaire-editor.js');
 const {exportP2LRNPackage}=await import('/studio/package-export.js');
 const {openP2LRNPackageBytes}=await import('/p2lrn-player.js');
 const {scoreQuestionnaire}=await import('/questionnaire-core.js');
 const doc=createP2LRNStudioDocument({title:'Examen mixto',language:'es'});
 const activity=doc.addQuestionnaire(doc.rootId,{title:'Preguntas'});
 doc.setActivityProgression(activity.id,{mode:'passed',minScore:80});
 const state=await doc.readQuestionnaire(activity.id);
 const holder=document.createElement('div');document.body.append(holder);
 const render=(id,payload,renderer)=>renderQuestionnaireVisualEditor(holder,{
   model:doc,activityId:id,payload,renderer,
 });
 render(activity.id,state.payload,'https://p2lrn.org/renderer/questionnaire/standard');
 let grading=[...holder.querySelectorAll('select')].find(select=>[...select.options].some(option=>option.value==='host'));
 check(grading&&grading.value==='embedded-key','Initial automatic mode missing');
 grading.value='host';grading.dispatchEvent(new Event('change',{bubbles:true}));
 let updated=(await doc.readQuestionnaire(activity.id)).payload;
 check(updated.grading.mode==='host','Deferred mode was not saved');
 check(updated.questions.every(q=>!Object.hasOwn(q,'solution')),'Answer keys leaked into stored package');
 check(updated.presentation.showFeedback==='never','Deferred feedback not suppressed');
 check(doc.progressionForActivity(activity.id).completionRequirement==='completed','Unverifiable pass gate was not corrected');
 grading=[...holder.querySelectorAll('select')].find(select=>[...select.options].some(option=>option.value==='host'));
 check(grading.value==='host','Deferred mode not selected');
 const correct=holder.querySelector('.q-option-row input[type=radio]');
 check(correct?.hidden===true&&correct.disabled===true,'Hidden answer selector still active');
 const prompt=holder.querySelector('.q-prompt-input');
 prompt.value='Pregunta pendiente de revisión';prompt.dispatchEvent(new Event('input',{bubbles:true}));
 updated=(await doc.readQuestionnaire(activity.id)).payload;
 check(!('solution'in updated.questions[0]),'Editor input reintroduced hidden answer key');
 check(updated.questions[0].prompt==='Pregunta pendiente de revisión','Teacher prompt edit failed');
 const score=scoreQuestionnaire(updated,{q1:{choiceIds:['a']}});
 check(!score.graded&&score.normalized===null,'Player issued an automatic grade for deferred exercise');
 const packaged=await exportP2LRNPackage(doc);
 const reopened=await openP2LRNPackageBytes(packaged.bytes.buffer.slice(packaged.bytes.byteOffset,packaged.bytes.byteOffset+packaged.bytes.length));
 const entity=reopened.entities.get(activity.id),resource=reopened.entities.get(entity.resource);
 const path=resource.representations[0].location.path;
 const payload=JSON.parse(new TextDecoder().decode(await reopened.payload(path).read()));
 check(payload.grading.mode==='host'&&!('solution'in payload.questions[0]),'Export reintroduced a key');
 grading.value='embedded-key';grading.dispatchEvent(new Event('change',{bubbles:true}));
 const automatic=(await doc.readQuestionnaire(activity.id)).payload;
 check(automatic.grading.mode==='embedded-key'&&Boolean(automatic.questions[0].solution),'Could not return to automatic grading');
 const game=doc.addGame(doc.rootId,{kind:'matching',title:'Juego especial'});
 const gameQ=await doc.readQuestionnaire(game.id);
 render(game.id,gameQ.payload,'https://p2lrn.org/renderer/questionnaire/matching');
 const restricted=[...holder.querySelectorAll('select')].find(select=>[...select.options].some(option=>option.value==='host'));
 check(restricted?.querySelector('option[value="host"]')?.disabled===true,'Unplayable special game accepts deferred mode');
 return {mode:'host',noStudentKeys:true,playerUngraded:true,exportValid:true,
   promptEdited:true,progression:'completed',automaticRestored:true,gameRestriction:true};
}

let profile=null,chrome=null,ws=null,server=null;
try{
 server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.end('<!doctype html><html lang="es"><body></body></html>');return;
  }
  const file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  readFile(file).then(bytes=>{
   res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
   res.end(bytes);
  }).catch(()=>{res.writeHead(404);res.end();});
 });
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',()=>ok());});
 const binary=chromePath();if(!binary)throw new Error('Chrome or Edge is required for Studio browser E2E.');
 profile=await mkdtemp(join(tmpdir(),'p2lrn-grading-ui-'));
 chrome=spawn(binary,['--headless=new','--no-first-run','--disable-extensions',
   '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
   {windowsHide:true,stdio:'ignore'});
 let port=0;
 for(let i=0;i<120;i++){
  const file=join(profile,'DevToolsActivePort');
  if(existsSync(file)){port=Number((await readFile(file,'utf8')).split('\n')[0]);break;}
  await sleep(100);
 }
 if(!port)throw new Error('Chrome debugging port unavailable.');
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
 const page=pages.find(item=>item.type==='page');if(!page)throw new Error('No browser page.');
 ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
 const pending=new Map();let next=0;
 ws.onmessage=event=>{
  const message=JSON.parse(event.data),wait=pending.get(message.id);
  if(!wait)return;pending.delete(message.id);
  message.error?wait.reject(new Error(message.error.message)):wait.resolve(message.result);
 };
 const send=(method,params={})=>new Promise((ok,fail)=>{
  const id=++next;pending.set(id,{resolve:ok,reject:fail});ws.send(JSON.stringify({id,method,params}));
 });
 const evaluate=async expression=>{
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result?.value;
 };
 await send('Runtime.enable');await send('Page.enable');
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
 for(let n=0;n<60;n++){if(await evaluate('document.readyState')==='complete')break;await sleep(100);}
 const result=await evaluate('('+scenario.toString()+')()');
 assert(result?.noStudentKeys&&result?.playerUngraded&&result?.automaticRestored&&result?.gameRestriction);
 console.log(JSON.stringify({ok:true,studioGrading:result},null,2));
 console.log('P2LRN Studio deferred grading browser E2E PASS');
}finally{
 try{ws?.close();}catch{}
 try{chrome?.kill();}catch{}
 if(server)await new Promise(resolve=>server.close(resolve));
 if(profile)await rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:200});
}
