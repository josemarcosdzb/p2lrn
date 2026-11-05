// End-to-end visibility test for the real published demo and preserved fixtures.
// Unlike manifest or p2lrn:rendered tests, this inspects real nested iframe DOM
// using a browser automation frame context, and verifies a SCORM interaction.
import assert from 'node:assert/strict';
import {createReadStream,existsSync} from 'node:fs';
import {readFile,mkdir,stat,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join,resolve,sep,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..');
const site=join(root,'.netlify-cdn');
const headerLines=(await readFile(join(site,'_headers'),'utf8')).split(/\r?\n/);
let insideDemo=false,demoCsp=null;
for(const line of headerLines){
 if(line.startsWith('/')){insideDemo=line.trim()==='/demo/*';continue;}
 if(insideDemo&&line.trim().startsWith('Content-Security-Policy:'))
   demoCsp=line.trim().slice('Content-Security-Policy:'.length).trim();
}
assert.ok(demoCsp&&demoCsp.includes('script-src'),'Demo must exercise its real deployed CSP, not an unprotected mock.');
const screenshotRoot=join(root,'.p2lrn-external-visual-qa');
await mkdir(screenshotRoot,{recursive:true});
const browserModule=join(root,'.p2lrn-i18n-ci','node_modules','playwright-core','index.mjs');
const {chromium}=await import(pathToFileURL(browserModule).href);
const browserExe=[process.env.CHROME_BIN,process.env.P2LRN_BROWSER_EXE,
 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(s=>s&&existsSync(s));
if(!browserExe)throw Error('A real installed Chrome or Edge is required for external format visual QA.');
const contentTypes={
 '.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.json':'application/json',
 '.p2lrn':'application/octet-stream','.png':'image/png','.svg':'image/svg+xml',
};
const server=createServer(async(req,res)=>{
 try{
  const uri=new URL(req.url??'/', 'http://127.0.0.1');
  const decoded=decodeURIComponent(uri.pathname);
  const target=resolve(site,decoded==='/'?'index.html':decoded.slice(1),
    decoded.endsWith('/')?'index.html':'');
  if(!target.startsWith(site+sep)){res.writeHead(403);res.end();return;}
  const info=await stat(target);
  if(!info.isFile()){res.writeHead(404);res.end();return;}
  const range=req.headers.range;
  const headers={
    'Content-Type':contentTypes[extname(target)]??'application/octet-stream',
    'Accept-Ranges':'bytes','Cache-Control':'no-store',
    'Access-Control-Allow-Origin':'*',
    ...(uri.pathname.startsWith('/demo/')?{'Content-Security-Policy':demoCsp}:{}),
  };
  if(range){
    const match=/^bytes=(\d+)-(\d*)$/.exec(range);
    const start=Number(match?.[1]),end=match?.[2]?Number(match[2]):info.size-1;
    if(!match||start<0||end<start||end>=info.size){res.writeHead(416);res.end();return;}
    res.writeHead(206,{...headers,'Content-Range':'bytes '+start+'-'+end+'/'+info.size,
      'Content-Length':end-start+1});
    createReadStream(target,{start,end}).pipe(res);
  }else{res.writeHead(200,{...headers,'Content-Length':info.size});createReadStream(target).pipe(res);}
 }catch(error){res.writeHead(404);res.end(String(error.message??error));}
});
await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:browserExe,headless:true,args:['--no-first-run','--no-default-browser-check']});
const results=[];
const cases=[
 {name:'cmi5-geology-pretest',course:'/examples/canonical/external/cmi5-catapult-pre-post.p2lrn',frame:'iframe.p2lrn-package-runtime',marker:/pre.?test|question|geology|pregunta|assessment|test/i,minimumText:30},
 {name:'cmi5-geology-content-1',course:'/examples/canonical/external/cmi5-catapult-pre-post.p2lrn',navigateTo:'Content',navigateIndex:0,frame:'iframe.p2lrn-package-runtime',marker:/geology|earth|content|next|previous|rock|page/i,minimumText:28},
 {name:'cmi5-geology-content-2',course:'/examples/canonical/external/cmi5-catapult-pre-post.p2lrn',navigateTo:'Content',navigateIndex:1,frame:'iframe.p2lrn-package-runtime',marker:/geology|earth|content|next|previous|rock|page/i,minimumText:28},
 {name:'cmi5-geology-posttest',course:'/examples/canonical/external/cmi5-catapult-pre-post.p2lrn',navigateTo:'Post-test',navigateIndex:0,frame:'iframe.p2lrn-package-runtime',marker:/post.?test|geology|assessment|question|test/i,minimumText:28},
 {name:'scorm12-interactive',course:'/examples/generated/scorm12-browser-demo.p2lrn',frame:'iframe.p2lrn-scorm-runtime',marker:/Lección SCORM interactiva/,minimumText:70,button:'Completar lección',after:/Lección completada/},
 {name:'qti3-interactive',course:'/examples/generated/qti3-interactive-demo.p2lrn',marker:/Marte|planeta rojo/,minimumText:70},
 {name:'h5p-crossword',course:'/examples/canonical/external/h5p-crossword.p2lrn',frame:'iframe.p2lrn-h5p-frame',marker:/across|down|check|show solution|crucigrama|crossword|palabra/i,minimumText:12},
];
async function findVisibleText(locator,{minimumText=30,marker=null}={}){
 let result='';
 for(let n=0;n<35;n++){
  result=String(await locator.innerText({timeout:12000}).catch(()=>'' )).trim();
  if(result.length>=minimumText&&(!marker||marker.test(result)))return result;
  await new Promise(r=>setTimeout(r,450));
 }
 throw Error('Content was missing/empty. textLength='+result.length+' bodyText='+result.slice(0,650));
}

