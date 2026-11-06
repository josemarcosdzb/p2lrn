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
const communityOnly=process.argv.includes('--community-only');
const cases=[
 {name:'cmi5-geology-pretest',course:'/examples/canonical/external/cmi5-catapult-pre-post.p2lrn',frame:'iframe.p2lrn-package-runtime',marker:/pre.?test|question|geology|pregunta|assessment|test/i,minimumText:30},
 {name:'cmi5-geology-content-1',course:'/examples/canonical/external/cmi5-catapult-pre-post.p2lrn',navigateTo:'Content',navigateIndex:0,frame:'iframe.p2lrn-package-runtime',marker:/geology|earth|content|next|previous|rock|page/i,minimumText:28},
 {name:'cmi5-geology-content-2',course:'/examples/canonical/external/cmi5-catapult-pre-post.p2lrn',navigateTo:'Content',navigateIndex:1,frame:'iframe.p2lrn-package-runtime',marker:/geology|earth|content|next|previous|rock|page/i,minimumText:28},
 {name:'cmi5-geology-posttest',course:'/examples/canonical/external/cmi5-catapult-pre-post.p2lrn',navigateTo:'Post-test',navigateIndex:0,frame:'iframe.p2lrn-package-runtime',marker:/post.?test|geology|assessment|question|test/i,minimumText:28},
 {name:'scorm12-interactive',course:'/examples/generated/scorm12-browser-demo.p2lrn',frame:'iframe.p2lrn-scorm-runtime',marker:/Lección SCORM interactiva/,minimumText:70,button:'Completar lección',after:/Lección completada/},
 {name:'qti3-interactive',course:'/examples/generated/qti3-interactive-demo.p2lrn',marker:/Marte|planeta rojo/,minimumText:70},
 {name:'h5p-crossword',course:'/examples/canonical/external/h5p-crossword.p2lrn',frame:'iframe.p2lrn-h5p-frame',marker:/across|down|check|show solution|crucigrama|crossword|palabra/i,minimumText:12},
];
// Community examples are included as source-backed E2E cases, not just checked as ZIPs.
// The exact 19 entry list is maintained by immutable provenance and the site catalog.
const community=JSON.parse(await readFile(join(root,'examples','canonical','external','free','provenance.json'),'utf8'));
const familyFrame={h5p:'iframe.p2lrn-h5p-frame',scorm:'iframe.p2lrn-scorm-runtime'};
for(const entry of community.samples){
  const file='/examples/canonical/external/free/'+entry.slug+'.p2lrn';
  cases.push({
    name:'community-'+entry.slug,kind:entry.kind,
    course:file,frame:familyFrame[entry.kind]||null,
    minimumText:entry.kind==='scorm'?24:entry.kind==='h5p'?10:entry.kind==='imscc'?20:20,
    marker:null,sourceSha256:entry.sourceSha256,
  });
  if(entry.kind==='qti')cases.push({
    name:'community-'+entry.slug+'-second-item',kind:'qti',
    course:file,navigateTo:'geography',navigateIndex:0,minimumText:20,marker:/Paris|France/i,
    sourceSha256:entry.sourceSha256,
  });
}
async function findVisibleText(locator,{minimumText=30,marker=null}={}){
 let result='';
 for(let n=0;n<35;n++){
  result=String(await locator.innerText({timeout:12000}).catch(()=>'' )).trim();
  if(/^Falta el atributo src del paquete \.p2lrn\.?$/u.test(result)) { await new Promise(r=>setTimeout(r,450));continue; }
  if(result.length>=minimumText&&(!marker||marker.test(result)))return result;
  await new Promise(r=>setTimeout(r,450));
 }
 throw Error('Content was missing/empty. textLength='+result.length+' bodyText='+result.slice(0,650));
}
try{
 // Verify both public-facing gallery languages and the complete 19-item catalog.
 for(const [route,filterName] of [['/docs/ejemplos/','es'],['/en/docs/examples/','en']]){
   const page=await browser.newPage({viewport:{width:1280,height:820}});
   try{
     await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:25000});
     const rows=page.locator('[data-community-examples] .p2lrn-community-item');
     await page.waitForFunction(expected=>
       document.querySelectorAll('[data-community-examples] .p2lrn-community-item').length===expected,
       community.samples.length,{timeout:25000});
     assert.equal(await rows.count(),community.samples.length,filterName+' gallery count');
     const filter=page.locator('[data-community-examples] select');
     const counts=Object.fromEntries(['scorm','h5p','qti','imscc'].map(kind=>[
       kind,community.samples.filter(x=>x.kind===kind).length]));
     for(const [kind,count] of Object.entries(counts)){
       await filter.selectOption(kind);
       assert.equal(await rows.count(),count,filterName+' gallery '+kind+' count');
     }
     await filter.selectOption('all');
     const search=page.locator('[data-community-examples] input[type="search"]');
     await search.fill('crossword');
     assert.equal(await rows.count(),1,filterName+' gallery search');
     await search.fill('');
     assert.equal(await rows.count(),community.samples.length,'Gallery clear search');
     const links=await rows.locator('a').evaluateAll(els=>els.map(el=>el.href));
     assert(links.some(x=>x.includes('/demo/?src=')||x.includes('/en/demo/?src=')),
       'Gallery lacks Player links');
     const screenshot=join(screenshotRoot,filterName+'-community-gallery.png');
     await page.screenshot({path:screenshot,fullPage:false,animations:'disabled',timeout:12000});
     results.push({case:filterName+'-community-gallery',status:'PASS',count:community.samples.length,formats:counts,search:true,links:true});
   }catch(e){
     results.push({case:filterName+'-community-gallery',status:'FAIL',reason:String(e?.message??e)});
     await page.screenshot({path:join(screenshotRoot,filterName+'-gallery-FAIL.png'),timeout:7000}).catch(()=>{});
   }finally{await page.close();}
 }
 for(const item of cases.filter(entry=>!communityOnly||entry.name.startsWith('community-'))){
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
     await button.click({timeout:20000});
   }
   // Do not classify a loading placeholder as successfully displayed content.
   // A package entrypoint may be valid while its first activity fails to render.
   await page.waitForFunction(()=>
     document.querySelector('[data-event-log]')?.textContent?.includes('p2lrn:rendered') ||
     document.querySelector('[data-runtime-state]')?.dataset.state==='error',
     null,{timeout:40000});
   if(item.frame)await player.locator(item.frame).waitFor({timeout:25000});
   let content=item.frame?player.frameLocator(item.frame).locator('body'):player.locator('.p2lrn-stage');
   if(item.name==='h5p-crossword'||item.kind==='h5p'){
     const outer=player.frameLocator(item.frame);
     // Opaque H5P runs directly in this frame. Do not wait 22 seconds for
     // an inner iframe that deliberately does not exist in this topology.
     if(!(await outer.locator('.h5p-content').count())){
       const nested=outer.locator('iframe.h5p-iframe');
       if(await nested.waitFor({timeout:5500}).then(()=>true).catch(()=>false))
         content=outer.frameLocator('iframe.h5p-iframe').locator('body');
     }
   }
   const text=await findVisibleText(content,item);
   // Require actual activity content, not a Player shell or a 'preserved only' placeholder.
   let interaction={attempted:false,verified:false,kind:null};
   if(item.kind){
     const stageText=String(await player.locator('.p2lrn-stage').innerText().catch(()=>'')).trim();
     if(/no ejecutable por este Player|no local HTML launch|has no local HTML|no se puede reproducir|unable to render|no renderer/i.test(text+' '+stageText))
       throw Error('Source package is preserved but no executable activity is rendered: '+(text+' '+stageText).slice(0,300));
     if(item.kind==='qti'){
       const qti=player.locator('.p2lrn-qti');
       await qti.waitFor({timeout:9000});
       assert((await qti.locator('input[type="radio"]').count())>=2,
         'QTI choice interaction is missing from the real DOM');
       // The example fixture includes a real correctResponse=B for the first
       // item and C for the second; this is informational, not official scoring.
       const expected=item.name.includes('second-item')?'C':'B';
       await qti.locator('input[type="radio"][value="'+expected+'"]').check({timeout:9000});
       await qti.getByRole('button',{name:'Enviar respuestas'}).click({timeout:9000});
       await page.waitForFunction(()=>document.querySelector('[data-event-log]')?.textContent?.includes('p2lrn:complete'),null,{timeout:11000});
       const eventLog=await page.locator('[data-event-log]').innerText();
       assert(eventLog.includes('"simpleMatchCorrect": true')||eventLog.includes('"simpleMatchCorrect":true'),
         'QTI correct-response feedback did not match the example fixture');
       interaction={attempted:true,verified:true,kind:'answer-and-complete',authoritative:false};
     }else if(item.kind==='h5p'){
       const widget=content.locator('.h5p-content,.h5p-container,.h5p-question,.h5p-interactive-video,video,canvas');
       assert((await widget.count())>0,'H5P real content root or media control did not initialize');
       const controls=content.locator('button:visible,input:visible,select:visible,[role="button"]:visible,video:visible,canvas:visible');
       assert((await controls.count())>0,'H5P rendered but exposes no interactive control');
       const button=content.getByRole('button',{name:/^(?:start|begin|next|check|submit|show|play|continue|comprobar|enviar|siguiente|empezar|iniciar)/i}).first();
       if(await button.isVisible().catch(()=>false)){
         const beforeText=await content.innerText().catch(()=>'');
         await button.click({timeout:7000});
         const afterText=await content.innerText().catch(()=>'');
         interaction={attempted:true,verified:beforeText!==afterText,kind:'h5p-button-click'};
       }else interaction={attempted:false,verified:false,kind:'manual-interaction-required'};
     }else if(item.kind==='scorm'){
       assert((await player.locator('iframe.p2lrn-scorm-runtime').count())===1,'SCORM runtime iframe not mounted');
       const inputs=content.locator('button:visible,input:visible,a:visible');
       if((await inputs.count())>0){
         interaction={attempted:false,verified:false,kind:'scorm-controls-visible',controls:await inputs.count()};
         const next=content.getByRole('button',{name:/^(?:next|continue|siguiente|continuar)$/i}).first();
         if(await next.isVisible().catch(()=>false) && await next.isEnabled().catch(()=>false)){
           const before=await content.innerText();
           await next.click({timeout:9000});
           const after=await content.innerText();
           interaction={attempted:true,verified:after!==before,kind:'scorm-next-step',controls:await inputs.count()};
         }
       }else interaction={attempted:false,verified:false,kind:'no-interaction-exposed'};
     }else if(item.kind==='imscc'){
       const htmlIframe=player.locator('iframe.p2lrn-package-runtime');
       interaction={attempted:false,verified:false,kind:(await htmlIframe.count())>0?'imscc-html-rendered':'imscc-resources-only'};
       if(interaction.kind==='imscc-resources-only'){
          // This is a useful packaging result but does not qualify as
          // successful runnable course playback.
          throw Error('IMS Common Cartridge resource inventory shown without a launchable activity');
       }
     }
     const runtimeState=String(await page.locator('[data-runtime-state]').innerText().catch(()=>''));
     if(runtimeState==='ERROR')throw Error('Viewer runtime entered ERROR after rendering '+item.name);
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
   results.push({case:item.name,status:'PASS',visibleTextLength:text.length,preview:text.slice(0,220),interaction,errors});
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
}finally{
 await browser.close();
 await new Promise(r=>server.close(r));
}
await writeFile(join(screenshotRoot,'report.json'),JSON.stringify({results},null,2));
console.log('P2LRN_EXTERNAL_DEMO_CSP='+demoCsp);
console.log('P2LRN_EXTERNAL_BROWSER_VISUAL_QA='+JSON.stringify({results}));
if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
