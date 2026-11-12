import http from 'node:http';
import {readFile,mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findChrome,runChromePageGate} from './verify-browser-from-npm.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const cspHost="default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; style-src 'self' blob: 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' blob:; frame-src 'self' blob: data:; object-src 'none'; base-uri 'none'";
const cspRuntime="default-src 'none'; script-src 'self' blob: 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline' blob:; img-src blob: data:; media-src blob: data:; font-src blob: data:; connect-src blob:; frame-src blob: data: about:; object-src 'none'; form-action 'none'; base-uri 'none'";
async function suite(){
 const result=document.querySelector('#result'),host=document.querySelector('#host'),state={ready:[],errors:[],frames:[]};
 document.addEventListener('p2lrn:activityready',e=>state.ready.push({runtime:e.detail?.runtime,member:e.detail?.launchMember}));
 document.addEventListener('p2lrn:error',e=>state.errors.push({phase:e.detail?.phase,error:e.detail?.error}));
 window.addEventListener('message',e=>{if(e.data?.protocol==='p2lrn-cmi5-qa-frame')state.frames.push(e.data);});
 try{
  const {mountP2LRN}=await import('/packages/player/dist/p2lrn-player.js');
  await mountP2LRN(host,{src:'/examples/canonical/external/cmi5-catapult-pre-post.p2lrn'});
  const deadline=Date.now()+43000;
  while(Date.now()<deadline){
   const last=state.frames.at(-1);
   if(state.errors.length)break;
   if(state.ready.some(x=>x.runtime==='external-package')&&last?.hasContent&&last.bodyLength>120&&last?.completed===true)break;
   await new Promise(resolve=>setTimeout(resolve,90));
  }
  const frame=host.querySelector('p2lrn-player')?.shadowRoot?.querySelector('iframe.p2lrn-package-runtime');
  const last=state.frames.at(-1);
  result.dataset.status=frame?.getAttribute('sandbox')==='allow-scripts'&&state.errors.length===0&&state.ready.length>0&&last?.hasContent&&last.bodyLength>120&&last?.completed===true?'PASS':'FAIL';
  result.textContent=JSON.stringify({events:state.ready,errors:state.errors,frame:last,iframe:frame?.src,frameSandbox:frame?.getAttribute('sandbox')});
 }catch(e){result.dataset.status='FAIL';result.textContent=JSON.stringify({error:String(e),events:state.ready,errors:state.errors,frames:state.frames.slice(-3)});}
}
const frameExercise=String.raw`(()=>{
  if(window===top||!document.body)return;
  const body=document.body.innerText||document.body.textContent||'';
  if(body.length<12)return;
  const scorePanel=document.getElementById('score-panel');
  const scoreValue=document.getElementById('score-panel-score')?.textContent?.trim()||'';
  const complete=Boolean(window.__p2lrnQaSubmitted &&
    scorePanel?.classList.contains('full-overlay-visible') &&
    /^\d{1,3}(?:\.\d+)?$/u.test(scoreValue));
  if(!window.__p2lrnQaSubmitted&&scorePanel){
    const content=document.getElementById('content');
    const submit=[...(content?.querySelectorAll('button,[role="button"]')||[])]
      .find(el=>/^\s*Submit Answers\s*$/iu.test(el.textContent||'')&&!el.disabled);
    const selects=[...(content?.querySelectorAll('select')||[])];
    const textInputs=[...(content?.querySelectorAll('input[type="text"],input:not([type])')||[])];
    if(submit&&(selects.length||textInputs.length)){
      let answered=0;
      // The real CATAPULT pre-test has a required free-text question as well
      // as a select. Leaving the text blank prevented scoring in Chrome.
      for(const input of textInputs){
        const answer=String(input.getAttribute('data-answer')||'').trim();
        if(!answer)continue;
        input.value=answer;
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        answered++;
      }
      for(const select of selects){
        const options=[...select.options];
        const choice=options.find(o=>!o.disabled&&o.dataset.correct==='yes')
          ??options.find(o=>!o.disabled&&o.value.trim()!=='');
        if(choice){
          select.value=choice.value;
          select.dispatchEvent(new Event('input',{bubbles:true}));
          select.dispatchEvent(new Event('change',{bubbles:true}));
          answered++;
        }
      }
      // Only submit when every visible answer control has been completed.
      if(answered>0&&answered===textInputs.length+selects.length){
        window.__p2lrnQaAnswered=answered;
        window.__p2lrnQaSubmitted=true;
        submit.click(); // Actual embedded-course button, not a synthetic grade.
      }
    }
  }
  const updatedScore=document.getElementById('score-panel-score')?.textContent?.trim()||'';
  const completed=Boolean(window.__p2lrnQaSubmitted &&
    document.getElementById('score-panel')?.classList.contains('full-overlay-visible') &&
    /^\d{1,3}(?:\.\d+)?$/u.test(updatedScore));
  top.postMessage({protocol:'p2lrn-cmi5-qa-frame',href:location.href,
    hasContent:/pre.?test|geology|test|question|assessment/iu.test(body),
    bodyLength:body.length,bodySnippet:body.slice(0,190),
    buttons:document.querySelectorAll('button,[role="button"]').length,
    controls:[...document.querySelectorAll('button,input,select,a')].slice(0,16).map(x=>({tag:x.tagName,
      txt:(x.textContent||'').trim().slice(0,45),value:x.value||'',type:x.type||'',disabled:Boolean(x.disabled)})),
    answered:Number(window.__p2lrnQaAnswered||0),submitted:Boolean(window.__p2lrnQaSubmitted),
    score:updatedScore,completed},'*');
})()`;
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',cspHost);res.end('<!doctype html><html><body><pre id="result" data-status="BOOT">BOOT</pre><main id="host"></main><script type="module" src="/__suite.js"></script></body></html>');return;}
 if(u.pathname==='/__suite.js'){res.setHeader('Content-Type','text/javascript');res.end('('+suite.toString()+')();');return;}
 const file=resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{
  const bytes=await readFile(file);const ext=extname(file);
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.p2lrn':'application/vnd.p2lrn.package'})[ext]||'application/octet-stream');
  if(u.pathname.endsWith('/runtime-host/package-opaque.html'))res.setHeader('Content-Security-Policy',cspRuntime);
  res.setHeader('Accept-Ranges','bytes');
  const range=/^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range||''));
  if(range){const a=Number(range[1]),b=range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;if(a>=bytes.length||b<a){res.writeHead(416).end();return;}res.writeHead(206,{'Content-Range':`bytes ${a}-${b}/${bytes.length}`,'Content-Length':b-a+1});res.end(bytes.subarray(a,b+1));return;}
  res.end(bytes);
 }catch(e){res.writeHead(404).end();}
});
const profile=await mkdtemp(join(tmpdir(),'p2lrn-cmi5-qa-'));
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const out=await runChromePageGate(await findChrome(),`http://127.0.0.1:${server.address().port}/`,profile,{timeoutMs:65000,exerciseExpression:frameExercise});
 console.log('CMI5_REAL_BROWSER='+JSON.stringify({status:out.status,detail:out.detail?.slice(0,4000),browserErrors:out.browserLogs?.filter(x=>x.level==='error').slice(0,7),runtimeExceptions:out.runtimeExceptions?.slice(0,4)}));
 if(out.status!=='PASS'||(out.browserLogs||[]).some(x=>x.level==='error'&&/content security policy|unsafe|inline event handler|failed to load/i.test(x.text||'')))process.exitCode=1;
}finally{await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200});}