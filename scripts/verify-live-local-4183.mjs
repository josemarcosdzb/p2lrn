import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const origin='http://127.0.0.1:4183';
const repo=resolve(import.meta.dirname,'..');
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const checks=[
  ['player/current/dist/renderers/questionnaire-rosco.js','packages/toolkit/web/renderers/questionnaire-rosco.js','p2lrn-rosco-center'],
  ['player/current/dist/questionnaire-games.css','packages/toolkit/web/questionnaire-games.css','p2lrn-rosco-layout'],
  ['player/current/dist/p2lrn-player.js','packages/toolkit/web/p2lrn-player.js','Formato Core'],
];
for(const [route,source,needle] of checks){
  const result=await fetch(origin+'/'+route,{cache:'no-store'});
  assert.equal(result.status,200,'Local server cannot serve '+route);
  const bytes=Buffer.from(await result.arrayBuffer());
  const reference=await readFile(join(repo,source));
  assert(bytes.toString('utf8').includes(needle),'Local server is serving old '+route);
  console.log('RUNNING_LOCAL_ASSET='+JSON.stringify({
    route,bytes:bytes.length,sha256:sha(bytes),
    matchesCurrentSource:sha(bytes)===sha(reference),
    cacheControl:result.headers.get('cache-control'),
  }));
}
const example=origin+'/examples/generated/questionnaire-rosco.p2lrn';
const resp=await fetch(example,{method:'HEAD',cache:'no-store'});
assert.equal(resp.status,200,'The rosco example in the screenshot is unavailable');

const browser=process.env.CHROME_BIN||process.env.CHROME_PATH;
if(!browser)throw Error('CHROME_BIN must be set to a local Chromium executable');
assert((await stat(browser)).isFile(),'Browser executable missing: '+browser);
const profile=await mkdtemp(join(tmpdir(),'p2lrn-live-4183-check-'));
const child=spawn(browser,[
  '--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check',
  '--disable-extensions','--disable-cache','--user-data-dir='+profile,
  '--remote-debugging-port=0','about:blank',
],{stdio:['ignore','ignore','pipe'],windowsHide:true});
let stderr='',socket=null;
child.stderr?.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-12000);});
try {
  const portFile=join(profile,'DevToolsActivePort');
  let endpoint=null;
  for(let i=0;i<160;i++){
    try{
      const [port,route]=(await readFile(portFile,'utf8')).trim().split(/\r?\n/u);
      if(/^\d+$/u.test(port??'')&&route?.startsWith('/devtools/browser/')){
        endpoint='http://127.0.0.1:'+port;
        break;
      }
    }catch{}
    if(child.exitCode!==null)throw Error('Chrome quit before startup: '+stderr.slice(-1300));
    await sleep(150);
  }
  assert(endpoint,'Chrome did not expose DevToolsActivePort: '+stderr.slice(-1300));
  let pages=null;
  for(let i=0;i<80;i++){
    try{
      pages=(await (await fetch(endpoint+'/json/list')).json()).filter(p=>p.type==='page');
      if(pages.length)break;
    }catch{}
    await sleep(100);
  }
  assert(pages?.length,'No Chromium page target');
  socket=new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('WebSocket CDP timeout')),6000);
    socket.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('CDP socket refused'));},{once:true});
  });
  let seq=0;
  const pending=new Map();
  socket.addEventListener('message',evt=>{
    const reply=JSON.parse(evt.data);
    const item=pending.get(reply.id);
    if(!item)return;
    pending.delete(reply.id);
    reply.error?item.reject(Error(JSON.stringify(reply.error))):item.resolve(reply.result);
  });
  const cmd=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async code=>{
    const answer=await cmd('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true});
    if(answer.exceptionDetails)throw Error('Page eval failed: '+JSON.stringify(answer.exceptionDetails).slice(0,700));
    return answer.result?.value;
  };
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  const url=origin+'/demo/?runtime=auto&src='+encodeURIComponent(example);
  await cmd('Page.navigate',{url});
  let state;
  for(let i=0;i<170;i++){
    state=await evaluate('(()=>{const r=document.getElementById("demo-player")?.shadowRoot;const ring=r?.querySelector(".p2lrn-rosco");const rects=[...(r?.querySelectorAll(".p2lrn-rosco-letter")??[])].map(x=>x.getBoundingClientRect());const x=rects.map(a=>a.left),y=rects.map(a=>a.top);return {ready:document.querySelector("[data-runtime-state]")?.textContent,innerPlayerStatus:r?.querySelector(".p2lrn-status")?.textContent,ring:!!ring,center:!!r?.querySelector(".p2lrn-rosco-center"),letterCount:rects.length,spreadX:x.length?Math.max(...x)-Math.min(...x):0,spreadY:y.length?Math.max(...y)-Math.min(...y):0,errors:document.querySelector("[data-event-log]")?.textContent?.slice(-420)};})()');
    if(state?.ring||state?.ready==='ERROR')break;
    await sleep(200);
  }
  console.log('FRESH_CHROME_LOCAL_4183='+JSON.stringify(state));
  assert(state?.ring&&state.center&&state.letterCount>=4&&state.spreadY>70,
    'Fresh browser did not render the circular rosco on the running local server.');
  console.log('LIVE_LOCAL_4183_FRESH_BROWSER_PASS');
}finally{
  try{socket?.close();}catch{}
  try{child.kill();}catch{}
  await rm(profile,{recursive:true,force:true,maxRetries:2,retryDelay:300}).catch(()=>{});
}
