import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {extname, join, resolve, sep} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve(process.cwd());
const siteRoot=join(root,'.netlify-cdn');
const viewerPath=join(siteRoot,'demo','viewer.js');
const APP_ORIGIN='http://127.0.0.1:8765';
const RUNTIME_ORIGIN='http://127.0.0.1:8766';

function invariant(value,message){if(!value)throw new Error(message);}
const sleep=(ms)=>new Promise((resolvePromise)=>setTimeout(resolvePromise,ms));

const types={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8',
  '.p2lrn':'application/vnd.p2lrn.package','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2',
};

async function serve(req,res){
  try{
    const url=new URL(req.url||'/','http://127.0.0.1');
    let rel=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
    let file=resolve(siteRoot,rel);
    if(file!==siteRoot&&!file.startsWith(siteRoot+sep)){res.writeHead(403);res.end();return;}
    let info;
    try{
      info=await stat(file);
      if(info.isDirectory()){file=resolve(file,'index.html');info=await stat(file);}
    }catch{res.writeHead(404,{'Access-Control-Allow-Origin':'*'});res.end('Not Found');return;}
    const headers={
      'Content-Type':types[extname(file).toLowerCase()]||'application/octet-stream',
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Methods':'GET,HEAD,OPTIONS',
      'Access-Control-Allow-Headers':'Range,Content-Type',
      'Accept-Ranges':'bytes',
      'Cache-Control':'no-store',
    };
    if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return;}
    const range=req.headers.range;
    if(range){
      const match=/^bytes=(\d+)-(\d*)$/u.exec(String(range));
      if(!match){res.writeHead(416,{...headers,'Content-Range':`bytes */${info.size}`});res.end();return;}
      const start=Number(match[1]),end=match[2]?Number(match[2]):info.size-1;
      if(start<0||end<start||end>=info.size){res.writeHead(416,{...headers,'Content-Range':`bytes */${info.size}`});res.end();return;}
      res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':String(end-start+1)});
      if(req.method==='HEAD'){res.end();return;}
      createReadStream(file,{start,end}).pipe(res);return;
    }
    res.writeHead(200,{...headers,'Content-Length':String(info.size)});
    if(req.method==='HEAD'){res.end();return;}
    createReadStream(file).pipe(res);
  }catch(error){res.writeHead(500,{'Access-Control-Allow-Origin':'*'});res.end(String(error?.message||error));}
}

async function listen(port){
  const server=createServer((req,res)=>void serve(req,res));
  await new Promise((resolvePromise,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',resolvePromise);
  });
  return server;
}

function chromeCandidates(){
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
}
async function findChrome(){
  for(const candidate of chromeCandidates()){
    try{if((await stat(candidate)).isFile())return candidate;}catch{}
  }
  throw new Error('Chrome/Edge executable not found on the Windows runner.');
}

async function launchChrome(chrome){
  const profile=await mkdtemp(join(tmpdir(),'p2lrn-local-viewer-'));
  const args=[
    '--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-cache',
    '--enable-unsafe-swiftshader','--use-gl=swiftshader',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank',
  ];
  const child=spawn(chrome,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});
  let stderr='';
  const browserWs=await new Promise((resolvePromise,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Chrome DevTools endpoint did not start.')),12000);
    child.stderr.on('data',(chunk)=>{
      stderr=(stderr+String(chunk)).slice(-64000);
      const match=/DevTools listening on (ws:\/\/[^\s]+)/u.exec(stderr);
      if(match){clearTimeout(timer);resolvePromise(match[1]);}
    });
    child.once('error',(error)=>{clearTimeout(timer);reject(error);});
    child.once('exit',(code)=>{clearTimeout(timer);reject(new Error(`Chrome exited early: ${code}\n${stderr.slice(-4000)}`));});
  });
  return {child,profile,browserWs,getStderr:()=>stderr};
}

