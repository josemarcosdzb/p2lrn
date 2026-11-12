import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {basename, dirname, extname, join, resolve, sep} from 'node:path';
import {createP2LRNStudioDocument} from '../packages/toolkit/web/studio/new-document.js';
import {exportP2LRNPackage} from '../packages/toolkit/web/studio/package-export.js';
import {openP2LRNPackageBytes} from '../packages/toolkit/web/p2lrn-player.js';
import {parseOfflineAssignmentResult} from '../packages/toolkit/web/studio/offline-assignment.js';
import {buildQuestionnaireGame} from '../packages/toolkit/web/questionnaire-games-core.js';
import {defaultAssembly} from '../packages/toolkit/web/assembly-3d-core.js';
import {createP2LRNCollaborationHandler} from '../packages/player/server/collaboration-http.mjs';
import {tmpdir} from 'node:os';
import {STUDIO_RUNTIME_SHARED_FILES} from '../deploy/netlify/studio-runtime-assets.mjs';

const root=resolve(process.cwd());
const siteRoot=join(root,'.netlify-cdn');
const viewerPath=join(siteRoot,'demo','viewer.js');
let APP_ORIGIN=null;
let RUNTIME_ORIGIN=null;
let COLLABORATION_ORIGIN=null;

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

function createQaCollaborationService(){
  const rooms=new Map(),sessions=new Map();let sequence=0;
  const roomFor=(context,room)=>{
    const key=[context.courseScope,context.contentRoot,context.entityId,room].join('|');
    if(!rooms.has(key))rooms.set(key,{revision:0,participants:new Map(),events:[]});
    return {key,state:rooms.get(key)};
  };
  const current=({actor,input,context})=>{
    const session=sessions.get(String(input.sessionId??''));
    if(!session)throw Object.assign(new Error('Session required.'),{code:'P2LRN_COLLABORATION_SESSION_REQUIRED',statusCode:409});
    if(session.actor!==actor.id)throw Object.assign(new Error('Session actor mismatch.'),{code:'P2LRN_COLLABORATION_SESSION_ACTOR',statusCode:403});
    const scoped=roomFor(context,session.room);
    if(scoped.key!==session.key)throw Object.assign(new Error('Session scope mismatch.'),{code:'P2LRN_COLLABORATION_SCOPE_MISMATCH',statusCode:403});
    return {session,room:scoped.state};
  };
  return {
    async join({actor,input,context}){
      const room=String(input.room??'main'),scoped=roomFor(context,room),sessionId='qa-'+(++sequence);
      sessions.set(sessionId,{actor:actor.id,room,key:scoped.key});scoped.state.participants.set(sessionId,actor.id);
      return {sessionId,participantId:actor.id,revision:scoped.state.revision,presence:scoped.state.participants.size};
    },
    async send(args){
      const {actor,input}=args,{room}=current(args);room.revision+=1;
      const event={revision:room.revision,type:String(input.type??''),participantId:actor.id,payload:input.payload??{}};
      room.events.push(event);return {revision:room.revision,presence:room.participants.size,event};
    },
    async listen(args){
      const {input}=args,{room}=current(args),cursor=Math.max(0,Number(input.cursor)||0);
      return {revision:room.revision,presence:room.participants.size,events:room.events.filter((event)=>event.revision>cursor),hasMore:false};
    },
    async snapshot(args){const {room}=current(args);return {revision:room.revision,presence:room.participants.size,events:room.events};},
    async leave(args){const {input}=args,{room}=current(args);room.participants.delete(String(input.sessionId));sessions.delete(String(input.sessionId));return {left:true,revision:room.revision,presence:room.participants.size};},
  };
}

async function listenCollaboration(port){
  const handler=createP2LRNCollaborationHandler({
    allowedOrigins:[APP_ORIGIN],
    authenticate:(req)=>{const id=String(req.headers.authorization??'').replace(/^Bearer\s+/u,'').trim();return id?{id}:null;},
    resolveContext:({clientContext})=>{
      const contentRoot=String(clientContext.contentRoot??''),entityId=String(clientContext.entityId??'');
      if(!/^sha256:[0-9a-f]{64}$/u.test(contentRoot)||!entityId)throw Object.assign(new Error('Invalid package collaboration context.'),{statusCode:403,code:'P2LRN_COLLABORATION_CONTEXT_DENIED'});
      return {courseScope:'qa-course',contentRoot,entityId};
    },
    authorize:({actor,context})=>Boolean(actor?.id&&context.courseScope==='qa-course'),
    service:createQaCollaborationService(),
  });
  const server=createServer((req,res)=>void handler(req,res));
  await new Promise((resolvePromise,reject)=>{
    server.once('error',reject);server.listen(port,'127.0.0.1',resolvePromise);
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
  let lastError=null;
  for(let attempt=1;attempt<=2;attempt++){
    const profile=await mkdtemp(join(tmpdir(),'p2lrn-local-viewer-'));
    const args=[
      '--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-cache',
      '--enable-unsafe-swiftshader',
      // Chromium's deprecated legacy --use-gl=swiftshader can stall current
      // Windows headless DevTools before any 3D test starts. Use documented
      // SwANGLE WebGL instead, only for the focused 3D diagnostic.
      ...(process.env.P2LRN_QUEST3D_ONLY==='1'
        ? ['--use-gl=angle','--use-angle=swiftshader-webgl',
          '--disable-dev-shm-usage','--disable-extensions','--disable-default-apps',
          '--disable-background-networking','--disable-component-update']
        : ['--use-gl=swiftshader']),
      `--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank',
    ];
    const child=spawn(chrome,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});
    let stderr='';
    try{
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
    }catch(error){
      lastError=error;
      try{if(child.exitCode===null)child.kill();}catch{}
      try{await rm(profile,{recursive:true,force:true});}catch{}
      if(attempt===2||!/Chrome exited early: 0/u.test(String(error?.message??error)))throw error;
      await sleep(500);
    }
  }
  throw lastError??new Error('Browser launch failed.');
}

async function connectPage(browserWs){
  const endpoint=new URL(browserWs);
  const origin=`http://${endpoint.hostname}:${endpoint.port}`;
  const cdpTrace=(phase,extra={})=>{
    if(process.env.P2LRN_QUEST3D_ONLY==='1')
      console.log('P2LRN_CDP_TRACE='+JSON.stringify({phase,...extra}));
  };
  // The real 3D QA uses the same verified Playwright/CDP transport as the
  // bilingual browser suite. Windows-hosted Chrome can expose a debug page
  // yet stall the raw Node WebSocket handshake before any game is evaluated.
  if(process.env.P2LRN_QUEST3D_ONLY==='1'&&
      process.env.P2LRN_QUEST3D_USE_PLAYWRIGHT==='1'){
    const {chromium}=await import('../.p2lrn-i18n-ci/node_modules/playwright-core/index.mjs');
    cdpTrace('playwright-browser-connect-start');
    const browser=await chromium.connectOverCDP(browserWs,{timeout:18000});
    const context=browser.contexts()[0]||await browser.newContext();
    const page=context.pages().find(x=>x.url()==='about:blank')||
      context.pages()[0]||await context.newPage();
    cdpTrace('playwright-page-selected',{url:page.url()});
    const session=await context.newCDPSession(page);
    const security=[],exceptions=[],contexts=new Map();
    session.on('Log.entryAdded',({entry})=>{
      if(/content security policy|violates the following|refused to|blocked by csp/iu.test(entry?.text||''))
        security.push({level:entry.level,text:entry.text,url:entry.url||null});
    });
    session.on('Runtime.exceptionThrown',({exceptionDetails:d})=>{
      exceptions.push({text:d?.text||'exception',url:d?.url||null,lineNumber:d?.lineNumber??null,
        columnNumber:d?.columnNumber??null,description:d?.exception?.description||null});
    });
    session.on('Runtime.executionContextCreated',({context:ctx})=>{
      contexts.set(ctx.id,{id:ctx.id,origin:ctx.origin||'',name:ctx.name||'',frameId:ctx.auxData?.frameId||null});
    });
    session.on('Runtime.executionContextDestroyed',({executionContextId})=>contexts.delete(executionContextId));
    session.on('Runtime.executionContextsCleared',()=>contexts.clear());
    const send=async(method,params={},timeoutMs=20000)=>{
      let timer;
      try{return await Promise.race([
        session.send(method,params),
        new Promise((_,reject)=>{
          timer=setTimeout(()=>reject(new Error('Playwright CDP command timed out: '+method)),timeoutMs);
        })
      ]);}finally{if(timer)clearTimeout(timer);}
    };
    for(const method of ['Runtime.enable','Log.enable','Page.enable','Network.enable']){
      cdpTrace('playwright-command-start',{method});
      await send(method,{},12000);
      cdpTrace('playwright-command-ok',{method});
    }
    await send('Emulation.setDeviceMetricsOverride',
      {width:1500,height:950,deviceScaleFactor:1,mobile:false},12000);
    cdpTrace('playwright-cdp-ready');
    return {socket:{close:()=>{
      void session.detach().catch(()=>{});
      void browser.close().catch(()=>{});
    }},send,security,exceptions,contexts};
  }
  // The offline double-click E2E starts a second real Chrome while the
  // original browser is rendering Studio and 3D. Give its DevTools handshake
  // a bounded chance to complete, and refresh a stale target on retry.
  let socket=null,lastConnectError=null;
  const discoveryDeadline=Date.now()+35000;
  for(let attempt=1;attempt<=2&&!socket&&Date.now()<discoveryDeadline;attempt++){
    cdpTrace('target-discovery-start',{attempt,deadlineMs:Math.max(0,discoveryDeadline-Date.now())});
    let target=null;
    for(let i=0;i<80&&!target&&Date.now()<discoveryDeadline;i++){
      try{
        const targets=await (await fetch(origin+'/json/list',{signal:AbortSignal.timeout(3500)})).json();
        target=targets.find((item)=>item.type==='page'&&!item.url.startsWith('devtools://'))||null;
      }catch{}
      if(!target)await sleep(100);
    }
    if(!target?.webSocketDebuggerUrl){
      lastConnectError=new Error('Chrome page target not found.');
      cdpTrace('target-discovery-failed',{attempt});
      continue;
    }
    cdpTrace('target-found',{attempt,targetUrl:target.url,type:target.type});
    const candidate=new WebSocket(target.webSocketDebuggerUrl);
    try{
      await new Promise((resolvePromise,reject)=>{
        let timer=null,settled=false;
        const complete=(error)=>{
          if(settled)return;
          settled=true;
          clearTimeout(timer);
          candidate.removeEventListener('open',onOpen);
          candidate.removeEventListener('error',onError);
          error?reject(error):resolve();
        };
        const onOpen=()=>complete();
        const onError=()=>complete(new Error('Page DevTools socket failed.'));
        candidate.addEventListener('open',onOpen);
        candidate.addEventListener('error',onError);
        timer=setTimeout(()=>complete(new Error('Page DevTools socket timeout.')),
          Math.min(12000,Math.max(1000,discoveryDeadline-Date.now())));
      });
      socket=candidate;
      cdpTrace('page-socket-connected',{attempt});
    }catch(error){
      lastConnectError=error;
      // Do not leak a late-opening WebSocket after a timed-out attempt.
      if(candidate.readyState===WebSocket.CONNECTING)
        candidate.addEventListener('open',()=>candidate.close(),{once:true});
      else try{candidate.close();}catch{}
      if(attempt<2)await sleep(400);
    }
  }
  invariant(socket,'Page DevTools connection failed after two bounded attempts: '+
    String(lastConnectError?.message||lastConnectError));
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
  // Never let one frozen DevTools command hold the Windows job until GitHub's
  // global 40-minute timeout. A rejected command is a real QA failure.
  const send=(method,params={},timeoutMs=60000)=>{
    const id=++seq;
    return new Promise((resolvePromise,reject)=>{
      const timer=setTimeout(()=>{
        pending.delete(id);
        reject(new Error('CDP command timed out: '+method+' after '+timeoutMs+'ms'));
      },timeoutMs);
      pending.set(id,{
        resolve:value=>{clearTimeout(timer);resolvePromise(value);},
        reject:error=>{clearTimeout(timer);reject(error);}
      });
      try{socket.send(JSON.stringify({id,method,params}));}
      catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
    });
  };
  socket.addEventListener('close',()=>{
    for(const [id,wait] of pending){pending.delete(id);wait.reject(new Error('CDP socket closed before command '+id+' returned'));}
  });
  for(const method of ['Runtime.enable','Log.enable','Page.enable','Network.enable']){
    cdpTrace('command-start',{method});
    await send(method,{},12000);
    cdpTrace('command-ok',{method});
  }
  cdpTrace('command-start',{method:'Emulation.setDeviceMetricsOverride'});
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false},12000);
  cdpTrace('command-ok',{method:'Emulation.setDeviceMetricsOverride'});
  return {socket,send,security,exceptions,contexts};
}

async function evalTop(cdp,expression){
  const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails){
    const detail=result.exceptionDetails;
    throw new Error('Chrome evaluation: '+String(detail.exception?.description||detail.text||'unknown browser error'));
  }
  return result.result?.value;
}

async function waitForEval(cdp,expression,label,timeout=20000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    try{const value=await evalTop(cdp,expression);if(value)return value;}
    catch(error){
      // A navigational DOM probe may throw while loading; a dead CDP command
      // must instead fail immediately so the exact stalled case is reported.
      if(/CDP command timed out|CDP socket closed/u.test(String(error?.message)))throw error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForDownloadedFile(directory,suffix,timeout=20000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    const names=await readdir(directory).catch(()=>[]);
    const name=names.find((item)=>item.endsWith(suffix)&&!item.endsWith('.crdownload'));
    if(name){
      const filepath=join(directory,name);
      try{const info=await stat(filepath);if(info.isFile()&&info.size>0)return filepath;}catch{}
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for a ${suffix} download in ${directory}.`);
}

async function waitForExistingFile(filepath,label,timeout=20000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    try{const info=await stat(filepath);if(info.isFile()&&info.size>0)return info;}catch{}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}: ${filepath}`);
}

async function waitForLauncherUrl(child,timeout=25000){
  let output='';
  return new Promise((resolvePromise,reject)=>{
    let settled=false,timer=null;
    const finish=(fn,value)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);fn(value);};
    const inspect=(chunk)=>{
      output=(output+String(chunk)).slice(-64000);
      const match=/http:\/\/127\.0\.0\.1:\d+\/index\.html/u.exec(output);
      if(match)finish(resolvePromise,{url:match[0],output});
    };
    child.stdout?.on('data',inspect);
    child.stderr?.on('data',inspect);
    child.once('error',(error)=>finish(reject,error));
    child.once('exit',(code)=>finish(reject,new Error(`Offline launcher exited before exposing its URL (code ${code}).\n${output.slice(-5000)}`)));
    timer=setTimeout(()=>finish(reject,new Error(`Offline launcher did not expose its loopback URL.\n${output.slice(-5000)}`)),timeout);
  });
}

async function stopWindowsTree(child){
  if(!child||child.exitCode!==null)return;
  await new Promise((resolvePromise)=>{
    let settled=false;
    const done=()=>{if(!settled){settled=true;resolvePromise();}};
    try{
      const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      killer.once('exit',done);
      killer.once('error',()=>{try{child.kill();}catch{}done();});
      setTimeout(done,4000);
    }catch{try{child.kill();}catch{}done();}
  });
}

async function runOfflineDoubleClickE2E({launcherPath,chromePath,exportMeta}){
  invariant(process.platform==='win32','The real double-click offline gate requires Windows.');
  invariant(process.env.LOCALAPPDATA,'LOCALAPPDATA is required for the Windows offline launcher.');
  let launcher=null,browser=null,offlineCdp=null,downloads=null,extractedRoot=null;
  try{
    launcher=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','call',launcherPath],{cwd:dirname(launcherPath),windowsHide:true,stdio:['ignore','pipe','pipe']});
    const launched=await waitForLauncherUrl(launcher);
    const payloadDigest=String(exportMeta.payloadDigest??'').toLowerCase();
    invariant(/^sha256:[0-9a-f]{64}$/u.test(payloadDigest),'Studio did not return a valid launcher payload digest.');
    extractedRoot=join(process.env.LOCALAPPDATA,'P2LRN','Offline',payloadDigest.slice(7));
    const extractedCourse=join(extractedRoot,'www','course.p2lrn');
    const extractedAssignment=join(extractedRoot,'www','assignment.json');
    const courseInfo=await waitForExistingFile(extractedCourse,'the extracted real P2LRN course');
    await waitForExistingFile(extractedAssignment,'the extracted offline assignment manifest');
    const courseBytes=await readFile(extractedCourse);
    const courseBuffer=courseBytes.buffer.slice(courseBytes.byteOffset,courseBytes.byteOffset+courseBytes.byteLength);
    const opened=await openP2LRNPackageBytes(courseBuffer);
    invariant(opened.manifest.integrity.contentRoot===exportMeta.contentRoot,'The launcher extracted a course with a different content root.');
    const assignmentJson=JSON.parse(await readFile(extractedAssignment,'utf8'));
    invariant(assignmentJson.assignmentId===exportMeta.assignmentId,'The launcher extracted a different assignment.');
    invariant(assignmentJson.contentRoot===exportMeta.contentRoot,'The extracted assignment points to a different course.');

    downloads=await mkdtemp(join(tmpdir(),'p2lrn-offline-result-'));
    browser=await launchChrome(chromePath);
    offlineCdp=await connectPage(browser.browserWs);
    await offlineCdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
    await offlineCdp.send('Page.navigate',{url:launched.url});
    await waitForEval(offlineCdp,`(()=>{const b=document.getElementById('start');return Boolean(b&&!b.disabled&&document.getElementById('title')?.textContent.includes('Prueba doble clic real'));})()`,'the real offline assignment gate');
    invariant(await evalTop(offlineCdp,`(()=>{const b=document.getElementById('start');if(!b||b.disabled)return false;b.click();return true;})()`),'The real offline assignment could not be started.');
    await waitForEval(offlineCdp,`(()=>{const p=document.querySelector('#player p2lrn-player'),r=p?.shadowRoot;if(!r)return false;if(r.querySelector('.p2lrn-q-card'))return true;const target=[...r.querySelectorAll('button')].find((button)=>button.textContent.includes('Pregunta offline real'));if(target)target.click();return Boolean(r.querySelector('.p2lrn-q-card'));})()`,'the questionnaire rendered from the extracted P2LRN',45000);
    const answered=await evalTop(offlineCdp,`(()=>{const p=document.querySelector('#player p2lrn-player'),r=p?.shadowRoot,input=r?.querySelector('input[type="radio"]:not(:disabled)');if(!input)return false;input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));const finish=[...r.querySelectorAll('button:not(:disabled)')].find((button)=>button.textContent.trim()==='Finalizar');if(!finish)return false;finish.click();return true;})()`);
    invariant(answered,'The real offline questionnaire could not be answered and submitted.');
    const submitted=await waitForEval(offlineCdp,`(()=>{
      const r=document.querySelector('#player p2lrn-player')?.shadowRoot;
      const result=r?.querySelector('.p2lrn-q-result');
      if(!result)return null;
      return {text:result.textContent||'',scoreVisible:Boolean(result.querySelector('.p2lrn-q-score'))};
    })()`,'the questionnaire submission result');
    invariant(submitted.scoreVisible===false&&submitted.text.includes('La corrección se mostrará únicamente cuando lo permita el profesor.'),
      'Offline questionnaire leaked the score despite deferred feedback: '+JSON.stringify(submitted));
    const scoreText='oculto al alumno';
    const interactionScreenshot=await captureVisualEvidence(offlineCdp,'studio-offline-double-click-real-submitted');
    invariant(await evalTop(offlineCdp,`(()=>{const b=document.getElementById('finish');if(!b||b.disabled)return false;b.click();return true;})()`),'The outer offline submission button is unavailable.');
    await waitForEval(offlineCdp,`Boolean(document.querySelector('#finished:not([hidden])'))`,'the final offline submission screen');
    const finalScreenshot=await captureVisualEvidence(offlineCdp,'studio-offline-double-click-real-result');
    const resultPath=await waitForDownloadedFile(downloads,'.p2lrn-result',25000);
    const resultText=await readFile(resultPath,'utf8');
    return {
      resultText,resultFilename:basename(resultPath),launcherUrl:launched.url,launcherOutput:launched.output.slice(-5000),
      extractedCourseBytes:courseInfo.size,scoreText,interactionScreenshot,finalScreenshot,
    };
  }finally{
    try{offlineCdp?.socket?.close();}catch{}
    if(browser?.child?.exitCode===null)browser.child.kill();
    if(browser?.profile)await rm(browser.profile,{recursive:true,force:true}).catch(()=>{});
    await stopWindowsTree(launcher);
    if(downloads)await rm(downloads,{recursive:true,force:true}).catch(()=>{});
    if(extractedRoot)await rm(extractedRoot,{recursive:true,force:true}).catch(()=>{});
  }
}
const stateExpression=String.raw`(()=>{const p=document.getElementById('demo-player'),r=p?.shadowRoot,log=document.querySelector('[data-event-log]')?.textContent||'',rect=(el)=>{if(!el)return null;const b=el.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}};const iframe=r?.querySelector('.p2lrn-package-runtime,.p2lrn-scorm-runtime,.p2lrn-h5p-runtime,.p2lrn-h5p-frame');const stage=r?.querySelector('.p2lrn-stage');const shell=document.querySelector('.viewer-player-shell');const consoleEl=document.querySelector('.viewer-console');const workbench=document.querySelector('.viewer-workbench');return {state:document.querySelector('[data-runtime-state]')?.textContent||'',status:document.querySelector('[data-viewer-status]')?.textContent||'',renderer:document.querySelector('[data-inspect-renderer]')?.textContent||'',runtimeBase:p?.runtimeBaseUrl||'',activityReady:log.includes('p2lrn:activityready'),xapi:log.includes('p2lrn:xapi'),error:log.includes('p2lrn:error'),ready:log.includes('p2lrn:ready'),rendered:log.includes('p2lrn:rendered'),tail:log.slice(-2200),shadowText:r?.textContent?.slice(0,5000)||'',pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,innerWidth:innerWidth,grid:workbench?getComputedStyle(workbench).gridTemplateColumns:'',iframe:rect(iframe),stage:rect(stage),shell:rect(shell),console:rect(consoleEl)}})()`;

async function runtimeTexts(cdp){
  const out=[];
  for(const ctx of [...cdp.contexts.values()]){
    if(!ctx.origin.startsWith(RUNTIME_ORIGIN))continue;
    try{
      const evaluated=await cdp.send('Runtime.evaluate',{contextId:ctx.id,expression:"document.body?.innerText?.slice(0,2500)||''",returnByValue:true});
      const value=String(evaluated.result?.value||'').trim();
      if(value)out.push({origin:ctx.origin,frameId:ctx.frameId,text:value});
    }catch{}
  }
  return out;
}

// A public visitor opens /demo/ without URL parameters. This must succeed
// without a CORS-readable secondary Netlify origin, unlike the legacy static-only boot.
async function verifyDefaultViewerStartup(cdp){
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/'});
  const probe=String.raw`(()=>{
    const sample=document.querySelector('[data-sample]');
    const player=document.getElementById('demo-player');
    const log=document.querySelector('[data-event-log]')?.textContent||'';
    const src=player?.getAttribute('src')||'';
    const status=document.querySelector('[data-runtime-state]')?.textContent||'';
    const result={
      catalogCount:sample?.options?.length||0,
      src,
      status,
      rendered:log.includes('p2lrn:rendered'),
      activityReady:log.includes('p2lrn:activityready'),
      runtimeAutomatic:log.includes('automatic-opaque'),
      failedRuntime:log.includes('runtime-host-candidate-failed'),
      bootError:log.includes('boot-error'),
      tail:log.slice(-1500)
    };
    return result.bootError||(result.catalogCount>1&&src&&(result.rendered||result.activityReady))
      ? result : null;
  })()`;
  let result;
  try{result=await waitForEval(cdp,probe,'unparameterized public viewer startup',30000);}
  catch(error){
    const detail=await evalTop(cdp,String.raw`(()=>({
      url:location.href,
      ready:document.readyState,
      catalogCount:document.querySelector('[data-sample]')?.options?.length??null,
      selected:document.querySelector('[data-sample]')?.value??null,
      playerSrc:document.getElementById('demo-player')?.getAttribute('src')??null,
      runtimeState:document.querySelector('[data-runtime-state]')?.textContent??null,
      viewerStatus:document.querySelector('[data-viewer-status]')?.textContent??null,
      playerText:document.getElementById('demo-player')?.shadowRoot?.textContent?.slice(0,500)??null,
      swController:navigator.serviceWorker?.controller?.scriptURL??null,
      eventLog:document.querySelector('[data-event-log]')?.textContent?.slice(-2400)??null,
    }))()`).catch((diagnosticError)=>({diagnosticError:String(diagnosticError)}));
    throw new Error(String(error?.message??error)+'; default viewer state='+JSON.stringify(detail));
  }
  invariant(result&&!result.bootError,'Public viewer failed to initialize: '+JSON.stringify(result));
  invariant(result.catalogCount>1&&result.src,'Default viewer did not populate the catalogue and load src');
  invariant(result.runtimeAutomatic&&!result.failedRuntime,'Default viewer must use its secure opaque runtime without remote health probing');
  return result;
}

async function waitCase(cdp,name,src,{expectIframe=true,rejectText=[],requireXapi=false,automaticRuntime=false}={}){
  const exceptionStart=cdp.exceptions.length;
  await cdp.send('Page.navigate',{url:`${APP_ORIGIN}/demo/?src=${encodeURIComponent(src)}${automaticRuntime?'&runtime=auto':'&runtime=isolated'}`});
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
    const probe=await evalTop(cdp,String.raw`(()=>{const frame=document.getElementById('demo-player')?.shadowRoot?.querySelector('.p2lrn-package-runtime,.p2lrn-scorm-runtime,.p2lrn-h5p-frame,.p2lrn-h5p-runtime');return {sandbox:frame?.getAttribute('sandbox')||'',srcdoc:!!frame?.srcdoc,src:frame?.getAttribute('src')||'',accessible:(()=>{try{return !!frame?.contentDocument}catch{return false}})()}})()`);
    // HTTP(S) automatic opaque shells deliberately use separate static host
    // documents to avoid inheriting the LMS CSP; file: previews use srcdoc.
    const opaqueUrl=probe?.src?new URL(probe.src,APP_ORIGIN):null;
    const trustedOpaqueHost=opaqueUrl?.origin===new URL(APP_ORIGIN).origin&&
      ['/runtime-host/package-opaque.html','/runtime-host/h5p-opaque.html'].some(path=>opaqueUrl.pathname.endsWith(path));
    invariant(probe?.srcdoc||trustedOpaqueHost,name+': automatic iframe is neither a srcdoc nor a verified opaque host: '+JSON.stringify(probe));
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


async function prepareGameFixtures(){
  const games=[['crossword','Crucigrama de prueba'],['rosco','Rosco de prueba']];
  await mkdir(join(siteRoot,'examples'),{recursive:true});
  for(const [kind,title] of games){
    const doc=createP2LRNStudioDocument({title,language:'es'});
    const unit=doc.children(doc.rootId)[0];
    const activity=doc.addGame(unit.id,{kind,title,language:'es'});
    const record=await doc.readQuestionnaire(activity.id);
    const renderer=activity.extensions?.['https://p2lrn.org/ext/renderer-preference/1']?.preferred;
    const compiled=buildQuestionnaireGame(record.payload,renderer,{seedSource:'game-ui-regression'});
    invariant(compiled.compatible,kind+': generated test package not playable '+JSON.stringify(compiled.reasons));
    const exported=await exportP2LRNPackage(doc);
    await writeFile(join(siteRoot,'examples','game-ui-'+kind+'.p2lrn'),exported.bytes);
  }

  // One exported 3D package exercises all three native modes in sequence,
  // including saved partial state when navigating between trials.
  const threeDoc=createP2LRNStudioDocument({title:'Curso QA 3D',language:'es'});
  const unit=threeDoc.children(threeDoc.rootId)[0];
  const threePayload={
    schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
    version:'0.4.0',title:'Laboratorio 3D QA',language:'es',
    grading:{mode:'embedded-key'},
    presentation:{questionMode:'one-at-a-time',shuffleQuestions:false,showFeedback:'after-submit'},
    questions:[
      {id:'q-order',type:'ordering',prompt:'Ordena los tres bloques',points:1,
        items:[{id:'o1',text:'Primero'},{id:'o2',text:'Segundo'},{id:'o3',text:'Tercero'}],
        solution:{order:['o1','o2','o3']}},
      {id:'q-match',type:'matching',prompt:'Relaciona país y capital',points:1,
        left:[{id:'l1',text:'España'},{id:'l2',text:'Francia'},{id:'l3',text:'Italia'}],
        right:[{id:'r1',text:'Madrid'},{id:'r2',text:'París'},{id:'r3',text:'Roma'}],
        solution:{pairs:[{left:'l1',right:'r1'},{left:'l2',right:'r2'},{left:'l3',right:'r3'}]}},
      {id:'q-class',type:'classification',prompt:'Clasifica los objetos',points:1,
        items:[{id:'c1',text:'Triángulo'},{id:'c2',text:'Círculo'}],
        categories:[{id:'g1',text:'Tres lados'},{id:'g2',text:'Sin lados'}],
        solution:{assignments:[{item:'c1',category:'g1'},{item:'c2',category:'g2'}]}}
    ]
  };

  // Valid, embedded mesh asset: one actual GLB triangle with local POSITION and indices.
  // Player must parse this real GLB, not silently replace it with a fallback cube.
  function createAssemblyTestGLB(){
    const bin=new Uint8Array(44),dv=new DataView(bin.buffer);
    [0,0,0,0.8,0,0,0,0.8,0].forEach((v,i)=>dv.setFloat32(4*i,v,true));
    [0,1,2].forEach((v,i)=>dv.setUint16(36+2*i,v,true));
    const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],
      nodes:[{mesh:0,name:'Pieza tridimensional de prueba'}],
      meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],
      buffers:[{byteLength:44}],bufferViews:[
        {buffer:0,byteOffset:0,byteLength:36,target:34962},
        {buffer:0,byteOffset:36,byteLength:6,target:34963}],
      accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[0.8,0.8,0]},
        {bufferView:1,componentType:5123,count:3,type:'SCALAR'}]};
    const json=new TextEncoder().encode(JSON.stringify(doc)),len=(json.byteLength+3)&~3;
    const out=new Uint8Array(12+8+len+8+bin.byteLength),view=new DataView(out.buffer);
    view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,out.byteLength,true);
    view.setUint32(12,len,true);view.setUint32(16,0x4e4f534a,true);
    out.fill(32,20,20+len);out.set(json,20);
    view.setUint32(20+len,bin.byteLength,true);view.setUint32(24+len,0x004e4942,true);out.set(bin,28+len);
    return out;
  }
  const assemblyAsset=await threeDoc.addAssemblyAsset({bytes:createAssemblyTestGLB(),filename:'pieza-qa.glb'});
  const assemblyScene=defaultAssembly();
  assemblyScene.assets=[{id:assemblyAsset.id,path:assemblyAsset.path,name:'pieza-qa.glb',size:assemblyAsset.size,nodes:assemblyAsset.inspected.nodes}];
  assemblyScene.referenceAssetId=assemblyAsset.id;
  assemblyScene.pieces[0].assetId=assemblyAsset.id;
  assemblyScene.pieces[0].nodeId=assemblyAsset.inspected.nodes[0].nodeId;
  threePayload.questions.push({
    id:'q-assembly',type:'classification',prompt:'Ensambla las piezas en el espacio',points:2,
    items:assemblyScene.pieces.map(p=>({id:p.id,text:p.text})),
    categories:assemblyScene.targets.map(t=>({id:t.id,text:t.text})),
    solution:{assignments:assemblyScene.links.map(link=>({item:link.pieceId,category:link.targetId}))},
    assembly3d:assemblyScene,
  });
  const threeRenderer='https://p2lrn.org/renderer/questionnaire/3d-order-match';
  const compiled3D=buildQuestionnaireGame(threePayload,threeRenderer,{seedSource:'real-three-game-regression'});
  invariant(compiled3D.compatible,'3D game modes must be compatible: '+JSON.stringify(compiled3D.reasons));
  threeDoc.addQuestionnaire(unit.id,{title:'Laboratorio 3D QA',language:'es',renderer:threeRenderer,payload:threePayload});
  const exported3D=await exportP2LRNPackage(threeDoc);
  await writeFile(join(siteRoot,'examples','game-ui-3d-mixed.p2lrn'),exported3D.bytes);
}

