import {execFile, spawn} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {createReadStream, existsSync} from 'node:fs';
import http from 'node:http';
import {tmpdir} from 'node:os';
import {basename, dirname, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const gateRoot = join(root, '.npm-pack-gate');
const installRoot = join(gateRoot, 'install');
const copiedRuntime = join(gateRoot, 'copied-runtime');
const toolkitRoot = join(installRoot, 'node_modules', '@p2lrn', 'toolkit');
const browserRoot = join(gateRoot, 'browser-runtime');
const coursesRoot = join(browserRoot, 'courses');
const encoder = new TextEncoder();

async function importFile(path) {
  return import(pathToFileURL(path).href);
}

function mediaType(path) {
  const ext = extname(path).toLowerCase();
  return ({
    '.html':'text/html; charset=utf-8',
    '.htm':'text/html; charset=utf-8',
    '.js':'text/javascript; charset=utf-8',
    '.mjs':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8',
    '.json':'application/json; charset=utf-8',
    '.xml':'application/xml; charset=utf-8',
    '.svg':'image/svg+xml',
    '.png':'image/png',
    '.jpg':'image/jpeg',
    '.jpeg':'image/jpeg',
    '.gif':'image/gif',
    '.webp':'image/webp',
    '.woff':'font/woff',
    '.woff2':'font/woff2',
    '.ttf':'font/ttf',
    '.mp3':'audio/mpeg',
    '.mp4':'video/mp4',
    '.p2lrn':'application/vnd.p2lrn.package',
  })[ext] ?? 'application/octet-stream';
}

function createStaticServer(base, {cors=false} = {}) {
  const rootPath = resolve(base);
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1/');
      const decoded = decodeURIComponent(url.pathname);
      const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
      const file = resolve(rootPath, relative);
      if (file !== rootPath && !file.startsWith(rootPath + sep)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      let info;
      try { info = await stat(file); } catch { res.writeHead(404); res.end('Not Found'); return; }
      if (!info.isFile()) { res.writeHead(404); res.end('Not Found'); return; }

      if (cors) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      }
      res.setHeader('Content-Type', mediaType(file));
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      const method = String(req.method ?? 'GET').toUpperCase();
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/u.exec(String(range));
        if (!match) { res.writeHead(416, {'Content-Range':`bytes */${info.size}`}); res.end(); return; }
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : info.size - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= info.size) {
          res.writeHead(416, {'Content-Range':`bytes */${info.size}`}); res.end(); return;
        }
        res.writeHead(206, {
          'Content-Range':`bytes ${start}-${end}/${info.size}`,
          'Content-Length':String(end - start + 1),
        });
        if (method === 'HEAD') { res.end(); return; }
        createReadStream(file, {start,end}).pipe(res);
        return;
      }
      res.setHeader('Content-Length', String(info.size));
      res.writeHead(200);
      if (method === 'HEAD') { res.end(); return; }
      createReadStream(file).pipe(res);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error?.message ?? error));
    }
  });
}

function listen(server) {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolvePromise(address.port);
    });
  });
}

export async function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.CHROMIUM_BIN,
    process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : null,
    process.platform === 'win32' ? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' : null,
    process.platform === 'win32' ? 'C:\\Program Files\\Chromium\\Application\\chrome.exe' : null,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if ((candidate.includes('/') || candidate.includes('\\')) && !existsSync(candidate)) continue;
    try {
      await execFileAsync(candidate, ['--version'], {timeout:5000, maxBuffer:1024*1024});
      return candidate;
    } catch {}
  }
  throw new Error('Chrome/Chromium is required for the npm browser gate but was not found on the runner.');
}

async function writeZipFixture(path, entries) {
  const {writeZip} = await importFile(join(toolkitRoot,'dist','core','zip.js'));
  const encoded = entries.map(([name,text])=>({
    path:name,
    data:encoder.encode(text),
    mediaType:mediaType(name),
    method:8,
  }));
  await writeFile(path, writeZip(encoded));
}

