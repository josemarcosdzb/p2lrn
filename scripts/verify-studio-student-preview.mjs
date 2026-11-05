// Real Chrome/Edge smoke test: BOTH Studio variants served on local loopback.
// Captures screenshots into the dedicated preview directory for visual comparison.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const flag=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const port=Number(flag('--port','5531'));
const out=flag('--output','');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const executable=[
  process.env.P2LRN_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium','/usr/bin/google-chrome'
].filter(Boolean).find(existsSync);
if(!executable)throw new Error('Se requiere Chrome o Edge en el equipo Windows.');
async function verifyStudentPreview(){
  const root=document.querySelector('p2lrn-studio')?.shadowRoot||document;
  const toolbar=root.querySelector('.p2lrn-studio-ribbon');
  const edit=toolbar?.querySelector('[data-ui-action=edit]');
  const preview=toolbar?.querySelector('[data-ui-action=preview]');
  const content=()=>root.querySelector('[data-studio-html-surface=true]');
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  check(edit&&preview,'Editar and Vista alumno must both be visible');
  check(edit.getClientRects().length&&preview.getClientRects().length,'Mode switch not visible');
  check(edit.textContent.trim()==='Editar','Edit option must retain its label');
  check(preview.textContent.trim()==='Vista alumno','Student preview option must retain its label');
  check(!edit.disabled&&!preview.disabled,'Both modes must be enabled after opening a course');
  check(edit.getAttribute('aria-pressed')==='true'&&preview.getAttribute('aria-pressed')==='false','Initial edit mode is not selected');
  const original=content()?.innerHTML;
  check(original,'No editable lesson available before preview');
  // Add a genuinely unsaved edit before opening the embedded Player.
  const marker=content().ownerDocument.createElement('p');
  marker.dataset.p2lrnPreviewUnsaved='yes';
  marker.textContent='Cambio sin guardar conservado al volver de Vista alumno';
  content().append(marker);
  content().dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'Prueba'}));
  const before=content().innerHTML;
  check(before.includes('p2lrn-preview-unsaved'),'Unsaved marker not inserted');
  preview.click();
  let player=null;
  for(let attempt=0;attempt<90;attempt++){
    player=root.querySelector('[data-preview-stage] p2lrn-player')||
      root.querySelector('[data-stage] p2lrn-player');
    if(player?.shadowRoot?.childNodes.length&&player.getAttribute('src')?.startsWith('blob:')&&preview.getAttribute('aria-pressed')==='true')break;
    await new Promise(resolve=>setTimeout(resolve,125));
  }
  check(player?.shadowRoot?.childNodes.length,'The student Player was not rendered');
  check(player.getAttribute('src')?.startsWith('blob:'),'Player did not receive the current P2LRN course');
  check(preview.textContent.trim()==='Vista alumno','Student view option disappeared in preview mode');
  check(edit.getAttribute('aria-pressed')==='false'&&preview.getAttribute('aria-pressed')==='true','Preview mode was not selected');
  check(root.querySelector('[data-preview-stage]')?.hidden!==true,'Website preview stage is hidden');
  const previewInfo={
    playerRendered:true,
    playerUrl:player.getAttribute('src')?.split(':')[0]+':',
    previewButtonVisible:!!preview.getClientRects().length,
    editButtonVisible:!!edit.getClientRects().length
  };
  edit.click();
  for(let attempt=0;attempt<80;attempt++){
    if(edit.getAttribute('aria-pressed')==='true'&&content()?.isConnected)break;
    await new Promise(resolve=>setTimeout(resolve,125));
  }
  check(edit.getAttribute('aria-pressed')==='true'&&preview.getAttribute('aria-pressed')==='false','Return to editing did not select Editar');
  check(content()?.innerHTML===before,'Unsaved changes were lost during the preview round-trip');
  const undo=toolbar.querySelector('[data-ui-command=undo]');
  const redo=toolbar.querySelector('[data-ui-command=redo]');
  check(undo&&!undo.disabled,'Existing lesson undo history was lost after student preview');
  undo.click();
  check(!content()?.innerHTML.includes('p2lrn-preview-unsaved'),'Undo did not restore the previous lesson after returning');
  redo.click();
  check(content()?.innerHTML.includes('p2lrn-preview-unsaved'),'Redo was lost after the student preview');
  check(preview.textContent.trim()==='Vista alumno','Vista alumno is not visible again after returning');
  check(root.querySelector('[data-preview-stage]')?.hidden!==false,'Website preview stage remains visible during edit mode');
  return {ok:true,...previewInfo,lessonPreserved:true,returnedToEdit:true};
}

