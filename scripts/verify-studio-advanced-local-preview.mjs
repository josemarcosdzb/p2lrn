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
async function advancedCase(){
  const check=(ok,msg)=>{if(!ok)throw new Error(msg);};
  const component=document.querySelector('p2lrn-studio');
  const root=component?.shadowRoot||document;
  const ribbon=root.querySelector('.p2lrn-studio-ribbon');
  const surface=root.querySelector('[data-studio-html-surface=true]');
  check(ribbon&&surface,'HTML lesson is not active');
  const tab=id=>ribbon.querySelector('[role=tab][aria-controls$="-'+id+'"]');
  tab('insert').click();
  ribbon.querySelector('[data-ui-layout=table]').click();
  let table=surface.querySelector('table[data-p2lrn-layout=table]');
  check(table&&table.rows.length===3,'Table insertion failed');
  table.rows[1].cells[0].click();
  const context=ribbon.querySelector('[data-studio-context-tools]');
  check(context&&!context.hidden&&tab('home').getAttribute('aria-selected')==='true','Selecting table must show tools within Formato');
  check(!tab('table')&&!tab('design'),'Redundant design/table tabs still exist');
  ribbon.querySelector('[data-studio-advanced-action=rowBelow]').click();
  ribbon.querySelector('[data-studio-advanced-action=colRight]').click();
  check(table.rows.length===4&&table.rows[0].cells.length===3,'Table row or column edit failed');
  check(tab('home').getAttribute('aria-selected')==='true','Object design must remain in Formato');
  const width=ribbon.querySelector('input[aria-label="Ancho del elemento en píxeles"]');
  width.value='360';
  ribbon.querySelector('[data-studio-advanced-action=width]').click();
  check(table.style.width==='360px','Resize button failed');
  const fill=[...ribbon.querySelectorAll('button')].find(b=>b.title==='Aplicar fondo azul');
  fill.click();check(table.style.backgroundColor==='rgb(239, 246, 255)','Design change failed');
  tab('home').click();
  const undo=ribbon.querySelector('[data-ui-command=undo]');
  const redo=ribbon.querySelector('[data-ui-command=redo]');
  check(!undo.disabled,'Undo is disabled after design change');
  undo.click();
  table=surface.querySelector('table[data-p2lrn-layout=table]');
  check(table.style.backgroundColor!=='rgb(239, 246, 255)','Undo did not revert design');
  undo.click();
  table=surface.querySelector('table[data-p2lrn-layout=table]');
  check(table.style.width!=='360px','Undo did not revert resize');
  redo.click();redo.click();
  table=surface.querySelector('table[data-p2lrn-layout=table]');
  check(table.style.width==='360px','Redo did not restore resize');
  tab('insert').click();
  ribbon.querySelector('[data-ui-layout=shape]').click();
  const shape=surface.querySelector('[data-p2lrn-layout=shape]');
  check(shape,'Shape cannot be inserted');
  const resize=root.querySelector('[data-object-action=resize]');
  check(resize,'Object resize handle missing');
  const resizePointer=(target,type,x,y,id)=>target.dispatchEvent(new PointerEvent(type,{
    bubbles:true,pointerId:id,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y
  }));
  const beforeWidth=shape.getBoundingClientRect().width;
  resizePointer(resize,'pointerdown',180,180,41);
  resizePointer(resize,'pointermove',258,210,41);
  resizePointer(resize,'pointerup',258,210,41);
  check(shape.getBoundingClientRect().width>beforeWidth,'Shape grip resizing failed');
  const drag=root.querySelector('[data-object-action=drag]');
  check(drag,'Object drag handle missing');
  resizePointer(drag,'pointerdown',180,180,42);
  resizePointer(drag,'pointermove',214,202,42);
  resizePointer(drag,'pointerup',214,202,42);
  check(Number(shape.dataset.p2lrnObjectX)>0,'Shape drag was not applied');
  if(component){
    const exported=await component.exportPackage();
    const bytes=exported.bytes;
    const pkg=await(await window.P2LRNReady).openPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
    const decoder=new TextDecoder();
    let foundTable=false,foundShape=false,foundWidth=false,foundMoved=false;
    for(const entity of pkg.entities.values())for(const rep of entity.representations||[]){
      if(!rep.location?.path)continue;
      const text=decoder.decode(await pkg.payload(rep.location.path).read());
      if(text.includes('data-p2lrn-layout="table"'))foundTable=true;
      if(text.includes('data-p2lrn-layout="shape"'))foundShape=true;
      if(text.includes('width: 360px'))foundWidth=true;
      if(text.includes('data-p2lrn-object-x'))foundMoved=true;
    }
    check(foundTable&&foundShape&&foundWidth&&foundMoved,'NPM export lost visual design changes');
  }
  return {ok:true,tableRows:table.rows.length,tableColumns:table.rows[0].cells.length,
    undoRedo:true,shape:true,npmRoundTrip:!!component};
}