async function synthesizeExternalPackages() {
  const {convertExternalPackage} = await importFile(join(toolkitRoot,'dist','creator','external.js'));

  const fixtures = [
    {
      name:'common-cartridge.p2lrn',
      source:'common-cartridge.imscc',
      entries:[
        ['imsmanifest.xml',`<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1" identifier="cc-browser">
  <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.3.0</schemaversion></metadata>
  <organizations default="org1"><organization identifier="org1"><title>CC Browser</title><item identifier="i1" identifierref="r1"><title>Page</title></item></organization></organizations>
  <resources><resource identifier="r1" type="webcontent" href="index.html"><file href="index.html"/></resource></resources>
</manifest>`],
        ['index.html','<!doctype html><html><body><h1 id="cc-ok">Common Cartridge browser OK</h1></body></html>'],
      ],
    },
    {
      name:'ims-content-package.p2lrn',
      source:'ims-content.zip',
      entries:[
        ['imsmanifest.xml',`<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" identifier="ims-browser">
  <metadata><schema>IMS Content</schema><schemaversion>1.1.4</schemaversion></metadata>
  <organizations default="org1"><organization identifier="org1"><title>IMS Browser</title><item identifier="i1" identifierref="r1"><title>Lesson</title></item></organization></organizations>
  <resources><resource identifier="r1" type="webcontent" href="lesson.html"><file href="lesson.html"/></resource></resources>
</manifest>`],
        ['lesson.html','<!doctype html><html><body><h1 id="ims-ok">IMS browser OK</h1></body></html>'],
      ],
    },
    {
      name:'tincan-package.p2lrn',
      source:'tincan.zip',
      entries:[
        ['tincan.xml',`<?xml version="1.0" encoding="UTF-8"?>
<tincan><activities><activity id="https://example.invalid/tincan/browser"><name>Tin Can Browser</name><launch>index.html</launch></activity></activities></tincan>`],
        ['index.html','<!doctype html><html><body><h1 id="tincan-ok">Tin Can browser OK</h1></body></html>'],
      ],
    },
    {
      name:'qti3-interactive.p2lrn',
      source:'qti3-interactive.zip',
      entries:[
        ['imsmanifest.xml',`<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" identifier="qti-browser">
  <metadata><schema>QTI Package</schema><schemaversion>3.0</schemaversion></metadata>
  <organizations/>
  <resources><resource identifier="ITEM1" type="imsqti_item_xmlv3p0" href="item.xml"><file href="item.xml"/></resource></resources>
</manifest>`],
        ['item.xml',`<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="item-1" title="QTI Browser">
  <qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="identifier">
    <qti-correct-response><qti-value>A</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <p>Which planet is red?</p>
    <qti-choice-interaction response-identifier="RESPONSE" max-choices="1">
      <qti-prompt>Select one</qti-prompt>
      <qti-simple-choice identifier="A">Mars</qti-simple-choice>
      <qti-simple-choice identifier="B">Venus</qti-simple-choice>
    </qti-choice-interaction>
  </qti-item-body>
</qti-assessment-item>`],
      ],
    },
    {
      name:'scorm12-interactive.p2lrn',
      source:'scorm12-interactive.zip',
      entries:[
        ['imsmanifest.xml',`<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="scorm-browser" version="1"
 xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
 xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG1"><organization identifier="ORG1"><title>SCORM Browser</title><item identifier="ITEM1" identifierref="RES1"><title>Lesson</title></item></organization></organizations>
  <resources><resource identifier="RES1" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources>
</manifest>`],
        ['index.html',`<!doctype html><html><body><h1>SCORM browser OK</h1><script>
(function(){var api=null;try{api=window.API||(window.parent&&window.parent.API)||null;}catch(e){}if(!api)throw new Error('SCORM API missing');if(api.LMSInitialize('')!=='true')throw new Error('SCORM init failed');api.LMSSetValue('cmi.core.lesson_status','incomplete');api.LMSCommit('');})();
<\/script></body></html>`],
      ],
    },
  ];

  for (const fixture of fixtures) {
    const source = join(browserRoot, fixture.source);
    const output = join(coursesRoot, fixture.name);
    await writeZipFixture(source, fixture.entries);
    convertExternalPackage(source, output);
  }
}

