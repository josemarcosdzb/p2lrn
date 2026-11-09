import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findChrome, runChromePageGate} from './verify-browser-from-npm.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const hits = [];
// The real packages stay unchanged. CDP drives their UI as a user would.
const exerciseExpression = `(()=>{
  if (window.API && document.querySelector('#complete:not(:disabled)')) document.querySelector('#complete').click();
  if(document.querySelector('#ok[data-kind=html]') && !window.__p2lrnNext){window.__p2lrnNext=true;setTimeout(()=>document.querySelector('a')?.click(),250);}
  if (window.H5P?.instances?.length && !window.__p2lrnChecked) {
    const button=document.querySelector('.h5p-question-check-answer');
    if(button){window.__p2lrnChecked=true;button.click();}
  }
})()`;

async function browserSuite() {
  const result = document.getElementById('result');
  const records = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const wait = async (condition, label) => {
    const deadline = Date.now() + 18000;
    while (!condition()) { if (Date.now() > deadline) throw new Error('Timed out: ' + label); await new Promise(r => setTimeout(r, 40)); }
  };
  try {
    const web = '/packages/player/dist/';
    const {mountP2LRN} = await import(web + 'p2lrn-player.js');
    const host = document.getElementById('host');
    document.cookie = 'platform-secret=private; SameSite=Strict';
    localStorage.setItem('platform-secret', 'private');
    sessionStorage.setItem('platform-secret', 'private');
    window.platformSecret = 'private';
    const saved = [];
    const scores = [];
    const adapter = {loadState:async()=>null, saveState:async(state,context)=>saved.push({state,context}), reportScore:async(score)=>scores.push(score)};
    const events = [];
    document.addEventListener('p2lrn:activityready',e=>events.push({type:'ready',detail:e.detail}));
    document.addEventListener('p2lrn:xapi',e=>events.push({type:'xapi',detail:e.detail}));
    document.addEventListener('p2lrn:error',e=>events.push({type:'error',detail:e.detail}));
    await mountP2LRN(host, {src:'/examples/canonical/external/scorm12-real.p2lrn', adapter});
    await wait(()=>scores.some(score=>score.raw===100), 'real SCORM score 100');
    const realScorm=host.querySelector('p2lrn-player').shadowRoot.querySelector('iframe');
    assert(realScorm.sandbox.value === 'allow-scripts', 'SCORM grants excess permissions');
    records.push({test:'SCORM 1.2 repository interactive package',score:100,topology:events.find(e=>e.type==='ready')?.detail.topology});
    events.length=0; scores.length=0; saved.length=0;
    await mountP2LRN(host, {src:'/examples/canonical/external/h5p-crossword.p2lrn', adapter});
    await wait(()=>events.some(e=>e.type==='xapi' && e.detail.statement?.verb?.id?.endsWith('/answered')), 'real H5P Check xAPI');
    assert(events.some(e=>e.type==='ready'&&e.detail.topology==='opaque-inline'), 'H5P did not use automatic opaque runtime');
    records.push({test:'H5P Crossword real external-library package',xapi:'answered',catalog:'distribution libraries',stateWrites:saved.length});
    // Missing libraries must fail explicitly, rather than emitting activityready.
    const {hydrateH5PStaticSession} = await import(web+'h5p-auto-runtime.js');
    let missing=false;
    try { await hydrateH5PStaticSession({session:{files:[],transfers:[],totalBytes:0},nested:{names:()=>[]},inspection:{names:[],required:[{machineName:'H5P.Missing',majorVersion:1,minorVersion:0}],content:{}},sharedLibrariesUrl:location.origin+'/missing-libraries/',fetchImpl:async()=>new Response('missing',{status:404})}); }
    catch(error){missing=String(error.code).startsWith('P2LRN_H5P_');}
    assert(missing,'missing H5P library did not fail');
    records.push({test:'missing H5P library',result:'explicit failure'});
    host.replaceChildren();
    const reports = new Map();
    const importedAssets = new Map();
    window.addEventListener('message',e=>{if(e.data?.protocol==='p2lrn-security-test') reports.set(e.data.id,{origin:e.origin,...e.data.result});if(e.data?.protocol==='p2lrn-imscc-asset-test')importedAssets.set(e.data.id,{origin:e.origin,loaded:e.data.loaded});});
    const probe = function(id) {
      const out={};
      try { out.parentDOM=!!parent.document; } catch { out.parentDOM=false; }
      try { out.cookie=document.cookie.includes('platform-secret'); } catch { out.cookie=false; }
      try { out.localStorage=localStorage.getItem('platform-secret')==='private'; } catch { out.localStorage=false; }
      try { out.sessionStorage=sessionStorage.getItem('platform-secret')==='private'; } catch { out.sessionStorage=false; }
      out.privateChannel=typeof privatePort!=='undefined'||typeof channel!=='undefined'||typeof port!=='undefined';
      try { parent.location.href=location.origin+'/__top-escape'; out.topNavigation=true; } catch { out.topNavigation=false; }
      try { out.popup=!!open('about:blank'); } catch { out.popup=false; }
      try { out.topSecret=typeof parent.platformSecret==='string'; } catch { out.topSecret=false; }
      const image=new Image();image.src=parentOrigin+'/__leak';document.body.append(image);
      fetch(parentOrigin+'/__leak',{credentials:'include'}).catch(()=>{});
      parent.postMessage({protocol:'p2lrn-scorm-runtime/1',action:'state',state:{forged:true}},'*');
      parent.postMessage({protocol:'p2lrn-package-runtime/1',action:'cmi5-statement',statement:{forged:true}},'*');
      parent.postMessage({protocol:'p2lrn-security-test',id,result:out},'*');
    };
    const encoder=new TextEncoder();
    const nestedFor=(files)=>({archive:{entries:new Map(Object.entries(files).map(([name,text])=>[name,{uncompressedSize:encoder.encode(text).length}]))},names:()=>Object.keys(files),read:async name=>encoder.encode(files[name])});
    for (const kind of ['scorm12','scorm2004','html','cmi5','h5p','imscc']) {
      const target=new EventTarget();const state=[];const ready=[];const completed=[];
      target.addEventListener('p2lrn:complete',e=>completed.push(e.detail));
      target.addEventListener('p2lrn:activityready',e=>ready.push(e.detail));
      const module=await import(web+'renderers/'+(kind.startsWith('scorm')?'scorm':kind==='h5p'?'h5p':'package')+'-runtime.js');
      const api=kind==='scorm12'?`API.LMSInitialize('');if(API.LMSGetValue('cmi.core.lesson_location')!=='resume-marker')throw new Error('SCORM resume failed');API.LMSSetValue('cmi.core.lesson_location','bookmark');API.LMSCommit('');` :kind==='scorm2004'?`API_1484_11.Initialize('');if(API_1484_11.GetValue('cmi.location')!=='resume-marker')throw new Error('SCORM 2004 resume failed');API_1484_11.SetValue('cmi.location','bookmark');API_1484_11.Commit('');`:'';
      let code=`const parentOrigin=${JSON.stringify(location.origin)};(${probe.toString()})(${JSON.stringify(kind)});${api}`;
      if(kind==='cmi5') code+=`fetch('https://p2lrn.invalid/cmi5/xapi/activities/state?stateId=bookmark').then(async response=>{if((await response.json()).page!==1)throw new Error('cmi5 preview resume failed');await fetch('https://p2lrn.invalid/cmi5/xapi/activities/state?stateId=bookmark',{method:'PUT',body:JSON.stringify({page:2})});fetch('https://p2lrn.invalid/cmi5/xapi/statements',{method:'POST',body:JSON.stringify({verb:{id:'http://adlnet.gov/expapi/verbs/completed'},result:{completion:true}})});});`;
      if(kind==='h5p') code=`H5P.IsolationTest=function(params,id,extras){if(extras.previousState?.bookmark!==1)throw new Error('H5P resume failed');H5P.EventDispatcher.call(this);this.getCurrentState=()=>({bookmark:2});this.attach=container=>{container.text('H5P synthetic isolation');setTimeout(()=>{${code};H5P.externalDispatcher.trigger('xAPI',{statement:{verb:{id:'http://adlnet.gov/expapi/verbs/completed'},result:{completion:true}}});},100);};};H5P.IsolationTest.prototype=Object.create(H5P.EventDispatcher.prototype);`;
      const files={'index.html':`<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1 id="ok" data-kind="${kind}">Portable</h1><a href="next.html">Next</a><script src="code.js"></script></body></html>`,'next.html':'<h1>Second page</h1>','code.js':code,'style.css':'h1{color:rgb(10,20,30)}'};
      // SCORM 2004 requires a valid sequencing manifest even in hostile-content probes.
      // Preserve the strict production runtime and repair the old synthetic fixture.
      if(kind==='scorm2004')files['imsmanifest.xml']="<manifest identifier=\"SECURITY-CONTENT\"><metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata><organizations default=\"ORG\"><organization identifier=\"ORG\"><title>Security runtime fixture</title><item identifier=\"ITEM\" identifierref=\"RES\"><title>Security SCO</title></item></organization></organizations><resources><resource identifier=\"RES\" href=\"index.html\"><file href=\"index.html\"/><file href=\"code.js\"/></resource></resources></manifest>";
      if(kind==='imscc'){
        const svg='<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#145"/></svg>';
        files['web_resources/images/icon.svg']=svg;
        files['wiki_content/index.html']='<!doctype html><html><head><meta charset="utf-8"></head><body><img id="imscc-asset" src="$IMS-CC-FILEBASE$/images/icon.svg?canvas_download=1" alt="Cartridge asset"><script src="code.js"></script></body></html>';
        files['wiki_content/code.js']=code+';const asset=document.getElementById("imscc-asset");const sendAsset=()=>parent.postMessage({protocol:"p2lrn-imscc-asset-test",id:"imscc",loaded:asset.naturalWidth===8},"*");asset.addEventListener("load",sendAsset,{once:true});asset.addEventListener("error",sendAsset,{once:true});if(asset.complete)setTimeout(sendAsset,0);';
      }
      if(kind==='h5p'){Object.assign(files,{'h5p.json':JSON.stringify({mainLibrary:'H5P.IsolationTest',embedTypes:['div'],preloadedDependencies:[{machineName:'H5P.IsolationTest',majorVersion:1,minorVersion:0}]}),'content/content.json':'{}','H5P.IsolationTest-1.0/library.json':JSON.stringify({machineName:'H5P.IsolationTest',majorVersion:1,minorVersion:0,patchVersion:0,runnable:1,preloadedJs:[{path:'test.js'}]}),'H5P.IsolationTest-1.0/test.js':code});}
      const profile='https://p2lrn.org/profile/'+(kind.startsWith('scorm')?'scorm':kind==='cmi5'?'cmi5':kind==='h5p'?'h5p':'ims-content-package');
      const representation={profile,location:{type:'embedded',path:'nested.zip'},extensions:{[profile]:{member:kind==='imscc'?'wiki_content/index.html':'index.html',scormVersion:kind==='scorm2004'?'2004':'1.2'}}};
      const runtime=await module.render({container:host,payload:{nested:nestedFor(files)},representation,eventTarget:target,adapter:{loadState:async()=>kind==='h5p'?{bookmark:1}:kind==='cmi5'?{protocol:'p2lrn-cmi5-preview-state/1',states:{bookmark:{page:1}}}:kind.startsWith('scorm')?{values:{'cmi.core.student_id':'secret-user','cmi.core.student_name':'Private User','cmi.learner_id':'secret-user','cmi.learner_name':'Private User','cmi.core.lesson_location':'resume-marker','cmi.location':'resume-marker'}}:null,saveState:async value=>state.push(value)},context:{learnerId:'secret-user',learnerName:'Private User',packageId:'test',entityId:kind}});
      await wait(()=>reports.has(kind)&&ready.length,'runtime/probe '+kind);
      const report=reports.get(kind);assert(report.origin==='null','runtime inherited host origin '+kind);
      for(const [key,value] of Object.entries(report))if(key!=='origin')assert(value===false,kind+' leaked '+key);
      if(kind.startsWith('scorm')) {await wait(()=>state.some(x=>Object.values(x.values??{}).includes('bookmark')),'SCORM persistence '+kind);assert(!JSON.stringify(state).includes('secret-user'),'SCORM received platform identity');}
      if(kind==='html')await wait(()=>ready.some(x=>x.launchMember==='next.html'),'local HTML navigation');
      if(kind==='imscc'){await wait(()=>importedAssets.has(kind),'IMSCC portable asset');assert(importedAssets.get(kind).origin==='null'&&importedAssets.get(kind).loaded,'IMSCC asset must load inside isolated runtime');}
      if(kind==='cmi5'){await wait(()=>state.some(x=>x.states?.bookmark?.page===2)&&completed.some(x=>x.authoritative===false),'cmi5 preview persistence/completion');}
      if(kind==='h5p')await wait(()=>state.some(x=>x.bookmark===2),'H5P isolated state');
      assert(!state.some(x=>x.forged),'forged global state accepted');
      assert(host.querySelector('iframe').sandbox.value==='allow-scripts','excess package permissions');
      await runtime.flush?.();runtime.destroy();assert(!host.querySelector('iframe'),'destroy left live runtime');
      records.push({test:kind+' hostile-content isolation',result:'pass',stateWrites:state.length});
    }
    assert(localStorage.getItem('platform-secret')==='private','host persistence changed');
    result.dataset.status='PASS';result.textContent=JSON.stringify(records);
  } catch(error) {result.dataset.status='FAIL';result.textContent=JSON.stringify({message:error.message,stack:error.stack,records});}
}

