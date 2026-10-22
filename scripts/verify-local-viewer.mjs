import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {extname, join, resolve, sep} from 'node:path';
import {createP2LRNStudioDocument} from '../packages/toolkit/web/studio/new-document.js';
import {exportP2LRNPackage} from '../packages/toolkit/web/studio/package-export.js';
import {buildQuestionnaireGame} from '../packages/toolkit/web/questionnaire-games-core.js';
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
    const probe=await evalTop(cdp,String.raw`(()=>{const frame=document.getElementById('demo-player')?.shadowRoot?.querySelector('.p2lrn-package-runtime,.p2lrn-scorm-runtime,.p2lrn-h5p-frame');return {sandbox:frame?.getAttribute('sandbox')||'',srcdoc:!!frame?.srcdoc,accessible:(()=>{try{return !!frame?.contentDocument}catch{return false}})()}})()`);
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
      const wrong=root.querySelectorAll('.p2lrn-rosco-letter.is-wrong').length;
      button('Reiniciar')?.click();
      const restarted=root.querySelectorAll('.p2lrn-rosco-letter.is-wrong').length===0
        &&root.querySelector('.p2lrn-rosco-progress')?.textContent.startsWith('0 /');
      return {count:letters.length,spreadX:Math.max(...xs)-Math.min(...xs),
        spreadY:Math.max(...ys)-Math.min(...ys),initial,next,wrong,restarted};
    }
    behavior=await evalTop(cdp,'('+roscoScenario.toString()+')()');
    invariant(behavior.count>=4&&behavior.spreadX>80&&behavior.spreadY>80,kind+': expected circle, not horizontal letters '+JSON.stringify(behavior));
    invariant(behavior.initial!==behavior.next&&behavior.wrong===1&&behavior.restarted,kind+': pass, check or reset failed '+JSON.stringify(behavior));
  }
  const desktop=await captureVisualEvidence(cdp,'game-'+kind+'-desktop');
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
  const mobileScreenshot=await captureVisualEvidence(cdp,'game-'+kind+'-mobile');
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
    const title=q('.studio-title');
    title.textContent='Lección editada con Studio web';
    title.dispatchEvent(new InputEvent('input',{bubbles:true}));
    sheet.innerHTML='<p>Texto incorporado mediante el editor WYSIWYG real.</p>';
    sheet.dispatchEvent(new InputEvent('input',{bubbles:true}));
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
  const previewScreenshot=await captureVisualEvidence(cdp,'studio-website-preview');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(350);
  const mobile=await evalTop(cdp,"({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,playerWidth:document.querySelector('[data-player]')?.getBoundingClientRect().width||0})");
  invariant(mobile.scrollWidth<=mobile.clientWidth+3,'Studio website overflows mobile viewport: '+JSON.stringify(mobile));
  const mobileScreenshot=await captureVisualEvidence(cdp,'studio-website-mobile');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1500,height:950,deviceScaleFactor:1,mobile:false});
  invariant(cdp.exceptions.length===before,'Studio website threw in Chrome: '+JSON.stringify(cdp.exceptions.slice(before)));
  return {suite:'studio-website-ui',...result,editorScreenshot,previewScreenshot,mobile,mobileScreenshot};
}

async function prepareVisualStudioFixture(){
  const dir=join(siteRoot,'ui-gates');
  await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'studio-component.html'),'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>P2LRN Studio CDN UI E2E</title><style>body{font:15px system-ui,sans-serif;margin:0;padding:16px;background:#f3f5f7}h1{font-size:20px}p2lrn-studio{display:block}</style><script src="/studio/current/dist/p2lrn-studio.js"></script></head><body><h1>Prueba de interfaz Studio desde CDN local</h1><p2lrn-studio id="studio"></p2lrn-studio></body></html>');
}

let appServer=null,runtimeServer=null,chrome=null,cdp=null;
try{
  // Match build-site.mjs: the static Studio page imports the toolkit's canonical browser modules.
  // The CDN-only fixture does not materialize these until we copy them here.
  await cp(join(root,'packages','toolkit','web','studio'),join(siteRoot,'studio','runtime'),{recursive:true,force:true});
  for(const file of ['native-composite-core.js','component-registry.js','identifiers.js','renderer-registry.js','fill-blanks-core.js']){
    await cp(join(root,'packages','toolkit','web',file),join(siteRoot,'studio',file));
  }
  await prepareVisualStudioFixture();
  await prepareGameFixtures();
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
  const nativeGames=[];
  for(const kind of ['crossword','rosco']){
    try{nativeGames.push(await verifyGameLayout(cdp,kind));}
    catch(error){failures.push({name:'game-'+kind+'-ui',message:String(error?.message||error)});}
  }
  let narrow=null;
  try{narrow=await verifyNarrowLayout(cdp);}catch(error){failures.push({name:'narrow-layout',message:String(error?.message||error)});}
  let studioUI=null;
  try{studioUI=await verifyStudioComponentUI(cdp);}catch(error){failures.push({name:'studio-component-cdn',message:String(error?.message||error)});}
  let studioSiteUI=null;
  try{studioSiteUI=await verifyStudioSiteUI(cdp);}catch(error){failures.push({name:'studio-website-ui',message:String(error?.message||error)});}
  console.log(JSON.stringify({ok:failures.length===0,chrome:chromePath,cases,nativeGames,studioUI,studioSiteUI,failures,narrow:narrow?{innerWidth:narrow.innerWidth,pageOverflow:narrow.pageOverflow,grid:narrow.grid,shell:narrow.shell,console:narrow.console}:null},null,2));
  invariant(failures.length===0,`Local viewer verification failed: ${JSON.stringify(failures)}`);
}finally{
  try{cdp?.socket?.close();}catch{}
  if(chrome?.child?.exitCode===null)chrome.child.kill();
  if(chrome?.profile)await rm(chrome.profile,{recursive:true,force:true}).catch(()=>{});
  await new Promise((resolvePromise)=>appServer?appServer.close(()=>resolvePromise()):resolvePromise());
  await new Promise((resolvePromise)=>runtimeServer?runtimeServer.close(()=>resolvePromise()):resolvePromise());
}