async function verifyThreeGameInteractionAndResume(cdp){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/?src='+encodeURIComponent('/examples/game-ui-3d-mixed.p2lrn')});
  await waitForEval(cdp,"document.getElementById('demo-player')?.shadowRoot?.querySelectorAll('.p2lrn-nav button').length>0",'3D browser course navigation',30000);
  const outcome=await evalTop(cdp,`(async()=>{
    const player=document.getElementById('demo-player'),root=player.shadowRoot;
    const wait=async(predicate,label,timeout=20000)=>{
      const start=performance.now();
      while(performance.now()-start<timeout){
        if(predicate())return true;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      const diagnostic={
        trial:root.querySelector('.p2lrn-3d-trial')?.textContent?.slice(0,350)??null,
        message:[...root.querySelectorAll('[role=status]')].map(n=>n.textContent?.slice(0,350)),
        current:root.querySelector('.p2lrn-stage')?.textContent?.slice(0,450)??null,
        page:root.textContent?.slice(-700)??null
      };
      throw new Error(label+' timeout: '+JSON.stringify(diagnostic));
    };
    const open=[...root.querySelectorAll('.p2lrn-nav button')].find(button=>button.textContent.includes('Laboratorio 3D QA'));
    if(!open)throw new Error('3D QA activity missing from navigation');
    open.click();
    // Scope the trial to the currently visible Player stage: background or
    // cached activity trees may retain old accessible controls in the DOM.
    const stage=()=>root.querySelector('.p2lrn-stage');
    const trial=()=>stage()?.querySelector('.p2lrn-3d-trial');
    // The heading is a sibling of the accessible answer panel in compiled
    // Player layouts; inspect the active stage heading, not a panel child.
    const title=()=>stage()?.querySelector('.p2lrn-3d-layout h3')?.textContent||'';
    await wait(()=>Boolean(trial())&&title()==='Ordena los tres bloques','3D ordering scene');
    // The public Player must NEVER submit unplayed 3D challenges.
    const action=()=>[...root.querySelectorAll('.p2lrn-game-shell button')].find(x=>
      ['Revisar pendientes','Finalizar actividad'].includes(x.textContent));
    if(action()?.textContent!=='Revisar pendientes')
      throw Error('An incomplete 3D activity incorrectly offers Finalizar actividad');
    action().click();
    await wait(()=>root.querySelector('.p2lrn-game-shell')?.textContent?.includes('No puedes finalizar: quedan pruebas sin completar.'),
      'unfinished 3D finish was not refused');
    if(document.querySelector('[data-event-log]')?.textContent?.includes('p2lrn:score'))
      throw Error('Incomplete 3D activity emitted an illegal score');
    const status=()=>[...root.querySelectorAll('.p2lrn-game-status')].at(-1)?.textContent??'';
    const select=(name,value)=>{
      const label=[...trial().querySelectorAll('label')].find(node=>node.querySelector('span')?.textContent===name);
      const input=label?.querySelector('select');
      if(!input)throw new Error('3D option missing: '+name);
      input.value=value;
      input.dispatchEvent(new Event('change',{bubbles:true}));
      return input.value;
    };
    const read=(name)=>{
      const label=[...trial().querySelectorAll('label')].find(node=>node.querySelector('span')?.textContent===name);
      return label?.querySelector('select')?.value;
    };
    const go=(label)=>{
      const button=[...trial().querySelectorAll('button')].find(node=>node.textContent.trim()===label);
      if(!button||button.disabled)throw new Error('3D navigation '+label+' unavailable');
      button.click();
    };
    const choose=(column,label)=>{
      const items=[...trial().querySelectorAll('.p2lrn-match-column')];
      const button=[...items[column]?.querySelectorAll('button')??[]].find(x=>x.textContent===label);
      if(!button)throw new Error('3D matching button missing: '+label);
      button.click();
    };
    if(select('Primero','0')!=='0')throw new Error('3D ordering placement failed');
    go('Siguiente');
    if(title()!=='Relaciona país y capital')throw new Error('3D did not navigate to matching');
    choose(0,'España');choose(1,'Madrid');
    if(!status().includes('1/3'))throw new Error('3D matching did not register first relation: '+status());
    go('Anterior');
    if(read('Primero')!=='0'||!status().includes('recuperadas'))
      throw new Error('3D ordering placement lost when returning: '+read('Primero')+' '+status());
    select('Segundo','1');select('Tercero','2');
    if(!status().includes('Orden correcto'))throw new Error('3D ordering did not finish: '+status());
    go('Siguiente');
    if(!status().includes('Conexiones recuperadas · 1/3'))
      throw new Error('3D matching connection did not restore: '+status());
    choose(0,'Francia');choose(1,'París');
    choose(0,'Italia');choose(1,'Roma');
    if(!status().includes('3/3'))throw new Error('3D matching could not finish: '+status());
    const matchingPreserved=[...trial().querySelectorAll('.p2lrn-match-column button.is-solved')].length;
    go('Siguiente');
    if(title()!=='Clasifica los objetos')throw new Error('3D did not navigate to classification');
    if(select('Triángulo','g1')!=='g1')throw new Error('3D classification failed');
    go('Anterior');
    go('Siguiente');
    if(read('Triángulo')!=='g1'||!status().includes('recuperadas'))
      throw new Error('3D classification did not restore: '+read('Triángulo')+' '+status());
    select('Círculo','g2');
    if(!status().includes('completada'))throw new Error('3D classification could not finish: '+status());

    // Real assembly scene, real GLB and same exported course, in the actual
    // Player/Three.js/Rapier browser runtime. Check no fallback model warning.
    go('Siguiente');
    await wait(()=>title()==='Ensambla las piezas en el espacio' && Boolean(trial()?.querySelector('select[aria-label="Pieza que vas a colocar"]')),'3D assembly scene');
    if(!root.querySelector('.p2lrn-3d-interactive'))throw new Error('3D assembly silently entered fallback mode');
    const assemblyTrial=trial();
    const warning=assemblyTrial.querySelector('[role=alert]');
    if(warning)throw new Error('GLB asset could not load in Player: '+warning.textContent);
    const piecePicker=assemblyTrial.querySelector('select[aria-label="Pieza que vas a colocar"]');
    const targetPicker=assemblyTrial.querySelector('select[aria-label="Zona donde colocar la pieza"]');
    const placeButton=[...assemblyTrial.querySelectorAll('button')].find(button=>button.textContent==='Colocar pieza');
    if(!piecePicker||!targetPicker||!placeButton)throw new Error('Assembly controls missing in Player');
    for(const [piece,target] of [['piece-1','target-1'],['piece-2','target-2']]){
      piecePicker.value=piece;
      piecePicker.dispatchEvent(new Event('change',{bubbles:true}));
      targetPicker.value=target;
      targetPicker.dispatchEvent(new Event('change',{bubbles:true}));
      if(placeButton.disabled)throw new Error('Assembly placement locked unexpectedly: '+piece);
      placeButton.click();
    }
    if(!status().includes('Montaje completado'))throw new Error('Assembly snap/score did not complete: '+status());
    const assemblyProgress=assemblyTrial.querySelector('p[role=status]')?.textContent??'';
    if(!assemblyProgress.includes('2/2'))throw new Error('Assembly did not persist both pieces: '+assemblyProgress);
    const finish=[...root.querySelectorAll('.p2lrn-game-shell button')].find(x=>x.textContent==='Finalizar actividad');
    if(!finish)throw new Error('3D scoring action missing after ALL challenges were completed');
    if(root.querySelector('.p2lrn-game-shell')?.textContent?.includes('Pruebas pendientes: 1.'))
      throw Error('3D completion count not updated after solving all trials');
    finish.click();
    await wait(()=>root.querySelector('.p2lrn-game-shell')?.textContent?.includes('Resultado:')||
      document.querySelector('[data-event-log]')?.textContent?.includes('p2lrn:score'),'3D final score');
    const log=document.querySelector('[data-event-log]')?.textContent||'';
    if(log.includes('p2lrn:error'))throw new Error('3D runtime emitted an error: '+log.slice(-1000));
    return {threeModes:['ordering','matching','classification','assembly'],orderedAndSaved:true,matchingRestored:true,
      classificationRestored:true,assemblyWithRealGLB:true,solvedConnectionButtons:matchingPreserved,
      finalScoreReceived:log.includes('p2lrn:score'),noRuntimeError:true};
  })()`);
  invariant(outcome?.orderedAndSaved&&outcome?.matchingRestored&&outcome?.classificationRestored
    &&outcome.assemblyWithRealGLB&&outcome.finalScoreReceived, '3D browser regression incomplete: '+JSON.stringify(outcome));
  const screenshot=await captureElementVisualEvidence(cdp,'3d-three-modes-completed',
    "document.getElementById('demo-player')",{maxHeight:1450});
  return {...outcome,screenshot};
}

async function verifyAssemblyScatteredViewport(cdp){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/?src='+encodeURIComponent('/examples/game-ui-3d-mixed.p2lrn')});
  await waitForEval(cdp,"document.getElementById('demo-player')?.shadowRoot?.querySelectorAll('.p2lrn-nav button').length>0",'assembly random start navigation',30000);
  const result=await evalTop(cdp,"(async()=>{\n    const root=document.getElementById('demo-player')?.shadowRoot;\n    const wait=async(check,label)=>{\n      for(let i=0;i<200;i++){\n        if(check())return true;\n        await new Promise(r=>setTimeout(r,100));\n      }\n      throw Error('Student assembly view unavailable: '+label);\n    };\n    const button=[...root.querySelectorAll('.p2lrn-nav button')].find(b=>b.textContent.includes('Laboratorio 3D QA'));\n    if(!button)throw Error('Assembly sample is missing from student course');\n    button.click();\n    const stage=()=>root.querySelector('.p2lrn-stage');\n    const next=()=>[...stage()?.querySelectorAll('.p2lrn-3d-trial button')??[]].find(b=>b.textContent==='Siguiente');\n    const title=()=>stage()?.querySelector('.p2lrn-3d-question-head h3')?.textContent;\n    await wait(()=>title()==='Ordena los tres bloques','first trial');\n    for(const heading of ['Relaciona país y capital','Clasifica los objetos','Ensambla las piezas en el espacio']){\n      const b=next();\n      if(!b||b.disabled)throw Error('Next 3D trial unavailable');\n      b.click();await wait(()=>title()===heading,heading);\n    }\n    await wait(()=>stage()?.querySelector('.p2lrn-3d-trial select[aria-label=\"Pieza que vas a colocar\"]'),'assembly controls');\n    const ui=stage()?.querySelector('.p2lrn-3d-layout');\n    const canvas=ui?.querySelector('canvas.p2lrn-3d-canvas');\n    const help=ui?.textContent??'';\n    const joystick=ui?.querySelector('.p2lrn-joystick,.p2lrn-3d-joystick,[data-p2lrn-joystick]');\n    if(!canvas||!canvas.getContext('webgl2'))throw Error('Real Three.js student canvas did not start');\n    if(!help.includes('desordenadas'))throw Error('Student game still advertises preassembled pieces');\n    if(joystick&&!joystick.hidden&&getComputedStyle(joystick).display!=='none')throw Error('Mobile joystick must be hidden on desktop assembly');\n    const entry=ui?.querySelector('.p2lrn-3d-entry-hint');\n    if(entry&&getComputedStyle(entry).display!=='none')throw Error('Walk-to-enter overlay obscures the assembly pieces');\n    const rect=canvas.getBoundingClientRect();\n    if(rect.width<360||rect.height<200)throw Error('Student assembly viewport is too small');\n    const status=stage().querySelector('.p2lrn-3d-trial p[role=status]')?.textContent??'';\n    if(!status.includes('0/2'))throw Error('Student sees already-completed assembly before touching any piece: '+status);\n    return {allPiecesStartUnplaced:true,orbitalStudentView:true,joystickHidden:!joystick||joystick.hidden||getComputedStyle(joystick).display==='none',\n      viewport:[rect.width,rect.height],progress:status};\n  })()");
  invariant(result.allPiecesStartUnplaced&&result.orbitalStudentView&&result.joystickHidden,
    'Initial assembly visualization failed: '+JSON.stringify(result));
  const screenshot=await captureElementVisualEvidence(cdp,'3d-assembly-scattered-student-start',
    "document.getElementById('demo-player')",{maxHeight:1450});
  return {...result,screenshot};
}

