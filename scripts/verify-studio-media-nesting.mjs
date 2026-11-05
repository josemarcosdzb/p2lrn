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
const REAL_WEBM_BASE64=(await readFile(new URL('./studio-media-test.webm',import.meta.url))).toString('base64');
const executable=[
  process.env.P2LRN_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium','/usr/bin/google-chrome'
].filter(Boolean).find(existsSync);
if(!executable)throw new Error('Se requiere Chrome o Edge en el equipo Windows.');
function inspectVisibleContextMenu(){
  const root=document.querySelector('p2lrn-studio')?.shadowRoot||document;
  const context=root.querySelector('[data-studio-context-tools]');
  const menu=context?.querySelector('[data-studio-context-menu=columnas]');
  if(!menu||context.hidden)return {ok:false,reason:'Contextual table is not active'};
  menu.querySelector('summary').click();
  const pop=menu.querySelector('.p2lrn-context-menu-pop');
  const rect=pop?.getBoundingClientRect();
  const button=pop?.querySelector('button');
  const hit=button?.getBoundingClientRect();
  const point=hit?{x:hit.left+Math.min(24,hit.width/2),y:hit.top+Math.min(12,hit.height/2)}:null;
  const found=point?(root.elementFromPoint?.(point.x,point.y)||document.elementFromPoint(point.x,point.y)):null;
  return {
    ok:menu.open&&!!rect&&rect.height>60&&!!button?.getClientRects().length,
    visible:!!button?.getClientRects().length,
    rect:rect?{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)}:null,
    hitButton:!!(found&&(found===button||button.contains(found))),
    menuOpen:menu.open,
    viewport:{width:innerWidth,height:innerHeight}
  };
}

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
  for(const required of ['create','open','export','recoverDraft'])check(fileOps.includes(required),'File menu lost '+required);
  for(const unique of ['create','open','save','export'])check(ribbon.querySelectorAll('[data-ui-action='+unique+']').length===1,'Duplicated '+unique+' command');
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
  check(media&&media.hidden,'Media properties should be hidden until a resource is selected');
  check(media.querySelector('[data-lesson-image-bigger]'),'Media resizing tools were removed');
  check(media.querySelector('[data-lesson-image-remove]'),'Media removal was removed');
  check(media.querySelector('[data-lesson-video-poster]'),'Video cover control was removed');
  check(media.parentElement.querySelector('[data-insert-lesson-image]').hidden,'Duplicate media insert command is still visible');
  check(media.parentElement.querySelector('[data-insert-lesson-video]').hidden,'Duplicate video insert command is still visible');
  const tab=name=>ribbon.querySelector('[role=tab][aria-controls$="-'+name+'"]');
  check(tab('home')&&tab('insert')&&!tab('design')&&!tab('table'),'The editor still has duplicate formatting tabs');
  const context=ribbon.querySelector('[data-studio-context-tools]');
  check(context&&context.hidden,'Context inspector must stay hidden without a selection');
  const more=ribbon.querySelector('.p2lrn-format-more-toggle');
  const extra=ribbon.querySelector('.p2lrn-format-more-panel');
  tab('home').click();
  check(more&&more.getClientRects().length&&more.getAttribute('aria-expanded')==='false','Mobile More format control is not available');
  more.click();
  check(more.getAttribute('aria-expanded')==='true'&&extra.getClientRects().length>0,'More format controls cannot expand');
  check(extra.querySelector('[aria-label="Tipo de letra"]')?.getClientRects().length>0,'Font settings are inaccessible from Formato');
  check(extra.querySelector('[data-ui-command=undo]'),'Undo disappeared from formatting tools');
  more.click();check(more.getAttribute('aria-expanded')==='false'&&extra.dataset.expanded==='false','More format controls cannot collapse');
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
  check(!context.hidden,'Clicking a table must expose its styles and structure');
  check(tab('home').getAttribute('aria-selected')==='true','Table selection did not return to Formato');
  check(context.querySelectorAll('[data-studio-advanced-action=rowBelow]').length===1,'Table operation duplicated');
  check(['filas','columnas','celda','fondo','objeto','tamano'].every(k=>context.querySelector('[data-studio-context-menu='+k+']')),'Grouped context menus are incomplete');
  check(context.querySelector('[data-studio-advanced-action=width]')&&context.querySelector('.p2lrn-object-colors'),'Object layout and palette are not together');
  check(ribbon.querySelector('[data-ui-command=bold]').getClientRects().length>0,'Text styling is not available alongside table formatting');
  check(root.querySelectorAll('[data-object-action=duplicate],[data-object-action=rowBelow]').length===0,'Floating toolbar still duplicates editing commands');
  const cell=table.rows[1].cells[0];cell.textContent='Texto de tabla editable';
  cell.dispatchEvent(new Event('input',{bubbles:true}));
  const range=cell.ownerDocument.createRange();range.selectNodeContents(cell);
  const selection=(typeof root.getSelection==='function'?root.getSelection():null)||cell.ownerDocument.getSelection();
  selection.removeAllRanges();selection.addRange(range);
  root.dispatchEvent(new Event('selectionchange'));cell.ownerDocument.dispatchEvent(new Event('selectionchange'));
  ribbon.querySelector('[data-ui-command=bold]').click();
  check(/<b>|<strong>|font-weight:\\s*bold|font-weight:\\s*700/i.test(cell.innerHTML),'The same Formato tab cannot apply bold to text inside a table');
  check(!context.hidden&&tab('home').getAttribute('aria-selected')==='true','Formatting text hid the table inspector');
  const rowMenu=context.querySelector('[data-studio-context-menu=filas]');
  check(rowMenu&&!rowMenu.open,'The Rows menu should start closed');
  rowMenu.querySelector('summary').click();
  check(rowMenu.open,'Rows menu could not open');
  const addRow=rowMenu.querySelector('[data-studio-advanced-action=rowBelow]');
  check(addRow.getClientRects().length>0,'Insert Row is not visible inside the opened Rows menu');
  addRow.click();
  check(!rowMenu.open,'Rows menu stayed open after inserting a row');
  check(table.rows.length===4,'Inserting row from Formato did not work');
  const backgroundMenu=context.querySelector('[data-studio-context-menu=fondo]');
  check(backgroundMenu,'The same context panel lacks block fill colors');
  backgroundMenu.querySelector('summary').click();
  check(backgroundMenu.open,'Block background menu could not open');
  const blue=[...backgroundMenu.querySelectorAll('button')].find(b=>b.title==='Aplicar fondo azul');
  check(blue&&blue.getClientRects().length>0,'Block background color is not visible');
  blue.click();check(!backgroundMenu.open,'Background menu did not close after applying a color');
  check(table.style.backgroundColor==='rgb(239, 246, 255)','Block fill could not be changed alongside table text');
  tab('home').focus();
  tab('home').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  check(tab('insert').getAttribute('aria-selected')==='true','Keyboard cannot reach Insertar');
  tab('insert').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
  check(tab('home').getAttribute('aria-selected')==='true','Keyboard cannot return to Formato');
  const columnsMenu=context.querySelector('[data-studio-context-menu=columnas]');
  columnsMenu.querySelector('summary').click();
  check(columnsMenu.open,'Columns menu could not open');
  columnsMenu.querySelector('summary').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  check(!columnsMenu.open,'Escape did not close the context menu');
  columnsMenu.querySelector('summary').click();check(columnsMenu.open,'Columns menu could not reopen');
  lesson.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:5,pointerType:'mouse'}));
  check(!columnsMenu.open,'Clicking outside did not dismiss the context menu');
  const visibleActions=[...ribbon.querySelectorAll('button')].filter(b=>b.getClientRects().length&&!b.disabled);
  check(visibleActions.every(el=>{const r=el.getBoundingClientRect();return r.height>=24&&r.width>=24;}),'A visible toolbar control is below 24 CSS pixels');
  return {ok:true,outline:true,fileMenuKeyboard:true,lessonProperties:true,mediaOptions:true,mediaInsert:true,contextTabs:true,targetSizes:true,onePlaceTextAndTable:true,noDuplicates:true,responsiveMore:true};
}