let profile=null,browser=null,ws=null;
try{
  profile=await mkdtemp(join(tmpdir(),'p2lrn-studio-local-'));
  browser=spawn(executable,[
    '--headless=new','--no-first-run','--disable-extensions','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'
  ],{windowsHide:true,stdio:'ignore'});
  let debugPort=0;
  for(let i=0;i<100;i++){
    const path=join(profile,'DevToolsActivePort');
    if(existsSync(path)){debugPort=Number((await readFile(path,'utf8')).split('\n')[0]);break;}
    await sleep(125);
  }
  assert(debugPort,'Chrome did not expose a debugger.');
  const pages=await(await fetch('http://127.0.0.1:'+debugPort+'/json')).json();
  const page=pages.find(x=>x.type==='page');
  assert(page?.webSocketDebuggerUrl,'Chrome has no inspectable page');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
  let id=0;const pending=new Map();
  ws.onmessage=evt=>{
    const obj=JSON.parse(evt.data),task=pending.get(obj.id);
    if(!task)return;
    pending.delete(obj.id);
    if(obj.error)task.reject(new Error(obj.error.message));
    else task.resolve(obj.result);
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}));
  });
  const evalExpr=async(expression)=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result?.value;
  };
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});
  const paths=[
    {id:'web',path:'/studio/',ready:"document.documentElement.dataset.p2lrnStudioReady==='true'",
      surface:"document.querySelector('.p2lrn-studio-ribbon')"},
    {id:'npm',path:'/npm-studio/',ready:"document.documentElement.dataset.previewReady==='true'",
      surface:"document.querySelector('p2lrn-studio')?.shadowRoot?.querySelector('.p2lrn-studio-ribbon')"}
  ];
  const results=[];
  for(const sample of paths){
    await send('Page.navigate',{url:'http://127.0.0.1:'+port+sample.path});
    let ready=false;
    for(let i=0;i<160;i++){
      ready=await evalExpr(sample.ready).catch(()=>false);
      if(ready)break;
      await sleep(160);
    }
    const expression="(()=>{const t="+sample.surface+"; return {ready:"+sample.ready+
      ",title:document.title,ribbon:!!t,tabs:t?[...t.querySelectorAll('[role=tab]')].map(x=>x.textContent.trim()):[],"+
      "actions:t?[...t.querySelectorAll('[data-ui-action]')].map(x=>x.dataset.uiAction):[],"+
      "activityPicker:!!t?.querySelector('button[title*=Lecciones]'),"+
      "currentStatus:document.querySelector('#status')?.textContent||document.querySelector('[data-studio-status]')?.textContent,"+
      "stage:!!(document.querySelector('[data-editor-stage]')||document.querySelector('p2lrn-studio')?.shadowRoot?.querySelector('[data-stage]'))};})()";
    const info=await evalExpr(expression);
    assert.equal(ready,true,sample.id+' did not initialize: '+JSON.stringify(info));
    assert.equal(info.ribbon,true,sample.id+' missing unified toolbar');
    assert(info.tabs.includes('Inicio')&&info.tabs.includes('Insertar')&&info.tabs.includes('Diseño'),
      sample.id+' lacks a shared tab');
    assert(info.stage,sample.id+' missing the Studio editing stage');
    const studentPreview=await evalExpr('('+verifyStudentPreview.toString()+')()');
    assert(studentPreview?.ok,sample.id+' student preview scenario failed');
    info.studentPreview=studentPreview;
    if(out){
      await sleep(500);
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(join(out,'qa-'+sample.id+'.png'),Buffer.from(shot.data,'base64'));
    }
    results.push({id:sample.id,...info});
  }
  assert.deepEqual(results[0].tabs,results[1].tabs,'Web and NPM UI tabs differ');
  console.log(JSON.stringify({ok:true,port,results,
    screenshots:out?['qa-web.png','qa-npm.png']:[]},null,2));
}finally{
  try{ws?.close();}catch{}
  try{browser?.kill();}catch{}
  if(profile)await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:150}).catch(()=>{});
}
