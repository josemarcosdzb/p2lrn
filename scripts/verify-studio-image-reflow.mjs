// Browser-level regression for draggable lesson images. No third-party test runner.
// Uses the same image editor that website Studio and npm Studio import.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
function chromePath(){
  const paths=[
    process.env.P2LRN_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA&&join(process.env.LOCALAPPDATA,'Google','Chrome','Application','chrome.exe'),
    '/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome',
  ].filter(Boolean);
  const found=paths.find(existsSync);
  if(!found)throw new Error('Chrome or Edge executable not found for 3D-free image-flow QA.');
  return found;
}

async function browserScenario(){
  // An HTTP-served native module resolves its sibling studio-ui-i18n.js.
  // Blob URL modules do not have a hierarchical base for relative imports.
  const imageModule=await import(new URL('/lesson-images.js',location.origin).href);
  const host=document.createElement('div');
  host.id='p2lrn-image-flow-check';
  host.style.cssText='width:720px;margin:15px;background:white;color:#111';
  const surface=document.createElement('article');
  surface.className='studio-wysiwyg';
  surface.style.cssText='width:100%;font:18px/28px Arial;box-sizing:border-box;min-height:360px';
  surface.contentEditable='true';
  surface.innerHTML='<h1 style="margin:0 0 16px;font-size:28px;line-height:38px">Primera lección — título intacto</h1>'+
    '<p style="margin:0;white-space:normal">'+
    Array(80).fill('El texto tiene que rodear la imagen y volver a ocupar todo el ancho disponible. ').join('')+'</p>';
  host.append(surface);
  document.body.append(host);
  let saves=0;
  const editor=imageModule.mountLessonImageEditor({host,surface,onChange:()=>{saves++;}});
  const bitmap=document.createElement('canvas');
  bitmap.width=500;bitmap.height=260;
  bitmap.getContext('2d').fillRect(0,0,500,260);
  const blob=await new Promise(resolve=>bitmap.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Browser did not encode the image.');
  const file=new File([blob],'imagen-prueba.png',{type:'image/png'});
  const img=await editor.insertImage(file,{x:92,y:135});
  await new Promise(resolve=>setTimeout(resolve,120));
  const measure=()=>{
    const box=surface.querySelector('[data-p2lrn-lesson-canvas]');
    const images=[...box.querySelectorAll('[data-p2lrn-lesson-image]')];
    const rectangles=images.map(image=>image.getBoundingClientRect());
    const first=rectangles[0];
    const rootRect=box.getBoundingClientRect();
    const iterator=document.createTreeWalker(surface,NodeFilter.SHOW_TEXT);
    let collisions=0,above=0,below=0,beside=0,maxRightAbove=0;
    while(iterator.nextNode()){
      const node=iterator.currentNode;
      for(let i=0;i<node.textContent.length;i+=2){
        const range=document.createRange();
        range.setStart(node,i);range.setEnd(node,Math.min(node.textContent.length,i+1));
        const r=range.getBoundingClientRect();
        if(!r.width)continue;
        if(r.bottom<first.top-2){above++;maxRightAbove=Math.max(maxRightAbove,r.right-rootRect.left);}
        if(r.top>first.bottom+2)below++;
        if(r.top<first.bottom-1&&r.bottom>first.top+1&&
            (r.left>first.right+2||r.right<first.left-2))beside++;
        for(const rect of rectangles)if(r.left<rect.right-1&&r.right>rect.left+1&&
           r.top<rect.bottom-1&&r.bottom>rect.top+1)collisions++;
      }
    }
    let imageOverlaps=0;
    for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++){
      const a=rectangles[i],b=rectangles[j];
      if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)imageOverlaps++;
    }
    return {
      imageCount:images.length,collisions,imageOverlaps,above,below,beside,maxRightAbove,
      canvasWidth:Math.round(rootRect.width),scrollWidth:box.scrollWidth,
      position:img.style.position,float:img.style.float,marginTop:img.style.marginTop,
      imageY:img.dataset.p2lrnImageY,shape:img.style.shapeOutside,
    };
  };
  const initial=measure();

  // Exercise drag events through the actual Studio image listeners, not CSS mockups.
  const start=img.getBoundingClientRect();
  const e=(type,x,y)=>new PointerEvent(type,{
    bubbles:true,pointerId:42,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,
    clientX:x,clientY:y,
  });
  img.dispatchEvent(e('pointerdown',start.left+12,start.top+12));
  surface.dispatchEvent(e('pointermove',start.left+36,start.top+193));
  surface.dispatchEvent(e('pointerup',start.left+36,start.top+193));
  await new Promise(resolve=>setTimeout(resolve,40));
  const moved=measure();

  // Resize the active image through the same toolbar a teacher uses.
  const previousWidth=parseFloat(img.style.width);
  host.querySelector('[data-lesson-image-bigger]').click();
  const resized=measure();
  const afterWidth=parseFloat(img.style.width);

  // Multiple images must never overlap either each other or the text.
  await editor.insertImage(file,{x:415,y:320});
  await new Promise(resolve=>setTimeout(resolve,80));
  const twoImages=measure();
  host.style.width='350px';
  await new Promise(resolve=>setTimeout(resolve,220));
  const mobile=measure();
  const html=surface.innerHTML;

  // Old exported HTML is migrated in place, preserving its text and embedded data.
  const legacyHost=document.createElement('div');legacyHost.style.cssText='width:720px';
  const legacySurface=document.createElement('article');legacySurface.contentEditable='true';
  legacySurface.innerHTML='<div data-p2lrn-lesson-canvas="1" style="position:relative;min-height:360px">'+
    '<h1>Título anterior intacto</h1><p>Texto anterior intacto</p>'+
    '<img data-p2lrn-lesson-image="1" src="'+img.src+
    '" style="position:absolute;left:35%;top:120px;width:280px"></div>';
  legacyHost.append(legacySurface);document.body.append(legacyHost);
  let legacySaved=0;
  imageModule.mountLessonImageEditor({host:legacyHost,surface:legacySurface,onChange:()=>legacySaved++});
  const legacy=legacySurface.querySelector('[data-p2lrn-lesson-image]');
  const legacyResult={
    position:legacy.style.position,float:legacy.style.float,
    x:legacy.dataset.p2lrnImageX,y:legacy.dataset.p2lrnImageY,
    hasOldText:legacySurface.textContent.includes('Título anterior intacto')&&
      legacySurface.textContent.includes('Texto anterior intacto'),
    persisted:legacySaved>0,
  };
  host.remove();legacyHost.remove();
  return {
    initial,moved,resized,twoImages,mobile,
    widthIncreased:afterWidth>previousWidth,saves,
    markupFlow:html.includes('float:')&&html.includes('shape-outside:')&&
      !html.includes('position: absolute'),
    portableImage:html.includes('data:image/png;base64,'),
    retainedText:html.includes('Primera lección'),
    legacy:legacyResult,
  };
}

