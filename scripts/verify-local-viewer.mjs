import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
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

const stateExpression=String.raw`(()=>{const p=document.getElementById('demo-player'),r=p?.shadowRoot,log=document.querySelector('[data-event-log]')?.textContent||'',rect=(el)=>{if(!el)return null;const b=el.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}};const iframe=r?.querySelector('.p2lrn-package-runtime,.p2lrn-scorm-runtime,.p2lrn-h5p-runtime,.p2lrn-h5p-frame');const stage=r?.querySelector('.p2lrn-stage');const shell=document.querySelector('.viewer-player-shell');const consoleEl=document.querySelector('.viewer-console');const workbench=document.querySelector('.viewer-workbench');return {state:document.querySelector('[data-runtime-state]')?.textContent||'',status:document.querySelector('[data-viewer-status]')?.textContent||'',renderer:document.querySelector('[data-inspect-renderer]')?.textContent||'',runtimeBase:p?.runtimeBaseUrl||'',activityReady:log.includes('p2lrn:activityready'),error:log.includes('p2lrn:error'),ready:log.includes('p2lrn:ready'),rendered:log.includes('p2lrn:rendered'),tail:log.slice(-2200),shadowText:r?.textContent?.slice(0,5000)||'',pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,innerWidth:innerWidth,grid:workbench?getComputedStyle(workbench).gridTemplateColumns:'',iframe:rect(iframe),stage:rect(stage),shell:rect(shell),console:rect(consoleEl)}})()`;

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

async function waitCase(cdp,name,src,{expectIframe=true,rejectText=[]}={}){
  const exceptionStart=cdp.exceptions.length;
  await cdp.send('Page.navigate',{url:`${APP_ORIGIN}/demo/?src=${encodeURIComponent(src)}`});
  let state=null;
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    await sleep(300);
    state=await evalTop(cdp,stateExpression);
    if(state?.error||state?.activityReady)break;
  }
  const texts=await runtimeTexts(cdp);
  invariant(state?.activityReady,`${name}: activityready not reached. ${JSON.stringify(state)}`);
  invariant(!state.error,`${name}: p2lrn:error was emitted. ${state.tail}`);
  invariant(state.runtimeBase.startsWith(RUNTIME_ORIGIN),`${name}: runtime origin is not isolated locally: ${state.runtimeBase}`);
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

let appServer=null,runtimeServer=null,chrome=null,cdp=null;
try{
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
  await audit('cmi5','/examples/canonical/external/cmi5-catapult-pre-post.p2lrn',{rejectText:['Not implemented yet']});
  await audit('h5p','/examples/canonical/external/h5p-crossword.p2lrn');
  await audit('scorm','/examples/canonical/external/scorm12-real.p2lrn',{rejectText:['Not implemented yet']});
  await audit('qti','/examples/canonical/external/qti3-minimal.p2lrn',{expectIframe:false,rejectText:['This QTI item has no itemBody.']});
  let narrow=null;
  try{narrow=await verifyNarrowLayout(cdp);}catch(error){failures.push({name:'narrow-layout',message:String(error?.message||error)});}
  console.log(JSON.stringify({ok:failures.length===0,chrome:chromePath,cases,failures,narrow:narrow?{innerWidth:narrow.innerWidth,pageOverflow:narrow.pageOverflow,grid:narrow.grid,shell:narrow.shell,console:narrow.console}:null},null,2));
  invariant(failures.length===0,`Local viewer verification failed: ${JSON.stringify(failures)}`);
}finally{
  try{cdp?.socket?.close();}catch{}
  if(chrome?.child?.exitCode===null)chrome.child.kill();
  if(chrome?.profile)await rm(chrome.profile,{recursive:true,force:true}).catch(()=>{});
  await new Promise((resolvePromise)=>appServer?appServer.close(()=>resolvePromise()):resolvePromise());
  await new Promise((resolvePromise)=>runtimeServer?runtimeServer.close(()=>resolvePromise()):resolvePromise());
}