async function connectPage(browserWs){
  const endpoint=new URL(browserWs);
  const origin=`http://${endpoint.hostname}:${endpoint.port}`;
  let target=null;
  for(let i=0;i<80&&!target;i++){
    try{
      const targets=await (await fetch(origin+'/json/list')).json();
      target=targets.find((item)=>item.type==='page'&&!item.url.startsWith('devtools://'))||null;
    }catch{}
    if(!target)await sleep(100);
  }
  invariant(target?.webSocketDebuggerUrl,'Chrome page target not found.');
  const socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Page DevTools socket timeout.')),5000);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolvePromise();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Page DevTools socket failed.'));},{once:true});
  });
  let seq=0;
  const pending=new Map();
  const security=[];
  const exceptions=[];
  const contexts=new Map();
  socket.addEventListener('message',(event)=>{
    const message=JSON.parse(event.data);
    if(message.id&&pending.has(message.id)){
      const wait=pending.get(message.id);pending.delete(message.id);
      message.error?wait.reject(new Error(JSON.stringify(message.error))):wait.resolve(message.result);
      return;
    }
    if(message.method==='Log.entryAdded'){
      const entry=message.params.entry;
      if(/content security policy|violates the following|refused to|blocked by csp/iu.test(entry.text||''))security.push({level:entry.level,text:entry.text,url:entry.url||null});
    }
    if(message.method==='Runtime.exceptionThrown'){const d=message.params.exceptionDetails||{};exceptions.push({text:d.text||'exception',url:d.url||null,lineNumber:d.lineNumber??null,columnNumber:d.columnNumber??null,description:d.exception?.description||null});}
    if(message.method==='Runtime.executionContextCreated'){
      const ctx=message.params.context;
      contexts.set(ctx.id,{id:ctx.id,origin:ctx.origin||'',name:ctx.name||'',frameId:ctx.auxData?.frameId||null});
    }
    if(message.method==='Runtime.executionContextDestroyed')contexts.delete(message.params.executionContextId);
    if(message.method==='Runtime.executionContextsCleared')contexts.clear();
  });
  const send=(method,params={})=>{
    const id=++seq;
    socket.send(JSON.stringify({id,method,params}));
    return new Promise((resolvePromise,reject)=>pending.set(id,{resolve:resolvePromise,reject}));
  };
  await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
  return {socket,send,security,exceptions,contexts};
}

async function evalTop(cdp,expression){
  const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  return result.result?.value;
}

const stateExpression=String.raw`(()=>{const p=document.getElementById('demo-player'),r=p?.shadowRoot,log=document.querySelector('[data-event-log]')?.textContent||'',rect=(el)=>{if(!el)return null;const b=el.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}};const iframe=r?.querySelector('.p2lrn-package-runtime,.p2lrn-scorm-runtime,.p2lrn-h5p-runtime,.p2lrn-h5p-frame');const stage=r?.querySelector('.p2lrn-stage');const shell=document.querySelector('.viewer-player-shell');const consoleEl=document.querySelector('.viewer-console');const workbench=document.querySelector('.viewer-workbench');return {state:document.querySelector('[data-runtime-state]')?.textContent||'',status:document.querySelector('[data-viewer-status]')?.textContent||'',renderer:document.querySelector('[data-inspect-renderer]')?.textContent||'',runtimeBase:p?.runtimeBaseUrl||'',activityReady:log.includes('p2lrn:activityready'),xapi:log.includes('p2lrn:xapi'),error:log.includes('p2lrn:error'),ready:log.includes('p2lrn:ready'),rendered:log.includes('p2lrn:rendered'),tail:log.slice(-2200),shadowText:r?.textContent?.slice(0,5000)||'',pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,innerWidth:innerWidth,grid:workbench?getComputedStyle(workbench).gridTemplateColumns:'',iframe:rect(iframe),stage:rect(stage),shell:rect(shell),console:rect(consoleEl)}})()`;

