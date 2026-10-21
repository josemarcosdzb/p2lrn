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
  // A green UI is insufficient when Chrome can silently load an old module
  // graph. Check the actual network resource URLs and the import-map revision.
  const resources=await evaluate('(()=>{const script=document.querySelector("script[src^=\"/player/current/dist/p2lrn.js\"]");const revision=script?new URL(script.src).searchParams.get("v"):null;const urls=performance.getEntriesByType("resource").map(entry=>entry.name);const rosco=urls.filter(url=>new URL(url).pathname.endsWith("/renderers/questionnaire-rosco.js"));const esm=urls.filter(url=>new URL(url).pathname.endsWith("/p2lrn.esm.js"));const html=document.querySelector("script[type=importmap]")?.textContent??"";return {revision,rosco,esm,importMapRosco:revision?html.includes("/renderers/questionnaire-rosco.js?v="+revision):false};})()');
  console.log('LOCAL_PLAYER_LOADED_MODULE_URLS='+JSON.stringify(resources));
  assert.match(resources.revision??'',/^[a-f0-9]{16}$/u,'The local Player loader URL is not revisioned');
  assert(resources.rosco.some(url=>new URL(url).searchParams.get('v')===resources.revision),
    'Chrome loaded a rosco module without the active content revision');
  assert(resources.esm.some(url=>new URL(url).searchParams.get('v')===resources.revision),
    'Chrome loaded an old or unversioned Player ESM module');
  assert(resources.importMapRosco,'The local document lacks a matching generated Player import map');
  console.log('LIVE_LOCAL_4183_FRESH_BROWSER_PASS');

  // Re-test the exact preserved landing from localhost itself.
  await cmd('Page.navigate',{url:origin+'/?check=restored-carousel'});
  let home=null;
  for(let i=0;i<110;i++){
    home=await evaluate('(()=>{const root=document.querySelector("[data-hero-carousel-root]");const slides=[...(root?.querySelectorAll("[data-hero-slide]")??[])];return {build:document.documentElement.dataset.build,slides:slides.length,initialCenter:slides.find(x=>x.dataset.slot==="center")?.querySelector("figcaption strong")?.textContent,video:!!slides.find(x=>x.dataset.slot==="center")?.querySelector("video"),webBuild:document.querySelector("[data-site-build]")?.textContent,npmVersion:document.querySelector("[data-player-version]")?.textContent,images:slides.filter(x=>x.querySelector("img")).map(x=>({loaded:x.querySelector("img").complete&&x.querySelector("img").naturalWidth>0,draggable:x.querySelector("img").draggable}))};})()');
    if(home?.initialCenter&&home.webBuild?.startsWith('Web '))break;
    await sleep(160);
  }
  console.log('RESTORED_LOCAL_HOME='+JSON.stringify(home));
  assert.equal(home.build,'inward-carousel-20261020');
  assert.equal(home.slides,6);
  assert.equal(home.initialCenter,'Paquete en movimiento');
  assert.equal(home.video,true);
  assert.equal(home.images.length,5);
  assert(home.images.every(x=>x.loaded&&!x.draggable),'Restored carousel media missing or draggable');
  assert.equal(home.npmVersion,'0.5.0-alpha.10');
  assert(home.webBuild?.startsWith('Web ')&&home.webBuild!=='Web sin revisión','Missing distinct local build ID');
  const move=async(slot,expected)=>{
    const selector='[data-hero-carousel-root] [data-slot="'+slot+'"]';
    const clicked=await evaluate('(()=>{const slide=document.querySelector('+JSON.stringify(selector)+');if(!slide)return false;slide.click();return true;})()');
    assert(clicked,'No clickable carousel panel '+slot);
    let current=null;
    for(let i=0;i<35;i++){
      current=await evaluate('document.querySelector("[data-hero-carousel-root] [data-slot=center] figcaption strong")?.textContent');
      if(current===expected)break;
      await sleep(100);
    }
    assert.equal(current,expected,'Direct card selection failed for '+slot);
    await sleep(750);
  };
  await move('right2','Cuestionarios');
  await move('left3','Studio');
  const interaction=await evaluate('(()=>{const root=document.querySelector("[data-hero-carousel-root]");return {centered:root.querySelector("[data-slot=center] figcaption strong")?.textContent,total:root.querySelectorAll("[data-hero-slide]").length,selectable:getComputedStyle(root).userSelect,shift:root.querySelector("[data-slot=right1]")?.style.pointerEvents};})()');
  console.log('RESTORED_LOCAL_CAROUSEL_INTERACTION='+JSON.stringify(interaction));
  assert.equal(interaction.centered,'Studio');
  assert.equal(interaction.total,6);
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(320);
  const mobile=await evaluate('(()=>{const hero=document.querySelector(".hero-showcase");return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,heroWidth:hero?.getBoundingClientRect().width,centered:document.querySelector("[data-slot=center] figcaption strong")?.textContent};})()');
  console.log('RESTORED_LOCAL_CAROUSEL_MOBILE='+JSON.stringify(mobile));
  assert(mobile.heroWidth<=mobile.viewport+2,'Home carousel exceeds mobile viewport');
  assert(mobile.documentWidth<=mobile.viewport+4,'Homepage has mobile horizontal overflow');
  console.log('LIVE_LOCAL_4183_RESTORED_CAROUSEL_PASS');
}finally{
  try{socket?.close();}catch{}
  try{child.kill();}catch{}
  await rm(profile,{recursive:true,force:true,maxRetries:2,retryDelay:300}).catch(()=>{});
}