async function verifyLocalPackageUpload(route,language){
 const page=await browser.newPage({viewport:{width:1360,height:800}});
 const caseName='viewer-local-package-upload-'+language;
 const networkWrites=[];
 page.on('request',req=>{
  if(['POST','PUT','PATCH'].includes(req.method()))networkWrites.push({method:req.method(),url:req.url()});
 });
 try{
   const initial='/examples/generated/scorm12-browser-demo.p2lrn';
   await page.goto(base+route+'?src='+encodeURIComponent(initial),{waitUntil:'domcontentloaded',timeout:30000});
   const example=page.locator('[data-sample]');
   const player=page.locator('#demo-player');
   await player.locator('.p2lrn-head').waitFor({timeout:40000});
   const events=page.locator('[data-event-log]');
   const count=async()=>((await events.innerText()).match(/p2lrn:ready/g)??[]).length;
   await page.waitForFunction(()=>String(document.querySelector('[data-event-log]')?.textContent??'').includes('p2lrn:ready'),null,{timeout:25000});
   assert.equal(await page.locator('[data-package-url]').count(),0,'Obsolete URL input still present');
   assert.equal(await page.locator('[data-file-input][type=file][multiple]').count(),1,'Native multi-file picker missing');
   const catalogItems=await example.locator('option').allTextContents();
   assert.ok(catalogItems.some(item=>item.includes('Catapult')),'Existing cmi5 examples disappeared');
   assert.ok(catalogItems.some(item=>item.includes('SCORM')),'Existing SCORM examples disappeared');

   const chooserPromise=page.waitForEvent('filechooser',{timeout:12000});
   await page.locator('[data-load]').click();
   const chooser=await chooserPromise;
   assert.equal(chooser.isMultiple(),true,'Load package must support selecting multiple local .p2lrn files');
   await chooser.setFiles([
     join(root,'examples','canonical','external','cmi5-catapult-pre-post.p2lrn'),
     join(root,'examples','canonical','external','scorm12-real.p2lrn'),
   ]);
   await page.waitForFunction(()=>document.querySelector('#demo-player')?.getAttribute('src')?.startsWith('blob:'),null,{timeout:45000});
   const firstSrc=await player.getAttribute('src');
   assert.ok(firstSrc.startsWith('blob:'),'The chosen local file must be played through a browser object URL');
   const uploaded=example.locator('optgroup option').filter({hasText:/^(cmi5-catapult-pre-post\.p2lrn|scorm12-real\.p2lrn)$/});
   await page.waitForFunction(()=>document.querySelectorAll('[data-sample] option[value^="blob:"]').length===2,null,{timeout:30000});
   assert.equal(await uploaded.count(),2,'Both local packages must be listed');
   await page.waitForFunction(()=>String(document.querySelector('[data-event-log]')?.textContent??'').includes('p2lrn:ready'),null,{timeout:25000});
   assert.ok((await events.innerText()).includes('inspect'),'Uploaded package must be verified');
   const localLabel=await page.locator('[data-package-label]').innerText();
   assert.equal(localLabel,'cmi5-catapult-pre-post.p2lrn');
   assert.ok(!(new URL(page.url()).searchParams.get('src')||'').startsWith('blob:'),'Never persist session-local blob URLs in address bar');

   const before=await count();
   await example.selectOption({label:'scorm12-real.p2lrn'});
   await page.waitForFunction(first=>document.querySelector('#demo-player')?.getAttribute('src')?.startsWith('blob:')&&document.querySelector('#demo-player')?.getAttribute('src')!==first,firstSrc,{timeout:30000});
   await page.waitForFunction(n=>((document.querySelector('[data-event-log]')?.textContent??'').match(/p2lrn:ready/g)??[]).length>n,before,{timeout:35000});
   assert.equal(await page.locator('[data-package-label]').innerText(),'scorm12-real.p2lrn');
   const secondSrc=await player.getAttribute('src');
   const beforeReload=await count();
   await page.locator('[data-reload]').click();
   await page.waitForFunction(n=>((document.querySelector('[data-event-log]')?.textContent??'').match(/p2lrn:ready/g)??[]).length>n,beforeReload,{timeout:35000});
   assert.equal(await player.getAttribute('src'),secondSrc,'Reload must keep the selected local package');

   // Selecting a public sample again must not delete the locally added files.
   await example.selectOption('/examples/generated/scorm12-browser-demo.p2lrn');
   await page.waitForFunction(()=>String(document.querySelector('#demo-player')?.getAttribute('src')??'').includes('scorm12-browser-demo.p2lrn'),null,{timeout:30000});
   assert.equal(await example.locator('option[value^="blob:"]').count(),2,'Locally added courses must remain selectable after opening an example');
   assert.equal(networkWrites.length,0,'Local files must never be POSTed to a server by the public viewer');
   await page.screenshot({path:join(screenshotRoot,caseName+'.png'),fullPage:false,animations:'disabled'});
   results.push({case:caseName,status:'PASS',filesLoaded:2,exampleRestored:true,reloadWorks:true,serverUploads:0});
 }catch(error){
   results.push({case:caseName,status:'FAIL',reason:String(error?.message??error).slice(0,1300),
     log:(await page.locator('[data-event-log]').textContent().catch(()=>''))?.slice(-2700)});
   await page.screenshot({path:join(screenshotRoot,caseName+'-FAIL.png'),fullPage:false,timeout:6000}).catch(()=>{});
 }finally{await page.close();}
}

