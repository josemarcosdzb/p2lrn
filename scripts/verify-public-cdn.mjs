import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import {basename,join} from 'node:path';
import {findChrome} from './verify-browser-from-npm.mjs';
import {openP2LRNPackageBytes} from '../packages/toolkit/web/p2lrn-player.js';

const origin=(process.env.P2LRN_PUBLIC_ORIGIN||'https://p2lrn.netlify.app').replace(/\/+$/,'');
const release='p2lrn-0.5.0-alpha.10-2026-10-19';
const output=join(process.env.USERPROFILE||homedir(),'Downloads','p2lrn-public-validation',String(process.env.GITHUB_RUN_ID||'manual'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output,{recursive:true});
const report={origin,release,startedAt:new Date().toISOString(),downloads:[],pages:[],browser:null,registry:[],warnings:[]};
const save=async()=>writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');

async function get(path,{timeout=18000,headers={}}={}){
  const url=new URL(path,origin);
  const response=await fetch(url,{redirect:'follow',headers:{'Cache-Control':'no-cache',...headers},signal:AbortSignal.timeout(timeout)});
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!response.ok)throw new Error('Public CDN HTTP '+response.status+': '+url.href+' '+bytes.toString('utf8',0,Math.min(200,bytes.length)));
  return {url:url.href,status:response.status,headers:response.headers,bytes};
}
async function waitForDeploy(){
  const deadline=Date.now()+9*60*1000;
  let attempts=0;let last='';
  while(Date.now()<deadline){
    attempts++;
    try {
      const r=await get('/deployment-verification.json',{timeout:14000});
      const marker=JSON.parse(r.bytes.toString('utf8'));
      if(marker.release===release){
        console.log('PUBLIC_DEPLOY_MARKER_VERIFIED',JSON.stringify({url:r.url,release,attempts}));
        return marker;
      }
      last='Old marker: '+String(marker.release??'missing');
    }catch(error){last=String(error?.message||error).slice(0,260);}
    if(attempts%3===1)console.log('PUBLIC_DEPLOY_WAIT',JSON.stringify({attempts,last}));
    await sleep(15000);
  }
  throw new Error('Public Netlify deployment not verified after 9 minutes: '+last);
}

async function validateDownloadedPackage(path){
  const r=await get(path,{timeout:60000});
  assert(r.bytes.length>1000,'Downloaded package empty: '+path);
  assert.equal(r.bytes.subarray(0,2).toString('ascii'),'PK','Downloaded .p2lrn is not ZIP: '+path);
  const ab=r.bytes.buffer.slice(r.bytes.byteOffset,r.bytes.byteOffset+r.bytes.byteLength);
  const pkg=await openP2LRNPackageBytes(ab);
  assert.equal(pkg.manifest.format,'P2LRN');
  assert.match(String(pkg.manifest.integrity?.contentRoot??''),/^sha256:[0-9a-f]{64}$/i);
  const name=basename(new URL(r.url).pathname);
  const target=join(output,name);
  await writeFile(target,r.bytes);
  const data={name,url:r.url,bytes:r.bytes.length,sha256:sha(r.bytes),contentRoot:pkg.manifest.integrity.contentRoot,entrypoints:pkg.manifest.entrypoints?.length??0,path:target};
  report.downloads.push(data);
  console.log('PUBLIC_PACKAGE_DOWNLOADED',JSON.stringify(data));
  return data;
}