// A real Three.js canvas, not a mocked 3D diagram: dispatches browser pointer
// and keyboard events against the same assembly controller used by Player.
async function browserAssemblyInteraction(){
  const [{createThreeGameScene},{buildAssemblyControls},{defaultAssembly}]=await Promise.all([
    import('/player/current/dist/game-3d/three-runtime.js'),
    import('/player/current/dist/renderers/assembly-3d.js'),
    import('/player/current/dist/assembly-3d-core.js'),
  ]);
  const canvas=document.createElement('canvas');
  canvas.id='p2lrn-assembly-live-qa';
  canvas.width=900;canvas.height=540;
  canvas.tabIndex=0;
  Object.assign(canvas.style,{position:'fixed',left:'20px',top:'20px',width:'780px',height:'460px',
    display:'block',background:'#0b1526',zIndex:'2147483600'});
  document.body.append(canvas);
  // Synthetic CDP events have no operating-system pointer capture record.
  canvas.setPointerCapture=()=>{};
  canvas.releasePointerCapture=()=>{};
  let game=null;
  try{
    let controller=null;
    game=await createThreeGameScene(canvas,{physics:'none',
      onDrag:(meta,phase,info)=>controller?.drag(meta,phase,info)??false,
      onInteraction:meta=>controller?.interact(meta)??false});
    game.setAssemblyMode(true);
    const config=defaultAssembly(),patches=[];
    const saved=new Map();
    const runtime={
      state:{completed:false,attemptsCompleted:0},
      answer:()=>null,
      getGameState:(key,fallback)=>saved.has(key)?saved.get(key):fallback,
      setGameState:(key,value)=>saved.set(key,value),
      applyPatch:(questionId,patch)=>patches.push({questionId,patch}),
    };
    const status=document.createElement('p');
    controller=await buildAssemblyControls({trial:{scene:config,questionId:'qa-assembly'},
      runtime,scene:game,status,pkg:null});
    game.frameObjects(['assembly:piece-1','assembly:piece-2',
      'assembly-target:target-1','assembly-target:target-2'],{padding:1.3});
    const avatar=game.scene.getObjectByName('p2lrn-3d-student-avatar');
    if(!avatar?.visible)throw Error('Assembly hides its 3D player, unlike the other games');
    let source=null;
    game.scene.traverse(node=>{
      if(node.userData?.p2lrnInteraction?.kind==='assembly-piece' &&
        node.userData.p2lrnInteraction.id==='piece-1')source=node;
    });
    if(!source)throw Error('Real assembly piece is missing from the Three scene');
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    await sleep(200);
    function screenPoint(object){
      game.camera.updateMatrixWorld(true);
      const world=object.getWorldPosition(object.position.clone().set(0,0,0));
      const screen=world.project(game.camera),rect=canvas.getBoundingClientRect();
      return {x:rect.left+(screen.x+1)*rect.width/2,
        y:rect.top+(1-screen.y)*rect.height/2};
    }
    function emit(type,point){
      canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:81,
        pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,
        clientX:point.x,clientY:point.y}));
    }
    function movePiece(){
      const from=screenPoint(source),rect=canvas.getBoundingClientRect();
      if(from.x<rect.left+15||from.x>rect.right-15||from.y<rect.top+15||from.y>rect.bottom-15)
        throw Error('Assembly piece not visible for pointer interaction');
      const to={x:from.x+(from.x>rect.left+rect.width/2?-62:62),
        y:from.y+(from.y>rect.top+rect.height/2?-20:20)};
      const before=source.position.clone();
      emit('pointerdown',from);
      emit('pointermove',to);
      emit('pointerup',to);
      const delta=source.position.distanceTo(before);
      if(delta<0.2)throw Error('Real assembly pointer drag reverted its position: '+delta);
      if(patches.length)throw Error('Free drag incorrectly awarded assembly points');
      return delta;
    }
    const firstDelta=movePiece();
    const secondDelta=movePiece();
    // In third-person view a free release may overlap a different cage.
    // That correctly reports a wrong target, but MUST keep the moved piece.
    // The two measured displacements above are the actual persistence gate.
    if(!/Pieza desplazada|La pieza no corresponde|La pieza debe situarse dentro|fuera de|Ajusta el centro/.test(status.textContent))
      throw Error('Assembly drag gave no meaningful placement feedback: '+status.textContent);
    const cameraBefore=game.camera.position.clone(),avatarBefore=avatar.position.clone();
    game.setMovementVector(0,1);
    await sleep(350);
    game.setMovementVector(0,0);
    const joystickDistance=game.camera.position.distanceTo(cameraBefore);
    const avatarDistance=avatar.position.distanceTo(avatarBefore);
    if(joystickDistance<0.2||avatarDistance<0.2)
      throw Error('Assembly did not move player AND third-person camera: '+JSON.stringify({joystickDistance,avatarDistance}));
    canvas.focus();
    const keyboardBefore=game.camera.position.clone();
    canvas.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,code:'KeyD',key:'d'}));
    await sleep(350);
    canvas.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,code:'KeyD',key:'d'}));
    const keyboardDistance=game.camera.position.distanceTo(keyboardBefore);
    if(keyboardDistance<0.2)throw Error('Assembly WASD did not move the Three camera');

    // Same click-to-carry and empty-floor release as ordering/classification.
    // Test two consecutive picks against the actual Three scene, not a mock.
    const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
    const aId='assembly:piece-1',bId='assembly:piece-2';
    const originalA=game.getTranslation(aId);
    controller.interact({kind:'assembly-piece',id:'piece-1'});
    game.setMovementVector(0,1);
    await sleep(400);
    game.setMovementVector(0,0);
    const heldA=game.getTranslation(aId);
    const carriedFirstMoved=horizontal(originalA,heldA);
    if(carriedFirstMoved<0.35)
      throw Error('Assembly click did not carry piece 1 with the student: '+carriedFirstMoved);
    controller.interact({kind:'assembly-piece',id:'piece-2'});
    const releasedA=game.getTranslation(aId);
    const originalB=game.getTranslation(bId);
    game.setMovementVector(0,1);
    await sleep(420);
    game.setMovementVector(0,0);
    const releasedFirstDrift=horizontal(releasedA,game.getTranslation(aId));
    const carriedSecondMoved=horizontal(originalB,game.getTranslation(bId));
    if(releasedFirstDrift>0.12||carriedSecondMoved<0.35)
      throw Error('Assembly still accumulates carried pieces: '+
        JSON.stringify({releasedFirstDrift,carriedSecondMoved}));
    const lastHeldB=game.getTranslation(bId);
    controller.interact({kind:'scene-empty'});
    const releasedB=game.getTranslation(bId);
    // Y is important in assembly: dropping a 3D part must not teleport it
    // onto the room floor as if it were a ground-level classification box.
    const releasedVerticalDrift=Math.abs(releasedB[1]-lastHeldB[1]);
    if(releasedVerticalDrift>0.12)
      throw Error('Assembly release changed the piece height: '+releasedVerticalDrift);
    game.setMovementVector(1,0);
    await sleep(360);
    game.setMovementVector(0,0);
    const releasedSecondDrift=horizontal(releasedB,game.getTranslation(bId));
    if(releasedSecondDrift>0.12)
      throw Error('Assembly piece still follows student after release: '+releasedSecondDrift);
    const poses=runtime.getGameState('3d:assembly:free-poses:qa-assembly:attempt-1',null);
    if(!poses?.['piece-1']||!poses?.['piece-2']||
      horizontal(poses['piece-1'].position,releasedA)>0.12||
      horizontal(poses['piece-2'].position,releasedB)>0.12)
      throw Error('Assembly did not persist both released positions');
    if(patches.length)throw Error('Assembly movement alone awarded points');
    globalThis.__p2lrnAssemblyQA={game,canvas};
    return {realWebGL:true,avatarVisible:true,avatarDistance,
      firstDelta,secondDelta,joystickDistance,keyboardDistance,
      carriedFirstMoved,carriedSecondMoved,releasedFirstDrift,releasedSecondDrift,
      releasedVerticalDrift,noUnearnedScores:patches.length===0};
  }catch(error){game?.destroy();canvas.remove();throw error;}
}
async function verifyAssemblyLiveInput(cdp){
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/'});
  await waitForEval(cdp,"Boolean(customElements.get('p2lrn-player'))",
    '3D assembly live browser startup',30000);
  const result=await evalTop(cdp,'('+browserAssemblyInteraction.toString()+')()');
  try{
    invariant(result?.realWebGL&&result.avatarVisible&&result.avatarDistance>0.2&&
      result.firstDelta>0.2&&result.secondDelta>0.2&&
      result.joystickDistance>0.2&&result.keyboardDistance>0.2&&
      result.carriedFirstMoved>0.35&&result.carriedSecondMoved>0.35&&
      result.releasedFirstDrift<0.12&&result.releasedSecondDrift<0.12&&
      result.releasedVerticalDrift<0.12&&result.noUnearnedScores,
      'Assembly real drag/navigation regression: '+JSON.stringify(result));
    const screenshot=await captureElementVisualEvidence(cdp,'3d-assembly-live-drag-and-navigation',
      "document.getElementById('p2lrn-assembly-live-qa')",{maxHeight:1000});
    return {...result,screenshot};
  }finally{
    await evalTop(cdp,"(()=>{const qa=globalThis.__p2lrnAssemblyQA;qa?.game?.destroy();qa?.canvas?.remove();delete globalThis.__p2lrnAssemblyQA;return true;})()");
  }
}

// Exercise the actual 3D controllers with real scene meshes. Unlike a
// controller mock, this proves that an old box stops following the player when
// a different box is picked. The same contract covers Ordering and Classify.
async function browserExclusiveCarry(){
  const [{createThreeGameScene},{buildOrderingControls,buildClassificationControls}]=await Promise.all([
    import('/player/current/dist/game-3d/three-runtime.js'),
    import('/player/current/dist/renderers/questionnaire-3d.js'),
  ]);
  const canvas=document.createElement('canvas');
  canvas.id='p2lrn-exclusive-carry-live-qa';
  Object.assign(canvas.style,{position:'fixed',top:'24px',left:'24px',width:'740px',
    height:'420px',zIndex:'2147483599',background:'#070f20'});
  canvas.width=740;canvas.height=420;document.body.append(canvas);
  let game=null;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const getMesh=(kind,id)=>{
    let found=null;
    game.scene.traverse(node=>{
      if(node.userData?.p2lrnInteraction?.kind===kind&&node.userData?.p2lrnInteraction?.id===id)
        found=node;
    });
    if(!found)throw Error('3D mesh missing: '+kind+'/'+id);
    return found;
  };
  const trialObjects=[{id:'a',text:'A'},{id:'b',text:'B'},{id:'c',text:'C'}];
  const runtime={
    state:{completed:false},
    getGameState:(key,fallback)=>fallback,
    setGameState:()=>{},
    answer:()=>({order:[],classifications:{}}),
    replaceAnswer:()=>{},
    applyPatch:(questionId,patch)=>runtime.patches.push(patch),
    patches:[],
  };
  const status=document.createElement('p');
  const select=(control,kind,id)=>control.interact({kind,id});
  async function exercise(kind,controls){
    const a=getMesh(kind,'a'),b=getMesh(kind,'b');
    select(controls,kind,'a');
    await sleep(180);
    select(controls,kind,'b');
    if(status.textContent.includes('Ya llevas un objeto'))
      throw Error('Picking B incorrectly refuses to release A: '+status.textContent);
    await sleep(180);
    const oldBefore=a.position.clone(),newBefore=b.position.clone();
    game.setMovementVector(0,1);
    await sleep(450);
    game.setMovementVector(0,0);
    // Measure horizontal tracking: real Rapier may let a dropped box fall
    // vertically, which is correct and must not count as following a player.
    const oldTravel=Math.hypot(a.position.x-oldBefore.x,a.position.z-oldBefore.z);
    const newTravel=Math.hypot(b.position.x-newBefore.x,b.position.z-newBefore.z);
    if(oldTravel>0.15||newTravel<0.6)
      throw Error('3D boxes still stack/follow player: '+kind+' '+JSON.stringify({oldTravel,newTravel}));
    return {releasedFirstTravel:oldTravel,selectedSecondTravel:newTravel};
  }
  try{
    game=await createThreeGameScene(canvas,{physics:'none'});
    const ordering={questionId:'carry-order',prompt:'Ordenar cajas',objects:trialObjects,
      correctOrder:['a','b','c']};
    const order=buildOrderingControls({trial:ordering,runtime,scene:game,status});
    const orderResult=await exercise('ordering-object',order);
    order.interact({kind:'ordering-slot',index:0});
    if(runtime.patches.length!==0)throw Error('Partial ordering accidentally awarded a classification score');
    game.reset();
    game.resetPlayer();
    const classification={questionId:'carry-class',prompt:'Clasificar cajas',objects:trialObjects,
      categories:[{id:'group-1',text:'Grupo 1'},{id:'group-2',text:'Grupo 2'}],
      assignments:[{itemId:'a',categoryId:'group-1'},
        {itemId:'b',categoryId:'group-2'},{itemId:'c',categoryId:'group-1'}]};
    const classify=buildClassificationControls({trial:classification,runtime,scene:game,status});
    const classResult=await exercise('classification-object',classify);
    select(classify,'classification-category','group-2');
    if(runtime.patches.length!==1||
      runtime.patches[0]?.kind!=='classification-set'||
      runtime.patches[0]?.itemId!=='b')
      throw Error('Switching carried boxes corrupted classification grading');
    const scoredBox=getMesh('classification-object','b');
    const scoredPosition=scoredBox.position.clone();
    game.setMovementVector(1,0);
    await sleep(300);
    game.setMovementVector(0,0);
    if(scoredBox.position.distanceTo(scoredPosition)>0.15)
      throw Error('Already scored box still follows the player');
    globalThis.__p2lrnExclusiveCarryQA={game,canvas};
    return {ordering:orderResult,classification:classResult,scoredOnce:true};
  }catch(error){game?.destroy();canvas.remove();throw error;}
}
async function verifyExclusiveCarryInBrowser(cdp){
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/'});
  await waitForEval(cdp,"Boolean(customElements.get('p2lrn-player'))",
    '3D exclusive carry browser startup',30000);
  const result=await evalTop(cdp,'('+browserExclusiveCarry.toString()+')()');
  try{
    invariant(result?.scoredOnce&&result.ordering?.releasedFirstTravel<0.15&&
      result.ordering?.selectedSecondTravel>0.6&&
      result.classification?.releasedFirstTravel<0.15&&
      result.classification?.selectedSecondTravel>0.6,
      'Multiple objects followed the player: '+JSON.stringify(result));
    const screenshot=await captureElementVisualEvidence(cdp,'3d-single-carried-box-live',
      "document.getElementById('p2lrn-exclusive-carry-live-qa')",{maxHeight:900});
    return {...result,screenshot};
  }finally{
    await evalTop(cdp,"(()=>{const qa=globalThis.__p2lrnExclusiveCarryQA;qa?.game?.destroy();qa?.canvas?.remove();delete globalThis.__p2lrnExclusiveCarryQA;return true;})()");
  }
}

// Test the ORIGINAL game controllers, not just raycast metadata or select UI.
// The pointer drops must update the same native answer contract Player scores.
async function browserRealQuest3DDrops(){
  const [{createThreeGameScene},gameControllers]=await Promise.all([
    import('/player/current/dist/game-3d/three-runtime.js'),
    import('/player/current/dist/renderers/questionnaire-3d.js'),
  ]);
  const canvas=document.createElement('canvas');
  canvas.id='p2lrn-real-scored-drops-qa';
  Object.assign(canvas.style,{position:'fixed',left:'20px',top:'20px',
    width:'800px',height:'510px',display:'block',zIndex:'2147483600'});
  canvas.width=800;canvas.height=510;
  canvas.tabIndex=0;
  document.body.append(canvas);
  canvas.setPointerCapture=()=>{};
  canvas.releasePointerCapture=()=>{};
  let game=null,controller=null;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const answers=new Map(),patches=[],traces=[];
  const runtime={
    state:{completed:false},
    answer:id=>answers.get(id)??{order:[],pairs:{},classifications:{}},
    getGameState:(k,fallback)=>fallback,
    setGameState:()=>{},
    replaceAnswer:(id,answer)=>{answers.set(id,answer);return true;},
    applyPatch:(id,patch)=>{
      patches.push({...patch,questionId:id});
      const answer=runtime.answer(id);
      if(patch.kind==='pair-set')answers.set(id,{...answer,pairs:{...answer.pairs,[patch.leftId]:patch.rightId}});
      if(patch.kind==='classification-set')
        answers.set(id,{...answer,classifications:{...answer.classifications,[patch.itemId]:patch.categoryId}});
      return answer;
    },
  };
  function find(kind,id){
    let hit=null;
    game.scene.traverse(node=>{
      const interaction=node.userData?.p2lrnInteraction;
      if(interaction?.kind===kind&&interaction?.id===id)hit=node;
    });
    if(!hit)throw Error('Missing scored-drop object '+kind+'/'+id);
    return hit;
  }
  function point(node){
    game.camera.updateMatrixWorld(true);
    const world=node.getWorldPosition(node.position.clone().set(0,0,0));
    const screen=world.project(game.camera),rect=canvas.getBoundingClientRect();
    return {x:rect.left+(screen.x+1)*rect.width/2,
      y:rect.top+(1-screen.y)*rect.height/2};
  }
  function pointer(type,position){
    canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,
      pointerId:89,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,
      clientX:position.x,clientY:position.y}));
  }
  async function run({trial,builder,sourceKind,sourceId,targetKind,targetId,arrange,verify}){
    game.reset();game.resetPlayer();
    const status=document.createElement('p');
    controller=builder({trial,runtime,scene:game,status});
    arrange?.();
    await sleep(260);
    const from=point(find(sourceKind,sourceId)),to=point(find(targetKind,targetId));
    const rect=canvas.getBoundingClientRect();
    for(const pt of [from,to]){
      if(pt.x<rect.left+3||pt.x>rect.right-3||pt.y<rect.top+3||pt.y>rect.bottom-3)
        throw Error('Scored 3D drag is outside visible canvas: '+JSON.stringify({sourceKind,targetKind,from,to}));
    }
    const old=patches.length;
    pointer('pointerdown',from);pointer('pointermove',to);pointer('pointerup',to);
    await sleep(60);
    if(!verify())throw Error('Real '+sourceKind+' to '+targetKind+' did not score: '+
      JSON.stringify({from,to,patches:patches.slice(old),answer:runtime.answer(trial.questionId),
        status:status.textContent}));
    traces.push({mode:trial.type,scored:true,sourceKind,targetKind});
  }
  try{
    game=await createThreeGameScene(canvas,{physics:'none',
      onDrag:(meta,phase,details)=>controller?.drag(meta,phase,details)??false,
      onInteraction:meta=>controller?.interact(meta)??false});
    await run({
      trial:{type:'ordering-3d',questionId:'qa-order',prompt:'Ordena',
        objects:[{id:'first',text:'Primero'}],correctOrder:['first']},
      builder:gameControllers.buildOrderingControls,
      sourceKind:'ordering-object',sourceId:'first',
      targetKind:'ordering-slot',targetId:undefined,
      arrange:()=>game.setTranslation('order:first',[0,0.78,4.2]),
      verify:()=>runtime.answer('qa-order').order?.[0]==='first',
    });
    await run({
      trial:{type:'matching-3d',questionId:'qa-match',prompt:'Relaciona',
        left:[{id:'spain',text:'España'}],right:[{id:'madrid',text:'Madrid'}],
        connections:[{leftId:'spain',rightId:'madrid'}]},
      builder:gameControllers.buildMatchingControls,
      sourceKind:'matching-left',sourceId:'spain',targetKind:'matching-right',targetId:'madrid',
      arrange:()=>{
        game.setTranslation('left:spain',[-2,0.7,4.1]);
        game.setTranslation('right:madrid',[2,0.7,3.1]);
      },
      verify:()=>runtime.answer('qa-match').pairs?.spain==='madrid',
    });
    await run({
      trial:{type:'classification-3d',questionId:'qa-classify',prompt:'Clasifica',
        objects:[{id:'circle',text:'Círculo'}],
        categories:[{id:'shapes',text:'Formas'}],
        assignments:[{itemId:'circle',categoryId:'shapes'}]},
      builder:gameControllers.buildClassificationControls,
      sourceKind:'classification-object',sourceId:'circle',
      targetKind:'classification-category',targetId:'shapes',
      arrange:()=>game.setTranslation('classify:circle',[0,0.78,4.2]),
      verify:()=>runtime.answer('qa-classify').classifications?.circle==='shapes',
    });
    globalThis.__p2lrnRealDropsQA={game,canvas};
    return {realWebGL:true,scoredModes:traces,nativePatches:patches.length};
  }catch(error){game?.destroy();canvas.remove();throw error;}
}
async function verifyRealQuest3DDrops(cdp){
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/'});
  await waitForEval(cdp,"Boolean(customElements.get('p2lrn-player'))",
    'real scored 3D drop startup',30000);
  const result=await evalTop(cdp,'('+browserRealQuest3DDrops.toString()+')()');
  try{
    invariant(result?.realWebGL&&result.scoredModes?.length===3&&result.nativePatches===2,
      'Real drag-to-score regressions: '+JSON.stringify(result));
    const screenshot=await captureElementVisualEvidence(cdp,'3d-real-scored-drops',
      "document.getElementById('p2lrn-real-scored-drops-qa')",{maxHeight:900});
    return {...result,screenshot};
  }finally{
    await evalTop(cdp,"(()=>{const qa=globalThis.__p2lrnRealDropsQA;qa?.game?.destroy();qa?.canvas?.remove();delete globalThis.__p2lrnRealDropsQA;return true;})()");
  }
}

