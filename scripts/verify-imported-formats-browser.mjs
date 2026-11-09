import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findChrome,runChromePageGate} from './verify-browser-from-npm.mjs';

const root=resolve(fileURLToPath(new URL('..', import.meta.url)));
const cases=[
  {name:'h5p-boardgame',path:'/examples/canonical/external/h5p-boardgame.p2lrn',timeout:55000},
  {name:'scorm12-bilan-moodle',path:'/examples/canonical/external/scorm12-bilan-moodle.p2lrn',timeout:55000},
  {name:'scorm12-golf',path:'/examples/canonical/external/scorm12-golf.p2lrn',timeout:55000},
  {name:'common-cartridge-plan',path:'/examples/canonical/external/common-cartridge-topkit.p2lrn',node:'urn:uuid:ff890aa5-9175-575f-877e-728711cdfb80',timeout:55000},
  {name:'common-cartridge-topkit',path:'/examples/canonical/external/common-cartridge-topkit.p2lrn',node:'urn:uuid:52ecbb78-50df-5d6b-bf49-845e848490dc',timeout:55000},
];
async function suite(){
 const root=document.getElementById('root'),status=document.getElementById('result');
  const events=[],errors=[],frameReports=[];
  window.addEventListener('message',event=>{if(event.data?.protocol==='p2lrn-qa-frame-report')frameReports.push(event.data);});
 document.addEventListener('p2lrn:activityready',e=>events.push({type:'ready',detail:e.detail}));
 document.addEventListener('p2lrn:rendered',e=>events.push({type:'rendered',detail:e.detail}));
 document.addEventListener('p2lrn:error',e=>errors.push(e.detail));
 try{
  const {mountP2LRN}=await import('/packages/player/dist/p2lrn-player.js');
  const params=new URLSearchParams(location.search);await mountP2LRN(root,{src:params.get('src'),node:params.get('node')||undefined});
  const timeout=Date.now()+45000;
  const interactive=/scorm|h5p/iu.test(params.get('src')||'');
  while(!errors.length && !events.some(x=>x.type===(interactive?'ready':'rendered')) && Date.now()<timeout)await new Promise(resolve=>setTimeout(resolve,100));
  if(!errors.length)await new Promise(resolve=>setTimeout(resolve,1200));
  const child=root.querySelector('p2lrn-player')?.shadowRoot?.querySelector('iframe');
  const player=root.querySelector('p2lrn-player');
  const importedHtml=player?.shadowRoot?.querySelector('iframe.p2lrn-html')?.srcdoc??'';
  const importedDoc=new DOMParser().parseFromString(importedHtml,'text/html');
  const importedImages=importedDoc.querySelectorAll('img[src^="data:"]').length;
  const missingSource=importedDoc.querySelectorAll('[data-p2lrn-source-missing]').length;
  const unresolved=importedDoc.querySelectorAll('img[src^="$IMS-CC-FILEBASE$"]').length;
  const visual=frameReports.at(-1)??null;
  const response={events,errors,frameSrc:child?.src??'',frameSandbox:child?.getAttribute('sandbox')??null,dom:(player?.shadowRoot?.innerText||player?.shadowRoot?.textContent||'').slice(0,500),importedImages,missingSource,unresolved,visual,importedHtmlBytes:importedHtml.length};
    const expectedSourceError=params.get('src')?.includes('scorm12-bilan-moodle.p2lrn');
  const expectedImport=params.get('node');
  const healthy=events.some(x=>x.type===(interactive?'ready':'rendered')) && !errors.length && (!expectedImport||unresolved===0) && (!expectedImport||importedImages+missingSource>=2) && (!expectedImport||(!!visual&&visual.brokenImages===0&&visual.loadedImages>=importedImages));
  status.dataset.status=expectedSourceError?(errors.some(x=>String(x.error).includes('source package is missing JavaScript'))?'PASS':'FAIL'):(healthy?'PASS':'FAIL');
  status.textContent=JSON.stringify(response);
 }catch(error){status.dataset.status='FAIL';status.textContent=JSON.stringify({error:error.stack||String(error),events,errors});}
}
const port=await new Promise((done,reject)=>{
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
  if(url.pathname.endsWith('/runtime-host/h5p-opaque.html'))res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' blob: 'unsafe-eval'; style-src 'unsafe-inline' blob:; img-src blob: data:; font-src blob: data:; media-src blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'");
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><pre id="result" data-status="BOOT">BOOT</pre><main id="root"></main><script type="module" src="/__suite.js"></script></body></html>');return;}
  if(url.pathname==='/__suite.js'){res.setHeader('Content-Type','text/javascript');res.end('('+suite.toString()+')();');return;}
  const file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{
   const bytes=await readFile(file);
   res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.p2lrn':'application/vnd.p2lrn.package','.woff2':'font/woff2'})[extname(file)]??'application/octet-stream');
   res.setHeader('Accept-Ranges','bytes');
   const requestRange=String(req.headers.range||'').match(/^bytes=(\d+)-(\d*)$/u);
   if(requestRange){
     const start=Number(requestRange[1]),end=requestRange[2]?Math.min(Number(requestRange[2]),bytes.byteLength-1):bytes.byteLength-1;
     if(start<0||start>=bytes.byteLength||end<start){res.writeHead(416,{'Content-Range':'bytes */'+bytes.byteLength}).end();return;}
     res.writeHead(206,{'Content-Range':'bytes '+start+'-'+end+'/'+bytes.byteLength,'Content-Length':String(end-start+1)});
     res.end(bytes.subarray(start,end+1));return;
   }
   res.setHeader('Content-Length',String(bytes.length));res.end(bytes);
  }catch(error){console.warn('FILE_RESPONSE_ERROR',file,String(error));res.writeHead(404).end();}
 });
 server.on('error',reject);server.listen(0,'127.0.0.1',()=>done({port:server.address().port,server}));
});
const frameExpression=String.raw`(()=>{
  const hasPlayerImages=document.images.length>0;
  const hasFallback=!!document.querySelector('[data-p2lrn-source-missing]');
  const h5pStage=document.querySelector('#h5p-stage');
  if(!hasPlayerImages&&!hasFallback&&!h5pStage)return;
  const imageItems=Array.from(document.images).map(img=>({complete:img.complete,loaded:img.complete&&img.naturalWidth>0,scheme:img.currentSrc.split(':')[0]}));
  top.postMessage({protocol:'p2lrn-qa-frame-report',url:location.href,imageCount:imageItems.length,loadedImages:imageItems.filter(x=>x.loaded).length,brokenImages:imageItems.filter(x=>x.complete&&!x.loaded).length,placeholderCount:document.querySelectorAll('[data-p2lrn-source-missing]').length,h5pStage:!!h5pStage,h5pElements:h5pStage?.querySelectorAll('*').length??0,bodyText:document.body?.textContent?.trim().slice(0,75)},'*');
})()`;
const profile=await mkdtemp(join(tmpdir(),'p2lrn-import-format-'));
let failures=0;
try{
 for(const row of cases.filter(row=>!process.argv[2]||row.name===process.argv[2])){
  const outcome=await runChromePageGate(await findChrome(),`http://127.0.0.1:${port.port}/?src=${encodeURIComponent(row.path)}${row.node?'&node='+encodeURIComponent(row.node):''}`,profile,{timeoutMs:75000,exerciseExpression:frameExpression});
  const errors=(outcome.browserLogs||[]).filter(l=>l.level==='error'&&l.url!=='/favicon.ico');
   let report={};try{report=JSON.parse(outcome.detail||'{}')}catch{};console.log(JSON.stringify({name:row.name,status:outcome.status,eventTypes:report.events?.map(x=>x.type),runtimeErrors:report.errors?.map(x=>x.error),visual:report.visual,importedImages:report.importedImages,missingSource:report.missingSource,unresolved:report.unresolved,errors:errors.slice(0,5),exceptions:outcome.runtimeExceptions?.slice(0,4)},null,2));
  if(outcome.status!=='PASS')failures++;
 }
}finally{await new Promise(r=>port.server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200})}
if(failures)process.exitCode=1;
