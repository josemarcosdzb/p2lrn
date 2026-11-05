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
        addContent:on('activity'),preview:on('preview'),edit:on('edit')
      },
      onStatus:msg=>actions.push('status:'+msg)
    });
    ui.setDocument(true,'Estudio visual');
    const toolbar=mount.querySelector('.p2lrn-studio-ribbon');
    expect(toolbar&&mount.classList.contains('p2lrn-studio-unified'),'Canonical toolbar missing');
    expect(toolbar.querySelectorAll('[role=tab]').length===3,'Three working tabs not rendered');
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
