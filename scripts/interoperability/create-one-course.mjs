// Creates ONE course by interacting with the actual hosted Studio DOM in Chrome.
// No direct course-model mutation, no fake LMS, no per-platform package variants.
// All evidence stays on the Windows runner in Downloads/P2LRN-INTEROP-*.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,rename,stat,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createInteropStudioServer} from './studio-lab-server.mjs';
import {launchInteropChrome} from './chrome-visual.mjs';

const cli=process.argv.slice(2);
const flag=(name)=>{const i=cli.indexOf(name);return i>=0?cli[i+1]:null;};
const site=resolve(flag('--site')||'.netlify-cdn');
const output=resolve(flag('--output')||'.interop-evidence');
const repo=resolve(flag('--repo')||process.cwd());
const screenshots=join(output,'studio-visual-evidence');
const downloads=join(output,'downloads');
const coursePath=join(output,'seguridad-informatica.p2lrn');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const digestFile=async path=>sha(await readFile(path));
await mkdir(output,{recursive:true});
const report={
  schema:'https://p2lrn.org/schema/interoperability-real-qa/1',
  type:'REAL_STUDIO_BROWSER_AUTHORING',status:'IN_PROGRESS',
  startedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA??null,
  branch:process.env.GITHUB_REF_NAME||'mejorastudio',
  courseName:'Seguridad informática y prevención de riesgos en el trabajo',
  courseFile:'seguridad-informatica.p2lrn',
  courseSha256:null,sourceImports:[],stages:[],destinationResults:[],
  contentAdaptations:0,courseVariantsPerDestination:0,
};
let chrome=null,server=null;
const persist=async()=>writeFile(join(output,'course-creation-evidence.json'),JSON.stringify(report,null,2)+'\n');
const stage=async(name,fn,{screenshot=false}={})=>{
  const row={name,state:'IN_PROGRESS',startedAt:new Date().toISOString()};
  report.stages.push(row);console.log('P2LRN_REAL_STUDIO_STAGE='+name);
  try{
    const result=await fn();
    row.state='PASS';row.completedAt=new Date().toISOString();
    if(result!==undefined)row.detail=result;
    if(screenshot&&chrome)row.screenshot=await chrome.screenshot(name);
    await persist();
    return result;
  }catch(error){
    row.state='FAIL';row.error=String(error?.message||error).slice(0,1100);
    row.completedAt=new Date().toISOString();await persist();throw error;
  }
};
const js=value=>JSON.stringify(value);
const click=async selector=>{
  const ok=await chrome.evaluate("(()=>{const el=document.querySelector("+js(selector)+");if(!el||el.disabled)throw Error('Button is missing/disabled: '+ "+js(selector)+");el.click();return true})()");
  assert.equal(ok,true);
};
const clickAdd=async kind=>{
  await click('[data-add-content]');
  await chrome.wait("document.querySelector('[data-add-dialog]')?.open===true",{label:'add-content dialog'});
  await click('[data-add-kind='+kind+']');
};
const selectType=async(type,last=false)=>{
  await chrome.evaluate("(()=>{const items=[...document.querySelectorAll('[data-tree] button[data-entity-id]')].filter(b=>b.querySelector('.type')?.textContent==="+js(type)+");const selected=items["+(last?"items.length-1":"0")+"];if(!selected)throw Error('Missing Studio outline type: '+"+js(type)+");selected.click();return true})()");
  await chrome.wait("document.querySelector('[data-editor-stage] .studio-title')!==null",{label:'Studio title'});
};
const fillEditable=async(selector,text)=>{
  const found=await chrome.evaluate("(()=>{const el=document.querySelector("+js(selector)+");if(!el?.isContentEditable)throw Error('Not an editable Studio element: '+ "+js(selector)+");el.focus();const range=document.createRange();range.selectNodeContents(el);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);return true})()");
  assert(found);
  await chrome.send('Input.insertText',{text});
  await chrome.evaluate("(()=>{const el=document.querySelector("+js(selector)+");el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));return true})()");
  return chrome.evaluate("document.querySelector("+js(selector)+")?.textContent");
};
const fillInput=async(selector,text)=>{
  const found=await chrome.evaluate("(()=>{const el=document.querySelector("+js(selector)+");if(!el||!('value' in el))throw Error('Missing Studio field '+ "+js(selector)+");el.focus();if(typeof el.select==='function')el.select();return true})()");
  assert(found);
  await chrome.send('Input.insertText',{text:String(text)});
  await chrome.evaluate("(()=>{const el=document.querySelector("+js(selector)+");el.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
};
const upload=async(selector,url,name,type)=>{
  const evalCode="(async()=>{const response=await fetch("+js(url)+");if(!response.ok)throw Error('Upload fixture missing: '+response.status);const blob=await response.blob();const transfer=new DataTransfer();transfer.items.add(new File([blob],"+js(name)+",{type:"+js(type)+"}));const input=document.querySelector("+js(selector)+");if(!input||input.type!=='file')throw Error('Missing Studio media picker: '+"+js(selector)+");input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return {name:input.getAttribute('data-external-file')!==null?'external':'media',bytes:blob.size}})()";
  return chrome.evaluate(evalCode);
};
async function waitFile(pattern,{after=[]}={}){
  for(let i=0;i<200;i++){
    const files=(await readdir(downloads)).filter(name=>pattern.test(name)&&!name.endsWith('.crdownload')&&!after.includes(name));
    if(files.length){const match=join(downloads,files.sort().at(-1));const info=await stat(match);if(info.size>500)return match;}
    await new Promise(done=>setTimeout(done,100));
  }
  throw Error('Studio export did not download a complete .p2lrn');
}
async function setCourseTitle(){
  await selectType('course');
  const value=await fillEditable('[data-editor-stage] .studio-title',report.courseName);
  assert(value.includes('Seguridad informática'));
  await fillEditable('[data-editor-stage] .studio-description','Curso original de prueba: phishing, contraseñas, ergonomía informática, prevención de riesgos y respuesta a incidentes.');
}
async function editLesson(text,title){
  await fillEditable('[data-editor-stage] .studio-title',title);
  await fillEditable('[data-editor-stage] [data-studio-html-surface="true"]',text);
}
async function createMediaLesson(){
  await selectType('activity');
  await editLesson(
    'Seguridad informática en el trabajo\n\n1. Verifica el remitente antes de abrir enlaces o adjuntos.\n2. Usa autenticación multifactor y contraseñas únicas.\n3. Bloquea el equipo y comunica cualquier incidente.\n4. Ajusta pantalla, silla y pausas para evitar fatiga y riesgos ergonómicos.\n\nPractica con las fichas y revisa la tabla de medidas preventivas.',
    '01 · Reconocer riesgos y prevenir incidentes',
  );
  await click('[role=tab][aria-controls*="-insert"]');
  await click('[data-ui-layout=table]');
  await chrome.wait("document.querySelector('[data-studio-html-surface] table')!==null",{label:'inserted risk table'});
  await click('[data-ui-layout=drag-drop]');
  await chrome.wait("document.querySelector('[data-studio-html-surface] [data-p2lrn-dnd=\"1\"]')!==null",{label:'drag-drop activity'});
  const media=await chrome.evaluate("(async()=>{"+
    "const canvas=document.createElement('canvas');canvas.width=900;canvas.height=500;"+
    "const c=canvas.getContext('2d');c.fillStyle='#eaf4fb';c.fillRect(0,0,900,500);"+
    "c.fillStyle='#164e63';c.font='bold 43px system-ui';c.fillText('Seguridad digital en el trabajo',30,70);"+
    "c.fillStyle='#0c4a6e';c.font='26px system-ui';"+
    "['Contraseñas únicas + MFA','Detener el phishing','Informar de incidentes','Ergonomía y pausas'].forEach((text,i)=>{"+
    "c.fillStyle=i%2?'#d1fae5':'#bfdbfe';c.fillRect(30,100+i*94,840,75);c.fillStyle='#0f172a';c.fillText(text,58,145+i*94);});"+
    "const blob=await new Promise(ok=>canvas.toBlob(ok,'image/png'));"+
    "const transfer=new DataTransfer();transfer.items.add(new File([blob],'mapa-riesgos.png',{type:'image/png'}));"+
    "const picker=document.querySelector('[data-lesson-image-file]');if(!picker)throw Error('No Studio image picker');"+
    "picker.files=transfer.files;picker.dispatchEvent(new Event('change',{bubbles:true}));return {bytes:blob.size};})()");
  await chrome.wait("document.querySelector('[data-studio-html-surface] img')!==null",{label:'authored lesson image',timeout:12000});
  await upload('[data-lesson-video-file]','/interop/sources/video.webm','demostracion-seguridad.webm','video/webm');
  await chrome.wait("document.querySelector('[data-studio-html-surface] video[data-p2lrn-lesson-video]')!==null",{label:'lesson video',timeout:20000});
  const detail=await chrome.evaluate("(()=>{const s=document.querySelector('[data-studio-html-surface]');return {paragraphs:s.querySelectorAll('p,div').length,tables:s.querySelectorAll('table').length,images:s.querySelectorAll('img').length,videos:s.querySelectorAll('video').length,dragDrop:s.querySelectorAll('[data-p2lrn-dnd=\"1\"]').length}})()");
  assert(detail.tables>0&&detail.images>0&&detail.videos>0&&detail.dragDrop>0);
  return {mediaImageBytes:media.bytes,...detail};
}
async function createSecondLesson(){
  await clickAdd('lesson');
  await chrome.wait("document.querySelector('[data-studio-status]')?.textContent.includes('Lección añadida')",{label:'second lesson created'});
  await editLesson('Qué hacer ante una alerta de ciberseguridad\n\nAísla el incidente sin borrar evidencias. Notifica al responsable de seguridad. No compartas credenciales. Registra la hora y sigue el procedimiento de continuidad. En un puesto de trabajo, protege también la salud: ajusta tu postura y realiza pausas.','02 · Actuar ante incidentes y ergonomía');
  const size=await chrome.evaluate("document.querySelector('[data-studio-html-surface]')?.textContent?.length");
  assert(size>170);return {lessonTextLength:size};
}
async function createMatchingGame(){
  await clickAdd('matching');
  await chrome.wait("document.querySelector('.questionnaire-visual-editor .q-pair-row')!==null",{label:'matching game editor'});
  await fillInput('.questionnaire-visual-editor .q-prompt-input','Relaciona el riesgo con la medida preventiva');
  const pairValues=[
    ['Correo fraudulento','Verificar remitente y enlace'],
    ['Contraseña compartida','Usar credenciales individuales'],
    ['Pantalla mal colocada','Ajustar altura y distancia'],
  ];
  const original=await chrome.evaluate("document.querySelectorAll('.questionnaire-visual-editor .q-pair-row').length");
  if(original<pairValues.length){
    for(let k=original;k<pairValues.length;k++){
      await chrome.evaluate("(()=>{const b=[...document.querySelectorAll('.questionnaire-visual-editor button')].find(x=>x.textContent.includes('Añadir pareja'));if(!b)throw Error('Matching add pair control missing');b.click();return true})()");
    }
  }
  for(let i=0;i<pairValues.length;i++){
    await fillInput('.questionnaire-visual-editor .q-pair-row:nth-child('+(i+1)+') input:nth-of-type(1)',pairValues[i][0]);
    await fillInput('.questionnaire-visual-editor .q-pair-row:nth-child('+(i+1)+') input:nth-of-type(2)',pairValues[i][1]);
  }
  return {pairs:await chrome.evaluate("document.querySelectorAll('.questionnaire-visual-editor .q-pair-row').length")};
}
async function createQuiz(title,mode='embedded-key'){
  await clickAdd('questionnaire');
  await chrome.wait("document.querySelector('.questionnaire-visual-editor .q-card')!==null",{label:'new Studio questionnaire'});
  await fillInput('.questionnaire-visual-editor .q-settings input[type=text]:first-of-type',title);
  await fillInput('.questionnaire-visual-editor .q-prompt-input','¿Qué debes hacer si recibes un mensaje que solicita tu contraseña?');
  const choices=await chrome.evaluate("document.querySelectorAll('.questionnaire-visual-editor .q-option-row input[type=text]').length");
  assert(choices>=2,'Questionnaire lacks two answers');
  await fillInput('.questionnaire-visual-editor .q-option-row:nth-child(1) input[type=text]','No introducir contraseñas y avisar al responsable');
  await fillInput('.questionnaire-visual-editor .q-option-row:nth-child(2) input[type=text]','Enviar la contraseña para verificar la identidad');
  if(mode==='host'){
    const chose=await chrome.evaluate("(()=>{const s=[...document.querySelectorAll('.questionnaire-visual-editor .q-settings label')].find(e=>e.textContent.includes('Modo de corrección'))?.querySelector('select');if(!s)throw Error('Host grading control missing');s.value='host';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
    assert(chose);
    await chrome.wait("[...document.querySelectorAll('.questionnaire-visual-editor .q-settings select')].some(s=>s.value==='host')",{label:'host-graded final assessment'});
  }
  return {title,mode,questions:await chrome.evaluate("document.querySelectorAll('.questionnaire-visual-editor .q-card').length")};
}
async function importSample(file){
  await selectType('unit');
  const before=await chrome.evaluate("document.querySelectorAll('[data-tree] button[data-entity-id]').length");
  await clickAdd('external');
  const sent=await upload('[data-external-file]','/interop/sources/'+file,file,'application/vnd.p2lrn+zip');
  await chrome.wait("document.querySelectorAll('[data-tree] button[data-entity-id]').length>"+before,{label:'Studio imported '+file,timeout:50000});
  const result={name:file,bytes:sent.bytes,createdNewTreeNodes:true};
  report.sourceImports.push(result);return result;
}
async function exportOne(){
  const prior=await readdir(downloads);
  await click('[data-export]');
  await chrome.wait("document.querySelector('[data-studio-status]')?.textContent.includes('Paquete exportado y verificado')",{timeout:45000,label:'Studio export verified'});
  const downloaded=await waitFile(/\.p2lrn$/i,{after:prior});
  const originalHash=await digestFile(downloaded);
  await rename(downloaded,coursePath);
  const actual=await readFile(coursePath);
  assert(actual.byteLength>20000,'Single course unusually small for real H5P and SCORM');
  assert.equal(sha(actual),originalHash,'Browser download was altered during naming');
  try{await chmod(coursePath,0o444);}catch{}
  report.courseSha256=originalHash;report.courseBytes=actual.byteLength;
  return {file:coursePath,sha256:originalHash,bytes:actual.byteLength};
}
async function validateOnePackage(){
  const file=await readFile(coursePath);
  const {validatePackageBytes}=await import('../../packages/toolkit/dist/core/validator.js');
  const parsed=validatePackageBytes(file,{strictProfiles:true,validateProfilePayloads:true});
  const entities=parsed.graph?.entities??[];
  const resources=entities.filter(e=>e.type==='resource');
  const text=JSON.stringify({profiles:parsed.manifest?.profiles,entities}).toLowerCase();
  const hasH5P=/h5p/.test(text),hasSCORM=/scorm/.test(text);
  const count=entities.filter(e=>e.type==='activity').length;
  assert(count>=7,'Course has too few activities: '+count);
  assert(hasH5P&&hasSCORM,'Exported course is missing real H5P or SCORM data');
  const tampered=Buffer.from(file);
  tampered[Math.floor(tampered.length*0.6)]^=0x01;
  let rejected=false;
  try{validatePackageBytes(tampered,{strictProfiles:true,validateProfilePayloads:true});}catch{rejected=true;}
  if(!rejected)throw new Error('Integrity defect: corruption of the package was not rejected');
  return {activityCount:count,resourceCount:resources.length,hasH5P,hasSCORM,tamperRejected:true};
}
async function independentWeb(){
  const received=Buffer.from(await(await fetch(server.base+'/interop/seguridad-informatica.p2lrn')).arrayBuffer());
  assert.equal(sha(received),report.courseSha256,'Independent Host did not serve EXACT original bytes');
  await chrome.navigate(server.base+'/demo/?src='+encodeURIComponent('/interop/seguridad-informatica.p2lrn'));
  await chrome.wait("document.querySelector('p2lrn-player')?.shadowRoot!=null",{timeout:35000,label:'independent P2LRN Player'});
  const state=await chrome.evaluate("(()=>{const p=document.querySelector('p2lrn-player');return {src:p?.getAttribute('src'),shadow:p?.shadowRoot?.textContent?.slice(0,650)}})()");
  assert(state.src||state.shadow,'Independent web did not initialize the Player');
  return {sameSha256:sha(received),bytes:received.length,playerAttached:true,screenReadOnly:true};
}
try{
  server=await createInteropStudioServer({siteRoot:site,repoRoot:repo,coursePath});
  chrome=await launchInteropChrome({downloadDir:downloads,evidenceDir:screenshots});
  report.browserExecutable=chrome.executable;report.localBase=server.base;
  await stage('01-studio-launch',async()=>{
    await chrome.navigate(server.base+'/studio/');
    await chrome.wait("document.documentElement.dataset.p2lrnStudioReady==='true'&&Boolean(document.querySelector('[data-tree] button[data-entity-id]'))",{timeout:50000,label:'real hosted Studio initialized'});
    return {ui:'hosted-studio',createdBy:'actual-browser-commands'};
  },{screenshot:true});
  await stage('02-course-metadata',setCourseTitle,{screenshot:true});
  await stage('03-lesson-table-image-video-dnd',createMediaLesson,{screenshot:true});
  await stage('04-second-authored-lesson',createSecondLesson,{screenshot:true});
  await stage('05-native-matching-game',createMatchingGame,{screenshot:true});
  await stage('06-native-self-check',()=>createQuiz('Autoevaluación de prevención','embedded-key'),{screenshot:true});
  await stage('07-genuine-h5p-import',()=>importSample('h5p-arithmetic.p2lrn'),{screenshot:true});
  await stage('08-genuine-scorm-import',()=>importSample('snack-safety-scorm12.p2lrn'),{screenshot:true});
  await stage('09-host-graded-final-assessment',()=>createQuiz('Evaluación final de seguridad informática','host'),{screenshot:true});
  await stage('10-export-once',exportOne,{screenshot:true});
  await stage('11-validate-real-package-integrity',validateOnePackage);
  await stage('12-independent-web-original-bytes',independentWeb,{screenshot:true});
  report.status='PARTIAL_REAL_EVIDENCE';
}catch(error){
  report.status='FAILED_AT_STAGE';report.lastError=String(error?.message||error).slice(0,1300);
  console.error('P2LRN_REAL_STUDIO_ERROR='+report.lastError);
  if(chrome)try{await chrome.screenshot('failure-last-state');}catch{}
  process.exitCode=1;
}finally{
  report.endedAt=new Date().toISOString();
  if(server)report.importEvidence=server.report.imports;
  await persist();
  if(chrome)await chrome.close();
  if(server)await server.close();
}
console.log('P2LRN_REAL_STUDIO_REPORT='+JSON.stringify(report));
if(!report.courseSha256)console.log('P2LRN_REAL_STUDIO_SINGLE_COURSE_NOT_YET_EXPORTED');