async function runtimeTexts(cdp){
  const out=[];
  for(const ctx of [...cdp.contexts.values()]){
    if(!ctx.origin.includes('127.0.0.1:8766'))continue;
    try{
      const evaluated=await cdp.send('Runtime.evaluate',{contextId:ctx.id,expression:"document.body?.innerText?.slice(0,2500)||''",returnByValue:true});
      const value=String(evaluated.result?.value||'').trim();
      if(value)out.push({origin:ctx.origin,frameId:ctx.frameId,text:value});
    }catch{}
  }
  return out;
}

async function waitCase(cdp,name,src,{expectIframe=true,rejectText=[],requireXapi=false,automaticRuntime=false}={}){
  const exceptionStart=cdp.exceptions.length;
  await cdp.send('Page.navigate',{url:`${APP_ORIGIN}/demo/?src=${encodeURIComponent(src)}${automaticRuntime?'&runtime=auto':''}`});
  let state=null;
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    await sleep(300);
    state=await evalTop(cdp,stateExpression);
    if(state?.error||state?.activityReady)break;
  }
  if(requireXapi && state?.activityReady && !state?.xapi){
    const xapiDeadline=Date.now()+5000;
    while(Date.now()<xapiDeadline&&!state?.xapi){
      await sleep(200);
      state=await evalTop(cdp,stateExpression);
    }
  }
  const texts=await runtimeTexts(cdp);
  invariant(state?.activityReady,`${name}: activityready not reached. state=${JSON.stringify(state)} runtimeText=${JSON.stringify(texts)} exceptions=${JSON.stringify(cdp.exceptions.slice(exceptionStart))} security=${JSON.stringify(cdp.security)}`);
  invariant(!state.error,`${name}: p2lrn:error was emitted. ${state.tail}`);
  if(requireXapi) invariant(state.xapi,`${name}: cmi5 initialized without forwarding an xAPI statement. ${state.tail}`);
  if (automaticRuntime) {
    invariant(!state.runtimeBase.startsWith(RUNTIME_ORIGIN),name+': automatic mode must not use a dedicated runtime origin');
    const probe=await evalTop(cdp,String.raw`(()=>{const frame=document.getElementById('demo-player')?.shadowRoot?.querySelector('.p2lrn-package-runtime,.p2lrn-scorm-runtime,.p2lrn-h5p-runtime');return {sandbox:frame?.getAttribute('sandbox')||'',srcdoc:!!frame?.srcdoc,accessible:(()=>{try{return !!frame?.contentDocument}catch{return false}})()}})()`);
    invariant(probe?.srcdoc,name+': automatic runtime did not use a srcdoc frame');
    invariant(!probe?.sandbox.includes('allow-same-origin'),name+': opaque iframe unexpectedly has allow-same-origin');
    invariant(!probe?.accessible,name+': application can access executable iframe content');
  } else {
    invariant(state.runtimeBase.startsWith(RUNTIME_ORIGIN),name+': runtime origin is not isolated locally: '+state.runtimeBase);
  }
  invariant(state.pageOverflow<=2,`${name}: page overflows horizontally by ${state.pageOverflow}px`);
  if(expectIframe){
    invariant(state.iframe&&state.stage,`${name}: runtime iframe/stage missing.`);
    invariant(state.iframe.width<=state.stage.width+2,`${name}: runtime iframe width ${state.iframe.width} exceeds stage ${state.stage.width}`);
  }
  for(const bad of rejectText){
    const inRuntime=texts.some((item)=>item.text.includes(bad));
    const inPlayer=String(state.shadowText||'').includes(bad);
    invariant(!inRuntime&&!inPlayer,`${name}: still shows placeholder text "${bad}". Runtime text: ${JSON.stringify(texts)} Player text: ${state.shadowText}`);
  }
  const security=cdp.security.splice(0);
  invariant(security.length===0,`${name}: CSP/security console errors: ${JSON.stringify(security)}`);
  const caseExceptions=cdp.exceptions.slice(exceptionStart);
  invariant(caseExceptions.length===0,`${name}: unhandled runtime exceptions: ${JSON.stringify(caseExceptions)}`);
  return {name,src,state,texts:texts.map((item)=>item.text.slice(0,700)),exceptions:caseExceptions};
}