async function diagramCase(){
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const component=document.querySelector('p2lrn-studio');
  const root=component?.shadowRoot||document;
  const ribbon=root.querySelector('.p2lrn-studio-ribbon');
  const surface=root.querySelector('[data-studio-html-surface=true]');
  assert(ribbon&&surface,'No active HTML lesson for diagram');
  const tab=id=>ribbon.querySelector('[role=tab][aria-controls$="-'+id+'"]');
  tab('insert').click();
  const insert=kind=>{
    const trigger=ribbon.querySelector('[data-ui-layout="'+kind+'"]');
    assert(trigger,'Insert palette lacks '+kind);
    trigger.click();
  };
  insert('diagram-canvas');
  const canvas=surface.querySelector('[data-p2lrn-layout=diagram-canvas]');
  assert(canvas,'Diagram canvas was not inserted');
  const scroll=canvas.closest('[data-p2lrn-layout=diagram-scroll]');
  assert(scroll,'Diagram lacks independent scroll wrapper');
  canvas.click();
  tab('insert').click();
  insert('shape:cloud');
  let cloud=canvas.querySelector(':scope > figure[data-p2lrn-shape=cloud]');
  assert(cloud,'Cloud was not inserted as direct canvas layer');
  assert(cloud.style.position==='absolute'&&cloud.style.left.endsWith('%'),'Cloud position is not responsive');
  cloud.click();
  tab('insert').click();
  insert('shape:droplet');
  let drop=canvas.querySelector(':scope > figure[data-p2lrn-shape=droplet]');
  assert(drop,'Droplet was not inserted as sibling layer');
  const prev={x:parseFloat(drop.style.left),y:parseFloat(drop.style.top)};
  drop.click();
  const drag=root.querySelector('[data-object-action=drag]');
  assert(drag,'Object movement control missing');
  const pointer=(target,type,x,y,id)=>target.dispatchEvent(new PointerEvent(type,{
    bubbles:true,pointerId:id,pointerType:'mouse',button:0,
    buttons:type==='pointerup'?0:1,clientX:x,clientY:y
  }));
  const box=drag.getBoundingClientRect();
  pointer(drag,'pointerdown',box.x+10,box.y+10,300);
  pointer(drag,'pointermove',box.x+50,box.y+30,300);
  pointer(drag,'pointerup',box.x+50,box.y+30,300);
  assert(parseFloat(drop.style.left)!==prev.x||parseFloat(drop.style.top)!==prev.y,
    'Moving diagram element did not change percentage coordinates');
  drop.click();
  const angles=ribbon.querySelector('input[aria-label="Ángulo del objeto en grados"]');
  assert(angles,'Rotation inspector is missing');
  angles.value='40';
  ribbon.querySelector('[data-studio-advanced-action=rotate]').click();
  assert(drop.style.transform.includes('rotate(40deg)'),'Rotation lost after editing');
  cloud.click();
  drop.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));
  const groupButton=ribbon.querySelector('[data-studio-advanced-action=group]');
  assert(groupButton,'Group action missing');
  groupButton.click();
  const group=canvas.querySelector(':scope > [data-p2lrn-layout=diagram-group]');
  assert(group&&group.children.length===2,'Group did not preserve two independent shapes');
  assert(group.style.width.endsWith('%')&&group.style.height.endsWith('%'),
    'Group lost responsive dimensions');
  group.click();
  ribbon.querySelector('[data-studio-advanced-action=ungroup]').click();
  assert(canvas.querySelectorAll(':scope > figure').length===2,'Ungroup did not restore both layers');
  cloud=canvas.querySelector('figure[data-p2lrn-shape=cloud]');
  const before=cloud.getBoundingClientRect();
  const layerItem=cloud;
  cloud.click();
  const layerMenu=ribbon.querySelector('[data-studio-context-menu=capas]');
  assert(layerMenu&&!layerMenu.hidden,'Layer inspector unavailable');
  const count=layerMenu.querySelectorAll('.p2lrn-layer-entry').length;
  assert(count>=2,'Layer inspector did not list both shapes');
  const shape=canvas.querySelector(':scope > figure[data-p2lrn-shape=droplet]');
  const leftPct=parseFloat(shape.style.left),widthPct=parseFloat(shape.style.width);
  assert(leftPct>=0&&widthPct>0,'Diagram shape lacks persistent percentages');
  const geometry={shapeCount:count,leftPct,widthPct};
  // Import a real PNG via Studio's existing image picker, not an embedded
  // drawing masquerading as a raster lesson resource.
  canvas.click();
  const picker=root.querySelector('input[data-lesson-image-file]');
  assert(picker,'Native lesson image picker unavailable');
  const graphic=document.createElement('canvas');
  graphic.width=48;graphic.height=48;
  const brush=graphic.getContext('2d');brush.fillStyle='#facc15';
  brush.beginPath();brush.arc(24,24,21,0,Math.PI*2);brush.fill();
  const blob=await new Promise(resolve=>graphic.toBlob(resolve,'image/png'));
  assert(blob,'PNG generation failed');
  const transfer=new DataTransfer();
  transfer.items.add(new File([blob],'sol-prueba.png',{type:'image/png'}));
  picker.files=transfer.files;picker.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,420));
  const image=canvas.querySelector(':scope > img[data-p2lrn-lesson-image]');
  assert(image,'Raster image was not inserted inside native diagram canvas');
  assert(image.style.position==='absolute'&&image.style.left.endsWith('%')&&image.style.width.endsWith('%'),
    'Diagram image is not positioned proportionally');
  const oldImageWidth=parseFloat(image.style.width);
  image.click();
  const bigger=root.querySelector('[data-lesson-image-bigger]');
  assert(bigger,'Existing image resize control unavailable');bigger.click();
  assert(parseFloat(image.style.width)>oldImageWidth,'Resizing diagram raster image failed');
  geometry.imagePercent=true;
  if(component){
    const exported=await component.exportPackage();
    const bytes=exported.bytes;
    const pkg=await (await window.P2LRNReady).openPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
    const decoder=new TextDecoder();
    let foundCanvas=false,foundCloud=false,foundDroplet=false,foundImage=false;
    for(const entity of pkg.entities.values())for(const rep of entity.representations||[]){
      if(!rep.location?.path)continue;
      const html=decoder.decode(await pkg.payload(rep.location.path).read());
      if(html.includes('data-p2lrn-layout="diagram-canvas"'))foundCanvas=true;
      if(html.includes('data-p2lrn-shape="cloud"'))foundCloud=true;
      if(html.includes('data-p2lrn-shape="droplet"'))foundDroplet=true;
      if(html.includes('data-p2lrn-lesson-image'))foundImage=true;
    }
    assert(foundCanvas&&foundCloud&&foundDroplet&&foundImage,'Saved package lost authored diagram or image geometry');
    geometry.packageRoundTrip=true;
  }
  canvas.scrollIntoView({block:'center'});
  const desktop=canvas.getBoundingClientRect();
  geometry.desktopWidth=desktop.width;
  return {ok:true,...geometry};
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
    const advanced=await evalExpr('('+advancedCase.toString()+')()');
    assert.equal(advanced.ok,true);
    info.advanced=advanced;
    const diagram=await evalExpr('('+diagramCase.toString()+')()');
    assert.equal(diagram.ok,true,sample.id+' diagram interaction failed');
    info.diagram=diagram;
    if(out){
      await sleep(500);
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(join(out,'qa-'+sample.id+'.png'),Buffer.from(shot.data,'base64'));
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      await sleep(220);
      const responsive=await evalExpr(`(()=>{
        const root=document.querySelector('p2lrn-studio')?.shadowRoot||document;
        const canvas=root.querySelector('[data-p2lrn-layout="diagram-canvas"]');
        const scroll=canvas?.closest('[data-p2lrn-layout="diagram-scroll"]');
        const image=canvas?.querySelector('img[data-p2lrn-lesson-image]');
        return {canvasWidth:canvas?.getBoundingClientRect().width,
          scrollWidth:scroll?.getBoundingClientRect().width,
          imageWidth:image?.getBoundingClientRect().width,
          imageWidthPercent:parseFloat(image?.style.width||'0'),
          overflow:scroll?.scrollWidth>scroll?.clientWidth};
      })()`);
      assert(responsive.canvasWidth>=640&&responsive.scrollWidth<=390&&responsive.overflow,
        sample.id+' mobile viewport did not preserve proportional diagram inside scroll region');
      info.diagram.mobile=responsive;
      const mobileShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(join(out,'qa-'+sample.id+'-mobile.png'),Buffer.from(mobileShot.data,'base64'));
      await send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});
    }
    results.push({id:sample.id,...info});
  }
  assert.deepEqual(results[0].tabs,results[1].tabs,'Web and NPM UI tabs differ');
  console.log(JSON.stringify({ok:true,port,results,
    screenshots:out?['qa-web.png','qa-npm.png','qa-web-mobile.png','qa-npm-mobile.png']:[]},null,2));
}finally{
  try{ws?.close();}catch{}
  try{browser?.kill();}catch{}
  if(profile)await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:150}).catch(()=>{});
}