// Real Rapier regression for the most important shared rule: an invalid
// release keeps the object's horizontal world coordinates even after physics
// steps, after another object is picked, and after a trial is reopened.
async function browserRetained3DDrops(){
  const [{createThreeGameScene},{buildOrderingControls,buildClassificationControls}]=await Promise.all([
    import('/player/current/dist/game-3d/three-runtime.js'),
    import('/player/current/dist/renderers/questionnaire-3d.js'),
  ]);
  const canvas=document.createElement('canvas');
  canvas.id='p2lrn-physical-free-drop-qa';
  canvas.width=800;canvas.height=510;canvas.tabIndex=0;
  Object.assign(canvas.style,{position:'fixed',left:'20px',top:'20px',width:'800px',
    height:'510px',display:'block',zIndex:'2147483600'});
  canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
  document.body.append(canvas);
  const store=new Map(),answers=new Map(),patches=[];
  const runtime={
    state:{completed:false},
    getGameState:(key,fallback)=>store.has(key)?store.get(key):fallback,
    setGameState:(key,value)=>store.set(key,structuredClone(value)),
    answer:id=>answers.get(id)??{order:[],classifications:{}},
    replaceAnswer:(id,answer)=>{answers.set(id,structuredClone(answer));return true;},
    applyPatch:(id,patch)=>{patches.push(patch);return true;},
  };
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  let game=null,controller=null,blankClicks=0;
  try{
    game=await createThreeGameScene(canvas,{physics:'rapier',
      onInteraction:(meta)=>{
        if(meta.kind==='scene-empty')blankClicks++;
        return controller?.interact(meta)??false;
      },
      onDrag:(meta,phase,info)=>controller?.drag(meta,phase,info)??false});
    if(game.physics!=='rapier')throw Error('True Rapier physics unavailable for free-drop regression');
    const modes=[
      {trial:{questionId:'qa-drop-order',type:'ordering-3d',prompt:'Ordena',
          objects:[{id:'a',text:'A'},{id:'b',text:'B'}],correctOrder:['a','b']},
        builder:buildOrderingControls,prefix:'order:',kind:'ordering-object',
        target:[-3.1,0.76,1.9],scoreKey:'order'},
      {trial:{questionId:'qa-drop-class',type:'classification-3d',prompt:'Clasifica',
          objects:[{id:'a',text:'A'},{id:'b',text:'B'}],
          categories:[{id:'green',text:'Verde'},{id:'blue',text:'Azul'}],
          assignments:[{itemId:'a',categoryId:'green'},{itemId:'b',categoryId:'blue'}]},
        builder:buildClassificationControls,prefix:'classify:',kind:'classification-object',
        target:[-3.0,0.76,2.3],scoreKey:'classifications'},
    ];
    const results=[];
    for(const {trial,builder,prefix,kind,target} of modes){
      game.reset();game.resetPlayer();
      const status=document.createElement('p');
      controller=builder({trial,runtime,scene:game,status});
      await sleep(190);
      const a=game.getTranslation(prefix+'a');
      if(!a)throw Error('Missing real Rapier box in '+kind);
      if(!controller.drag({kind,id:'a'},'start',{position:a}))
        throw Error('Could not start physical drag in '+kind);
      controller.drag({kind,id:'a'},'move',{position:target});
      controller.drag({kind,id:'a'},'end',{position:target,
        target:kind==='classification-object'?{kind:'classification-category',id:'blue'}:null});
      await sleep(450);
      const afterDrop=game.getTranslation(prefix+'a');
      if(horizontal(afterDrop,target)>0.24)
        throw Error('Released '+kind+' snapped/rolled away from drop: '+
          JSON.stringify({target,afterDrop}));
      if(patches.length!==0||runtime.answer(trial.questionId).order?.length)
        throw Error('Invalid physical drop was scored in '+kind);
      controller.interact({kind,id:'b'});
      await sleep(100);
      const afterNext=game.getTranslation(prefix+'a');
      if(horizontal(afterNext,target)>0.24)
        throw Error('Picking B moved the released A in '+kind);
      // Click on the empty upper part of the canvas, never on a game object.
      const rect=canvas.getBoundingClientRect(),pt={clientX:rect.left+rect.width/2,clientY:rect.top+9};
      for(const type of ['pointerdown','pointerup']){
        canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,
          pointerId:91,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,...pt}));
      }
      if(blankClicks<results.length+1)
        throw Error('Empty ground click did not release the click-carried box: '+kind);
      await sleep(160);
      const bReleased=game.getTranslation(prefix+'b');
      game.setMovementVector(0,1);
      await sleep(260);
      game.setMovementVector(0,0);
      if(horizontal(game.getTranslation(prefix+'b'),bReleased)>0.32)
        throw Error('Box B is still carried after a click on empty ground: '+kind);
      game.reset();game.resetPlayer();
      controller=builder({trial,runtime,scene:game,status:document.createElement('p')});
      await sleep(220);
      const restored=game.getTranslation(prefix+'a');
      if(horizontal(restored,target)>0.24)
        throw Error('Reopening '+kind+' lost saved free position: '+JSON.stringify({target,restored}));
      results.push({mode:kind,dropXZ:[...target],restoredXZ:[...restored],
        releaseDrift:horizontal(afterDrop,target),switchDrift:horizontal(afterNext,target),
        restoredDrift:horizontal(restored,target),blankClickReleases:true});
    }
    // Matching is the sole anchored-object exception: the rope moves,
    // but the two answer endpoints must not be pushed by the player.
    game.reset();game.resetPlayer();
    game.addNode({id:'qa-match-anchor',text:'Relación fija',
      position:[0,0.78,5.9],interaction:{kind:'matching-left',id:'qa-anchor'}});
    await sleep(100);
    const anchorBefore=game.getTranslation('qa-match-anchor');
    game.setMovementVector(0,1);
    await sleep(650);
    game.setMovementVector(0,0);
    const matchingAnchorDrift=horizontal(anchorBefore,game.getTranslation('qa-match-anchor'));
    if(matchingAnchorDrift>0.08)
      throw Error('Moving the student pushed a matching rope anchor: '+matchingAnchorDrift);
    globalThis.__p2lrnRetainedDropQA={game,canvas};
    return {physics:game.physics,results,matchingAnchorDrift,
      scoredInvalidDrops:patches.length};
  }catch(error){game?.destroy();canvas.remove();throw error;}
}
async function verifyRetained3DDrops(cdp){
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/'});
  await waitForEval(cdp,"Boolean(customElements.get('p2lrn-player'))",
    'real 3D free-drop/physics startup',30000);
  const result=await evalTop(cdp,'('+browserRetained3DDrops.toString()+')()');
  try{
    invariant(result?.physics==='rapier'&&result.results?.length===2&&
      result.results.every(item=>item.blankClickReleases&&item.restoredDrift<0.24)&&
      result.matchingAnchorDrift<0.08&&result.scoredInvalidDrops===0,
      'Physical drop contract failed: '+JSON.stringify(result));
    const screenshot=await captureElementVisualEvidence(cdp,'3d-rapier-free-drop-persistence',
      "document.getElementById('p2lrn-physical-free-drop-qa')",{maxHeight:900});
    return {...result,screenshot};
  }finally{
    await evalTop(cdp,"(()=>{const qa=globalThis.__p2lrnRetainedDropQA;qa?.game?.destroy();qa?.canvas?.remove();delete globalThis.__p2lrnRetainedDropQA;return true;})()");
  }
}

async function verifyThreePointerDragAndRope(cdp){
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/'});
  await waitForEval(cdp,"Boolean(globalThis.P2LRN?.createCapabilityBroker&&customElements.get('p2lrn-player'))",'3D pointer test runtime',30000);
  const result=await evalTop(cdp,`(async()=>{
    const {createThreeGameScene}=await import('/player/current/dist/game-3d/three-runtime.js');
    const canvas=document.createElement('canvas');
    canvas.style.width='780px';
    canvas.style.height='500px';
    canvas.style.display='block';
    document.body.append(canvas);
    // Synthetic CDP test input has no OS pointer record: bypass pointer capture
    // only for this temporary QA canvas, not for the Player's real canvas.
    canvas.setPointerCapture=()=>{};
    canvas.releasePointerCapture=()=>{};
    const phases=[];
    let game=null;
    try{
      game=await createThreeGameScene(canvas,{physics:'none',
        onDrag:(meta,phase,info)=>{phases.push({id:meta.id,phase,target:info.target?.kind??null});return true;},
        onInteraction:()=>{}});
      game.addBox({id:'qa-object',text:'Arrastrar',position:[0,0.75,4.4],dynamic:false,
        interaction:{kind:'ordering-object',id:'qa-object'}});
      game.addZone({id:'qa-target',text:'Destino',position:[3.1,0.14,1.6],size:[2.35,0.22,1.85],
        interaction:{kind:'ordering-slot',index:0}});
      const line=game.connect('qa-object','qa-target');
      if(!line)throw new Error('3D rope could not connect two nodes');
      await new Promise(resolve=>setTimeout(resolve,450));
      const floats=line.geometry.attributes.position.array;
      if(![...floats].every(Number.isFinite))throw new Error('3D rope produced non-finite coordinates');
      const stage=game.scene.children.find(node=>node.type==='Group'&&node.children.some(child=>child.userData?.p2lrnInteraction));
      const source=stage?.children.find(node=>node.userData?.p2lrnInteraction?.kind==='ordering-object');
      const target=stage?.children.find(node=>node.userData?.p2lrnInteraction?.kind==='ordering-slot');
      if(!source||!target)throw new Error('3D QA scene has no interactive nodes');
      function point(node){
        game.camera.updateMatrixWorld();
        const world=node.getWorldPosition(node.position.clone().set(0,0,0));
        const projected=world.project(game.camera);
        const rect=canvas.getBoundingClientRect();
        return {x:rect.left+(projected.x+1)*rect.width/2,
          y:rect.top+(1-projected.y)*rect.height/2};
      }
      const from=point(source),to=point(target);
      const pointer=(type,pos)=>canvas.dispatchEvent(new PointerEvent(type,{
        bubbles:true,pointerId:123,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,
        clientX:pos.x,clientY:pos.y}));
      pointer('pointerdown',from);
      pointer('pointermove',to);
      pointer('pointerup',to);
      const began=phases.some(item=>item.phase==='start'&&item.id==='qa-object');
      const moved=phases.some(item=>item.phase==='move'&&item.id==='qa-object');
      const ended=phases.some(item=>item.phase==='end'&&item.target==='ordering-slot');
      if(!began||!moved||!ended)throw new Error('3D pointer drag failed: '+JSON.stringify({phases,from,to}));
      // Repeat real pointer events for the OTHER 3D games. A generic drag
      // 'end' is not enough: its destination must be the correct game target.
      const extraTargets=[];
      async function realDrop({sourceKind,targetKind,install}){
        game.reset();game.resetPlayer();
        const ids=install();
        await new Promise(resolve=>setTimeout(resolve,180));
        const sourceNode=game.scene.getObjectByProperty('name','__none__');
        let fromNode=null,toNode=null;
        game.scene.traverse(node=>{
          const m=node.userData?.p2lrnInteraction;
          if(m?.kind===sourceKind&&m.id===ids.source)fromNode=node;
          if(m?.kind===targetKind&&m.id===ids.target)toNode=node;
        });
        if(!fromNode||!toNode)throw Error('3D drop cannot find '+sourceKind+'/'+targetKind);
        const before=phases.length;
        const from=point(fromNode),to=point(toNode);
        pointer('pointerdown',from);
        pointer('pointermove',to);
        pointer('pointerup',to);
        const events=phases.slice(before);
        if(!events.some(x=>x.phase==='start'&&x.id===ids.source)||
           !events.some(x=>x.phase==='end'&&x.target===targetKind))
          throw Error('Real '+sourceKind+' did not drop into '+targetKind+': '+
            JSON.stringify({events,from,to}));
        extraTargets.push(targetKind);
      }
      await realDrop({
        sourceKind:'classification-object',targetKind:'classification-category',
        install:()=>{
          game.addBox({id:'qa-classify',text:'Clasificar',position:[-2,0.78,4.2],
            dynamic:false,physicsEnabled:false,
            interaction:{kind:'classification-object',id:'qa-classify'}});
          game.addZone({id:'qa-category',text:'Grupo 1',position:[-2,0.14,1.5],
            size:[4.1,0.24,2.5],
            interaction:{kind:'classification-category',id:'qa-category'}});
          return {source:'qa-classify',target:'qa-category'};
        },
      });
      await realDrop({
        sourceKind:'matching-left',targetKind:'matching-right',
        install:()=>{
          game.addNode({id:'qa-left',text:'España',position:[-3,0.7,4.1],
            interaction:{kind:'matching-left',id:'qa-left'}});
          game.addNode({id:'qa-right',text:'Madrid',position:[3,0.7,3.1],
            interaction:{kind:'matching-right',id:'qa-right'}});
          return {source:'qa-left',target:'qa-right'};
        },
      });
      // The same real Three.js scene must respond to navigation in assembly
      // without stealing movement or drag handlers from ordering/matching.
      game.setAssemblyMode(true);
      game.frameObjects(null,{padding:1.2});
      const cameraBefore=game.camera.position.clone();
      game.setMovementVector(0,1);
      await new Promise(resolve=>setTimeout(resolve,380));
      game.setMovementVector(0,0);
      const movedCamera=game.camera.position.distanceTo(cameraBefore);
      if(movedCamera<0.2)throw new Error('Assembly analog navigation did not move the real camera: '+movedCamera);
      return {finiteRope:true,dragPhases:phases.map(item=>item.phase),
        target:'ordering-slot',additionalDrops:extraTargets,
        assemblyCameraDistance:movedCamera,syntheticPointer:true};
    }finally{game?.destroy();canvas.remove();}
  })()`);
  invariant(result?.finiteRope&&result?.dragPhases?.includes('end')&&
    result.additionalDrops?.includes('classification-category')&&
    result.additionalDrops?.includes('matching-right')&&result?.assemblyCameraDistance>0.2,
    '3D pointer-drag scene test failed: '+JSON.stringify(result));
  return result;
}

async function verifyThreeMobileAndDesktopEntry(cdp){
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  try{
    await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/?src='+encodeURIComponent('/examples/game-ui-3d-mixed.p2lrn')});
    await waitForEval(cdp,"document.getElementById('demo-player')?.shadowRoot?.querySelectorAll('.p2lrn-nav button').length>0",'mobile 3D navigation',30000);
    const mobile=await evalTop(cdp,"(async()=>{\n  const player=document.getElementById('demo-player'),root=player?.shadowRoot;\n  const wait=async(predicate,label)=>{\n    for(let i=0;i<240;i++){\n      if(predicate())return;\n      await new Promise(resolve=>setTimeout(resolve,70));\n    }\n    throw new Error('Mobile 3D timeout: '+label);\n  };\n  const open=await (async()=>{\n    await wait(()=>[...root.querySelectorAll('.p2lrn-nav button')].some(b=>b.textContent.includes('Laboratorio 3D QA')),'navigation');\n    return [...root.querySelectorAll('.p2lrn-nav button')].find(b=>b.textContent.includes('Laboratorio 3D QA'));\n  })();\n  open.click();\n  await wait(()=>root.querySelector('.p2lrn-3d-joystick')&&root.querySelector('.p2lrn-3d-directions'),'scene');\n  const stage=root.querySelector('.p2lrn-3d-stage');\n  const canvas=stage.querySelector('canvas');\n  const stick=stage.querySelector('.p2lrn-3d-joystick');\n  const knob=stick?.querySelector('.p2lrn-3d-joystick-knob');\n  const fallback=root.querySelector('.p2lrn-3d-fallback');\n  if(fallback)throw new Error('WebGL fell back while testing the mobile 3D scene');\n  if(getComputedStyle(stick).display==='none')throw new Error('Joystick is hidden on touch screen');\n  if(getComputedStyle(canvas).touchAction!=='none')throw new Error('Touch input is intercepted by page scrolling');\n  const alt=root.querySelector('.p2lrn-3d-alternative');\n  if(!getComputedStyle(alt).clipPath.includes('inset'))throw new Error('Legacy 3D button controls remain visible');\n  const initialInstruction=root.querySelector('.p2lrn-3d-directions').textContent;\n  if(!initialInstruction.includes('pedestal'))throw new Error('Missing ordering scene instruction');\n  const rect=stick.getBoundingClientRect();\n  const x=rect.left+rect.width/2,y=rect.top+rect.height/2;\n  const dispatch=(name,px,py)=>stick.dispatchEvent(new PointerEvent(name,{\n    bubbles:true,cancelable:true,pointerId:83,pointerType:'touch',button:0,\n    buttons:name==='pointerup'?0:1,clientX:px,clientY:py,\n  }));\n  dispatch('pointerdown',x,y);\n  dispatch('pointermove',x,y-44);\n  const activeKnob=knob.style.transform;\n  if(!activeKnob.includes('translate3d')||activeKnob==='translate3d(0,0,0)')\n    throw new Error('Touch joystick did not track thumb position');\n  dispatch('pointerup',x,y-44);\n  const neutral=new DOMMatrix(getComputedStyle(knob).transform);\n  if(Math.hypot(neutral.m41,neutral.m42)>0.5)\n    throw new Error('Touch joystick did not return to neutral: '+knob.style.transform);\n  const next=()=>[...root.querySelectorAll('.p2lrn-3d-trial .p2lrn-game-actions button')]\n    .find(button=>button.textContent==='Siguiente');\n  next().click();\n  await wait(()=>root.querySelector('.p2lrn-3d-directions')?.textContent.includes('azul'),'matching instruction');\n  next().click();\n  await wait(()=>root.querySelector('.p2lrn-3d-directions')?.textContent.includes('categoría'),'classification instruction');\n  return {\n    mobileViewport:innerWidth,stageWidth:stage.getBoundingClientRect().width,\n    joystickVisible:true,joystickMovesAndResets:true,touchAction:'none',\n    oldControlsVisuallyHidden:true,gameInstructions:['ordering','matching','classification'],\n    noMoveButtons:root.querySelectorAll('.p2lrn-3d-move-pad button').length===0,\n  };\n})()");
    invariant(mobile.joystickVisible&&mobile.joystickMovesAndResets&&mobile.oldControlsVisuallyHidden&&mobile.noMoveButtons,'Mobile 3D QA failed: '+JSON.stringify(mobile));
    const screenshot=await captureElementVisualEvidence(cdp,'quest-3d-mobile-390px',"document.getElementById('demo-player')",{maxHeight:1400});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
    await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/?src='+encodeURIComponent('/examples/game-ui-3d-mixed.p2lrn')});
    await waitForEval(cdp,"Boolean(document.getElementById('demo-player')?.shadowRoot?.querySelector('.p2lrn-nav'))",'desktop 3D navigation',30000);
    const desktop=await evalTop(cdp,"(async()=>{\n  const root=document.getElementById('demo-player')?.shadowRoot;\n  const wait=async(predicate)=>{\n    for(let i=0;i<240;i++){\n      if(predicate())return;\n      await new Promise(r=>setTimeout(r,70));\n    }\n    throw new Error('Desktop 3D scene did not render');\n  };\n  await wait(()=>[...root.querySelectorAll('.p2lrn-nav button')].some(b=>b.textContent.includes('Laboratorio 3D QA')));\n  [...root.querySelectorAll('.p2lrn-nav button')].find(b=>b.textContent.includes('Laboratorio 3D QA')).click();\n  await wait(()=>root.querySelector('.p2lrn-3d-entry-hint'));\n  const entry=root.querySelector('.p2lrn-3d-entry-hint'),stage=root.querySelector('.p2lrn-3d-stage');\n  const initiallyVisible=getComputedStyle(entry).display!=='none';\n  const label=entry.textContent;\n  stage.querySelector('canvas').click();\n  const entered=stage.classList.contains('is-entered')&&getComputedStyle(entry).display==='none';\n  if(!initiallyVisible||!label.includes('Haz clic')||!entered)\n    throw new Error('Desktop 3D entry hint invalid: '+JSON.stringify({initiallyVisible,entered,label,stageClass:stage.className,display:getComputedStyle(entry).display,coarse:matchMedia('(pointer:coarse)').matches,fine:matchMedia('(pointer:fine)').matches}));\n  return {entryPrompt:label,enteredWithSceneClick:entered};\n})()");
    invariant(desktop.enteredWithSceneClick,'Desktop scene entry failed');
    return {mobile,desktop,screenshot};
  }finally{
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
  }
}

