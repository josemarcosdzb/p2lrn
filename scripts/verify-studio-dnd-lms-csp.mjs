import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,sep,extname} from 'node:path';
import {launchInteropChrome} from './interoperability/chrome-visual.mjs';
import {studioDropRuntimeSource} from '../packages/toolkit/web/renderers/lesson-drop-runtime.js';

// Regression for the exact failure observed when a P2LRN course is framed
// by an LMS: srcdoc inherits the strict launch CSP and must still boot DND.
test('trusted Drag & Drop runs inside opaque frame under strict LMS CSP', {timeout:45000}, async()=>{
  const root=resolve('packages/toolkit/web');
  const scratch=await mkdtemp(join(tmpdir(),'p2lrn-dnd-csp-'));
  const csp="default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' blob: about:; connect-src 'self'";
  const server=createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    res.setHeader('Content-Security-Policy',csp);
    res.setHeader('Cache-Control','no-store');
    if(pathname==='/'){
      res.setHeader('Content-Type','text/html');
      res.end('<!doctype html><html><head></head><body></body></html>');
      return;
    }
    if(pathname==='/renderers/lesson-drop-bootstrap.js'){
      res.setHeader('Content-Type','text/javascript');
      res.end(studioDropRuntimeSource);
      return;
    }
    const path=resolve(root,'.'+pathname);
    if(relative(root,path).startsWith('..'+sep)||path===root){
      res.writeHead(403);res.end();return;
    }
    try{
      const bytes=await readFile(path);
      res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':'text/plain');
      res.end(bytes);
    }catch{res.writeHead(404);res.end();}
  });
  let browser=null;
  try{
    await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});
    browser=await launchInteropChrome({downloadDir:scratch,evidenceDir:scratch});
    await browser.navigate('http://127.0.0.1:'+server.address().port+'/');
    const prepared=await browser.evaluate("(async()=>{"+
      "const {render}=await import('/renderers/passive-text.js');"+
      "const {createStudioDropActivity,setStudioDropItemText}=await import('/studio/studio-drop-activity.js');"+
      "const activity=createStudioDropActivity(document);"+
      "const cards=[...activity.querySelectorAll('[data-p2lrn-dnd-item]')];"+
      "setStudioDropItemText(activity,cards[0],'Ficha 1');"+
      "setStudioDropItemText(activity,cards[1],'Ficha 2');"+
      "const host=document.createElement('div');document.body.append(host);"+
      "await render({container:host,bytes:new TextEncoder().encode('<!doctype html><html><body>'+activity.outerHTML+'<script>window.__untrusted=1</script></body></html>'),representation:{mediaType:'text/html'}});"+
      "const frame=host.querySelector('iframe');"+
      "return {sandbox:frame.getAttribute('sandbox'),trusted:frame.srcdoc.includes('lesson-drop-bootstrap.js'),untrusted:frame.srcdoc.includes('window.__untrusted=1')};"+
    "})()");
    assert.deepEqual(prepared,{sandbox:'allow-scripts',trusted:true,untrusted:false});
    // Chromium may expose the opaque frame as a separate target after load.
    // Poll for the real child rather than interpreting a transient absence
    // as a failed player initialization.
    let target=null;
    for(let attempt=0;attempt<40&&!target;attempt++){
      const targets=(await browser.send('Target.getTargets')).targetInfos.filter(x=>x.type==='iframe');
      target=targets.find(x=>x.url==='about:srcdoc');
      if(!target)await new Promise(done=>setTimeout(done,100));
    }
    assert.ok(target,'The Player did not create an actual srcdoc iframe.');
    const attached=await browser.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    await browser.send('Runtime.enable',{},attached.sessionId);
    const expression="(()=>{"+
      "const activity=document.querySelector('[data-p2lrn-dnd=\"1\"]');"+
      "if(!activity)return {ok:false,reason:'No interactive activity'};"+
      "const reset=[...document.querySelectorAll('button')].find(x=>x.textContent==='Reiniciar actividad');"+
      "const cards=[...activity.querySelectorAll('[data-p2lrn-dnd-item]')];"+
      "const zones=[...activity.querySelectorAll('[data-p2lrn-dnd-zone]')];"+
      "if(!reset||cards.some(x=>!x.draggable))return {ok:false,reason:'Awaiting trusted bootstrap'};"+
      "const transfer=new DataTransfer();"+
      "cards[0].dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer}));"+
      "zones[0].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));"+
      "const dragPlaced=zones[0].contains(cards[0]);"+
      "cards[1].click();zones[1].click();"+
      "const clickPlaced=zones[1].contains(cards[1]);"+
      "const complete=activity.dataset.p2lrnDndCompleted==='true';"+
      "reset.click();"+
      "const resetWorked=cards.every(x=>x.draggable)&&!!activity.querySelector('[data-p2lrn-dnd-tray]')?.contains(cards[0])&&!activity.dataset.p2lrnDndCompleted;"+
      "return {ok:dragPlaced&&clickPlaced&&complete&&resetWorked,dragPlaced,clickPlaced,complete,resetWorked};"+
    "})()";
    let result=null;
    for(let attempt=0;attempt<30;attempt++){
      const answer=await browser.send('Runtime.evaluate',{expression,returnByValue:true},attached.sessionId);
      if(answer.exceptionDetails)throw Error('Browser child runtime: '+(answer.exceptionDetails.exception?.description||answer.exceptionDetails.text));
      result=answer.result?.value;
      if(result?.ok||result?.reason!=='Awaiting trusted bootstrap')break;
      await new Promise(done=>setTimeout(done,100));
    }
    assert.equal(result?.ok,true,'Drag & Drop still fails under strict CSP: '+JSON.stringify(result));
    console.log('DND_LMS_STRICT_CSP='+JSON.stringify(result));
  }finally{
    if(browser)await browser.close();
    if(server.listening)await new Promise(done=>server.close(done));
    await rm(scratch,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
});