async function prepareCourses() {
  await rm(browserRoot, {recursive:true, force:true});
  await mkdir(coursesRoot, {recursive:true});
  const canonical = join(root,'examples','canonical','external');
  const copies = [
    ['h5p-crossword.p2lrn','h5p-crossword.p2lrn'],
    ['cmi5-catapult-pre-post.p2lrn','cmi5-catapult-pre-post.p2lrn'],
  ];
  for (const [from,to] of copies) await cp(join(canonical,from), join(coursesRoot,to));
  await cp(join(root,'examples','canonical','native-questionnaire-course.p2lrn'), join(coursesRoot,'native-questionnaire-course.p2lrn'));
  await synthesizeExternalPackages();

  const {createMultipartPackage} = await importFile(join(toolkitRoot,'dist','tools','multipart.js'));
  createMultipartPackage(
    join(coursesRoot,'cmi5-catapult-pre-post.p2lrn'),
    join(coursesRoot,'cmi5-multipart.p2lrn'),
    {partSize:1024*1024},
  );
}

async function writeHarness(runtimeOrigin) {
  const html=`<!doctype html>
<html><head><meta charset="utf-8"><title>P2LRN npm browser gate</title></head>
<body>
<pre id="result" data-status="BOOT">BOOT</pre>
<script>
const result=document.getElementById('result');
const events=[];
let finished=false;
function finish(status,detail){
  if(finished)return;finished=true;
  result.dataset.status=status;
  result.textContent=JSON.stringify({status,detail,events},null,2);
}
addEventListener('error',e=>finish('FAIL',{phase:'window-error',message:e.message}));
addEventListener('unhandledrejection',e=>finish('FAIL',{phase:'unhandledrejection',message:String(e.reason?.message||e.reason)}));
</script>
<script src="${runtimeOrigin}/p2lrn.js"></script>
<script>
(async()=>{
  try{await window.P2LRNReady;}catch(e){finish('FAIL',{phase:'loader',message:String(e?.message||e)});return;}
  const params=new URLSearchParams(location.search);
  const course=params.get('course');
  const passiveExpectations={
    'common-cartridge.p2lrn':'Common Cartridge browser OK',
  };
  const p=document.createElement('p2lrn-player');
  p.id='player';
  p.setAttribute('src','/courses/'+course);
  for(const name of ['p2lrn:ready','p2lrn:rendered','p2lrn:activityready','p2lrn:statechange','p2lrn:error']){
    p.addEventListener(name,e=>{
      let detail=e.detail;
      try{detail=JSON.parse(JSON.stringify(detail));}catch{detail=String(detail);}
      events.push({name,detail});
      if(name==='p2lrn:error')finish('FAIL',{phase:'p2lrn-error',detail});
      if(name==='p2lrn:rendered'&&passiveExpectations[course]){
        const frame=p.shadowRoot?.querySelector('iframe.p2lrn-html');
        const srcdoc=frame?.getAttribute('srcdoc')||'';
        const marker=passiveExpectations[course];
        if(!frame||!srcdoc.includes(marker)){
          finish('FAIL',{phase:'passive-render-contract',course,renderer:detail?.rendererId,marker,frame:!!frame});
          return;
        }
        finish('PASS',{course,renderer:detail?.rendererId,passiveContentVerified:true});
      }
      if(name==='p2lrn:activityready'){
        if(course.includes('h5p')){
          const frame=p.shadowRoot?.querySelector('iframe.p2lrn-h5p-frame');
          const allow=frame?.getAttribute('allow')||'';
          if(!frame||!allow.toLowerCase().includes('fullscreen')){
            finish('FAIL',{phase:'fullscreen-contract',course,allow,frame:!!frame});
            return;
          }
        }
        if(course==='qti3-interactive.p2lrn'){
          const text=p.shadowRoot?.textContent||'';
          if(!text.includes('Mars')||!text.includes('Select one')){
            finish('FAIL',{phase:'qti3-render-contract',course,text:text.slice(0,1600)});
            return;
          }
        }
        if(course==='scorm12-interactive.p2lrn'){
          setTimeout(()=>{
            const stateEvent=[...events].reverse().find((item)=>item.name==='p2lrn:statechange');
            const lessonStatus=stateEvent?.detail?.state?.values?.['cmi.core.lesson_status'];
            if(!stateEvent||lessonStatus!=='incomplete'){
              finish('FAIL',{phase:'scorm-inline-script-contract',course,lessonStatus,events});
              return;
            }
            finish('PASS',{course,activity:detail,inlineScriptExecuted:true,lessonStatus});
          },100);
          return;
        }
        finish('PASS',{course,activity:detail,fullscreenContract:course.includes('h5p')?true:null});
      }
    });
  }
  document.body.append(p);
  // This page is executed with Chrome virtual time. An in-page timeout can
  // expire while network/runtime IPC is still progressing and produce a false
  // failure. The outer Chrome timeout and virtual-time budget are the deadline;
  // runCourse still fails unless the page explicitly reaches PASS.
})();
</script>
</body></html>`;
  await writeFile(join(browserRoot,'index.html'),html);

  const questionnaireHtml=`<!doctype html>
<html><head><meta charset="utf-8"><title>P2LRN questionnaire npm gate</title></head>
<body>
<pre id="result" data-status="BOOT">BOOT</pre>
<script>
const result=document.getElementById('result');
const events=[];
let finished=false;
let storedState=null;
let saveCount=0;
let loadCount=0;
let reportedScore=null;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function finish(status,detail){
  if(finished)return;finished=true;
  result.dataset.status=status;
  result.textContent=JSON.stringify({status,detail,events,saveCount,loadCount,reportedScore,storedState},null,2);
}
addEventListener('error',e=>finish('FAIL',{phase:'window-error',message:e.message}));
addEventListener('unhandledrejection',e=>finish('FAIL',{phase:'unhandledrejection',message:String(e.reason?.message||e.reason)}));
</script>
<script src="${runtimeOrigin}/p2lrn.js"></script>
<script>
(async()=>{
  let api;
  try{api=await window.P2LRNReady;}catch(e){finish('FAIL',{phase:'loader',message:String(e?.message||e)});return;}
  const adapter=api.createHostAdapter({
    async loadState(){loadCount++;return clone(storedState);},
    async saveState(state){saveCount++;storedState=clone(state);},
    async reportScore(score){reportedScore=clone(score);},
    async emitEvent(event){events.push({name:'adapter:'+String(event?.type||event?.name||'event'),detail:clone(event)});}
  });

  const attachEvents=(p)=>{
    for(const name of ['p2lrn:ready','p2lrn:rendered','p2lrn:progress','p2lrn:statechange','p2lrn:score','p2lrn:complete','p2lrn:error']){
      p.addEventListener(name,e=>{
        let detail=e.detail;
        try{detail=clone(detail);}catch{detail=String(detail);}
        events.push({name,detail});
        if(name==='p2lrn:error')finish('FAIL',{phase:'p2lrn-error',detail});
      });
    }
  };

  const makePlayer=()=>{
    const p=document.createElement('p2lrn-player');
    p.setAttribute('src','/courses/native-questionnaire-course.p2lrn');
    p.adapter=adapter;
    attachEvents(p);
    return p;
  };

  const waitFor=async(check,timeout=8000)=>{
    const started=Date.now();
    while(Date.now()-started<timeout){
      const value=check(); if(value)return value;
      await sleep(40);
    }
    return null;
  };

  const setInput=(input,value,eventName)=>{
    if(input.value!==undefined)input.value=value;
    if('checked' in input && typeof value==='boolean')input.checked=value;
    input.dispatchEvent(new Event(eventName,{bubbles:true}));
  };

  const answerVisible=async(p)=>{
    const root=p.shadowRoot;
    if(!root)return false;
    let changed=false;

    const radios=[...root.querySelectorAll('input[type="radio"]:not(:disabled)')];
    const radioGroups=new Map();
    for(const input of radios){
      const name=input.name||'__radio__';
      if(!radioGroups.has(name))radioGroups.set(name,[]);
      radioGroups.get(name).push(input);
    }
    for(const group of radioGroups.values()){
      if(!group.some(x=>x.checked)&&group[0]){setInput(group[0],true,'change');changed=true;}
    }

    for(const input of root.querySelectorAll('input[type="checkbox"]:not(:disabled)')){
      if(!input.checked){setInput(input,true,'change');changed=true;break;}
    }
    for(const input of root.querySelectorAll('input[type="text"]:not(:disabled), textarea:not(:disabled)')){
      if(!String(input.value||'').trim()){setInput(input,'respuesta','input');changed=true;}
    }
    for(const select of root.querySelectorAll('select:not(:disabled)')){
      const option=[...select.options].find(o=>o.value);
      if(option&&select.value!==option.value){setInput(select,option.value,'change');changed=true;}
    }

    const move=[...root.querySelectorAll('button[aria-label="Mover abajo"]:not(:disabled)')][0];
    if(move){move.click();changed=true;await sleep(60);}
    return changed;
  };

  const p=makePlayer();
  document.body.append(p);
  if(!await waitFor(()=>p.shadowRoot?.querySelector('.p2lrn-q-card'))){
    finish('FAIL',{phase:'questionnaire-mount',text:p.shadowRoot?.textContent||''});return;
  }

  for(let step=0;step<30;step++){
    await answerVisible(p);
    await sleep(100);
    const buttons=[...p.shadowRoot.querySelectorAll('button:not(:disabled)')];
    const finishButton=buttons.find(b=>b.textContent.trim()==='Finalizar');
    if(finishButton){finishButton.click();break;}
    const next=buttons.find(b=>b.textContent.trim()==='Siguiente');
    if(!next){finish('FAIL',{phase:'questionnaire-navigation',step,text:p.shadowRoot.textContent});return;}
    next.click();
    await sleep(100);
  }

  if(!await waitFor(()=>events.some(e=>e.name==='p2lrn:complete'),6000)){
    finish('FAIL',{phase:'completion-timeout',text:p.shadowRoot?.textContent||''});return;
  }
  await sleep(250);

  const requiredEvents=['p2lrn:progress','p2lrn:statechange','p2lrn:score','p2lrn:complete'];
  const missing=requiredEvents.filter(name=>!events.some(e=>e.name===name));
  if(missing.length){finish('FAIL',{phase:'events-missing',missing});return;}
  if(!storedState||storedState.completed!==true||saveCount<1){finish('FAIL',{phase:'state-not-saved',saveCount,storedState});return;}
  if(!reportedScore){finish('FAIL',{phase:'score-not-reported'});return;}

  p.remove();
  const resumed=makePlayer();
  document.body.append(resumed);
  if(!await waitFor(()=>resumed.shadowRoot?.textContent?.includes('Resultado')||resumed.shadowRoot?.textContent?.includes('Respuestas enviadas'),8000)){
    finish('FAIL',{phase:'resume-failed',loadCount,text:resumed.shadowRoot?.textContent||''});return;
  }
  if(loadCount<2){finish('FAIL',{phase:'load-state-not-reused',loadCount});return;}

  finish('PASS',{
    progress:true,
    statePersistence:true,
    scoreReporting:true,
    completion:true,
    resume:true,
    saveCount,
    loadCount,
    score:reportedScore
  });
})();
</script>
</body></html>`;
  await writeFile(join(browserRoot,'questionnaire.html'),questionnaireHtml);
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

export async function runChromePageGate(chrome, url, profile, {timeoutMs=35000, exerciseExpression=null} = {}) {
  await rm(profile,{recursive:true,force:true});
  const args=[
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-cache',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    url,
  ];
  const child=spawn(chrome,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});
  let stderr='';
  let settled=false;
  let devtoolsReject;
  const devtools=new Promise((resolvePromise,reject)=>{
    devtoolsReject=reject;
    const timer=setTimeout(()=>reject(new Error('Chrome DevTools endpoint did not start in time.')),10000);
    child.stderr?.on('data',(chunk)=>{
      stderr=(stderr+String(chunk)).slice(-64000);
      const match=/DevTools listening on (ws:\/\/[^\s]+)/u.exec(stderr);
      if(match&&!settled){
        settled=true;
        clearTimeout(timer);
        resolvePromise(match[1]);
      }
    });
    child.once('error',(error)=>{clearTimeout(timer);reject(error);});
    child.once('exit',(code)=>{
      if(!settled){
        clearTimeout(timer);
        reject(new Error(`Chrome exited before DevTools was ready (code=${code}).\n${stderr.slice(-4000)}`));
      }
    });
  });

  let socket=null;
  try{
    const browserWs=await devtools;
    const endpoint=new URL(browserWs);
    const jsonOrigin=`http://${endpoint.hostname}:${endpoint.port}`;
    let target=null;
    const targetDeadline=Date.now()+10000;
    while(Date.now()<targetDeadline&&!target){
      try{
        const targets=await (await fetch(jsonOrigin+'/json/list')).json();
        target=targets.find((item)=>item.type==='page'&&item.url===url)
          ?? targets.find((item)=>item.type==='page'&&!item.url.startsWith('devtools://'))
          ?? null;
      }catch{}
      if(!target)await sleep(100);
    }
    if(!target?.webSocketDebuggerUrl)throw new Error('Chrome page target was not available.');

    socket=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolvePromise,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Chrome page DevTools socket did not open in time.')),5000);
      socket.addEventListener('open',()=>{clearTimeout(timer);resolvePromise();},{once:true});
      socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Chrome page DevTools socket failed.'));},{once:true});
    });
    let sequence=0;
    const pending=new Map();
    const browserLogs=[];
    const runtimeExceptions=[];
    const contexts=new Map();
    socket.addEventListener('message',(event)=>{
      const message=JSON.parse(event.data);
      const sessionId=message.sessionId ?? null;
      if(message.method==='Runtime.executionContextCreated' && message.params?.context?.auxData?.isDefault) {
        const contextId=message.params.context.id;
        contexts.set(`${sessionId ?? ''}:${contextId}`,{sessionId,contextId});
      }
      if(message.method==='Runtime.executionContextDestroyed') contexts.delete(`${sessionId ?? ''}:${message.params.executionContextId}`);
      if(message.method==='Target.attachedToTarget' && exerciseExpression) {
        const childSession=message.params.sessionId;
        void send('Runtime.enable',{},childSession).catch(()=>{});
        void send('Log.enable',{},childSession).catch(()=>{});
      }
      if(message.method==='Target.detachedFromTarget') {
        for(const [key,value] of contexts) if(value.sessionId===message.params.sessionId) contexts.delete(key);
      }
      if(message.method==='Log.entryAdded'){
        const entry=message.params?.entry;
        if(entry)browserLogs.push({level:entry.level,source:entry.source,text:entry.text,url:entry.url||null});
      }
      if(message.method==='Runtime.exceptionThrown'){
        const details=message.params?.exceptionDetails;
        runtimeExceptions.push({text:details?.text||'exception',url:details?.url||null,lineNumber:details?.lineNumber??null});
      }
      const wait=pending.get(message.id);
      if(!wait)return;
      pending.delete(message.id);
      if(message.error)wait.reject(new Error(JSON.stringify(message.error)));
      else wait.resolve(message.result);
    });
    const send=(method,params={},sessionId=null)=>{
      const id=++sequence;
      socket.send(JSON.stringify({id,method,params,...(sessionId ? {sessionId} : {})}));
      return new Promise((resolvePromise,reject)=>pending.set(id,{resolve:resolvePromise,reject}));
    };
    await send('Runtime.enable');
    await send('Log.enable');
    if(exerciseExpression) await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});

    const deadline=Date.now()+timeoutMs;
    let snapshot={status:'BOOT',detail:'BOOT',readyState:'loading'};
    while(Date.now()<deadline){
      if(exerciseExpression) for(const {contextId,sessionId} of contexts.values()) {
        try { await send('Runtime.evaluate',{expression:exerciseExpression,contextId,returnByValue:true},sessionId); } catch {}
      }
      const evaluated=await send('Runtime.evaluate',{
        expression:`(()=>{const e=document.getElementById('result');return {status:e?.dataset?.status??'MISSING',detail:e?.textContent??'',readyState:document.readyState};})()`,
        returnByValue:true,
      });
      snapshot=evaluated.result?.value??snapshot;
      if(snapshot.status!=='BOOT'&&snapshot.status!=='MISSING')return {...snapshot,stderr,browserLogs,runtimeExceptions};
      await sleep(100);
    }
    return {...snapshot,stderr,browserLogs,runtimeExceptions,timeout:true};
  } finally {
    try{socket?.close();}catch{}
    if(child.exitCode===null){
      child.kill();
      await Promise.race([
        new Promise((resolvePromise)=>child.once('exit',()=>resolvePromise())),
        sleep(2000),
      ]);
    }
    void devtoolsReject;
  }
}