async function verifyGameLayout(cdp,kind){
  const title=kind==='crossword'?'Crucigrama de prueba':'Rosco de prueba';
  const selector=kind==='crossword'?'.p2lrn-crossword-grid':'.p2lrn-rosco';
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/?src='+encodeURIComponent('/examples/game-ui-'+kind+'.p2lrn')});
  let initial=null;
  for(let i=0;i<150;i++){
    initial=await evalTop(cdp,stateExpression);
    if(initial?.ready&&initial?.rendered)break;
    if(initial?.error)break;
    await sleep(160);
  }
  invariant(initial?.ready&&initial?.rendered&&!initial.error,
    kind+': generated course did not load: '+JSON.stringify(initial));
  const selectCode='(()=>{const r=document.getElementById("demo-player")?.shadowRoot;const title='+JSON.stringify(title)+';const button=[...(r?.querySelectorAll(".p2lrn-nav button")??[])].find(x=>x.textContent.includes(title));if(!button)return false;button.click();return true;})()';
  invariant(await evalTop(cdp,selectCode),kind+': game not found in Player navigation');
  let shown=false;
  for(let i=0;i<90&&!shown;i++){
    shown=await evalTop(cdp,'!!document.getElementById("demo-player")?.shadowRoot?.querySelector('+JSON.stringify(selector)+')');
    if(!shown)await sleep(160);
  }
  invariant(shown,kind+': game did not render');

  function baseScenario(){
    const root=document.getElementById('demo-player').shadowRoot;
    const game=root.querySelector('.p2lrn-crossword-grid,.p2lrn-rosco');
    const stage=root.querySelector('.p2lrn-stage');
    const status=root.querySelector('.p2lrn-status')?.textContent??'';
    return {board:game.getBoundingClientRect().width,stage:stage.getBoundingClientRect().width,version:status,
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  }
  const base=await evalTop(cdp,'('+baseScenario.toString()+')()');
  invariant(base.version.includes('Formato Core')&&base.version.includes('Player '),kind+': missing explicit runtime version');
  invariant(base.board<=base.stage+2&&base.overflow<=2,kind+': horizontal overflow '+JSON.stringify(base));
  let behavior;
  if(kind==='crossword'){
    function crosswordScenario(){
      const root=document.getElementById('demo-player').shadowRoot;
      const grid=root.querySelector('.p2lrn-crossword-grid');
      const cells=[...grid.querySelectorAll('.p2lrn-crossword-cell')];
      const clues=[...root.querySelectorAll('.p2lrn-crossword-clue')];
      const rect=cells[0]?.getBoundingClientRect();
      clues[0]?.click();
      const chosen=clues[0]?.getAttribute('aria-pressed')==='true';
      const first=root.activeElement;
      if(first?.tagName==='INPUT'){first.value='A';first.dispatchEvent(new InputEvent('input',{bubbles:true}));}
      const advanced=first!==root.activeElement;
      const wrap=grid.closest('.p2lrn-grid-scroll');
      return {cells:cells.length,clues:clues.length,square:!!rect&&Math.abs(rect.width-rect.height)<2,
        cellWidth:rect?.width??0,chosen,advanced,scroll:wrap.scrollWidth-wrap.clientWidth};
    }
    behavior=await evalTop(cdp,'('+crosswordScenario.toString()+')()');
    invariant(behavior.cells>0&&behavior.clues>=4&&behavior.square,kind+': layout/pistas '+JSON.stringify(behavior));
    invariant(behavior.cellWidth>=18&&behavior.cellWidth<=70&&behavior.scroll<=2,kind+': malformed cell dimensions '+JSON.stringify(behavior));
    invariant(behavior.chosen&&behavior.advanced,kind+': clue or keyboard interaction failed '+JSON.stringify(behavior));
  }else{
    function roscoScenario(){
      const root=document.getElementById('demo-player').shadowRoot;
      const letters=[...root.querySelectorAll('.p2lrn-rosco-letter')];
      const rectangles=letters.map(x=>x.getBoundingClientRect());
      const xs=rectangles.map(x=>x.left),ys=rectangles.map(x=>x.top);
      const initial=root.querySelector('.p2lrn-rosco-letter.is-current')?.textContent;
      const button=(name)=>[...root.querySelectorAll('.p2lrn-rosco-challenge button')].find(x=>x.textContent===name);
      button('Pasar')?.click();
      const next=root.querySelector('.p2lrn-rosco-letter.is-current')?.textContent;
      const input=root.querySelector('.p2lrn-rosco-challenge input');input.value='INCORRECTO';
      button('Comprobar')?.click();
      const progressAfterCheck=root.querySelector('.p2lrn-rosco-progress')?.textContent??'';
      const statusAfterCheck=root.querySelector('.p2lrn-game-status')?.textContent??'';
      const revealedWrong=root.querySelectorAll('.p2lrn-rosco-letter.is-wrong').length;
      const revealedSolved=root.querySelectorAll('.p2lrn-rosco-letter.is-solved').length;
      const correctionHidden=revealedWrong===0&&revealedSolved===0;
      const registered=progressAfterCheck.startsWith('1 /')&&statusAfterCheck.includes('Respuesta registrada');
      button('Reiniciar')?.click();
      const restarted=root.querySelectorAll('.p2lrn-rosco-letter.is-wrong,.p2lrn-rosco-letter.is-solved').length===0
        &&root.querySelector('.p2lrn-rosco-progress')?.textContent.startsWith('0 /');
      return {count:letters.length,spreadX:Math.max(...xs)-Math.min(...xs),
        spreadY:Math.max(...ys)-Math.min(...ys),initial,next,registered,correctionHidden,revealedWrong,revealedSolved,restarted};
    }
    behavior=await evalTop(cdp,'('+roscoScenario.toString()+')()');
    invariant(behavior.count>=4&&behavior.spreadX>80&&behavior.spreadY>80,kind+': expected circle, not horizontal letters '+JSON.stringify(behavior));
    invariant(behavior.initial!==behavior.next&&behavior.registered&&behavior.correctionHidden&&behavior.restarted,kind+': pass, deferred correction or reset failed '+JSON.stringify(behavior));
  }
  const desktop=await captureElementVisualEvidence(cdp,'game-'+kind+'-desktop',"document.getElementById('demo-player')",{maxHeight:1300});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:840,deviceScaleFactor:1,mobile:true});
  await sleep(400);
  function mobileScenario(){
    const root=document.getElementById('demo-player')?.shadowRoot;
    const game=root?.querySelector('.p2lrn-crossword-grid,.p2lrn-rosco');
    const stage=root?.querySelector('.p2lrn-stage');
    return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      board:game?.getBoundingClientRect().width??0,stage:stage?.getBoundingClientRect().width??0};
  }
  const mobile=await evalTop(cdp,'('+mobileScenario.toString()+')()');
  invariant(mobile.overflow<=2&&mobile.board<=mobile.stage+2,kind+': mobile UI overflows '+JSON.stringify(mobile));
  const mobileScreenshot=await captureElementVisualEvidence(cdp,'game-'+kind+'-mobile',"document.getElementById('demo-player')",{maxHeight:1500});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
  return {kind,base,behavior,mobile,desktopScreenshot:desktop,mobileScreenshot};
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


const visualEvidenceRoot=process.env.P2LRN_QUEST3D_OUTPUT_DIR
  ?resolve(process.env.P2LRN_QUEST3D_OUTPUT_DIR)
  :join(root,'.visual-evidence');
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
async function captureElementVisualEvidence(cdp,name,expression,{padding=12,maxHeight=1800}={}){
  await mkdir(visualEvidenceRoot,{recursive:true});
  const found=await evalTop(cdp,`(()=>{const el=(${expression});if(!el)return false;el.scrollIntoView({block:'center',inline:'nearest'});return true;})()`);
  invariant(found,name+': visual target is missing');
  await sleep(250);
  const box=await evalTop(cdp,`(()=>{const el=(${expression});if(!el)return null;const r=el.getBoundingClientRect();return{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,docWidth:document.documentElement.scrollWidth,docHeight:document.documentElement.scrollHeight};})()`);
  invariant(box&&box.width>20&&box.height>20,name+': visual target has no visible box '+JSON.stringify(box));
  const x=Math.max(0,box.x-padding),y=Math.max(0,box.y-padding);
  const width=Math.max(1,Math.min(box.docWidth-x,box.width+padding*2));
  const height=Math.max(1,Math.min(maxHeight,box.docHeight-y,box.height+padding*2));
  const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true,clip:{x,y,width,height,scale:1}});
  if(!shot?.data)throw new Error('Chrome returned no element screenshot for '+name);
  const filepath=join(visualEvidenceRoot,name+'.png');
  await writeFile(filepath,Buffer.from(shot.data,'base64'));
  const info=await stat(filepath);
  invariant(info.size>6000,name+': empty element screenshot');
  return {filename:name+'.png',bytes:info.size,box:{width:box.width,height:box.height,capturedHeight:height}};
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
    await wait(()=>{const surface=q('.surface');return surface?.isContentEditable?surface:null;},'add lesson');
    const title=q('.title-input');
    if(!title?.isContentEditable)throw new Error('Studio editable lesson title missing');
    title.textContent='Lección visual P2LRN';title.dispatchEvent(new InputEvent('input',{bubbles:true}));
    const surface=q('.surface');surface.textContent='Lección escrita desde la interfaz visual';surface.dispatchEvent(new InputEvent('input',{bubbles:true}));
    const lessonCount=q('[data-tree]').querySelectorAll('button').length;
    const added=[];
    for(const kind of ['questionnaire','memory','matching','ordering','classification','true-false','fill-blanks','word-search','crossword','rosco','3d','3d-matching','3d-classification','component','composite']){
      const before=q('[data-tree]').querySelectorAll('button').length;
      q('[data-add-menu]').open=true;
      click('[data-add-kind="'+kind+'"]');
      if(kind==='component'){
        const picker=await wait(()=>q('.studio-choice-dialog'),'component picker');
        const option=picker.querySelector('.studio-choice-card');
        if(!option)throw new Error('Component picker has no registered components');
        option.click();
      }
      await wait(()=>q('[data-tree]').querySelectorAll('button').length>before,'add '+kind,10000);
      if(['3d','3d-matching','3d-classification'].includes(kind)){
        const typePicker=await wait(()=>{
          const fields=[...root.querySelectorAll('.q-card .q-basic-grid label')];
          return fields.find(label=>label.querySelector('.q-label')?.textContent==='Tipo')?.querySelector('select');
        },'3D type selector');
        const options=[...typePicker.options].map(option=>option.value);
        if(JSON.stringify(options)!==JSON.stringify(['ordering','matching','classification']))throw new Error('3D game modes missing: '+options.join(','));
        const expected={'3d':'ordering','3d-matching':'matching','3d-classification':'classification'}[kind];
        if(typePicker.value!==expected)throw new Error('Wrong initial 3D mode: '+kind+' => '+typePicker.value);
      }
      added.push(kind);
    }
    // The last added item is a composite. Previously Studio inserted
    // additional activities next to it instead of under it.
    const groupSelect=await wait(()=>root.querySelector('.composite-existing select'),'composite move controls');
    const wordSearch=[...groupSelect.options].find((item)=>item.textContent==='Sopa de letras');
    if(!wordSearch)throw new Error('Existing sibling game is missing from composite move candidates');
    groupSelect.value=wordSearch.value;
    groupSelect.dispatchEvent(new Event('change',{bubbles:true}));
    const moveButton=await wait(()=>{const button=[...root.querySelectorAll('button')].find((item)=>item.textContent.includes('actividad existente'));return button&&!button.disabled?button:null;},'composite move action enabled');
    moveButton.click();
    await wait(()=>[...root.querySelectorAll('.composite-row strong')].some((item)=>item.textContent==='Sopa de letras'),'composite activity move');

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
    const compound=exported.graph.entities.find((item)=>item.type==='activity'&&item.activityType==='https://p2lrn.org/type/composite');
    if(!compound)throw new Error('A composite with children must carry the native composite activity type');
    if(compound.children?.length!==2)throw new Error('Composite should own the moved word search and newly uploaded file');
    if(compound.children[0]!==wordSearch.value)throw new Error('Existing word search was not re-parented into the composite');
    const parentOfMoved=exported.graph.entities.filter((entity)=>(entity.children||[]).includes(wordSearch.value));
    if(parentOfMoved.length!==1||parentOfMoved[0].id!==compound.id)throw new Error('Moved activity still has another parent');
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
    // A selected unit contains several activities; the outer Studio outline
    // must remain the only navigation when its Player preview is rendered.
    const unitOutline=[...q('[data-tree]').querySelectorAll('button')].find(button=>
      button.querySelector('small')?.textContent==='unit'
    );
    if(!unitOutline)throw new Error('The Studio component lost its unit in the outline');
    unitOutline.click();
    const unitPreview=await wait(()=>{
      const candidate=q('p2lrn-player.preview');
      return candidate&&candidate!==player
        &&candidate.getAttribute('navigation')==='external'
        &&candidate.shadowRoot?.querySelector('.p2lrn-layout-external .p2lrn-stage')
        ?candidate:null;
    },'npm Studio unit preview without a nested navigation',18000);
    if(unitPreview.shadowRoot.querySelector('.p2lrn-nav'))
      throw new Error('npm Studio duplicated the course outline inside Player');
    const compactLayout=unitPreview.shadowRoot.querySelector('.p2lrn-layout-external');
    const compactStage=compactLayout.querySelector('.p2lrn-stage');
    if(compactStage.getBoundingClientRect().width+2<compactLayout.getBoundingClientRect().width)
      throw new Error('npm Studio did not expand its Player stage to full width');
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
async function verifyStudioComponentUI(cdp,chromePath){
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

  const offlineDialog=await evalTop(cdp,`(async()=>{
    const studio=document.getElementById('studio'),root=studio?.shadowRoot;
    const button=root?.querySelector('[data-offline]');
    if(!button)throw new Error('Offline assignment control is missing from Studio.');
    button.click();
    for(let i=0;i<100;i++){
      const dialog=root.querySelector('.studio-choice-dialog:has(.offline-form)');
      if(dialog?.open){
        const labels=[...dialog.querySelectorAll('.offline-field span')].map((node)=>node.textContent);
        const format=dialog.querySelector('.offline-field select');
        const fixed=dialog.querySelector('.offline-fixed')?.textContent??'';
        return {open:true,labels,fixed,formatValue:format?.value??null,formatOptions:format?[...format.options].map((option)=>({value:option.value,text:option.textContent})):[]};
      }
      await new Promise((resolve)=>setTimeout(resolve,40));
    }
    throw new Error('Offline assignment dialog did not open.');
  })()`);
  invariant(offlineDialog.open===true,'Offline assignment dialog is not open.');
  invariant(offlineDialog.labels.includes('Quién entrega este curso')&&offlineDialog.labels.includes('Formato de entrega')&&offlineDialog.labels.includes('Disponible desde')&&offlineDialog.labels.includes('Fecha límite')&&offlineDialog.labels.includes('Tiempo máximo desde que empieza (minutos)')&&offlineDialog.labels.includes('Caduca tras la primera apertura (días)')&&offlineDialog.labels.includes('Intentos máximos'),'Offline assignment policy controls are incomplete: '+JSON.stringify(offlineDialog));
  invariant(offlineDialog.formatValue==='windows-single','Offline assignment must default to the one-file Windows delivery: '+JSON.stringify(offlineDialog));
  invariant(offlineDialog.formatOptions.some((item)=>item.value==='windows-single')&&offlineDialog.formatOptions.some((item)=>item.value==='portable-zip'),'Offline assignment format selector is incomplete: '+JSON.stringify(offlineDialog));
  invariant(offlineDialog.fixed.includes('Colaboración')&&offlineDialog.fixed.includes('Desactivada'),'Offline assignment UI does not make collaboration disabled explicit.');
  const offlineDialogScreenshot=await captureElementVisualEvidence(cdp,'studio-offline-assignment-dialog',"document.getElementById('studio').shadowRoot.querySelector('.studio-choice-dialog:has(.offline-form)')",{maxHeight:1200});
  await evalTop(cdp,"document.getElementById('studio').shadowRoot.querySelector('.studio-choice-dialog:has(.offline-form)')?.close()");

  const launcherDownloads=await mkdtemp(join(tmpdir(),'p2lrn-offline-launcher-'));
  let offlineFlow=null;
  try{
    await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:launcherDownloads});
    const offlineExport=await evalTop(cdp,`(async()=>{
      const studio=document.getElementById('studio');
      const doc=await studio.createCourse({title:'Prueba doble clic real',language:'es'});
      doc.setCourseRights({author:'Equipo docente QA',copyrightHolder:'Centro P2LRN QA',license:'Uso educativo de prueba'});
      const unit=doc.children(doc.rootId)[0];
      if(!unit)throw new Error('Studio did not create its initial unit.');
      const starter=doc.children(unit.id)[0];
      if(starter)doc.removeActivity(starter.id);
      const activity=doc.addQuestionnaire(unit.id,{title:'Pregunta offline real',language:'es'});
      const questionnaire=await doc.readQuestionnaire(activity.id);
      questionnaire.payload.questions[0].prompt='Selecciona la respuesta correcta para validar la entrega offline real.';
      questionnaire.payload.questions[0].choices[0].text='Respuesta correcta real';
      questionnaire.payload.questions[0].choices[1].text='Respuesta incorrecta';
      doc.setQuestionnaire(activity.id,questionnaire.payload);
      studio.offlineRuntimeBaseUrl='${APP_ORIGIN}/player/current/dist/';
      const exported=await studio.downloadOfflineAssignment({deliveryFormat:'windows-single',issuerName:'Profesor QA',participantLabel:'Alumno visual real',expiresAfterFirstOpenDays:30,maxAttempts:1,activityTracking:true});
      return {downloadedFilename:exported.downloadedFilename,assignmentId:exported.assignment.assignmentId,contentRoot:exported.assignment.contentRoot,payloadDigest:exported.windowsLauncher.payloadDigest,courseBytes:exported.course.bytes.byteLength,bundleBytes:exported.bytes.byteLength,provenance:exported.assignment.provenance,expiryDays:exported.assignment.policy.expiresAfterFirstOpenDays};
    })()`);
    invariant(offlineExport?.downloadedFilename?.endsWith('.p2lrn-offline.cmd'),'Studio did not download the one-file Windows offline delivery: '+JSON.stringify(offlineExport));
    invariant(offlineExport.courseBytes>500,'Studio exported an implausibly small P2LRN course.');
    invariant(offlineExport.provenance?.issuerName==='Profesor QA'&&offlineExport.provenance?.author==='Equipo docente QA'&&offlineExport.provenance?.copyrightHolder==='Centro P2LRN QA','Offline export lost declared provenance: '+JSON.stringify(offlineExport.provenance));
    invariant(offlineExport.expiryDays===30,'Offline export lost first-open expiry: '+JSON.stringify(offlineExport));
    const launcherPath=await waitForDownloadedFile(launcherDownloads,'.p2lrn-offline.cmd',25000);
    const executed=await runOfflineDoubleClickE2E({launcherPath,chromePath,exportMeta:offlineExport});
    const parsed=await parseOfflineAssignmentResult(executed.resultText,{expectedContentRoot:offlineExport.contentRoot,expectedAssignmentId:offlineExport.assignmentId});
    invariant(parsed.integrityValid&&parsed.courseMatches&&parsed.assignmentMatches,'The real .p2lrn-result failed integrity or identity verification.');
    invariant(parsed.summary.participantLabel==='Alumno visual real','The real result lost the participant identity.');
    invariant(parsed.summary.answers.length>=1&&parsed.summary.scores.length>=1&&parsed.summary.events.length>=1,'The real result is missing answers, scores or telemetry events.');
    invariant(Number(parsed.summary.latestScore?.normalized)===1,'The real result did not preserve the questionnaire score.');
    const resultLiteral=JSON.stringify(executed.resultText),filenameLiteral=JSON.stringify(executed.resultFilename);
    const offlineReview=await evalTop(cdp,`(async()=>{
      const studio=document.getElementById('studio'),root=studio.shadowRoot;
      await studio.reviewOfflineResult(new File([${resultLiteral}],${filenameLiteral},{type:'application/vnd.p2lrn-result+json'}));
      for(let i=0;i<100;i++){
        const dialog=[...root.querySelectorAll('.studio-choice-dialog')].find((item)=>item.querySelector('h2')?.textContent==='Revisar entrega offline');
        if(dialog?.open)return {text:dialog.textContent,open:true};
        await new Promise((resolve)=>setTimeout(resolve,40));
      }
      throw new Error('Offline result review dialog did not open.');
    })()`);
    invariant(offlineReview.open===true&&offlineReview.text.includes('Integridad')&&offlineReview.text.includes('Válida')&&offlineReview.text.includes('Coincide')&&offlineReview.text.includes('Alumno visual real')&&offlineReview.text.includes('100 %'),'Offline result review UI is incomplete or is not reviewing the real result: '+JSON.stringify(offlineReview));
    const offlineReviewScreenshot=await captureElementVisualEvidence(cdp,'studio-offline-result-review-real',"[...document.getElementById('studio').shadowRoot.querySelectorAll('.studio-choice-dialog')].find((item)=>item.querySelector('h2')?.textContent==='Revisar entrega offline')",{maxHeight:1400});
    await evalTop(cdp,"[...document.getElementById('studio').shadowRoot.querySelectorAll('.studio-choice-dialog')].find((item)=>item.querySelector('h2')?.textContent==='Revisar entrega offline')?.close()");
    offlineFlow={export:offlineExport,result:{filename:executed.resultFilename,integrityValid:parsed.integrityValid,courseMatches:parsed.courseMatches,assignmentMatches:parsed.assignmentMatches,participantLabel:parsed.summary.participantLabel,answers:parsed.summary.answers.length,scores:parsed.summary.scores.length,events:parsed.summary.events.length,latestScore:parsed.summary.latestScore},launcherUrl:executed.launcherUrl,extractedCourseBytes:executed.extractedCourseBytes,scoreText:executed.scoreText,interactionScreenshot:executed.interactionScreenshot,finalScreenshot:executed.finalScreenshot,reviewScreenshot:offlineReviewScreenshot};
  }finally{
    await rm(launcherDownloads,{recursive:true,force:true}).catch(()=>{});
  }
  const desktop=await captureVisualEvidence(cdp,'studio-cdn-desktop');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(350);
  const mobile=await evalTop(cdp,"(()=>{const r=document.getElementById('studio').shadowRoot,s=r.querySelector('.shell'),b=s.getBoundingClientRect(),nav=r.querySelector('nav');return {width:b.width,viewport:innerWidth,body:!r.querySelector('[data-body]').hidden,overflow:Math.max(0,s.scrollWidth-s.clientWidth),navOverflow:nav?Math.max(0,nav.scrollWidth-nav.clientWidth):0}})()");
  invariant(mobile.body&&mobile.width<=mobile.viewport+2&&mobile.overflow<=2&&mobile.navOverflow<=2,'Studio mobile layout overflows: '+JSON.stringify(mobile));
  const screenshotMobile=await captureElementVisualEvidence(cdp,'studio-cdn-mobile',"document.getElementById('studio')",{maxHeight:1600});
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
  invariant(cdp.exceptions.length===exceptionsStart,'Studio browser exceptions: '+JSON.stringify(cdp.exceptions.slice(exceptionsStart)));
  return {suite:'studio-component-cdn',...result,offlineDialog,offlineDialogScreenshot,offlineFlow,desktop,mobile,screenshotMobile};
}

