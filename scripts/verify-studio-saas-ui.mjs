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
async function inspectSaasCapabilities(){
  const root=document.querySelector('p2lrn-studio')?.shadowRoot||document;
  const check=(value,message)=>{if(!value)throw Error(message);};
  const ribbon=root.querySelector('.p2lrn-studio-ribbon');
  check(ribbon,'No unified toolbar');
  const workspace=root.querySelector('.p2lrn-studio-workspace');
  const outline=workspace?.querySelector('.p2lrn-studio-outline');
  const outlineToggle=ribbon.querySelector('.p2lrn-outline-toggle');
  check(outline&&outlineToggle,'Outline collapse toggle is missing');
  check(!outline.getClientRects().length,'Mobile outline should initially be collapsed');
  check(outlineToggle.getAttribute('aria-expanded')==='false','Outline collapsed state is not communicated');
  outlineToggle.click();
  check(outline.getClientRects().length>0&&outlineToggle.getAttribute('aria-expanded')==='true','Outline cannot be opened');
  outlineToggle.click();
  check(!outline.getClientRects().length,'Outline cannot be closed');
  const fileMenu=ribbon.querySelector('.p2lrn-file-menu');
  const summary=fileMenu.querySelector('summary');
  const fileOps=[...fileMenu.querySelectorAll('[data-ui-action]')].map(el=>el.dataset.uiAction);
  for(const required of ['create','open','save','export','recoverDraft'])check(fileOps.includes(required),'File menu lost '+required);
  summary.click();
  check(fileMenu.open,'File menu cannot be opened');
  summary.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  check(!fileMenu.open,'Escape did not close File menu');
  const details=root.querySelector('.p2lrn-studio-lesson-properties');
  const lesson=root.querySelector('[data-studio-html-surface=true]');
  check(details&&lesson,'Lesson properties or body disappeared');
  check(!details.open,'Lesson properties should initially be compact');
  const original=lesson.innerHTML;
  details.querySelector('summary').click();
  check(details.open&&!!details.querySelector('[contenteditable=true]'),'Cannot edit title and description');
  details.querySelector('summary').click();
  check(lesson.innerHTML===original,'Toggling lesson properties changed its content');
  const media=root.querySelector('.p2lrn-lesson-media-options');
  check(media&&!media.open,'Media options should be initially compact');
  media.querySelector('summary').click();
  check(media.open,'Media options cannot be opened');
  check(media.querySelector('[data-lesson-image-bigger]'),'Media resizing tools were removed');
  check(media.querySelector('[data-lesson-image-remove]'),'Media removal was removed');
  check(media.querySelector('[data-lesson-video-poster]'),'Video cover control was removed');
  media.querySelector('summary').click();
  const tab=name=>ribbon.querySelector('[role=tab][aria-controls$="-'+name+'"]');
  tab('design').click();
  const design=tab('design').getAttribute('aria-controls');
  const panel=root.getElementById?root.getElementById(design):root.querySelector('#'+design);
  check(panel.querySelector('.p2lrn-ribbon-caption')?.textContent.includes('Selecciona un objeto'),'No contextual Design empty state');
  tab('insert').click();
  const insertImage=ribbon.querySelector('[data-ui-action=insertImage]');
  const insertVideo=ribbon.querySelector('[data-ui-action=insertVideo]');
  check(insertImage&&!insertImage.disabled&&insertVideo&&!insertVideo.disabled,'Image/Video insertion missing in Insertar');
  let imageClicks=0,videoClicks=0;
  const imagePicker=media.parentElement.querySelector('[data-lesson-image-file]');
  const videoPicker=media.parentElement.querySelector('[data-lesson-video-file]');
  check(imagePicker&&videoPicker,'Media file pickers were removed');
  const oldImage=imagePicker.click,oldVideo=videoPicker.click;
  imagePicker.click=()=>{imageClicks++;};
  videoPicker.click=()=>{videoClicks++;};
  try{insertImage.click();insertVideo.click();}finally{imagePicker.click=oldImage;videoPicker.click=oldVideo;}
  check(imageClicks===1&&videoClicks===1,'Ribbon does not route to the media upload tools');
  ribbon.querySelector('[data-ui-layout=table]').click();
  const table=lesson.querySelector('table[data-p2lrn-layout=table]');
  check(table,'Table insert stopped working');
  table.rows[1].cells[0].click();
  const tableTab=tab('table');
  check(!tableTab.hidden,'Contextual Table tab is not shown');
  tab('design').focus();
  tab('design').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  check(tableTab.getAttribute('aria-selected')==='true','Arrow-right cannot reach the contextual Table tab');
  tableTab.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
  check(tab('design').getAttribute('aria-selected')==='true','Arrow-left cannot return to Design');
  const visibleActions=[...ribbon.querySelectorAll('button')].filter(b=>b.getClientRects().length&&!b.disabled);
  check(visibleActions.every(el=>{const r=el.getBoundingClientRect();return r.height>=24&&r.width>=24;}),'A visible toolbar control is below 24 CSS pixels');
  return {ok:true,outline:true,fileMenuKeyboard:true,lessonProperties:true,mediaOptions:true,mediaInsert:true,contextTabs:true,targetSizes:true};
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
    if(out){
      await sleep(500);
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(join(out,'qa-'+sample.id+'.png'),Buffer.from(shot.data,'base64'));
    }

    // Reproducible visual sweep: desktop, tablet, mobile and each ribbon tab.
    info.saasAudit=[];
    for(const v of [
      {label:'desktop',width:1440,height:960},
      {label:'tablet',width:860,height:900},
      {label:'mobile',width:390,height:840}
    ]){
      await send('Emulation.setDeviceMetricsOverride',{width:v.width,height:v.height,deviceScaleFactor:1,mobile:false});
      await sleep(140);
      for(const ribbonTab of ['home','insert','design']){
        const detail=await evalExpr("(()=>{"+
          "const root=document.querySelector('p2lrn-studio')?.shadowRoot||document;"+
          "const ribbon=root.querySelector('.p2lrn-studio-ribbon');"+
          "const tab=ribbon.querySelector('[role=tab][aria-controls$=-"+ribbonTab+"]');"+
          "tab.click();"+
          "const top=ribbon.querySelector('.p2lrn-ribbon-top');"+
          "const actions=ribbon.querySelector('.p2lrn-ribbon-actions');"+
          "const panel=ribbon.querySelector('.p2lrn-ribbon-panel:not([hidden])');"+
          "const boxes=(parent)=>[...parent?.querySelectorAll('button,select,summary')||[]].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');"+
          "const rect=e=>{const r=e?.getBoundingClientRect();return r?{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}:null};"+
          "const offsets=boxes(actions).map(e=>Math.round(e.getBoundingClientRect().y));"+
          "const headerActions=[...new Set(offsets)].length;"+
          "const noLabel=boxes(ribbon).filter(e=>!e.textContent.trim()&&!e.title&&!e.getAttribute('aria-label')).map(e=>e.outerHTML.slice(0,120));"+
          "const header=rect(top),toolbar=rect(ribbon),controlPanel=rect(panel);"+
          "const tooSmall=boxes(ribbon).filter(e=>e.getBoundingClientRect().height<29).map(e=>e.title||e.textContent.trim()).slice(0,10);"+
          "const body=document.body;"+
          "return {tab:'"+ribbonTab+"',screen:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+3,"+
          "scrollWidth:document.documentElement.scrollWidth,"+
          "header,toolbar,controlPanel,headerActionRows:headerActions,"+
          "headerButtons:boxes(actions).length,toolbarHeight:toolbar?.h,toolbarButtonCount:boxes(ribbon).length,"+
          "tinyControls:tooSmall,unlabeled:noLabel,stage:rect(root.querySelector('[data-editor-stage],[data-stage]')),"+
          "side:rect(root.querySelector('[data-tree]'))};})()");
        info.saasAudit.push({viewport:v.label,...detail});
        if(out){
          const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
          await writeFile(join(out,'saas-'+sample.id+'-'+v.label+'-'+ribbonTab+'.png'),Buffer.from(shot.data,'base64'));
        }
      }
    }

    for(const v of info.saasAudit){assert(!v.overflow,sample.id+' horizontal page overflow at '+v.viewport+' '+v.tab);if(v.viewport==='mobile')assert(v.toolbarHeight<=280,sample.id+' mobile ribbon is too tall');}
    const capabilities=await evalExpr('('+inspectSaasCapabilities.toString()+')()');
    assert(capabilities?.ok,sample.id+' SaaS UI actions were not verified');
    info.capabilities=capabilities;
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