let profile=null,chrome=null,ws=null,studioServer=null;
try{
  // Serve only the two audited editor modules on a loopback-only origin.
  // This is closer to production and avoids rewriting the actual module.
  const assets=new Set(['/lesson-images.js','/studio-ui-i18n.js']);
  studioServer=createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
      res.end('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
      return;
    }
    if(!assets.has(url.pathname)){res.writeHead(404);res.end();return;}
    const path=resolve('packages/toolkit/web/studio',url.pathname.slice(1));
    readFile(path).then(bytes=>{
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8',
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(bytes);
    }).catch(()=>{res.writeHead(404);res.end();});
  });
  await new Promise((done,fail)=>{
    studioServer.once('error',fail);
    studioServer.listen(0,'127.0.0.1',()=>{studioServer.off('error',fail);done();});
  });
  profile=await mkdtemp(join(tmpdir(),'p2lrn-image-reflow-'));
  chrome=spawn(chromePath(),['--headless=new','--no-first-run','--disable-extensions',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
    {windowsHide:true,stdio:'ignore'});
  let port=0;
  for(let i=0;i<140;i++){
    const file=join(profile,'DevToolsActivePort');
    if(existsSync(file)){port=Number((await readFile(file,'utf8')).split('\n')[0]);break;}
    await sleep(100);
  }
  if(!port)throw new Error('Chrome did not start its debugging port.');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
  const tab=tabs.find(item=>item.type==='page');
  if(!tab)throw new Error('Chrome test page missing.');
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((accept,reject)=>{ws.onopen=accept;ws.onerror=reject;});
  const pending=new Map();let id=0;
  ws.onmessage=(event)=>{
    const message=JSON.parse(event.data),wait=pending.get(message.id);
    if(!wait)return;
    pending.delete(message.id);
    message.error?wait.reject(new Error(message.error.message)):wait.resolve(message.result);
  };
  const send=(method,params={})=>new Promise((accept,reject)=>{
    const next=++id;pending.set(next,{resolve:accept,reject});
    ws.send(JSON.stringify({id:next,method,params}));
  });
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:'+studioServer.address().port+'/'});
  let loaded=false;
  for(let attempt=0;attempt<60;attempt++){
    if(await evaluate('document.readyState')==='complete'){loaded=true;break;}
    await sleep(100);
  }
  if(!loaded)throw new Error('Chrome test page did not load.');
  const result=await evaluate('('+browserScenario.toString()+')()');
  console.log(JSON.stringify({ok:true,lessonImageFlow:result},null,2));
  for(const stage of ['initial','moved','resized','twoImages','mobile']){
    const item=result[stage];
    assert(item,'Missing '+stage+' scenario.');
    assert.equal(item.collisions,0,stage+' image overlaps lesson text');
    assert.equal(item.imageOverlaps,0,stage+' images overlap each other');
    assert(item.scrollWidth<=item.canvasWidth+1,stage+' overflows the lesson width');
  }
  assert(result.initial.beside>10,'Desktop text does not wrap beside the image.');
  assert(result.moved.above>40&&result.moved.maxRightAbove>620,'Text above moved image does not recover the full line.');
  assert(Number(result.moved.imageY)>Number(result.initial.imageY)+80,'Dragging did not move the image down.');
  assert(result.widthIncreased,'Image resize control did not work.');
  assert(result.twoImages.imageCount===2,'Second image insertion failed.');
  assert(result.mobile.canvasWidth===350,'Narrow layout did not recalculate.');
  assert(result.markupFlow&&result.portableImage&&result.retainedText,'Portable HTML lost the image or text layout.');
  assert.equal(result.legacy.position,'relative');
  assert(result.legacy.float==='left'||result.legacy.float==='right');
  assert.equal(result.legacy.y,'120');
  assert(result.legacy.hasOldText&&result.legacy.persisted,'Legacy image migration lost or failed to save content.');
  console.log('P2LRN lesson image flow E2E PASS');
}finally{
  try{ws?.close();}catch{}
  if(chrome?.exitCode===null)chrome.kill();
  if(profile){await sleep(500);await rm(profile,{recursive:true,force:true}).catch(()=>{});}
  if(studioServer)await new Promise(done=>studioServer.close(done));
}