async function studioSiteScenario(){
  const q=(sel)=>document.querySelector(sel);
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const wait=async(fn,label,limit=12000)=>{
    const started=Date.now();
    while(Date.now()-started<limit){const value=fn();if(value)return value;await sleep(65);}
    throw new Error('Studio site timed out: '+label+' status='+q('[data-studio-status]')?.textContent);
  };
  const click=(sel)=>{const el=q(sel);if(!el)throw new Error('Missing Studio site UI '+sel);el.click();};
  try{
    await window.P2LRNReady;
    click('[data-create-course]');
    await wait(()=>!q('[data-workspace]').hidden,'create');
    click('[data-add-unit]');
    await wait(()=>q('[data-tree]').textContent.includes('Nueva unidad'),'unit');
    click('[data-add-lesson]');
    const sheet=await wait(()=>q('.studio-wysiwyg[contenteditable=true]'),'lesson');
    const title=q('.studio-title-field');
    if(!title?.isContentEditable)throw new Error('Studio website editable title missing');
    title.textContent='Lección editada con Studio web';
    title.dispatchEvent(new InputEvent('input',{bubbles:true}));
    sheet.innerHTML='<p>Texto incorporado mediante el editor WYSIWYG real.</p>';
    sheet.dispatchEvent(new InputEvent('input',{bubbles:true}));
    // The Studio outline is the single navigation authority, including when
    // a whole unit (rather than one activity) is selected for preview.
    const editedLessonId=q('[data-tree] button[aria-current="true"]')?.dataset.entityId;
    const unitNode=[...q('[data-tree]').querySelectorAll('button')].find(button=>
      button.querySelector('.type')?.textContent==='unit'&&button.textContent.includes('Nueva unidad')
    );
    if(!unitNode||!editedLessonId)throw new Error('Cannot find unit and edited lesson for duplicate navigation regression');
    const unitId=unitNode.dataset.entityId;
    unitNode.click();
    await wait(()=>q('.studio-readonly'),'select full unit');
    click('[data-mode-preview]');
    const unitPlayer=await wait(()=>{
      const p=q('[data-player]');
      const layout=p?.shadowRoot?.querySelector('.p2lrn-layout-external');
      return p?.getAttribute('node')===unitId&&p.getAttribute('navigation')==='external'&&layout&&layout.querySelector('.p2lrn-stage')?p:null;
    },'unit preview without second navigation',18000);
    const unitShadow=unitPlayer.shadowRoot;
    if(unitShadow.querySelector('.p2lrn-nav')||unitShadow.querySelectorAll('nav').length)
      throw new Error('Studio unit preview duplicated the course navigation');
    const unitLayout=unitShadow.querySelector('.p2lrn-layout-external');
    const unitStage=unitShadow.querySelector('.p2lrn-stage');
    if(unitStage.getBoundingClientRect().width+2<unitLayout.getBoundingClientRect().width)
      throw new Error('Unit preview did not expand to the available editor width');
    click('[data-mode-edit]');
    await wait(()=>q('[data-editor-stage]')&&!q('[data-editor-stage]').hidden,'return to editing after unit preview');
    const editedLessonNode=q('[data-tree] button[data-entity-id="'+editedLessonId+'"]');
    if(!editedLessonNode)throw new Error('The outer course outline lost the edited lesson');
    editedLessonNode.click();
    await wait(()=>q('.studio-wysiwyg[contenteditable=true]'),'return to the HTML editor after unit preview');
    click('[data-add-content]');
    await wait(()=>q('[data-add-dialog]')?.open,'open palette');
    click('[data-add-kind="questionnaire"]');
    await wait(()=>!q('[data-add-dialog]').open&&q('[data-studio-status]').textContent.includes('Cuestionario'),'questionnaire');
    const getQuestionType=()=>[...(q('.q-card .q-basic-grid')?.querySelectorAll('label')??[])]
      .find(label=>label.querySelector('.q-label')?.textContent==='Tipo')?.querySelector('select');
    const standardType=await wait(getQuestionType,'standard questionnaire type selector');
    const expectedQuestionTypes=['single-choice','multiple-choice','true-false','text','fill-blanks','ordering','matching','classification'];
    if(JSON.stringify([...standardType.options].map(option=>option.value))!==JSON.stringify(expectedQuestionTypes))
      throw new Error('Standard questionnaire types missing: '+[...standardType.options].map(option=>option.value).join(','));
    const standardField=(name)=>[...(q('.q-card .q-basic-grid')?.querySelectorAll('label')??[])]
      .find(label=>label.querySelector('.q-label')?.textContent===name)?.querySelector('input,select,textarea');
    const standardPrompt=standardField('Enunciado'),standardTime=standardField('Tiempo (s)'),standardPoints=standardField('Puntos');
    if(!standardPrompt||standardPrompt.tagName!=='TEXTAREA'||standardPrompt.getBoundingClientRect().height<90)
      throw new Error('Question prompt editor is not the required multiline field');
    standardPrompt.value='Enunciado largo conservado al cambiar entre todos los tipos de pregunta.';
    standardPrompt.dispatchEvent(new Event('input',{bubbles:true}));
    standardTime.value='37';standardTime.dispatchEvent(new Event('input',{bubbles:true}));
    standardPoints.value='3';standardPoints.dispatchEvent(new Event('input',{bubbles:true}));
    const typeEditor={
      'single-choice':'.q-option-row',
      'multiple-choice':'.q-option-row',
      'true-false':'.q-option-row',
      'text':'.q-answer-list',
      'fill-blanks':'.q-blank-template-editor',
      'ordering':'.q-order',
      'matching':'.q-pair-row',
      'classification':'.q-class-row',
    };
    for(const type of expectedQuestionTypes){
      const picker=getQuestionType();picker.value=type;picker.dispatchEvent(new Event('change',{bubbles:true}));
      await wait(()=>getQuestionType()?.value===type&&q(typeEditor[type]),'switch standard question to '+type);
    }
    if(standardField('Enunciado')?.value!=='Enunciado largo conservado al cambiar entre todos los tipos de pregunta.'
      ||standardField('Tiempo (s)')?.value!=='37'||standardField('Puntos')?.value!=='3')
      throw new Error('Changing the standard question type erased its metadata');
    const tfPicker=getQuestionType();tfPicker.value='true-false';tfPicker.dispatchEvent(new Event('change',{bubbles:true}));
    await wait(()=>q('.q-tf-mode select'),'true-false format selector');
    const tfMode=q('.q-tf-mode select');
    if(JSON.stringify([...tfMode.options].map(option=>option.value))!==JSON.stringify(['single','multiple']))
      throw new Error('True-false does not expose single and multiple modes');
    tfMode.value='multiple';tfMode.dispatchEvent(new Event('change',{bubbles:true}));
    await wait(()=>q('.q-tf-row')&&document.querySelectorAll('.q-tf-row').length===2,'multiple true-false rows');
    const tfAdd=[...document.querySelectorAll('.q-type-editor button')].find(button=>button.textContent.includes('Añadir afirmación'));
    if(!tfAdd)throw new Error('Multiple true-false add statement action missing');
    tfAdd.click();
    await wait(()=>document.querySelectorAll('.q-tf-row').length===3,'third true-false statement');
    if([...document.querySelectorAll('.q-tf-row')].some(row=>row.querySelectorAll('input[type=radio]').length!==2))
      throw new Error('Each true-false statement must expose Verdadero and Falso');
    const fillPicker=getQuestionType();fillPicker.value='fill-blanks';fillPicker.dispatchEvent(new Event('change',{bubbles:true}));
    await wait(()=>q('.q-blank-template-editor')&&q('.q-field--mode select'),'fill-blanks editor');
    if(JSON.stringify([...q('.q-field--mode select').options].map(option=>option.value))!==JSON.stringify(['text','drag']))
      throw new Error('Fill-blanks does not expose text and drag modes');
    click('[data-add-content]');
    await wait(()=>q('[data-add-dialog]').open,'reopen palette');
    click('[data-add-kind="3d"]');
    await wait(()=>!q('[data-add-dialog]').open&&q('[data-studio-status]').textContent.includes('Juego 3D'),'3d game');
    const get3dType=()=>[...(q('.q-card .q-basic-grid')?.querySelectorAll('label')??[])]
      .find(label=>label.querySelector('.q-label')?.textContent==='Tipo')?.querySelector('select');
    const choice=await wait(get3dType,'3D question type selector');
    if(JSON.stringify([...choice.options].map(option=>option.value))!==JSON.stringify(['ordering','matching','classification']))
      throw new Error('Studio does not expose all three 3D question types');
    const gameField=(name)=>[...(q('.q-card .q-basic-grid')?.querySelectorAll('label')??[])]
      .find(label=>label.querySelector('.q-label')?.textContent===name)?.querySelector('input,select,textarea');
    const titleInput=gameField('Enunciado'),timeInput=gameField('Tiempo (s)'),pointsInput=gameField('Puntos');
    if(!titleInput||!timeInput||!pointsInput)throw new Error('Missing 3D question editor fields');
    titleInput.value='Juego 3D con enunciado personalizado';
    titleInput.dispatchEvent(new Event('input',{bubbles:true}));
    timeInput.value='45';
    timeInput.dispatchEvent(new Event('input',{bubbles:true}));
    pointsInput.value='4';
    pointsInput.dispatchEvent(new Event('input',{bubbles:true}));
    const chooseType=async(type,selector)=>{
      const picker=get3dType();
      picker.value=type;
      picker.dispatchEvent(new Event('change',{bubbles:true}));
      await wait(()=>get3dType()?.value===type&&q(selector),'switch 3D to '+type);
    };
    await chooseType('matching','.q-pair-row');
    await chooseType('classification','.q-class-row');
    if(gameField('Enunciado')?.value!=='Juego 3D con enunciado personalizado'
      ||gameField('Tiempo (s)')?.value!=='45'
      ||gameField('Puntos')?.value!=='4'){
      throw new Error('Changing the 3D game mode erased its question metadata');
    }
    click('[data-add-content]');
    await wait(()=>q('[data-add-dialog]').open,'open matching 3D palette');
    click('[data-add-kind="3d-matching"]');
    await wait(()=>!q('[data-add-dialog]').open&&q('[data-studio-status]').textContent.includes('Relacionar 3D'),'matching 3D game');
    if((await wait(get3dType,'matching 3D type')).value!=='matching')throw new Error('Matching 3D initial question type mismatch');
    click('[data-add-content]');
    await wait(()=>q('[data-add-dialog]').open,'open classification 3D palette');
    click('[data-add-kind="3d-classification"]');
    await wait(()=>!q('[data-add-dialog]').open&&q('[data-studio-status]').textContent.includes('Clasificar 3D'),'classification 3D game');
    if((await wait(get3dType,'classification 3D type')).value!=='classification')throw new Error('Classification 3D initial question type mismatch');
    click('[data-add-content]');
    await wait(()=>q('[data-add-dialog]').open,'open composite palette');
    click('[data-add-kind="composite"]');
    await wait(()=>!q('[data-add-dialog]').open&&q('[data-studio-status]').textContent.includes('Grupo de actividades'),'new composite');
    click('[data-add-content]');
    await wait(()=>q('[data-add-dialog]').open,'open composite child palette');
    click('[data-add-kind="word-search"]');
    await wait(()=>!q('[data-add-dialog]').open&&q('[data-studio-status]').textContent.includes('Sopa de letras'),'child game');
    const nested=await wait(()=>{
      const group=[...q('[data-tree]').querySelectorAll('button')].find(x=>
        x.querySelector('.title')?.textContent==='Grupo de actividades'
      );
      const container=group?.closest('.studio-tree-node');
      return [...(container?.querySelectorAll(':scope > .studio-tree-children > .studio-tree-node > button')??[])].find(x=>
        x.querySelector('.title')?.textContent==='Sopa de letras'
      );
    },'composite child displayed inside its parent');
    const lesson=[...q('[data-tree]').querySelectorAll('button')].find(x=>x.textContent.includes('Lección editada con Studio web'));
    if(!lesson)throw new Error('Edited lesson not present in outline');
    lesson.click();
    await wait(()=>q('.studio-title')?.textContent==='Lección editada con Studio web','restore lesson editor');
    click('[data-save-draft]');
    await wait(()=>q('[data-studio-status]')?.textContent.includes('Borrador guardado'),'manual draft save',18000);
    click('[data-export]');
    await wait(()=>q('[data-studio-status]')?.textContent.includes('Paquete exportado y verificado'),'verified export',18000);
    return {ok:true,lesson:'Lección editada con Studio web',questionnaire:true,game3d:true,three3dModes:true,compositeChild:true,draftSaved:true,packageExported:true,treeText:q('[data-tree]').textContent.slice(0,350)};
  }catch(error){return {ok:false,error:String(error?.stack||error)};}
}
async function verifyStudioSiteUI(cdp){
  // Do not inherit an arbitrary 800px default after another test cleared
  // Chrome's device metrics. Verify the intended desktop and mobile layouts.
  await cdp.send('Emulation.setDeviceMetricsOverride',
    {width:1500,height:950,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/studio/'});
  const deadline=Date.now()+16000;let loaded=false;
  while(Date.now()<deadline){
    loaded=await evalTop(cdp,"!!document.querySelector('[data-create-course]') && document.documentElement.dataset.p2lrnStudioReady==='true' && !!window.P2LRNReady");
    if(loaded)break;
    await sleep(150);
  }
  invariant(loaded,'Visual Studio website did not initialize.');
  const before=cdp.exceptions.length;
  const result=await evalTop(cdp,'('+studioSiteScenario.toString()+')()');
  invariant(result?.ok,'Studio website WYSIWYG/UI failure: '+JSON.stringify(result));
  const editorScreenshot=await captureVisualEvidence(cdp,'studio-website-editor');
  await evalTop(cdp,"document.querySelector('[data-mode-preview]').click();true");
  const previewDeadline=Date.now()+14000;let previewed=false;
  while(Date.now()<previewDeadline){
    previewed=await evalTop(cdp,"!!document.querySelector('p2lrn-player[data-player]')?.shadowRoot?.querySelector('.p2lrn-stage') && !document.querySelector('[data-preview-stage]').hidden");
    if(previewed)break;
    await sleep(120);
  }
  invariant(previewed,'Studio website preview did not create a Player');
  const previewLayout=await evalTop(cdp,"(()=>{const toolbar=document.querySelector('[data-toolbar]');const preview=document.querySelector('[data-preview-stage]');const tb=toolbar.getBoundingClientRect();const pb=preview.getBoundingClientRect();return{mode:document.documentElement.dataset.studioMode,toolbarPosition:getComputedStyle(toolbar).position,toolbarBottom:tb.bottom,previewTop:pb.top};})()");
  invariant(previewLayout.mode==='preview','Studio preview mode marker missing: '+JSON.stringify(previewLayout));
  invariant(previewLayout.toolbarPosition==='static','Studio preview toolbar must not overlay content: '+JSON.stringify(previewLayout));
  invariant(previewLayout.previewTop>=previewLayout.toolbarBottom-1,'Studio preview content is hidden below toolbar: '+JSON.stringify(previewLayout));
  const previewScreenshot=await captureVisualEvidence(cdp,'studio-website-preview');
  // Screenshot the exact regression from the user's recording: selecting a
  // whole UNIT inside Studio used to show a second Player outline.
  const unitId=await evalTop(cdp,"(()=>{const button=[...document.querySelectorAll('[data-tree] button')].find(item=>item.querySelector('.type')?.textContent==='unit' && item.textContent.includes('Nueva unidad'));if(!button)return null;const id=button.dataset.entityId;button.click();return id;})()");
  invariant(unitId,'Could not select unit for the duplicated-navigation visual regression.');
  const unitDeadline=Date.now()+18000;
  let unitLayout=null;
  while(Date.now()<unitDeadline){
    unitLayout=await evalTop(cdp,"(()=>{const p=document.querySelector('[data-player]');if(!p||p.getAttribute('node')!=="+JSON.stringify(unitId)+")return null;const root=p.shadowRoot;const layout=root?.querySelector('.p2lrn-layout-external'),stage=root?.querySelector('.p2lrn-stage');if(!layout||!stage)return null;return {navigation:p.getAttribute('navigation'),navCount:root.querySelectorAll('.p2lrn-nav').length,hostOutlineCount:document.querySelectorAll('[data-tree] button').length,layoutWidth:layout.getBoundingClientRect().width,stageWidth:stage.getBoundingClientRect().width,rendered:!!stage.querySelector('iframe')};})()");
    if(unitLayout?.rendered)break;
    await sleep(120);
  }
  invariant(unitLayout?.rendered,'Unit preview HTML did not render in Player.');
  invariant(unitLayout.navigation==='external'&&unitLayout.navCount===0&&unitLayout.hostOutlineCount>=3,'Duplicate navigation persisted: '+JSON.stringify(unitLayout));
  invariant(unitLayout.stageWidth+2>=unitLayout.layoutWidth,'Unit preview lost the available content width: '+JSON.stringify(unitLayout));
  const unitPreviewScreenshot=await captureVisualEvidence(cdp,'studio-website-unit-single-outline');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(350);
  const mobile=await evalTop(cdp,"(()=>{const t=document.querySelector('[data-toolbar]'),p=document.querySelector('[data-preview-stage]'),s=getComputedStyle(t);return {scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,playerWidth:document.querySelector('[data-player]')?.getBoundingClientRect().width||0,mode:document.documentElement.dataset.studioMode,toolbarPosition:s.position,toolbarTop:s.top,toolbarBottom:t.getBoundingClientRect().bottom,previewTop:p.getBoundingClientRect().top};})()");
  invariant(mobile.scrollWidth<=mobile.clientWidth+3,'Studio website overflows mobile viewport: '+JSON.stringify(mobile));
  invariant(mobile.mode==='preview'&&mobile.toolbarPosition==='relative'&&
    (mobile.toolbarTop==='auto'||mobile.toolbarTop==='0px')&&
    mobile.previewTop>=mobile.toolbarBottom-1,
    'Studio mobile preview toolbar overlaps the Player: '+JSON.stringify(mobile));
  const mobileScreenshot=await captureVisualEvidence(cdp,'studio-website-mobile');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
  invariant(cdp.exceptions.length===before,'Studio website threw in Chrome: '+JSON.stringify(cdp.exceptions.slice(before)));
  // Exercise both offline delivery formats through the independent public Studio website.
  // The toolkit component has a separate offline E2E; these controls must also work here.
  const offlineExportsDir=await mkdtemp(join(tmpdir(),'p2lrn-web-studio-offline-'));
  let offlineWeb=null;
  try{
    await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:offlineExportsDir});
    await evalTop(cdp,"document.querySelector('[data-create-course]').click();true");
    await waitForEval(cdp,"document.querySelector('[data-studio-status]')?.textContent==='Curso nuevo listo para editar'",'fresh standalone Studio course');
    // New courses intentionally open on their first editable lesson.
    // Ownership fields belong to the course root, so select it explicitly.
    await evalTop(cdp,`(()=>{
      const course=[...document.querySelectorAll('[data-tree] button[data-entity-id]')]
        .find(node=>node.querySelector('.type')?.textContent==='course');
      if(!course)throw new Error('Cannot select course root for authorship');
      course.click();
      return true;
    })()`);
    await waitForEval(cdp,"Boolean(document.querySelector('.studio-rights input'))",'course ownership editor');
    const rightsFilled=await evalTop(cdp,`(()=>{
      const set=(label,value)=>{
        const input=document.querySelector('[aria-label="'+label+'"]');
        if(!input)throw new Error('Missing course rights field '+label);
        input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));
      };
      set('Autor del contenido','Equipo docente web QA');
      set('Derechos de autor · Titular de los derechos','Centro web QA');
      set('Licencia · Condiciones de uso y distribución','Uso educativo QA');
      return true;
    })()`);
    invariant(rightsFilled===true,'Standalone Studio could not set course authorship before offline export.');
    const options=await evalTop(cdp,`(()=>{
      const button=document.querySelector('[data-export-offline]'),review=document.querySelector('[data-review-offline]');
      if(!button||!review)throw new Error('Standalone Studio offline controls missing');
      button.click();
      const dialog=document.querySelector('[data-offline-dialog]'),form=document.querySelector('[data-offline-form]');
      return {open:dialog?.open,formats:[...(form?.elements.namedItem('deliveryFormat')?.options??[])].map(option=>option.value),
        tries:form?.elements.namedItem('maxAttempts')?.value,hasIssuer:!!form?.elements.namedItem('issuerName'),
        hasExpiry:!!form?.elements.namedItem('expiresAfterFirstOpenDays'),reviewInput:!!document.querySelector('[data-offline-result-file]')};
    })()`);
    invariant(options.open&&options.formats.includes('windows-single')&&options.formats.includes('portable-zip')&&options.hasIssuer&&options.hasExpiry&&options.reviewInput,'Web Studio offline options are missing: '+JSON.stringify(options));
    const offlineWebScreenshot=await captureElementVisualEvidence(cdp,'studio-web-offline-export-dialog',"document.querySelector('[data-offline-dialog]')",{maxHeight:1200});
    await evalTop(cdp,"(()=>{const form=document.querySelector('[data-offline-form]');form.elements.namedItem('deliveryFormat').value='portable-zip';form.elements.namedItem('issuerName').value='Profesor web QA';form.elements.namedItem('expiresAfterFirstOpenDays').value='30';form.elements.namedItem('participantLabel').value='Alumno web';form.requestSubmit();return true})()");
    const zipFile=await waitForDownloadedFile(offlineExportsDir,'.p2lrn-offline.zip',90000);
    const zip=await readFile(zipFile);
    invariant(zip.byteLength>100000&&zip[0]===0x50&&zip[1]===0x4b,'Standalone Studio offline ZIP is invalid or incomplete.');
    await waitForEval(cdp,"!document.querySelector('[data-offline-dialog]').open",'standalone ZIP export completed');
    await evalTop(cdp,"(()=>{document.querySelector('[data-export-offline]').click();const form=document.querySelector('[data-offline-form]');form.elements.namedItem('deliveryFormat').value='windows-single';form.elements.namedItem('issuerName').value='Profesor web QA';form.elements.namedItem('expiresAfterFirstOpenDays').value='30';form.requestSubmit();return true})()");
    const cmdFile=await waitForDownloadedFile(offlineExportsDir,'.p2lrn-offline.cmd',90000);
    const cmdText=(await readFile(cmdFile)).toString('utf8');
    invariant(cmdText.startsWith('@echo off')&&cmdText.includes('__P2LRN_PAYLOAD__')&&cmdText.includes('powershell.exe')&&cmdText.length>100000,'Standalone Studio single-file Windows delivery is missing its embedded runtime.');
    await waitForEval(cdp,"!document.querySelector('[data-offline-dialog]').open",'standalone CMD export completed');
    const webReview=await evalTop(cdp,"(()=>({review:!!document.querySelector('[data-review-offline]'),fileInput:!!document.querySelector('[data-offline-result-file]'),status:document.querySelector('[data-studio-status]')?.textContent,dialogOpen:document.querySelector('[data-offline-dialog]')?.open}))()");
    invariant(webReview.review&&webReview.fileInput&&!webReview.dialogOpen&&webReview.status?.includes('.p2lrn-offline.cmd'),'Standalone offline delivery completion did not update Studio status: '+JSON.stringify(webReview));

    // Validate result review against a real course identity from the ZIP exported here.
    function storedEntry(archive,name){
      let offset=0;
      while(offset+30<=archive.length&&archive.readUInt32LE(offset)===0x04034b50){
        const size=archive.readUInt32LE(offset+18),nameLen=archive.readUInt16LE(offset+26),extra=archive.readUInt16LE(offset+28);
        const start=offset+30,body=start+nameLen+extra,path=archive.subarray(start,start+nameLen).toString('utf8');
        if(path===name)return archive.subarray(body,body+size);
        offset=body+size;
      }
      throw new Error('Missing real ZIP entry '+name);
    }
    const exportedAssignment=JSON.parse(storedEntry(zip,'www/assignment.json').toString('utf8'));
    invariant(exportedAssignment.provenance?.issuerName==='Profesor web QA'&&exportedAssignment.provenance?.author==='Equipo docente web QA'&&exportedAssignment.provenance?.copyrightHolder==='Centro web QA',
      'Standalone Studio offline ZIP lost provenance: '+JSON.stringify(exportedAssignment.provenance));
    invariant(exportedAssignment.policy?.expiresAfterFirstOpenDays===30,'Standalone Studio offline ZIP lost first-open expiry: '+JSON.stringify(exportedAssignment.policy));
    const canonical=(v)=>{
      if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number')return JSON.stringify(v);
      if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
      return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
    };
    const scoreOp={type:'score',value:{normalized:.75},timestamp:'2026-10-30T09:01:00Z',context:{entityId:'quiz-1'}};
    const activeOp={type:'event',value:{type:'p2lrn:active-time',payload:{totalActiveMs:10000}},timestamp:'2026-10-30T09:02:00Z',context:{entityId:'quiz-1'}};
    const resultBody={schema:'https://p2lrn.org/schema/offline-result/1',version:'1',
      assignment:{assignmentId:exportedAssignment.assignmentId,packageId:exportedAssignment.packageId,contentRoot:exportedAssignment.contentRoot,title:exportedAssignment.title,provenance:exportedAssignment.provenance,participantToken:exportedAssignment.participant.assignmentToken,participantLabel:'Alumno web',policy:exportedAssignment.policy},
      runtime:{playerVersion:exportedAssignment.runtime.playerVersion,runtimeDigest:exportedAssignment.runtime.runtimeDigest},
      attempt:{id:'attempt-web',number:1,status:'submitted',startedAt:'2026-10-30T09:00:00Z',finishedAt:'2026-10-30T09:03:00Z',elapsedSeconds:180},
      usage:{firstOpenedAt:'2026-10-30T08:59:00Z',lastOpenedAt:'2026-10-30T09:03:00Z',openCount:2,expiresAt:'2026-11-29T08:59:00Z',deviceBindingId:'qa-device',sessions:[{id:'open-1',openedAt:'2026-10-30T08:59:00Z',source:'windows-native'},{id:'open-2',openedAt:'2026-10-30T09:00:00Z',source:'windows-native'}]},
      summary:{latestScore:{normalized:.75},stateSnapshots:0,events:1,activeTimeMs:10000,answers:0,openings:2},
      submission:{states:[],answers:[],scores:[scoreOp]},
      analytics:{events:[activeOp],activeTimeMs:10000},audit:{anomalies:[],recordOrder:[['score',0],['event',0]]}};
    const validResult={...resultBody,integrity:{algorithm:'sha256',payloadDigest:'sha256:'+createHash('sha256').update(canonical(resultBody)).digest('hex')}};
    async function openReview(data){
      const payload=JSON.stringify(JSON.stringify(data));
      const expression="(()=>{const file=new File(["+payload+"],'entrega-web.p2lrn-result',{type:'application/vnd.p2lrn-result+json'});const transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector('[data-offline-result-file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()";
      await evalTop(cdp,expression);
      return waitForEval(cdp,"(()=>{const dialog=document.querySelector('[data-offline-review-dialog]');return dialog?.open?dialog.querySelector('[data-offline-review-content]')?.textContent:null})()",'standalone Studio result-review dialog',16000);
    }
    const validText=await openReview(validResult);
    const validAnalyticsEnabled=await evalTop(cdp,"!document.querySelector('[data-offline-open-analytics]')?.disabled");
    invariant(validText.includes('SHA-256 del resultadoCoincide')&&validText.includes('Curso originalCoincide')&&validText.includes('Alumno web')&&validText.includes('75 %')&&validText.includes('Aperturas registradas2')&&validAnalyticsEnabled,
      'Standalone Studio did not accept a matching integrity-valid offline result or enable Analytics: '+validText);
    const reviewScreenshot=await captureElementVisualEvidence(cdp,'studio-web-offline-result-review-valid',"document.querySelector('[data-offline-review-dialog]')",{maxHeight:1000});
    await evalTop(cdp,"document.querySelector('[data-offline-review-dialog]').close()");
    const tampered=structuredClone(validResult);tampered.attempt.elapsedSeconds=71;
    const invalidText=await openReview(tampered);
    const invalidAnalyticsBlocked=await evalTop(cdp,"document.querySelector('[data-offline-open-analytics]')?.disabled===true");
    invariant(invalidText.includes('SHA-256 del resultadoNO coincide')&&invalidText.includes('Curso originalCoincide')&&invalidAnalyticsBlocked,
      'Standalone Studio failed to flag a deliberately tampered offline result or block Analytics: '+invalidText);
    await evalTop(cdp,"document.querySelector('[data-offline-review-dialog]').close()");
    offlineWeb={formats:options.formats,zip:{name:basename(zipFile),bytes:zip.byteLength},windowsSingle:{name:basename(cmdFile),bytes:Buffer.byteLength(cmdText)},
      reviewAvailable:webReview.fileInput,matchingResultAccepted:true,tamperedResultRejected:true,screenshot:offlineWebScreenshot,reviewScreenshot};
  }finally{await rm(offlineExportsDir,{recursive:true,force:true}).catch(()=>{});}
  invariant(cdp.exceptions.length===before,'Standalone Studio offline export caused browser exceptions: '+JSON.stringify(cdp.exceptions.slice(before)));
  return {suite:'studio-website-ui',...result,editorScreenshot,previewScreenshot,unitLayout,unitPreviewScreenshot,mobile,mobileScreenshot,offlineWeb};
}