async function inspectMediaNesting(webmBase64){
  const root=document.querySelector('p2lrn-studio')?.shadowRoot||document;
  const ribbon=root.querySelector('.p2lrn-studio-ribbon');
  const lesson=root.querySelector('[data-studio-html-surface=true]');
  const check=(v,m)=>{if(!v)throw Error(m);};
  const pause=ms=>new Promise(done=>setTimeout(done,ms));
  const waitFor=async fn=>{for(let i=0;i<55;i++){const v=fn();if(v)return v;await pause(85);}throw Error('Media insertion timeout');};
  const tab=name=>ribbon.querySelector('[role=tab][aria-controls$="-'+name+'"]');
  const clickLayout=kind=>{tab('insert').click();const b=ribbon.querySelector('[data-ui-layout='+kind+']');check(b,'Missing insert '+kind);b.click();};
  clickLayout('section');
  const section=lesson.querySelector('[data-p2lrn-layout=section]');check(section,'Section not inserted');
  clickLayout('columns');
  const columns=section.querySelector('[data-p2lrn-layout=columns]');check(columns,'Columns were not nested into section');
  clickLayout('text-box');
  const box=columns.querySelector('[data-p2lrn-layout=text-box]');check(box,'Text box was not nested into a column');
  const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==';
  check(typeof webmBase64==='string'&&webmBase64.length>100,'Missing reproducible WebM test fixture');
  const realVideoBytes=Uint8Array.from(atob(webmBase64),c=>c.charCodeAt(0));
  const imageBytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0));
  async function upload(selector,bytes,name,mime,query){
    const input=root.querySelector(selector);check(input,'Missing picker '+selector);
    const before=lesson.querySelectorAll(query).length;
    const dt=new DataTransfer();dt.items.add(new File([bytes],name,{type:mime}));
    input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    return waitFor(()=>{const items=[...lesson.querySelectorAll(query)];return items.length>before?items.at(-1):null;});
  }
  const image=await upload('[data-lesson-image-file]',imageBytes,'test-bee.png','image/png','img[data-p2lrn-lesson-image]');
  check(box.contains(image),'Image not nested in text box');
  const options=root.querySelector('.p2lrn-lesson-media-options');
  const frame=root.querySelector('.p2lrn-lesson-media-selection');
  const move=root.querySelector('[data-lesson-media-move]');
  check(options&&!options.hidden&&options.open&&!frame.hidden,'Image editing toolbar is not persistent after insertion');
  const x=image.getBoundingClientRect();
  const pt=(kind,id,cx,cy,target=image)=>target.dispatchEvent(new PointerEvent(kind,{bubbles:true,pointerId:id,pointerType:'mouse',button:0,buttons:kind==='pointerup'?0:1,clientX:cx,clientY:cy}));
  pt('pointerdown',31,x.x+10,x.y+10);
  pt('pointermove',31,x.x+36,x.y+38,lesson);
  pt('pointerup',31,x.x+36,x.y+38,lesson);
  image.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  check(!options.hidden&&options.open&&!frame.hidden,'Image toolbar disappeared on pointer release');
  const bigger=options.querySelector('[data-lesson-image-bigger]');
  const smallerImage=options.querySelector('[data-lesson-image-smaller]');
  const initialSize=parseInt(image.style.width,10);smallerImage.click();
  const shrunk=parseInt(image.style.width,10);
  check(shrunk<initialSize,'Nested image cannot shrink: '+JSON.stringify({initialSize,shrunk,disabled:smallerImage.disabled,parentWidth:image.parentElement.clientWidth,style:image.getAttribute('style')?.slice(0,180),menuHidden:options.hidden}));
  bigger.click();
  check(parseInt(image.style.width,10)>shrunk,'Image resize action stopped working after drag');
  check(!options.hidden&&options.open,'Image selection was lost after resizing');
  const video=await upload('[data-lesson-video-file]',realVideoBytes,'test-embedded.webm','video/webm','video[data-p2lrn-lesson-video]');
  await waitFor(()=>video.readyState>=1&&video.videoWidth>0);
  video.muted=true;video.loop=true;
  const played=await video.play().then(()=>true).catch(()=>false);
  check(played,'Embedded WebM did not start playback');
  await pause(160);check(video.currentTime>0,'Embedded WebM playback did not advance');
  video.pause();
  check(box.contains(video)&&video.controls,'Video not nested or native controls removed');
  const vr=video.getBoundingClientRect();
  pt('pointerdown',32,vr.x+10,vr.y+10,video);
  pt('pointerup',32,vr.x+10,vr.y+10,video);
  video.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  check(!options.hidden&&options.open&&!frame.hidden,'Video toolbar did not persist after releasing click');
  const startY=Number(video.dataset.p2lrnImageY)||0;
  const moved=move;const start=video.getBoundingClientRect();
  pt('pointerdown',41,start.x+12,start.y+12,moved);
  pt('pointermove',41,start.x+30,start.y+64,moved);
  pt('pointerup',41,start.x+30,start.y+64,moved);
  check(Number(video.dataset.p2lrnImageY)>startY+10,'Video cannot be moved with its visible Mover handle');
  check(video.controls&&!options.hidden&&options.open,'Moving video removed playback controls or editing bar');
  const shrink=options.querySelector('[data-lesson-image-smaller]');const videoWidth=parseInt(video.style.width,10);
  shrink.click();check(parseInt(video.style.width,10)<videoWidth,'Video resize option does not work');
  clickLayout('table');
  const table=box.querySelector('table[data-p2lrn-layout=table]');
  check(table,'Table was not nested inside the text box');
  const cell=table.rows[1].cells[0];cell.click();
  const nestedCount=box.querySelectorAll('img[data-p2lrn-lesson-image]').length;
  const second=await upload('[data-lesson-image-file]',imageBytes,'test-cell.png','image/png','td img[data-p2lrn-lesson-image]');
  check(cell.contains(second),'Image table target mismatch: '+JSON.stringify({row:second.closest('td')?.parentElement.rowIndex,col:second.closest('td')?.cellIndex,expectedRow:cell.parentElement.rowIndex,expectedCol:cell.cellIndex,parent:second.parentElement?.tagName}));
  check(box.querySelectorAll('img[data-p2lrn-lesson-image]').length===nestedCount+1,'Nested media count changed unexpectedly');
  check(!options.hidden&&options.open,'Selecting nested cell image did not open editing options');
  // Drop a visual object into a sibling table cell: a real DOM reparent, not overlap.
  const destinationCell=table.rows[1].cells[1];
  clickLayout('shape');
  const shape=table.querySelector('[data-p2lrn-layout=shape]');
  check(shape&&cell.contains(shape),'New shape not nested in selected table cell');
  const objectMove=root.querySelector('[data-object-action=drag]');
  check(objectMove,'The shape does not have a Move handle');
  destinationCell.scrollIntoView({block:'center',behavior:'instant'});await pause(260);
  const dest=destinationCell.getBoundingClientRect(),origin=shape.getBoundingClientRect();
  const endX=dest.left+Math.min(22,Math.max(8,dest.width/2));
  const endY=dest.top+Math.min(25,Math.max(9,dest.height/2));
  pt('pointerdown',62,origin.left+12,origin.top+12,objectMove);
  pt('pointermove',62,endX,endY,objectMove);
  pt('pointerup',62,endX,endY,objectMove);
  check(destinationCell.contains(shape),'Dragging a shape did not nest: '+JSON.stringify({shapeParent:shape.parentElement?.tagName,shapeCell:shape.closest('td')?.cellIndex,destCell:destinationCell.cellIndex,sourceCell:cell.cellIndex,destRect:{x:dest.x,y:dest.y,w:dest.width,h:dest.height},hit:(root.elementsFromPoint?.(endX,endY)||document.elementsFromPoint(endX,endY)).slice(0,7).map(e=>e.tagName+':'+e.className),shapeStyle:shape.style.cssText.slice(0,180)}));
  video.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  destinationCell.scrollIntoView({block:'center',behavior:'instant'});await pause(160);
  const videoTarget=destinationCell.getBoundingClientRect();
  const videoEndX=videoTarget.left+Math.min(22,Math.max(8,videoTarget.width/2));
  const videoEndY=videoTarget.top+Math.min(25,Math.max(9,videoTarget.height/2));
  const mediaMove=root.querySelector('[data-lesson-media-move]');
  const videoOrigin=video.getBoundingClientRect();
  pt('pointerdown',63,videoOrigin.left+9,videoOrigin.top+9,mediaMove);
  pt('pointermove',63,videoEndX,videoEndY,mediaMove);
  pt('pointerup',63,videoEndX,videoEndY,mediaMove);
  check(destinationCell.contains(video),'Video reparent failure '+JSON.stringify({videoParent:video.parentElement?.tagName,videoCell:video.closest('td')?.cellIndex,videoY:video.dataset.p2lrnImageY,oldCell:cell.cellIndex,destCell:destinationCell.cellIndex,destRect:{x:videoTarget.x,y:videoTarget.y,w:videoTarget.width,h:videoTarget.height},pointerEnd:{x:videoEndX,y:videoEndY},hits:(root.elementsFromPoint?.(videoEndX,videoEndY)||document.elementsFromPoint(videoEndX,videoEndY)).slice(0,7).map(e=>e.tagName+':'+e.className),frame:root.querySelector('.p2lrn-lesson-media-selection')?.hidden,dragDebug:root.querySelector('.p2lrn-lesson-image-editor')?.dataset.p2lrnMediaDebug}));
  check(video.controls,'Video controls disappeared after nesting by drag');
  const student=ribbon.querySelector('[data-ui-action=preview]');student.click();
  await pause(600);
  const edit=ribbon.querySelector('[data-ui-action=edit]');edit.click();
  const restored=await waitFor(()=>root.querySelector('[data-studio-html-surface=true]')?.querySelector('[data-p2lrn-layout=section] [data-p2lrn-layout=columns] [data-p2lrn-layout=text-box]'));
  check(restored.querySelector('video[data-p2lrn-lesson-video]')&&restored.querySelector('td img[data-p2lrn-lesson-image]'),'Export/reopen through Vista alumno lost nested resources');
  return {ok:true,imageSelectionPersistent:true,videoSelectionPersistent:true,videoMover:true,mediaResize:true,nestedSectionColumnsText:true,nestedMedia:true,nestedTableImage:true,studentRoundTrip:true,videoNativeControls:true,dragReparentShape:true,dragReparentVideo:true,realVideoDecoded:true,realVideoPlayed:true};
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
    assert(info.tabs.length===2&&info.tabs.includes('Formato')&&info.tabs.includes('Insertar'),
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
      for(const ribbonTab of ['home','insert']){
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

    for(const v of info.saasAudit){assert(!v.overflow,sample.id+' horizontal page overflow at '+v.viewport+' '+v.tab);if(v.viewport==='mobile')assert(v.toolbarHeight<=280,sample.id+' mobile '+v.tab+' ribbon is too tall: '+v.toolbarHeight+'px');}
    const capabilities=await evalExpr('('+inspectSaasCapabilities.toString()+')()');
    assert(capabilities?.ok,sample.id+' SaaS UI actions were not verified');
    info.capabilities=capabilities;
    if(out){
      const selectedImage=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(join(out,'saas-'+sample.id+'-selected-mobile.png'),Buffer.from(selectedImage.data,'base64'));
    }
    const menuVisual=await evalExpr('('+inspectVisibleContextMenu.toString()+')()');
    assert(menuVisual?.ok&&menuVisual.hitButton,sample.id+' context dropdown is clipped or not clickable: '+JSON.stringify(menuVisual));
    info.contextMenuVisual=menuVisual;
    if(out){
      const menuImage=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(join(out,'saas-'+sample.id+'-menu-open-mobile.png'),Buffer.from(menuImage.data,'base64'));
    }
    await evalExpr("(()=>{const r=document.querySelector('p2lrn-studio')?.shadowRoot||document;const m=r.querySelector('[data-studio-context-menu=columnas]');if(m)m.open=false;return true})()");
    const media=await evalExpr("("+inspectMediaNesting.toString()+")("+JSON.stringify(REAL_WEBM_BASE64)+")");
    assert(media?.ok,sample.id+" media interaction regression");
    info.mediaNesting=media;
    const selectVideo=await evalExpr("(async()=>{const root=document.querySelector(\'p2lrn-studio\')?.shadowRoot||document;const v=root.querySelector(\'video[data-p2lrn-lesson-video]\');if(!v)return {found:false};v.scrollIntoView({block:\'center\',behavior:\'instant\'});await new Promise(done=>setTimeout(done,180));v.dispatchEvent(new MouseEvent(\'click\',{bubbles:true}));const o=root.querySelector(\'.p2lrn-lesson-media-options\');const r=o?.getBoundingClientRect();return {found:true,open:!!o?.open,hidden:!!o?.hidden,videoHeight:Math.round(v.getBoundingClientRect().height),toolbarRect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,viewportHeight:innerHeight,viewportWidth:innerWidth};})()");
    assert(selectVideo.found&&selectVideo.open&&!selectVideo.hidden,sample.id+" media selection toolbar disappeared on visual check");
    assert(selectVideo.toolbarRect&&selectVideo.toolbarRect.x>=4&&selectVideo.toolbarRect.x+selectVideo.toolbarRect.width<=selectVideo.viewportWidth-4,sample.id+" video inspector is clipped horizontally: "+JSON.stringify(selectVideo));
    info.selectedVideoVisual=selectVideo;
    if(out){const screenshot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(out,"media-selected-video-"+sample.id+".png"),Buffer.from(screenshot.data,"base64"));}
    if(out){const image=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(out,"media-nesting-"+sample.id+".png"),Buffer.from(image.data,"base64"));}
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