async function verifyNarrowLayout(cdp){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1100,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(600);
  const state=await evalTop(cdp,stateExpression);
  invariant(state.pageOverflow<=2,`narrow layout overflows horizontally by ${state.pageOverflow}px`);
  invariant(state.shell&&state.console,'narrow layout shell/console missing');
  invariant(state.console.top>=state.shell.bottom-4,`event log did not stack below player at 1100px: ${JSON.stringify({shell:state.shell,console:state.console,grid:state.grid})}`);
  return state;
}


const visualEvidenceRoot=join(root,'.visual-evidence');
async function captureVisualEvidence(cdp,name){
  await mkdir(visualEvidenceRoot,{recursive:true});
  const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
  if(!shot?.data)throw new Error('Chrome returned no screenshot for '+name);
  const filepath=join(visualEvidenceRoot,name+'.png');
  await writeFile(filepath,Buffer.from(shot.data,'base64'));
  const info=await stat(filepath);
  invariant(info.size>6000,name+': empty browser screenshot');
  return {filename:name+'.png',bytes:info.size};
}
async function studioComponentScenario(){
  const studio=document.getElementById('studio');
  const root=studio?.shadowRoot;
  const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(fn,label,limit=10000)=>{
    const started=Date.now();
    while(Date.now()-started<limit){const value=fn();if(value)return value;await sleep(60);}
    throw new Error('Studio UI timed out at '+label+': '+(root?.textContent||'').slice(-500));
  };
  const q=(sel)=>root.querySelector(sel);
  const click=(sel)=>{const el=q(sel);if(!el)throw new Error('Studio control missing: '+sel);el.click();};
  try{
    await globalThis.P2LRNStudioReady;
    if(!root)throw new Error('CDN Studio did not mount its shadow DOM.');
    const events=[];
    studio.addEventListener('p2lrn-studio-download',e=>events.push({type:'download',filename:e.detail?.filename}));
    studio.addEventListener('p2lrn-studio-open',e=>events.push({type:'open',filename:e.detail?.name}));
    click('[data-create]');
    await wait(()=>!q('[data-body]').hidden,'create course');
    click('.tree-actions button:first-child');
    await wait(()=>q('[data-tree]')?.textContent.includes('Unidad'),'add unit');
    click('.tree-actions button:nth-child(2)');
    await wait(()=>q('.surface[contenteditable="true"]'),'add lesson');
    const title=q('.title');title.textContent='Lección visual P2LRN';title.dispatchEvent(new InputEvent('input',{bubbles:true}));
    const surface=q('.surface');surface.textContent='Lección escrita desde la interfaz visual';surface.dispatchEvent(new InputEvent('input',{bubbles:true}));
    const lessonCount=q('[data-tree]').querySelectorAll('button').length;
    const added=[];
    for(const kind of ['questionnaire','memory','matching','ordering','classification','true-false','fill-blanks','word-search','crossword','rosco','3d','component','composite']){
      const before=q('[data-tree]').querySelectorAll('button').length;
      q('[data-add-menu]').open=true;
      click('[data-add-kind="'+kind+'"]');
      await wait(()=>q('[data-tree]').querySelectorAll('button').length>before,'add '+kind,10000);
      added.push(kind);
    }
    const beforeMedia=q('[data-tree]').querySelectorAll('button').length;
    q('[data-add-menu]').open=true;click('[data-add-kind="file"]');
    const mediaFile=new File([new TextEncoder().encode('Archivo creado desde UI')],'evidence.txt',{type:'text/plain'});
    const transfer=new DataTransfer();transfer.items.add(mediaFile);
    q('[data-resource-file]').files=transfer.files;
    q('[data-resource-file]').dispatchEvent(new Event('change',{bubbles:true}));
    await wait(()=>q('[data-tree]').querySelectorAll('button').length>beforeMedia,'upload media file');
    const exported=await studio.exportPackage();
    if(!exported?.bytes?.byteLength)throw new Error('Empty Studio export');
    const api=await globalThis.P2LRNReady;
    const buffer=exported.bytes.buffer.slice(exported.bytes.byteOffset,exported.bytes.byteOffset+exported.bytes.byteLength);
    const parsed=await api.openPackageBytes(buffer);
    if(!parsed?.manifest?.integrity?.contentRoot)throw new Error('Studio export did not survive Player integrity validation');
    const expectedNodes=lessonCount+added.length+1;
    const actualNodes=q('[data-tree]').querySelectorAll('button').length;
    if(actualNodes!==expectedNodes)throw new Error('Studio tree count mismatch: '+actualNodes+' vs '+expectedNodes);
    const lesson=[...q('[data-tree]').querySelectorAll('button')].find(el=>el.querySelector('span')?.textContent==='Lección visual P2LRN');
    if(!lesson)throw new Error('Edited lesson title missing in Studio course tree');
    lesson.click();
    await wait(()=>q('.title')?.textContent==='Lección visual P2LRN','reopen lesson');
    click('[data-preview]');
    await wait(()=>q('p2lrn-player.preview')?.shadowRoot?.querySelector('.p2lrn-stage'),'Player embedded preview',13000);
    const player=q('p2lrn-player.preview');
    if(!player?.getAttribute('src')?.startsWith('blob:'))throw new Error('Studio preview did not use exported P2LRN blob');
    click('[data-download]');
    await wait(()=>events.some(e=>e.type==='download'),'download through UI');
    const local=new File([exported.bytes],exported.filename,{type:'application/vnd.p2lrn+zip'});
    const inputTransfer=new DataTransfer();inputTransfer.items.add(local);
    q('[data-file]').files=inputTransfer.files;
    q('[data-file]').dispatchEvent(new Event('change',{bubbles:true}));
    await wait(()=>events.some(e=>e.type==='open'),'reopen exported package through file input',14000);
    if(!q('[data-tree]').textContent.includes('Lección visual P2LRN'))throw new Error('UI export/reimport lost edited lesson');
    return {ok:true,added,courseEntries:actualNodes,packageBytes:exported.bytes.byteLength,contentRoot:parsed.manifest.integrity.contentRoot,events,preview:'p2lrn-player',lesson:'Lección visual P2LRN'};
  }catch(error){return {ok:false,error:String(error?.stack||error?.message||error)};}
}
async function verifyStudioComponentUI(cdp){
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/ui-gates/studio-component.html'});
  let loaded=false;
  const deadline=Date.now()+20000;
  while(Date.now()<deadline){
    loaded=await evalTop(cdp,"Boolean(document.getElementById('studio')?.shadowRoot && window.P2LRNStudioReady)");
    if(loaded)break;
    await sleep(150);
  }
  invariant(loaded,'CDN Studio component did not register and render.');
  const exceptionsStart=cdp.exceptions.length;
  const result=await evalTop(cdp,'('+studioComponentScenario.toString()+')()');
  invariant(result?.ok,'CDN Studio browser UI failed: '+JSON.stringify(result));
  const desktop=await captureVisualEvidence(cdp,'studio-cdn-desktop');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(350);
  const mobile=await evalTop(cdp,"(()=>{const r=document.getElementById('studio').shadowRoot,b=r.querySelector('.shell').getBoundingClientRect();return {width:b.width,viewport:innerWidth,body:!r.querySelector('[data-body]').hidden}})()");
  invariant(mobile.body&&mobile.width<=mobile.viewport+2,'Studio mobile layout overflows: '+JSON.stringify(mobile));
  const screenshotMobile=await captureVisualEvidence(cdp,'studio-cdn-mobile');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
  invariant(cdp.exceptions.length===exceptionsStart,'Studio browser exceptions: '+JSON.stringify(cdp.exceptions.slice(exceptionsStart)));
  return {suite:'studio-component-cdn',...result,desktop,mobile,screenshotMobile};
}
async function prepareVisualStudioFixture(){
  const dir=join(siteRoot,'ui-gates');
  await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'studio-component.html'),String.raw'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P2LRN Studio CDN UI E2E</title><style>body{font:15px system-ui,sans-serif;margin:0;padding:16px;background:#f3f5f7}h1{font-size:20px}p2lrn-studio{display:block}</style><script src="/studio/current/dist/p2lrn-studio.js"></script></head><body><h1>Prueba de interfaz Studio desde CDN local</h1><p2lrn-studio id="studio"></p2lrn-studio></body></html>');
}