async function prepareVisualStudioFixture(){
  const dir=join(siteRoot,'ui-gates');
  await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'studio-component.html'),'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P2LRN Studio CDN UI E2E</title><style>body{font:15px system-ui,sans-serif;margin:0;padding:16px;background:#f3f5f7}h1{font-size:20px}p2lrn-studio{display:block}</style><script src="/studio/current/dist/p2lrn-studio.js"></script></head><body><h1>Prueba de interfaz Studio desde CDN local</h1><p2lrn-studio id="studio"></p2lrn-studio></body></html>');
}


async function prepareConnectedArchitectureFixtures(){
  const dir=join(siteRoot,'tests');
  await mkdir(dir,{recursive:true});
  const doc=createP2LRNStudioDocument({title:'Curso de capacidades',language:'es'});
  const activity=doc.addNativeComponent(doc.rootId,{componentId:'https://p2lrn.org/component/capability-action',title:'Tutor conectado',language:'es'});
  const target=await doc.readStructuredJson(activity.id);
  target.payload.data.heading='Tutor opcional';
  target.payload.data.body='Esta actividad solicita una pista sin conocer el proveedor que hay detrás.';
  target.payload.data.instruction='Da una pista breve sobre el objetivo actual sin revelar la solución.';
  target.payload.data.buttonLabel='Pedir pista';
  doc.setStructuredJson(activity.id,target.payload);
  doc.setHostCapabilities(activity.id,[{id:'ai.tutor',required:false,operations:['hint'],context:['component.input'],description:'Tutor semántico de ejemplo.'}]);
  const exported=await exportP2LRNPackage(doc);
  await writeFile(join(dir,'capability-action.p2lrn'),exported.bytes);

  const collaborative=createP2LRNStudioDocument({title:'Curso colaborativo',language:'es'});
  const poll=collaborative.addCollaborationActivity(collaborative.rootId,{mode:'poll',title:'Votación E2E',language:'es'});
  const pollTarget=await collaborative.readStructuredJson(poll.id);
  pollTarget.payload.data.prompt='Elige para validar la sincronización';
  pollTarget.payload.data.options=[{id:'a',label:'Opción A'},{id:'b',label:'Opción B'}];
  collaborative.setStructuredJson(poll.id,pollTarget.payload);
  const collaborativeExport=await exportP2LRNPackage(collaborative);
  await writeFile(join(dir,'collaboration-poll.p2lrn'),collaborativeExport.bytes);

  const sharedSvg='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 64 32"><rect width="64" height="32" fill="white"/><text x="4" y="20">P2LRN</text></svg>';
  const sharedDigest='sha256:'+createHash('sha256').update(sharedSvg).digest('hex');
  const shared=createP2LRNStudioDocument({title:'Curso con recurso compartido',language:'es'});
  const sharedActivity=shared.addRemoteResource(shared.rootId,{title:'Diagrama P2LRN compartido',url:'https://publisher.invalid/shared/p2lrn.svg',mediaType:'image/svg+xml',expectedDigest:sharedDigest});
  const sharedExport=await exportP2LRNPackage(shared);
  await writeFile(join(dir,'shared-resource.p2lrn'),sharedExport.bytes);

  const offlineDocument=createP2LRNStudioDocument({title:'Contenido web offline de prueba',language:'es'});
  const {WEB_CONTENT_PROFILE,WEB_CONTENT_MAPPING_EXTENSION}=await import('../packages/toolkit/web/web-content-core.js');
  // Use a genuine web-content representation, not a plain Studio lesson.
  // Only a web-content bundle is eligible for the authenticated virtual-asset
  // Service Worker route. Its index file is removed from the host after caching.
  const offlineActivity=offlineDocument.addEmbeddedResource(offlineDocument.rootId,{
    title:'Lección web offline',language:'es',filename:'index.html',
    mediaType:'text/html',profile:WEB_CONTENT_PROFILE,
    bytes:new TextEncoder().encode('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Offline</title></head><body><h1>Contenido P2LRN offline verificado</h1></body></html>')
  });
  const rep=offlineDocument.representationForActivity(offlineActivity.id)?.representation;
  if(!rep?.location?.path)throw Error('Offline fixture has no embedded web-content entrypoint.');
  rep.extensions={[WEB_CONTENT_MAPPING_EXTENSION]:{
    version:'1',entrypoint:'index.html',assets:{'index.html':rep.location.path}
  }};
  const offlineExport=await exportP2LRNPackage(offlineDocument);
  await writeFile(join(dir,'offline-web.p2lrn'),offlineExport.bytes);
  return Object.freeze({activityId:activity.id,collaborationActivityId:poll.id,sharedActivityId:sharedActivity.id,sharedSvg,sharedDigest,offlineNodeId:offlineActivity.id,offlineSource:join(dir,'offline-web.p2lrn')});
}

async function verifyConnectedArchitecture(cdp,fixture){
  await cdp.send('Page.navigate',{url:APP_ORIGIN+'/demo/'});
  for(let i=0;i<120;i++){
    if(await evalTop(cdp,"Boolean(globalThis.P2LRN?.createCapabilityBroker && customElements.get('p2lrn-player'))"))break;
    await sleep(50);
  }
  invariant(await evalTop(cdp,"Boolean(globalThis.P2LRN?.createCapabilityBroker && customElements.get('p2lrn-player'))"),'Connected architecture public API did not load.');

  const capability=await evalTop(cdp,`(async()=>{
    const host=document.createElement('div');host.id='connected-capability-gate';document.body.append(host);
    const provider=P2LRN.createToolCapabilityProvider({
      id:'ai.tutor',
      tools:{hint:'mcp.tutor.hint'},
      callTool:async(tool,input)=>({text:'Pista MCP: '+input.instruction,tool}),
    });
    const broker=P2LRN.createCapabilityBroker({providers:[provider],authorize:({capabilityId,operation})=>capabilityId==='ai.tutor'&&operation==='hint'});
    const player=document.createElement('p2lrn-player');
    player.capabilityBroker=broker;
    player.setAttribute('node',${JSON.stringify(fixture.activityId)});
    player.setAttribute('src','/tests/capability-action.p2lrn');
    host.append(player);
    const wait=async(test,label)=>{for(let i=0;i<240;i++){const value=test();if(value)return value;await new Promise(r=>setTimeout(r,50));}throw new Error(label+' timeout');};
    await wait(()=>player.shadowRoot?.querySelector('.p2lrn-component-capability'),'capability render');
    const button=player.shadowRoot.querySelector('.p2lrn-capability-action');
    if(!button||button.disabled)throw new Error('Connected capability button unavailable.');
    button.click();
    await wait(()=>player.shadowRoot?.querySelector('.p2lrn-capability-output pre')?.textContent?.includes('Pista MCP:'),'capability result');
    return {
      text:player.shadowRoot.querySelector('.p2lrn-capability-output pre').textContent,
      brokerExposed:Boolean(player.shadowRoot.querySelector('[data-broker]')),
      capabilityStatus:player.shadowRoot.querySelector('.p2lrn-component-capability').textContent,
    };
  })()`);
  invariant(capability.text.includes('Pista MCP:'),'Connected capability did not reach the host tool provider.');
  invariant(capability.brokerExposed===false,'Connected component exposed the host broker to package-authored DOM.');

  const collaboration=await evalTop(cdp,`(async()=>{
    if(typeof P2LRN.createHttpCollaborationProvider!=='function')throw new Error('Production collaboration HTTP provider missing.');
    if(typeof P2LRN.createMemoryCollaborationHub!=='function')throw new Error('Collaboration reference host helper missing.');
    const host=document.createElement('div');host.id='collaboration-e2e';host.style.display='grid';host.style.gridTemplateColumns='1fr 1fr';host.style.gap='16px';document.body.append(host);
    const make=(id,participant)=>{
      const player=document.createElement('p2lrn-player');player.id=id;
      const provider=P2LRN.createHttpCollaborationProvider({
        endpoint:${JSON.stringify(COLLABORATION_ORIGIN+'/collaboration')},
        getHeaders:()=>({Authorization:'Bearer '+participant}),
      });
      player.capabilityBroker=P2LRN.createCapabilityBroker({providers:[provider],authorize:({capabilityId})=>capabilityId==='collaboration.room'});
      player.setAttribute('node',${JSON.stringify(fixture.collaborationActivityId)});
      player.setAttribute('src','/tests/collaboration-poll.p2lrn');
      host.append(player);return player;
    };
    const a=make('collab-a','learner-a'),b=make('collab-b','learner-b');
    const wait=async(test,label)=>{for(let i=0;i<360;i++){const value=test();if(value)return value;await new Promise(r=>setTimeout(r,50));}throw new Error(label+' timeout');};
    await wait(()=>a.shadowRoot?.querySelector('.p2lrn-collaboration-poll')&&b.shadowRoot?.querySelector('.p2lrn-collaboration-poll'),'collaboration render');
    const radio=a.shadowRoot.querySelector('input[value="a"]');radio.click();
    a.shadowRoot.querySelector('.p2lrn-collaboration-button').click();
    await wait(()=>b.shadowRoot?.querySelector('.p2lrn-collaboration-results')?.textContent?.includes('Opción A · 1'),'collaboration HTTP synchronization');
    const status=b.shadowRoot.querySelector('.p2lrn-collaboration-status')?.textContent||'';
    const result=b.shadowRoot.querySelector('.p2lrn-collaboration-results')?.textContent||'';
    const accessible=Boolean(b.shadowRoot.querySelector('fieldset legend')&&b.shadowRoot.querySelector('[role="status"][aria-live="polite"]'));
    return {status,result,accessible,transport:'http'};
  })()`);
  invariant(collaboration.result.includes('Opción A · 1'),'Collaboration vote did not synchronize between two Players through the production HTTP provider.');
  invariant(collaboration.transport==='http','Collaboration E2E did not use the production HTTP provider.');
  invariant(collaboration.accessible===true,'Collaboration renderer lost semantic accessibility controls.');
  const collaborationScreenshot=await captureElementVisualEvidence(cdp,'collaboration-two-player',"document.getElementById('collaboration-e2e')",{maxHeight:1400});
  await evalTop(cdp,"document.getElementById('collaboration-e2e')?.remove()");

  const sharedResource=await evalTop(cdp,`(async()=>{
    if(typeof P2LRN.createMemorySharedResourceStore!=='function')throw new Error('Shared resource reference store missing.');
    const store=P2LRN.createMemorySharedResourceStore();
    const first=await store.put(new TextEncoder().encode(${JSON.stringify(fixture.sharedSvg)}),{mediaType:'image/svg+xml'});
    const second=await store.put(new TextEncoder().encode(${JSON.stringify(fixture.sharedSvg)}),{mediaType:'image/svg+xml'});
    if(first.digest!==${JSON.stringify(fixture.sharedDigest)}||second.digest!==first.digest||store.list().length!==1)throw new Error('Digest store did not deduplicate fixture bytes.');
    const adapter=P2LRN.createHostAdapter({resolveResourceUrl:(request)=>store.resolve(request)});
    const player=document.createElement('p2lrn-player');player.adapter=adapter;player.setAttribute('node',${JSON.stringify(fixture.sharedActivityId)});player.setAttribute('src','/tests/shared-resource.p2lrn');document.body.append(player);
    const wait=async(test,label)=>{for(let i=0;i<240;i++){const value=test();if(value)return value;await new Promise(r=>setTimeout(r,50));}throw new Error(label+' timeout');};
    const image=await wait(()=>player.shadowRoot?.querySelector('img.p2lrn-media'),'shared resource render');
    globalThis.__p2lrnSharedResourceStore=store;player.id='shared-resource-e2e';
    return {src:image.src,alt:image.alt,count:store.list().length,digest:first.digest};
  })()`);
  invariant(sharedResource.src.startsWith('blob:'),'Shared resource did not resolve through verified host object URL.');
  invariant(sharedResource.count===1,'Shared resource store retained duplicate physical objects.');
  invariant(sharedResource.alt==='Diagrama P2LRN compartido','Shared image did not inherit portable resource title as alt text.');
  const sharedResourceScreenshot=await captureElementVisualEvidence(cdp,'shared-resource-digest',"document.getElementById('shared-resource-e2e')",{maxHeight:1200});
  await evalTop(cdp,"document.getElementById('shared-resource-e2e')?.remove();globalThis.__p2lrnSharedResourceStore?.clear();delete globalThis.__p2lrnSharedResourceStore");

  const cached=await evalTop(cdp,`(async()=>{
    await P2LRN.installServiceWorker();
    const store=P2LRN.createCacheStoragePackageCache();
    await store.clear();
    const saved=await P2LRN.cachePackageURL('/tests/offline-web.p2lrn',{store});
    globalThis.__p2lrnConnectedCache=store;
    return {...saved,count:(await store.list()).length};
  })()`);
  invariant(cached.count===1,'Verified package cache did not persist exactly one test package.');
  await rm(fixture.offlineSource,{force:true});

  const offline=await evalTop(cdp,`(async()=>{
    const player=document.createElement('p2lrn-player');
    player.id='offline-package-gate';
    player.packageCache=globalThis.__p2lrnConnectedCache;
    player.setAttribute('node',${JSON.stringify(fixture.offlineNodeId)});
    player.setAttribute('src','/tests/offline-web.p2lrn');
    document.body.append(player);
    const wait=async(test,label)=>{for(let i=0;i<320;i++){const value=test();if(value)return value;await new Promise(r=>setTimeout(r,50));}throw new Error(label+' timeout');};
    const frame=await wait(()=>player.shadowRoot?.querySelector('iframe'),'offline web package render');
    await new Promise(r=>setTimeout(r,250));
    return {
      frameSrc:frame.src,
      status:player.shadowRoot.textContent.slice(0,600),
      cacheCount:(await globalThis.__p2lrnConnectedCache.list()).length,
    };
  })()`);
  invariant(offline.cacheCount===1,'Offline package cache entry disappeared during playback.');
  invariant(offline.frameSrc.includes('/__p2lrn__/v1/'),'Offline web package did not resolve through the verified static-resource bridge: '+JSON.stringify(offline));
  return Object.freeze({capability,collaboration,collaborationScreenshot,sharedResource,sharedResourceScreenshot,cached,offline});
}