try{
 for(const item of cases){
  const page=await browser.newPage({viewport:{width:1350,height:850}});
  const errors=[];
  page.on('pageerror',err=>errors.push(String(err.message).slice(0,600)));
  page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text().slice(0,450));});
  try{
   await page.goto(base+'/demo/?src='+encodeURIComponent(item.course),{waitUntil:'domcontentloaded',timeout:30000});
   await page.locator('p2lrn-player .p2lrn-head').waitFor({timeout:45000});
   const player=page.locator('p2lrn-player');
   if(item.navigateTo){
     const button=player.locator('nav.p2lrn-nav button').filter({hasText:item.navigateTo}).nth(item.navigateIndex??0);
     await button.waitFor({timeout:20000});
     assert.equal(await button.isDisabled(),false,'Expected playable '+item.navigateTo+' activity');
     await player.evaluate((host)=>{
       const stage=host.shadowRoot?.querySelector('.p2lrn-stage');
       window.__p2lrnActivityLoadingSeen=stage?.getAttribute('data-p2lrn-loading')==='true';
       if(stage){
         const observer=new MutationObserver(()=>{
           if(stage.getAttribute('data-p2lrn-loading')==='true')window.__p2lrnActivityLoadingSeen=true;
         });
         observer.observe(stage,{attributes:true,attributeFilter:['data-p2lrn-loading']});
         window.__p2lrnLoadingObserver=observer;
       }
     });
     await button.click({timeout:20000});
   }
   if(item.frame)await player.locator(item.frame).waitFor({timeout:25000});
   let content=item.frame?player.frameLocator(item.frame).locator('body'):player.locator('.p2lrn-stage');
   if(item.name==='h5p-crossword'){
     const outer=player.frameLocator(item.frame);
     const nested=outer.locator('iframe.h5p-iframe');
     if(await nested.waitFor({timeout:22000}).then(()=>true).catch(()=>false))
       content=outer.frameLocator('iframe.h5p-iframe').locator('body');
   }
   const text=await findVisibleText(content,item);
   await page.waitForFunction(()=>{
     const stage=document.querySelector('p2lrn-player')?.shadowRoot?.querySelector('.p2lrn-stage');
     return !!stage&&!stage.hasAttribute('data-p2lrn-loading')&&!stage.hasAttribute('aria-busy');
   },null,{timeout:15000});
   if(item.navigateTo){
     assert.equal(await page.evaluate(()=>window.__p2lrnActivityLoadingSeen),true,
       'Activity navigation must show its loading indicator before runtime readiness');
     await page.evaluate(()=>window.__p2lrnLoadingObserver?.disconnect());
   }
   if(item.name==='h5p-crossword'){
     const controls=await content.locator('input,button,[role="button"],canvas').count();
     assert.ok(controls>0,'Crossword is visible but lacks interactive controls');
   }
   if(item.button){
    await player.frameLocator(item.frame).getByRole('button',{name:item.button}).click({timeout:10000});
    await findVisibleText(content,{marker:item.after,minimumText:20});
   }
   const violations=errors.filter(error=>/content security policy|not allowed to load local resource|refused to execute|refused to load/i.test(error));
   if(violations.length)
     throw new Error('Course visible but blocked by CSP: '+violations.slice(0,3).join(' | '));
   const image=join(screenshotRoot,item.name+'.png');
   try {
     // A long scrollable cmi5 course can exceed full-page screenshot limits
     // despite fully visible and operational activity content.
     await page.screenshot({path:image,fullPage:false,animations:'disabled',timeout:15000});
   } catch (captureError) {
     await player.screenshot({path:image,animations:'disabled',timeout:12000})
       .catch(fallbackError=>{throw new Error('Activity visible but screenshot unavailable: '+String(captureError)+'; '+String(fallbackError));});
   }
   results.push({case:item.name,status:'PASS',visibleTextLength:text.length,preview:text.slice(0,220),errors});
  }catch(error){
   const image=join(screenshotRoot,item.name+'-FAIL.png');
   try{await page.screenshot({path:image,fullPage:false,animations:'disabled',timeout:7000});}catch{}
   const diagnostic=await page.evaluate(()=>{
    const p=document.querySelector('p2lrn-player');
    return {
      state:document.querySelector('[data-runtime-state]')?.textContent,
      viewerLog:document.querySelector('[data-event-log]')?.textContent?.slice(-5500),
      playerStage:p?.shadowRoot?.querySelector('.p2lrn-stage')?.textContent?.slice(0,1000),
      playerHtml:p?.shadowRoot?.querySelector('.p2lrn-stage')?.innerHTML?.slice(0,1200),
    };
   }).catch(err=>({diagnosticError:String(err)}));
   results.push({case:item.name,status:'FAIL',reason:String(error?.message??error).slice(0,900),diagnostic,errors});
  }finally{await page.close();}
 }
 await verifyLocalPackageUpload('/demo/','es');
 await verifyLocalPackageUpload('/en/demo/','en');
}finally{
 await browser.close();
 await new Promise(r=>server.close(r));
}
await writeFile(join(screenshotRoot,'report.json'),JSON.stringify({results},null,2));
console.log('P2LRN_EXTERNAL_DEMO_CSP='+demoCsp);
console.log('P2LRN_EXTERNAL_BROWSER_VISUAL_QA='+JSON.stringify({results}));
if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