async function startBrowser(){
  // On Windows GUI binaries can work normally yet return a nonzero code for
  // --version. The proven local E2E uses existence checks rather than CLI probing.
  const knownBrowsers=[process.env.CHROME_PATH,process.env.CHROME_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  let chrome=null;
  for(const candidate of knownBrowsers){try{if((await stat(candidate)).isFile()){chrome=candidate;break;}}catch{}}
  if(!chrome)chrome=await findChrome();
  console.log('PUBLIC_BROWSER_SELECTED',JSON.stringify({path:chrome}));
  const profile=await mkdtemp(join(tmpdir(),'p2lrn-public-cdn-'));
  const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-cache','--window-size=1440,900','--user-data-dir='+profile,'--remote-debugging-port=0',origin+'/studio/'];
  const child=spawn(chrome,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});
  let stderr='';
  try{
    const browserWs=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Chrome DevTools did not start: '+stderr.slice(-2000))),20000);
      child.stderr.on('data',part=>{
        stderr=(stderr+String(part)).slice(-10000);
        const found=/DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
        if(found){clearTimeout(timeout);resolve(found[1]);}
      });
      child.once('error',error=>{clearTimeout(timeout);reject(error)});
      child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Chrome exited early: '+code+' '+stderr.slice(-2000)));});
    });
    const uri=new URL(browserWs);
    const devtoolsOrigin='http://'+uri.hostname+':'+uri.port;
    let target;
    for(let i=0;i<100&&!target;i++){
      try{
        const targets=await (await fetch(devtoolsOrigin+'/json/list')).json();
        target=targets.find(t=>t.type==='page'&&t.url.startsWith(origin))??targets.find(t=>t.type==='page');
      }catch{}
      if(!target)await sleep(100);
    }
    if(!target?.webSocketDebuggerUrl)throw new Error('No public website Chrome page target');
    const ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('CDP WebSocket not open')),8000);
      ws.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
      ws.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('CDP WebSocket error'));},{once:true});
    });
    let seq=0;
    const pending=new Map();
    const exceptions=[];
    ws.addEventListener('message',evt=>{
      let msg;try{msg=JSON.parse(evt.data)}catch{return}
      if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params?.exceptionDetails?.exception?.description||msg.params?.exceptionDetails?.text||'exception');
      if(!msg.id||!pending.has(msg.id))return;
      const x=pending.get(msg.id);pending.delete(msg.id);
      msg.error?x.reject(new Error(JSON.stringify(msg.error))):x.resolve(msg.result);
    });
    const send=(method,params={},limit=45000)=>new Promise((resolve,reject)=>{
      const id=++seq;
      const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},limit);
      pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v);},reject:e=>{clearTimeout(timeout);reject(e);}});
      try{ws.send(JSON.stringify({id,method,params}));}
      catch(e){clearTimeout(timeout);pending.delete(id);reject(e);}
    });
    const evaluate=async(fn,timeout=60000)=>{
      const expression='('+fn.toString()+')()';
      const deadline=Date.now()+timeout;
      while(Date.now()<deadline){
        try{
          const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},Math.min(45000,Math.max(1000,deadline-Date.now())));
          if(response.exceptionDetails)throw new Error('Public page JS: '+(response.exceptionDetails.exception?.description||response.exceptionDetails.text));
          return response.result?.value;
        }catch(error){
          // Page.navigate and the initial Studio module load replace Chrome's
          // execution context. Retry only this navigation race, not app errors.
          const reason=String(error?.message||error);
          if(!/Execution context was destroyed|Cannot find context with specified id|Inspected target navigated/.test(reason))throw error;
          await sleep(400);
        }
      }
      throw new Error('Public website Chrome evaluation did not stabilize before the deadline');
    };
    const screenshot=async(name)=>{
      const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
      if(!shot?.data)throw new Error('No screenshot for '+name);
      const b=Buffer.from(shot.data,'base64');
      assert(b.length>6000,'Empty public UI screenshot');
      const path=join(output,name+'.png');await writeFile(path,b);
      return {path,bytes:b.length,sha256:sha(b)};
    };
    const browserInfo={chrome,studio:null,viewer:null,downloads:[],screenshots:[],exceptions};
    try{
      await send('Page.enable');await send('Runtime.enable');
      await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:output});
      browserInfo.studio=await evaluate(async function(){
        const wait=async(predicate,name)=>{
          const deadline=Date.now()+26000;
          while(Date.now()<deadline){const x=predicate();if(x)return x;await new Promise(r=>setTimeout(r,150));}
          throw new Error('Studio live timeout: '+name+'; status='+document.querySelector('[data-studio-status]')?.textContent);
        };
        await wait(()=>document.readyState==='complete'&&window.P2LRNReady,'Studio scripts');
        await window.P2LRNReady;
        await new Promise(r=>setTimeout(r,500));
        const create=await wait(()=>document.querySelector('[data-create-course]'),'create course');
        create.click();
        await wait(()=>document.querySelector('[data-workspace]')?.hidden===false,'created workspace');
        const tree=document.querySelector('[data-tree]');
        const before=tree?.querySelectorAll('button').length??0;
        document.querySelector('[data-add-unit]').click();
        await wait(()=>(tree?.querySelectorAll('button').length??0)>before,'new unit');
        const after=tree.querySelectorAll('button').length;
        document.querySelector('[data-add-lesson]').click();
        await wait(()=>tree.querySelectorAll('button').length>after,'new lesson');
        const titles=tree.textContent;
        document.querySelector('[data-export]').click();
        await wait(()=>document.querySelector('[data-studio-status]')?.textContent?.includes('exportado y verificado'),'download from Studio');
        return {status:'PASS',url:location.href,tree:titles.slice(0,1000),editorVisible:!document.querySelector('[data-workspace]').hidden,downloadInitiated:true};
      });
      assert.equal(browserInfo.studio.status,'PASS');
      browserInfo.screenshots.push(await screenshot('live-studio-desktop'));
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      browserInfo.screenshots.push(await screenshot('live-studio-mobile'));
      await send('Emulation.clearDeviceMetricsOverride');
      let exported;
      for(let i=0;i<100;i++){
        const names=(await readdir(output)).filter(name=>name.endsWith('.p2lrn')&&!name.endsWith('.crdownload'));
        const local=names.find(name=>!report.downloads.some(d=>d.name===name));
        if(local){
          const bytes=await readFile(join(output,local));
          if(bytes.length>1000){const pkg=await openP2LRNPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));exported={name:local,bytes:bytes.length,sha256:sha(bytes),contentRoot:pkg.manifest.integrity?.contentRoot};break;}
        }
        await sleep(200);
      }
      if(!exported)throw new Error('Studio did not download an actual .p2lrn to disk');
      browserInfo.downloads.push(exported);
      console.log('PUBLIC_STUDIO_EXPORT',JSON.stringify(exported));
      await send('Page.navigate',{url:origin+'/demo/?runtime=auto'});
      browserInfo.viewer=await evaluate(async function(){
        const wait=async(pred,label)=>{
          const limit=Date.now()+28000;
          while(Date.now()<limit){const x=pred();if(x)return x;await new Promise(r=>setTimeout(r,150));}
          throw new Error('Player live timeout: '+label+' state='+document.querySelector('[data-runtime-state]')?.textContent);
        };
        await wait(()=>document.readyState==='complete'&&window.P2LRNReady,'viewer scripts');
        await window.P2LRNReady;
        await wait(()=>document.querySelector('[data-load]'),'viewer controls');
        const out=[];
        for(const sample of ['scorm12-real.p2lrn','h5p-crossword.p2lrn']){
          const url='/examples/canonical/external/'+sample;
          document.querySelector('[data-clear-log]')?.click();
          document.querySelector('[data-package-url]').value=url;
          document.querySelector('[data-load]').click();
          await wait(()=>document.querySelector('[data-package-label]')?.textContent?.includes(sample),'viewer sample selection');
          await wait(()=>{
            const integrity=document.querySelector('[data-inspect-integrity]')?.textContent??'';
            const state=document.querySelector('[data-runtime-state]')?.textContent??'';
            const events=document.querySelector('[data-event-log]')?.textContent??'';
            return integrity.includes('verificada')&&['READY','RENDERED'].includes(state)
              &&events.includes('p2lrn:activityready')&&!events.includes('p2lrn:error');
          },'verified integrity and real activityready '+sample);
          const state=document.querySelector('[data-runtime-state]')?.textContent??'';
          out.push({sample,state,integrity:document.querySelector('[data-inspect-integrity]')?.textContent,activityReady:true,events:document.querySelector('[data-event-log]')?.textContent?.slice(-1600)});
        }
        return {status:'PASS',url:location.href,packages:out};
      },80000);
      assert.equal(browserInfo.viewer.status,'PASS');
      browserInfo.screenshots.push(await screenshot('live-player-desktop'));
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      browserInfo.screenshots.push(await screenshot('live-player-mobile'));
      await send('Emulation.clearDeviceMetricsOverride');
      return browserInfo;
    }finally{try{ws.close()}catch{}}
  }finally{
    if(child.exitCode===null){child.kill();await sleep(500);}
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
  }
}
try{
  report.deployment=await waitForDeploy();
  for(const [name,path,marker] of [
    ['home','/','P2LRN'],['studio','/studio/','P2LRN'],['player','/demo/','Visor P2LRN'],
    ['integration','/docs/integracion/','Studio'],['cd-player','/player/current/dist/p2lrn.js','P2LRN'],
    ['cd-studio','/studio/current/dist/p2lrn-studio.js','P2LRN']
  ]){
    const r=await get(path,{timeout:35000});
    if(!r.bytes.toString('utf8').includes(marker))throw new Error('Missing '+marker+' on live public '+path);
    const item={name,url:r.url,bytes:r.bytes.length,status:r.status,sha256:sha(r.bytes)};
    report.pages.push(item);console.log('PUBLIC_CDN_RESOURCE',JSON.stringify(item));
  }
  const catalog=JSON.parse((await get('/examples/catalog.json')).bytes.toString('utf8'));
  assert(Array.isArray(catalog.examples)&&catalog.examples.length>=5,'Live CDN has no real example catalog');
  report.catalogSize=catalog.examples.length;
  const examples=['/examples/canonical/creator-course.p2lrn','/examples/canonical/external/scorm12-real.p2lrn','/examples/canonical/external/h5p-crossword.p2lrn','/examples/generated/scorm12-browser-demo.p2lrn'];
  for(const path of examples)await validateDownloadedPackage(path);
  const range=await fetch(origin+examples[0],{headers:{Range:'bytes=0-31'},signal:AbortSignal.timeout(20000)});
  report.range={status:range.status,contentRange:range.headers.get('content-range')};
  if(range.status!==206)report.warnings.push('Public CDN did not respond with HTTP 206 to Range request');
  report.browser=await startBrowser();
  report.status='PASS';
}catch(error){
  report.status='FAIL';report.error=String(error?.stack||error);
  console.error('PUBLIC_DEPLOY_E2E_FAILED',report.error);
  process.exitCode=1;
}finally{
  report.finishedAt=new Date().toISOString();await save();
  console.log('PUBLIC_DEPLOY_E2E_REPORT',JSON.stringify({status:report.status,reportFile:join(output,'report.json'),downloaded:report.downloads.length,browserExports:report.browser?.downloads?.length??0,warningCount:report.warnings.length,error:report.error?.slice(0,500)??null}));
}