// Browser accessibility gate; this exercises the actual Studio authoring module.
async function browserStudioDropKeyboardScenario(){
  const {createStudioDropActivity,addStudioDropPair,mountStudioDropAuthoring}=
    await import('/studio/runtime/studio-drop-activity.js');
  const host=document.createElement('div');
  host.id='p2lrn-a11y-drop-regression';host.contentEditable='true';
  Object.assign(host.style,{width:'650px',maxWidth:'100%',minHeight:'400px',padding:'12px',background:'#fff'});
  document.querySelector('main')?.append(host);
  if(!host.isConnected)document.body.append(host);
  const sectionTitle=document.createElement('h2');sectionTitle.textContent='Keyboard editing regression';host.append(sectionTitle);
  let changes=0,selected=null,controls=null;
  try{
    const activity=createStudioDropActivity(document);
    host.append(activity);
    const pair1=addStudioDropPair(activity),pair2=addStudioDropPair(activity);
    controls=mountStudioDropAuthoring({surface:host,onSelected:zone=>{selected=zone;},
      onChange:()=>{changes++;}});
    const zone=pair1.zone,card=pair1.item;
    if(zone.tabIndex!==0||card.tabIndex!==0)throw Error('Drop targets not keyboard focusable');
    if(!zone.getAttribute('aria-description')||!card.getAttribute('aria-description'))
      throw Error('Keyboard instructions are missing');
    const press=(node,key,options={})=>node.dispatchEvent(new KeyboardEvent('keydown',
      {key,bubbles:true,cancelable:true,...options}));
    zone.focus();
    // In a contenteditable ancestor tabindex=0 is insufficient by itself:
    // Chrome may keep physical keyboard focus on the parent editor.
    if(document.activeElement!==zone||zone.isContentEditable)
      throw Error('Studio zone does not receive physical keyboard focus');
    const initialLeft=parseFloat(zone.style.left),initialWidth=parseFloat(zone.style.width);
    press(zone,'ArrowRight');
    const movedLeft=parseFloat(zone.style.left);
    press(zone,'ArrowRight',{shiftKey:true});
    const resizedWidth=parseFloat(zone.style.width);
    press(zone,'ArrowDown',{altKey:true});
    const coarseTop=parseFloat(zone.style.top);
    if(movedLeft!==initialLeft+1||resizedWidth!==initialWidth+1||
       !Number.isFinite(coarseTop))throw Error('Keyboard zone edits not persisted');
    const cards=[...activity.querySelectorAll('[data-p2lrn-dnd-item]')];
    const earlier=cards.indexOf(card),later=cards.indexOf(pair2.item);
    if(earlier<0||later<0||earlier===later)throw Error('Two test cards required');
    card.focus();
    if(document.activeElement!==card||card.isContentEditable)
      throw Error('Studio tile does not receive physical keyboard focus');
    press(card,'ArrowRight',{altKey:true});
    const ordered=[...activity.querySelectorAll('[data-p2lrn-dnd-item]')];
    if(ordered.indexOf(card)!==earlier+1)throw Error('Alt+ArrowRight failed to reorder');
    card.focus();press(card,'Enter');
    if(document.activeElement!==zone||selected!==zone)
      throw Error('Enter on card did not focus its matching zone');
    const focus=getComputedStyle(zone);
    if(focus.outlineStyle==='none'||parseFloat(focus.outlineWidth)<3)
      throw Error('Keyboard drop target has no visible focus outline');
    const added=addStudioDropPair(activity);
    await new Promise(resolve=>setTimeout(resolve,0));
    if(added.zone.tabIndex!==0||added.item.tabIndex!==0||
       added.zone.isContentEditable||added.item.isContentEditable)
      throw Error('Dynamically added pair not keyboard accessible');
    if(changes<4)throw Error('Keyboard edits did not notify the editor');
    return {ok:true,initialLeft,movedLeft,initialWidth,resizedWidth,coarseTop,
      reordersCards:true,enterFocusesZone:true,focusWidth:focus.outlineWidth,
      dynamicPairsAccessible:true,changes};
  }finally{controls?.dispose();host.remove();}
}
async function browserStudioHeadingScenario(){
  const heading=document.querySelector('h1.studio-title');
  // Open the ACTUAL ancestor of this title. Other lesson inspectors can also
  // have disclosures, so a global query may open the wrong one.
  const disclosure=heading?.closest('details');
  if(disclosure&&!disclosure.open)disclosure.open=true;
  // A closed details element is not rendered. Let Chrome reflow the now
  // visible editor before asserting focus and its computed outline.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const field=heading?.querySelector('.studio-title-field');
  if(!heading||!field)return {ok:false};
  field.focus();
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const styles=getComputedStyle(field);
  return {ok:true,heading:heading.tagName,headingRole:heading.getAttribute('role'),
    titleText:heading.textContent,editorRole:field.getAttribute('role'),
    editable:field.isContentEditable,label:field.getAttribute('aria-label'),
    openDisclosure:disclosure?.open??null,actualFocus:document.activeElement===field,
    focusWidth:styles.outlineWidth,focusStyle:styles.outlineStyle,
    focusColor:styles.outlineColor,rectWidth:field.getBoundingClientRect().width,
    matchedFocus:field.matches(':focus'),documentHasFocus:document.hasFocus(),
    cssSheets:[...document.styleSheets].length,
    loadedStylesheets:[...document.styleSheets].filter(x=>x.href).map(x=>x.href),
    invalidHeadingRoles:document.querySelectorAll('h1[role=textbox]').length};
}
async function browserHomepageTextSpacingScenario(){
  const style=document.createElement('style');
  style.dataset.p2lrnReflowTest='1';
  style.textContent='*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';
  document.head.append(style);
  try{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const width=window.innerWidth,scrollWidth=document.documentElement.scrollWidth;
    const headings=[...document.querySelectorAll('section.section h2')];
    return {width,scrollWidth,overflow:Math.max(0,scrollWidth-width),
      h2:headings.length,wraps:headings.map(h=>getComputedStyle(h).overflowWrap)};
  }finally{style.remove();}
}
async function verifyHomepageTextSpacingReflow(cdp){
  const results=[];
  await cdp.send('Emulation.setDeviceMetricsOverride',
    {width:320,height:768,deviceScaleFactor:1,mobile:false});
  try{
    for(const locale of ['es','en']){
      await cdp.send('Page.navigate',{url:APP_ORIGIN+(locale==='en'?'/en/':'/')});
      await cdp.send('Page.bringToFront');
      await waitForEval(cdp,
        "document.readyState==='complete' && document.querySelectorAll('section.section h2').length>0",
        'homepage text spacing reflow '+locale,25000);
      const result=await evalTop(cdp,'('+browserHomepageTextSpacingScenario.toString()+')()');
      invariant(result?.width===320&&result.overflow===0&&result.h2>0,
        'Homepage fails WCAG 1.4.12 text spacing at 320 CSS pixels '+locale+': '+
          JSON.stringify(result));
      results.push({locale,...result});
    }
    return results;
  }finally{await cdp.send('Emulation.clearDeviceMetricsOverride');}
}

async function verifyStudioAccessibility(cdp){
  const results=[];
  for(const locale of ['es','en']){
    await cdp.send('Page.navigate',{url:APP_ORIGIN+(locale==='en'?'/en/studio/':'/studio/')});
    // In headless CDP, a background page can hold document.activeElement while
    // not applying :focus. Activate the actual page before keyboard CSS checks.
    await cdp.send('Page.bringToFront');
    await waitForEval(cdp,
      "document.documentElement.dataset.p2lrnStudioReady==='true' && Boolean(document.querySelector('.studio-title-field'))",
      'Studio accessible heading '+locale,30000);
    // Wait for the stylesheet, not merely for the editor's JavaScript ready flag.
    await waitForEval(cdp,"Boolean([...document.styleSheets].find(x=>x.href?.includes('/studio/studio.css'))?.cssRules?.length)",
      'Studio stylesheet load '+locale,20000);
    await sleep(450);
    const heading=await evalTop(cdp,'('+browserStudioHeadingScenario.toString()+')()');
    invariant(heading?.ok&&heading.heading==='H1'&&heading.headingRole===null&&
      heading.editorRole==='textbox'&&heading.editable&&heading.label&&
      heading.actualFocus&&heading.invalidHeadingRoles===0&&heading.focusStyle==='solid'&&
      parseFloat(heading.focusWidth)>=3,
      'Studio title/heading/focus regression '+locale+': '+JSON.stringify(heading));
    const drag=await evalTop(cdp,'('+browserStudioDropKeyboardScenario.toString()+')()');
    invariant(drag?.ok,'Studio keyboard drop interaction '+locale+': '+JSON.stringify(drag));
    const language=await evalTop(cdp,"[...document.querySelectorAll('.language-switch a')].map(a=>({visible:a.textContent.trim(),name:a.getAttribute('aria-label')||''}))");
    invariant(language.length===2&&language.every(x=>x.name.startsWith(x.visible)),
      'Language switch accessible names omit ES/EN '+locale);
    results.push({locale,heading,drag,language});
  }
  const reflow=await verifyHomepageTextSpacingReflow(cdp);
  return {ok:true,results,reflow};
}

let appServer=null,runtimeServer=null,collaborationServer=null,chrome=null,cdp=null;
try{
  // Match build-site.mjs: the static Studio page imports the toolkit's canonical browser modules.
  // The CDN-only fixture does not materialize these until we copy them here.
  await cp(join(root,'packages','toolkit','web','studio'),join(siteRoot,'studio','runtime'),{recursive:true,force:true});
  for(const file of STUDIO_RUNTIME_SHARED_FILES){
    const destination=join(siteRoot,'studio',file);
    await mkdir(dirname(destination),{recursive:true});
    await cp(join(root,'packages','toolkit','web',file),destination);
  }
  await prepareVisualStudioFixture();
  await prepareGameFixtures();
  const connectedFixture=await prepareConnectedArchitectureFixtures();
  // Avoid collisions with previews and runners that already own 8765-8767.
  // Ephemeral app/runtime ports remain different origins for sandbox isolation.
  appServer=await listen(0);
  APP_ORIGIN='http://127.0.0.1:'+appServer.address().port;
  runtimeServer=await listen(0);
  RUNTIME_ORIGIN='http://127.0.0.1:'+runtimeServer.address().port;
  collaborationServer=await listenCollaboration(0);
  COLLABORATION_ORIGIN='http://127.0.0.1:'+collaborationServer.address().port;
  invariant(new Set([APP_ORIGIN,RUNTIME_ORIGIN,COLLABORATION_ORIGIN]).size===3,
    'QA runtime, app and collaboration must have isolated origins');
  console.log('P2LRN_QA_DYNAMIC_ORIGINS='+JSON.stringify({
    app:APP_ORIGIN,runtime:RUNTIME_ORIGIN,collaboration:COLLABORATION_ORIGIN
  }));
  const builtViewer=await readFile(viewerPath,'utf8');
  const localViewer=builtViewer.replace(/const RUNTIME_ORIGINS=Object\.freeze\(\[[\s\S]*?\]\);/u,
    `const RUNTIME_ORIGINS=Object.freeze(['${RUNTIME_ORIGIN}','${APP_ORIGIN}']);`);
  invariant(localViewer!==builtViewer,'Could not patch built viewer runtime origins for local-only verification.');
  await writeFile(viewerPath,localViewer,'utf8');


  const quest3dMode=process.env.P2LRN_QUEST3D_ONLY==='1';
  const stageLog=(name,status,extra={})=>{
    console.log('P2LRN_QUEST3D_STAGE='+JSON.stringify({case:name,status,...extra}));
  };
  if(quest3dMode)stageLog('chrome-launch','START');
  const chromePath=await findChrome();
  chrome=await launchChrome(chromePath);
  if(quest3dMode)stageLog('chrome-launch','PASS',{browser:chromePath});
  if(quest3dMode)stageLog('cdp-connect','START');
  try{
    cdp=await connectPage(chrome.browserWs);
    if(quest3dMode)stageLog('cdp-connect','PASS');
  }catch(error){
    if(quest3dMode)stageLog('cdp-connect','FAIL',{
      message:String(error?.message||error).slice(0,1500),
      browserStderr:chrome?.getStderr?.().slice(-1500)
    });
    throw error;
  }

  if(process.env.P2LRN_ACCESSIBILITY_ONLY==='1'){
    const accessibility=await verifyStudioAccessibility(cdp);
    await mkdir(visualEvidenceRoot,{recursive:true});
    await writeFile(join(visualEvidenceRoot,'accessibility-report.json'),
      JSON.stringify({ok:true,accessibility},null,2)+'\n');
    console.log('P2LRN_ACCESSIBILITY_BROWSER_REPORT='+JSON.stringify(accessibility));
  }else if(quest3dMode){
    // A separate case label and deadline make the original 32-minute silent
    // Chrome hang reproducible without re-running previously passed cases.
    const steps=[
      ['three-game','threeGame',verifyThreeGameInteractionAndResume],
      ['assembly-start','assemblyStart',verifyAssemblyScatteredViewport],
      ['pointer-drag-rope','pointerDrag',verifyThreePointerDragAndRope],
      ['scored-drops','scoredDrops',verifyRealQuest3DDrops],
      ['retained-drops','retainedDrops',verifyRetained3DDrops],
      ['assembly-live','assemblyLive',verifyAssemblyLiveInput],
      ['single-carry','singleCarry',verifyExclusiveCarryInBrowser],
      ['mobile-desktop','threeMobile',verifyThreeMobileAndDesktopEntry],
      ['accessibility','accessibility',verifyStudioAccessibility]
    ];
    const selected=String(process.env.P2LRN_QUEST3D_CASE||'all').trim();
    invariant(selected==='all'||selected==='remaining'||steps.some(([name])=>name===selected),
      'Unknown P2LRN_QUEST3D_CASE: '+selected);
    const report={ok:false,mode:'quest3d-mobile-and-desktop',selected,cases:[]};
    const evidenceFile=join(visualEvidenceRoot,'quest3d-report.json');
    await mkdir(visualEvidenceRoot,{recursive:true});
    const persist=()=>writeFile(evidenceFile,JSON.stringify(report,null,2)+'\n');
    await persist();
    for(const [name,key,run] of steps){
      if(selected==='remaining'&&name==='three-game')continue;
      if(selected!=='all'&&selected!=='remaining'&&selected!==name)continue;
      const started=Date.now();
      const maxMs=100000;
      stageLog(name,'START',{deadlineMs:maxMs});
      let timer;
      try{
        const result=await Promise.race([
          run(cdp),
          new Promise((_,reject)=>{
            timer=setTimeout(()=>reject(new Error(
              '3D QA case '+name+' exceeded its '+maxMs+'ms deadline')),maxMs);
          })
        ]);
        report[key]=result;
        report.cases.push({name,status:'PASS',elapsedMs:Date.now()-started});
        await persist();
        stageLog(name,'PASS',{elapsedMs:Date.now()-started});
      }catch(error){
        const message=String(error?.stack||error);
        report.failure={case:name,message,elapsedMs:Date.now()-started};
        report.cases.push({name,status:'FAIL',elapsedMs:Date.now()-started});
        await persist();
        stageLog(name,'FAIL',{elapsedMs:Date.now()-started,message:message.slice(0,1500)});
        throw new Error('3D focused regression failed at '+name+': '+message);
      }finally{
        if(timer)clearTimeout(timer);
      }
    }
    report.ok=true;
    await persist();
    console.log('P2LRN_QUEST3D_BROWSER_REPORT='+JSON.stringify(report));
  }else{
  const cases=[];
  const failures=[];
  try{cases.push({name:'public-default-startup',state:await verifyDefaultViewerStartup(cdp)});}
  catch(error){failures.push({name:'public-default-startup',message:String(error?.message||error)});}
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
  const nativeGames=[];
  for(const kind of ['crossword','rosco']){
    try{nativeGames.push(await verifyGameLayout(cdp,kind));}
    catch(error){failures.push({name:'game-'+kind+'-ui',message:String(error?.message||error)});}
  }
  let threeGame=null;
  try{threeGame=await verifyThreeGameInteractionAndResume(cdp);}
  catch(error){failures.push({name:'three-games-restore-and-complete',message:String(error?.message||error)});}
  let assemblyStart=null;
  try{assemblyStart=await verifyAssemblyScatteredViewport(cdp);}
  catch(error){failures.push({name:'assembly-student-scattered-all-pieces',message:String(error?.message||error)});}
  let pointerDrag=null;
  try{pointerDrag=await verifyThreePointerDragAndRope(cdp);}
  catch(error){failures.push({name:'three-pointer-drag-and-rope',message:String(error?.message||error)});}
  let assemblyLive=null;
  try{assemblyLive=await verifyAssemblyLiveInput(cdp);}
  catch(error){failures.push({name:'assembly-real-pointer-and-navigation',message:String(error?.message||error)});}
  let singleCarry=null;
  try{singleCarry=await verifyExclusiveCarryInBrowser(cdp);}
  catch(error){failures.push({name:'single-carry-real-physics-and-score',message:String(error?.message||error)});}
  let threeMobile=null;
  try{threeMobile=await verifyThreeMobileAndDesktopEntry(cdp);}
  catch(error){failures.push({name:'three-mobile-joystick-and-desktop-entry',message:String(error?.message||error)});}
  let narrow=null;
  try{narrow=await verifyNarrowLayout(cdp);}catch(error){failures.push({name:'narrow-layout',message:String(error?.message||error)});}
  let accessibility=null;
  try{accessibility=await verifyStudioAccessibility(cdp);}
  catch(error){failures.push({name:'studio-keyboard-accessibility',message:String(error?.message||error)});}
  let studioUI=null;
  try{studioUI=await verifyStudioComponentUI(cdp,chromePath);}catch(error){failures.push({name:'studio-component-cdn',message:String(error?.message||error)});}
  let studioSiteUI=null;
  try{studioSiteUI=await verifyStudioSiteUI(cdp);}catch(error){failures.push({name:'studio-website-ui',message:String(error?.message||error)});}
  let connectedArchitecture=null;
  try{connectedArchitecture=await verifyConnectedArchitecture(cdp,connectedFixture);}catch(error){failures.push({name:'connected-architecture',message:String(error?.message||error)});}
  console.log(JSON.stringify({ok:failures.length===0,chrome:chromePath,cases,nativeGames,threeGame,pointerDrag,threeMobile,accessibility,studioUI,studioSiteUI,connectedArchitecture,failures,narrow:narrow?{innerWidth:narrow.innerWidth,pageOverflow:narrow.pageOverflow,grid:narrow.grid,shell:narrow.shell,console:narrow.console}:null},null,2));
  invariant(failures.length===0,`Local viewer verification failed: ${JSON.stringify(failures)}`);
  }
}finally{
  try{cdp?.socket?.close();}catch{}
  if(chrome?.child?.exitCode===null)chrome.child.kill();
  if(chrome?.profile)await rm(chrome.profile,{recursive:true,force:true}).catch(()=>{});
  // Chrome may retain persistent HTTP connections after a failed WebGL
  // regression. Ensure QA cleanup cannot conceal the original failure by
  // hanging on server.close() until the GitHub job-wide timeout.
  const stopServer=async(server,name)=>{
    if(!server)return;
    try{server.closeAllConnections?.();}catch{}
    await new Promise(resolvePromise=>{
      let settled=false;
      const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);resolvePromise();};
      const timer=setTimeout(()=>{
        console.warn('P2LRN_QA_CLEANUP_WARNING='+name+' did not close within 5s');
        finish();
      },5000);
      try{server.close(finish);}catch(error){
        console.warn('P2LRN_QA_CLEANUP_WARNING='+name+': '+String(error));
        finish();
      }
    });
  };
  await stopServer(appServer,'app');
  await stopServer(runtimeServer,'runtime');
  await stopServer(collaborationServer,'collaboration');
}