let appServer=null,runtimeServer=null,chrome=null,cdp=null;
try{
  await prepareVisualStudioFixture();
  const builtViewer=await readFile(viewerPath,'utf8');
  const localViewer=builtViewer.replace(/const RUNTIME_ORIGINS=Object\.freeze\(\[[\s\S]*?\]\);/u,
    `const RUNTIME_ORIGINS=Object.freeze(['${RUNTIME_ORIGIN}','${APP_ORIGIN}']);`);
  invariant(localViewer!==builtViewer,'Could not patch built viewer runtime origins for local-only verification.');
  await writeFile(viewerPath,localViewer,'utf8');

  appServer=await listen(8765);
  runtimeServer=await listen(8766);
  const chromePath=await findChrome();
  chrome=await launchChrome(chromePath);
  cdp=await connectPage(chrome.browserWs);

  const cases=[];
  const failures=[];
  const audit=async(name,src,options={})=>{
    try{cases.push(await waitCase(cdp,name,src,options));}
    catch(error){failures.push({name,message:String(error?.message||error)});}
  };
  await audit('cmi5','/examples/canonical/external/cmi5-catapult-pre-post.p2lrn',{rejectText:['Not implemented yet'],requireXapi:true});
  await audit('h5p','/examples/canonical/external/h5p-crossword.p2lrn');
  await audit('scorm','/examples/canonical/external/scorm12-real.p2lrn',{rejectText:['Not implemented yet']});
  await audit('qti','/examples/canonical/external/qti3-minimal.p2lrn',{expectIframe:false,rejectText:['This QTI item has no itemBody.']});
  await audit('cmi5-automatic','/examples/canonical/external/cmi5-catapult-pre-post.p2lrn',{automaticRuntime:true,requireXapi:true,rejectText:['Not implemented yet']});
  await audit('h5p-automatic','/examples/canonical/external/h5p-crossword.p2lrn',{automaticRuntime:true});
  await audit('scorm-automatic','/examples/canonical/external/scorm12-real.p2lrn',{automaticRuntime:true,rejectText:['Not implemented yet']});
  let narrow=null;
  try{narrow=await verifyNarrowLayout(cdp);}catch(error){failures.push({name:'narrow-layout',message:String(error?.message||error)});}
  let studioUI=null;
  try{studioUI=await verifyStudioComponentUI(cdp);}catch(error){failures.push({name:'studio-component-cdn',message:String(error?.message||error)});}
  console.log(JSON.stringify({ok:failures.length===0,chrome:chromePath,cases,studioUI,failures,narrow:narrow?{innerWidth:narrow.innerWidth,pageOverflow:narrow.pageOverflow,grid:narrow.grid,shell:narrow.shell,console:narrow.console}:null},null,2));
  invariant(failures.length===0,`Local viewer verification failed: ${JSON.stringify(failures)}`);
}finally{
  try{cdp?.socket?.close();}catch{}
  if(chrome?.child?.exitCode===null)chrome.child.kill();
  if(chrome?.profile)await rm(chrome.profile,{recursive:true,force:true}).catch(()=>{});
  await new Promise((resolvePromise)=>appServer?appServer.close(()=>resolvePromise()):resolvePromise());
  await new Promise((resolvePromise)=>runtimeServer?runtimeServer.close(()=>resolvePromise()):resolvePromise());
}
