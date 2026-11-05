// Browser-level regression for the ONE Studio UI shared by the website and npm.
// Uses the real browser DOM, browser editing commands and official P2LRN exporter.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';

const sleep=ms=>new Promise(done=>setTimeout(done,ms));
function findChrome(){
  return [
    process.env.P2LRN_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium','/usr/bin/google-chrome'
  ].filter(Boolean).find(existsSync)||null;
}
async function browserScenario(){
  const {mountStudioCommandBar,applyUnifiedStudioWorkspace}=await import('/studio/command-bar.js');
  const {createP2LRNStudioDocument}=await import('/studio/new-document.js');
  const {exportP2LRNPackage}=await import('/studio/package-export.js');
  const {openP2LRNPackageBytes}=await import('/p2lrn-player.js');
  const expect=(value,msg)=>{if(!value)throw new Error(msg);};
  const make=async(withShadow)=>{
    const host=document.createElement('div');
    document.body.append(host);
    const root=withShadow?host.attachShadow({mode:'open'}):host;
    const mount=document.createElement('section');mount.className='toolbar';
    const workspace=document.createElement('div');
    const outline=document.createElement('nav');
    const canvas=document.createElement('main');
    const stage=document.createElement('div');
    const sheet=document.createElement('article');
    const surface=document.createElement('article');
    surface.contentEditable='true';surface.dataset.studioHtmlSurface='true';
    surface.innerHTML='<p>La explicación debe conservarse.</p>';
    sheet.append(surface);stage.append(sheet);canvas.append(stage);
    workspace.append(outline,canvas);root.append(mount,workspace);
    applyUnifiedStudioWorkspace({workspace,outline,canvas,stage,sheet});
    const course=createP2LRNStudioDocument({title:'Estudio visual',language:'es'});
    const lesson=course.addLesson(course.rootId,{title:'Diseño unificado',language:'es'});
    const editable=await course.readEditableText(lesson.id);
    let writes=0;
    surface.addEventListener('input',()=>{
      course.setPayloadText(editable.path,'<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>'+surface.innerHTML+'</body></html>');
      writes++;
    });
    const actions=[];
    const on=name=>()=>{actions.push(name);};
    const ui=mountStudioCommandBar({
      mount,resolveSurface:()=>surface,
      actions:{
        create:on('create'),open:on('open'),save:on('save'),
        export:on('export'),offline:on('offline'),
        review:on('review'),addUnit:on('unit'),addLesson:on('lesson'),
        addContent:on('activity'),addKind:(kind)=>{actions.push('kind:'+kind);},preview:on('preview'),edit:on('edit')
      },
      onStatus:msg=>actions.push('status:'+msg)
    });
    ui.setDocument(true,'Estudio visual');
    const toolbar=mount.querySelector('.p2lrn-studio-ribbon');
    expect(toolbar&&mount.classList.contains('p2lrn-studio-unified'),'Canonical toolbar missing');
    expect([...toolbar.querySelectorAll('[role=tab]')].filter(tab=>!tab.hidden).length===3,'Three working tabs not rendered');
    expect(toolbar.querySelector('[data-ui-action=save]'),'Save button missing');
    expect(toolbar.querySelector('[data-ui-action=export]'),'Export button missing');
    expect(toolbar.querySelector('[data-ui-action=preview]'),'Preview button missing');
    const html=toolbar.outerHTML.replace(/p2lrn-studio-(?:panel|tab)-\d+/g,'p2lrn-studio-unique');
    return {host,root,mount,toolbar,workspace,outline,stage,surface,course,lesson,editable,ui,actions,html,get writes(){return writes;}};
  };
  const website=await make(false),npm=await make(true);
  expect(website.html===npm.html,'Website and npm command trees are different');
  for(const item of [website,npm]){
    item.toolbar.querySelector('[role=tab][aria-controls*="-insert"]').click();
    const add=[...item.toolbar.querySelectorAll('button')].find(b=>b.textContent==='Añadir contenido');
    expect(add&&!add.disabled,'Common activity picker action missing');
    add.click();
    const picker=item.root.querySelector('.p2lrn-activity-picker')||document.querySelector('.p2lrn-activity-picker');
    expect(picker?.open,'Activity picker did not open in its DOM root');
    const search=picker.querySelector('input[type=search]');search.value='crucigrama';
    search.dispatchEvent(new Event('input',{bubbles:true}));
    const crossword=picker.querySelector('[data-activity-kind=crossword]');
    expect(crossword&&!crossword.hidden,'Searching the shared activity catalog failed');
    crossword.click();
    await new Promise(done=>setTimeout(done,0));
    expect(item.actions.includes('kind:crossword'),'Shared activity picker did not dispatch the chosen game');
    // Real table commands shared by both Studio entrypoints.
    const addTable=item.toolbar.querySelector('[data-ui-layout=table]');
    expect(addTable&&!addTable.disabled,'Table insertion is missing');
    addTable.click();
    let table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table&&table.rows.length===3&&table.rows[0].cells.length===2,'Inserted table has the wrong grid');
    table.rows[1].cells[0].click();
    const tableTab=item.toolbar.querySelector('[role=tab][aria-controls$="-table"]');
    expect(tableTab&&!tableTab.hidden,'Selecting a table does not show table tools');
    tableTab.click();
    const addRow=item.toolbar.querySelector('[data-studio-advanced-action=rowBelow]');
    const addCol=item.toolbar.querySelector('[data-studio-advanced-action=colRight]');
    expect(!addRow.disabled&&!addCol.disabled,'Context table actions are disabled');
    addRow.click();
    expect(table.rows.length===4,'Could not add a table row');
    addCol.click();
    expect(table.rows[0].cells.length===3,'Could not add a table column');
    // Undo/redo must work across Insertar and contextual Tabla, not just typing.
    item.toolbar.querySelector('[role=tab][aria-controls$="-home"]').click();
    const undo=item.toolbar.querySelector('[data-ui-command=undo]');
    const redo=item.toolbar.querySelector('[data-ui-command=redo]');
    expect(!undo.disabled,'Structural changes did not enter the shared history');
    undo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.rows[0].cells.length===2&&table.rows.length===4,'Undo did not remove column');
    undo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.rows.length===3,'Undo did not remove row');
    redo.click();redo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.rows.length===4&&table.rows[0].cells.length===3,'Redo did not restore table modifications');
    // Cell formatting and row geometry must be reversible as well.
    table.rows[1].cells[0].click();
    tableTab.click();
    const cellFill=item.toolbar.querySelector('input[aria-label="Color de fondo de celda"]');
    cellFill.value='#ffd6a5';
    item.toolbar.querySelector('[data-studio-advanced-action=cellFill]').click();
    expect(table.rows[1].cells[0].style.backgroundColor==='rgb(255, 214, 165)','Cell fill failed');
    const rowHeight=item.toolbar.querySelector('input[aria-label="Altura de fila en píxeles"]');
    rowHeight.value='64';
    item.toolbar.querySelector('[data-studio-advanced-action=rowHeight]').click();
    expect(table.rows[1].style.height==='64px','Row height failed');
    undo.click();undo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.rows[1].style.height!=='64px'&&table.rows[1].cells[0].style.backgroundColor!=='rgb(255, 214, 165)','Undo of cell formatting failed');
    redo.click();redo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.rows[1].style.height==='64px'&&table.rows[1].cells[0].style.backgroundColor==='rgb(255, 214, 165)','Redo of cell formatting failed');
    // Object geometry is also part of the same portable history.
    table.rows[1].cells[0].click();
    expect(item.ui.performObject('width',340)!==false,'Width command failed');
    expect(table.style.width==='340px','Table resize was not applied');
    expect(item.ui.performObject('nudge',{x:30,y:14})!==false,'Movement command failed');
    expect(table.dataset.p2lrnObjectX==='30','Object translation missing');
    const dragHandle=item.root.querySelector('[data-object-action=drag]');
    expect(dragHandle,'Object drag handle not rendered');
    const pointer=(type,x,y)=>dragHandle.dispatchEvent(new PointerEvent(type,{
      bubbles:true,pointerId:93,pointerType:'mouse',button:0,
      buttons:type==='pointerup'?0:1,clientX:x,clientY:y
    }));
    pointer('pointerdown',210,210);pointer('pointermove',235,230);pointer('pointerup',235,230);
    expect(table.dataset.p2lrnObjectX!=='30','Pointer drag did not move the table');
    undo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.dataset.p2lrnObjectX==='30','Undo did not restore previous position');
    redo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(Number(table.dataset.p2lrnObjectX)>30,'Redo did not restore drag');
    item.toolbar.querySelector('[role=tab][aria-controls$="-insert"]').click();
    const insert=item.toolbar.querySelector('[data-ui-layout=columns]');
    expect(insert&&!insert.disabled,'Columns action unavailable');
    insert.click();
    expect(item.surface.querySelector('[data-p2lrn-layout=columns]'),'Columns not inserted in HTML');
    expect(item.writes>0,'Insertion was not persisted in authoring model');
    item.toolbar.querySelector('[role=tab][aria-controls*="-design"]').click();
    const blue=[...item.toolbar.querySelectorAll('button')].find(b=>b.title==='Aplicar fondo azul');
    expect(blue,'Visual design option missing');
    blue.click();
    const section=item.surface.querySelector('[data-p2lrn-layout=columns]');
    expect(section.style.backgroundColor==='rgb(239, 246, 255)','Block design was not persisted');
    // Resize handle on a movable shape, including undo/redo of the gesture.
    item.toolbar.querySelector('[role=tab][aria-controls*="-insert"]').click();
    item.toolbar.querySelector('[data-ui-layout=shape]').click();
    let shape=item.surface.querySelector('[data-p2lrn-layout=shape]');
    expect(shape,'Shape insertion failed');
    const grip=item.root.querySelector('[data-object-action=resize]');
    expect(grip,'Shape resize grip missing');
    const previousWidth=shape.getBoundingClientRect().width;
    const resizeEvent=(type,x,y)=>grip.dispatchEvent(new PointerEvent(type,{
      bubbles:true,pointerId:75,pointerType:'mouse',button:0,
      buttons:type==='pointerup'?0:1,clientX:x,clientY:y
    }));
    resizeEvent('pointerdown',200,200);resizeEvent('pointermove',280,235);resizeEvent('pointerup',280,235);
    expect(shape.getBoundingClientRect().width>previousWidth,'Pointer resize did not grow shape');
    item.toolbar.querySelector('[role=tab][aria-controls*="-home"]').click();
    undo.click();
    shape=item.surface.querySelector('[data-p2lrn-layout=shape]');
    expect(shape.getBoundingClientRect().width<=previousWidth+2,'Undo did not restore shape width');
    redo.click();
    shape=item.surface.querySelector('[data-p2lrn-layout=shape]');
    expect(shape.getBoundingClientRect().width>previousWidth,'Redo did not restore shape width');
    item.toolbar.querySelector('[role=tab][aria-controls*="-design"]').click();
    item.toolbar.querySelector('[data-ui-action=save]').click();
    item.toolbar.querySelector('[data-ui-action=export]').click();
    item.toolbar.querySelector('[data-ui-action=preview]').click();
    await new Promise(done=>setTimeout(done,0));
    expect(item.actions.includes('save')&&item.actions.includes('export')&&item.actions.includes('preview'),'One of the visible actions did not execute');
    item.toolbar.querySelector('[data-ui-action=edit]').click();
    await new Promise(done=>setTimeout(done,0));
    expect(item.actions.includes('edit'),'Preview cannot return to edit mode');
    const exported=await exportP2LRNPackage(item.course);
    const bytes=exported.bytes;
    const reopened=await openP2LRNPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const activity=reopened.entities.get(item.lesson.id);
    const resource=reopened.entities.get(activity.resource);
    const path=resource.representations.find(rep=>rep.role==='primary').location.path;
    const html=new TextDecoder().decode(await reopened.payload(path).read());
    expect(html.includes('data-p2lrn-layout="columns"'),'Exported course lost visual layout');
    expect(html.includes('rgb(239, 246, 255)'),'Exported course lost design styles');
    expect(html.includes('La explicación debe conservarse.'),'Exported course lost original lesson text');
    item.ui.setMessage('Cambios guardados');
    expect(item.toolbar.querySelector('[role=status]').textContent==='Cambios guardados','Status feedback is not visible');
  }
  const label=website.toolbar.querySelector('[role=tab][aria-selected=true]');
  expect(label.textContent==='Diseño','Tab state is not consistent');
  const lightStyle=getComputedStyle(website.toolbar).fontFamily;
  const shadowStyle=getComputedStyle(npm.toolbar).fontFamily;
  expect(lightStyle===shadowStyle,'Stylesheets differ across light and Shadow DOM');
  return {ok:true,sameUI:true,sharedControls:website.toolbar.querySelectorAll('button').length,
    persisted:website.writes>0&&npm.writes>0,roundTrip:true,shadowDOM:true,stylesMatch:true};
}