const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/__leak')||pathname.startsWith('/__top-escape'))hits.push(pathname);
  if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><pre id="result" data-status="BOOT">BOOT</pre><main id="host"></main><script type="module" src="/__suite.js"></script>');return;}
  if(pathname==='/__suite.js'){res.setHeader('Content-Type','text/javascript');res.end(`(${browserSuite.toString()})();`);return;}
  const libraryPrefix='/packages/player/dist/runtime-host/h5p-libraries/';
  const file=pathname.startsWith(libraryPrefix) ? resolve(root,'packages/h5p-libraries/dist',decodeURIComponent(pathname.slice(libraryPrefix.length))) : resolve(root,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try {
    const bytes=await readFile(file);
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.woff':'font/woff','.woff2':'font/woff2'})[extname(file)]??'application/octet-stream');
    res.end(bytes);
  } catch {res.writeHead(404).end();}
});
const profile=await mkdtemp(join(tmpdir(),'p2lrn-opaque-'));
try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const outcome=await runChromePageGate(await findChrome(),`http://127.0.0.1:${server.address().port}/`,profile,{timeoutMs:55000,exerciseExpression});
  assert.equal(outcome.status,'PASS',JSON.stringify(outcome,null,2));
  assert.deepEqual(hits,[],'sandbox leaked network or top navigation');
  console.log(JSON.stringify({ok:true,results:JSON.parse(outcome.detail),blockedNetworkRequests:true},null,2));
} finally {await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