async function runCourse(chrome, appOrigin, course, index) {
  const profile=join(gateRoot,`chrome-profile-${index}`);
  const url=`${appOrigin}/?course=${encodeURIComponent(course)}`;
  const result=await runChromePageGate(chrome,url,profile,{timeoutMs:35000});
  const status=result.status??'MISSING';
  const detail=String(result.detail??'').trim();
  if(status!=='PASS'){
    throw new Error(`Browser gate failed for ${course}: status=${status}\n${detail}\nBrowser logs:\n${JSON.stringify(result.browserLogs??[],null,2)}\nRuntime exceptions:\n${JSON.stringify(result.runtimeExceptions??[],null,2)}\nChrome stderr:\n${String(result.stderr??'').slice(-4000)}`);
  }
  return {course,status,detail:detail.slice(0,1000)};
}

async function runQuestionnaire(chrome, appOrigin) {
  const profile=join(gateRoot,'chrome-profile-questionnaire');
  const result=await runChromePageGate(chrome,`${appOrigin}/questionnaire.html`,profile,{timeoutMs:45000});
  const status=result.status??'MISSING';
  const detail=String(result.detail??'').trim();
  if(status!=='PASS')throw new Error(`Questionnaire browser gate failed: status=${status}\n${detail}\nBrowser logs:\n${JSON.stringify(result.browserLogs??[],null,2)}\nRuntime exceptions:\n${JSON.stringify(result.runtimeExceptions??[],null,2)}\nChrome stderr:\n${String(result.stderr??'').slice(-4000)}`);
  return {course:'native-questionnaire-course.p2lrn',status,detail:detail.slice(0,2000)};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
await stat(join(installRoot,'node_modules','@p2lrn','player','package.json'));
await stat(join(copiedRuntime,'runtime-host','h5p-libraries','H5P.Crossword-0.5','library.json'));
await prepareCourses();

const runtimeServer=createStaticServer(copiedRuntime,{cors:true});
const appServer=createStaticServer(browserRoot,{cors:false});
const runtimePort=await listen(runtimeServer);
const appPort=await listen(appServer);
const runtimeOrigin=`http://127.0.0.1:${runtimePort}`;
const appOrigin=`http://127.0.0.1:${appPort}`;
await writeHarness(runtimeOrigin);

const chrome=await findChrome();
const courses=[
  'h5p-crossword.p2lrn',
  'scorm12-interactive.p2lrn',
  'cmi5-catapult-pre-post.p2lrn',
  'qti3-interactive.p2lrn',
  'common-cartridge.p2lrn',
  'ims-content-package.p2lrn',
  'tincan-package.p2lrn',
  'cmi5-multipart.p2lrn',
];

const results=[];
try{
  for(let i=0;i<courses.length;i++) results.push(await runCourse(chrome,appOrigin,courses[i],i));
  results.push(await runQuestionnaire(chrome,appOrigin));
}finally{
  await new Promise((resolvePromise)=>runtimeServer.close(()=>resolvePromise()));
  await new Promise((resolvePromise)=>appServer.close(()=>resolvePromise()));
}

console.log(JSON.stringify({ok:true,chrome,runtimeOrigin,appOrigin,results},null,2));


}