const webRoot=resolve('packages/toolkit/web');
let chrome=null,profile=null,server=null,ws=null;
try{
  const browser=findChrome();
  if(!browser)throw new Error('Chrome or Edge required to verify Studio visually.');
  server=createServer((req,res)=>{
    let url;
    try{url=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);res.end();return;}
    if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body></body></html>');return;}
    const path=resolve(webRoot,'.'+decodeURIComponent(url.pathname));
    if(!path.startsWith(webRoot+sep)){res.writeHead(403);res.end();return;}
    readFile(path).then(bytes=>{res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(bytes);}).catch(()=>{res.writeHead(404);res.end();});
  });
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});
  profile=await mkdtemp(join(tmpdir(),'p2lrn-unified-ui-'));
  chrome=spawn(browser,['--headless=new','--no-first-run','--disable-extensions','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let debugPort=0;
  for(let i=0;i<100;i++){
    const active=join(profile,'DevToolsActivePort');
    if(existsSync(active)){debugPort=Number((await readFile(active,'utf8')).split('\n')[0]);break;}
    await sleep(120);
  }
  if(!debugPort)throw new Error('Chrome debug port unavailable');
  const pages=await(await fetch('http://127.0.0.1:'+debugPort+'/json')).json();
  const page=pages.find(x=>x.type==='page');
  if(!page)throw new Error('Chrome did not expose a page');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done,fail)=>{ws.onopen=done;ws.onerror=fail;});
  const pending=new Map();let seq=0;
  ws.onmessage=event=>{
    const message=JSON.parse(event.data),task=pending.get(message.id);
    if(!task)return;
    pending.delete(message.id);
    if(message.error)task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  };
  const send=(method,params={})=>new Promise((done,fail)=>{
    const id=++seq;pending.set(id,{resolve:done,reject:fail});
    ws.send(JSON.stringify({id,method,params}));
  });
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  for(let i=0;i<60;i++){
    const r=await send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});
    if(r.result?.value==='complete')break;
    await sleep(100);
  }
  const r=await send('Runtime.evaluate',{
    expression:'('+browserScenario.toString()+')()',returnByValue:true,awaitPromise:true
  });
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  assert.equal(r.result?.value?.ok,true);
  console.log(JSON.stringify(r.result.value,null,2));
}finally{
  try{ws?.close();}catch{}
  try{chrome?.kill();}catch{}
  if(server)await new Promise(done=>server.close(done));
  if(profile)await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:180});
}
