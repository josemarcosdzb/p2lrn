import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Reuses the project's existing Playwright and a real Chrome browser.
const root=resolve(import.meta.dirname,'..');
const pwFile=join(root,'.p2lrn-i18n-ci','node_modules','playwright-core','index.mjs');
const {chromium}=await import(pathToFileURL(pwFile).href);
const origin=(process.argv.find(a=>a.startsWith('--origin='))?.split('=').slice(1).join('=')??'http://127.0.0.1:5533').replace(/\/$/,'');
const output=join(root,'reports','studio-preview-evidence','site-guide');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run','--disable-sync','--disable-background-networking']});
const sha=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const report={origin,capturedAt:new Date().toISOString(),gitCommit:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),captureSource:'Chrome real; sitio local',screens:[],errors:[],limitations:[]};
await mkdir(output,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1,locale:'es-ES'});
page.on('pageerror',error=>report.errors.push('studio:'+error.message));
async function shot(name,clip,description){
 const file=join(output,name+'.png');
 await page.screenshot({path:file,clip,animations:'disabled'});
 const bytes=(await readFile(file)).length;
 if(bytes<5000)report.errors.push('Unexpectedly small screenshot '+name+': '+bytes+' B');
 report.screens.push({id:name,description,file,sha256:await sha(file),bytes,width:Math.round(clip.width),height:Math.round(clip.height)});
}
async function trigger(label){
 const button=page.locator('button:visible').filter({hasText:new RegExp('^'+label+'$')}).first();
 if(await button.count()){await button.click();await page.waitForTimeout(280);return true}
 return false;
}
try{
 const response=await page.goto(origin+'/studio/',{waitUntil:'domcontentloaded',timeout:30000});
 if(response?.status()!==200)throw Error('Studio HTTP '+response?.status());
 await page.waitForFunction(()=>document.documentElement.dataset.p2lrnStudioReady==='true',{timeout:30000});
 await page.waitForTimeout(700);
 const course=join(root,'reports','curso-tierra','viaje-al-centro-de-la-tierra.p2lrn');
 try{
   await page.locator('input[data-file]').first().setInputFiles(course);
   await page.waitForTimeout(1800);
   report.courseImported=(await page.locator('body').innerText()).includes('viaje-al-centro-de-la-tierra');
 }catch(e){report.limitations.push('Could not import real Earth course: '+String(e).slice(0,150))}
 try{
  const lesson=page.getByRole('button',{name:/N?cleo interno/i}).first();
  if(await lesson.count()){await lesson.click();await page.waitForTimeout(650);report.lessonSelected='N?cleo interno'}
 }catch(e){report.limitations.push('Cannot select example lesson: '+String(e).slice(0,160))}
 report.ui=await page.evaluate(()=>({title:document.title,ready:document.documentElement.dataset.p2lrnStudioReady,controls:[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length).map(b=>b.textContent.trim().replace(/\s+/g,' ').slice(0,70)).filter(Boolean).slice(0,80)}));
 await shot('01-editor-overview',{x:16,y:90,width:1408,height:852},'Editor visual con barra superior, herramientas, estructura y lienzo');
 await shot('02-header-controls',{x:15,y:90,width:1410,height:100},'Archivo, Guardar, Editar, Vista alumno y pestañas');
 await shot('03-format-toolbar',{x:16,y:164,width:1050,height:126},'Comandos reales de formato; recorte sin el visor');
 await shot('04-course-tree',{x:16,y:335,width:262,height:400},'Arbol real de curso, unidad y leccion');
 await shot('05-lesson-canvas',{x:290,y:337,width:1110,height:510},'Lienzo de la leccion seleccionada');
 const fileMenu=page.locator('summary:visible').filter({hasText:'Archivo'}).first();
 if(await fileMenu.count()){
   await fileMenu.click();
   await shot('11-file-menu',{x:1050,y:99,width:365,height:520},'Menu Archivo: nuevo, abrir, guardar y exportar');
   await fileMenu.click();
 }
 if(await trigger('Insertar')){
   await shot('06-insert-menu',{x:16,y:164,width:1310,height:165},'Pestana Insertar: herramientas reales disponibles');
   report.insertControls=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length).map(b=>b.textContent.trim().replace(/\s+/g,' ').slice(0,65)).filter(Boolean).slice(0,95));
 }else report.limitations.push('Insertar menu was not available by exact button name');
 if(await trigger('Formato')) await shot('07-format-return',{x:16,y:164,width:1050,height:130},'Retorno a formato');
 const preview=page.locator('[data-ui-action="preview"]:visible').first();
 if(await preview.count()){
   await preview.click();await page.waitForTimeout(1300);
   await shot('08-student-view',{x:16,y:90,width:1408,height:850},'Vista alumno activada en Studio');
   report.preview={mode:await page.evaluate(()=>document.documentElement.dataset.studioMode),playerCount:await page.locator('p2lrn-player').count()};
 }else report.limitations.push('Preview toggle not found');
 const desktop=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1,locale:'es-ES'});
 desktop.on('pageerror',error=>report.errors.push('viewer:'+error.message));
 const src='/examples/generated/scorm12-browser-demo.p2lrn';
 const viewer=await desktop.goto(origin+'/demo/?src='+encodeURIComponent(src),{waitUntil:'domcontentloaded',timeout:35000});
 await desktop.waitForTimeout(3800);
 if(viewer?.status()===200){
   const file=join(output,'09-real-player.png');
   await desktop.screenshot({path:file,animations:'disabled'});
   report.screens.push({id:'09-real-player',description:'Visor existente cargando paquete SCORM; no equivale a certificar actividades',file,sha256:await sha(file),bytes:(await readFile(file)).length,width:1440,height:960});
   report.viewer={title:await desktop.title(),playerCount:await desktop.locator('p2lrn-player').count(),statusText:(await desktop.locator('body').innerText()).slice(0,600)};
 }else report.errors.push('Viewer HTTP '+viewer?.status());
 await desktop.close();
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,locale:'es-ES'});
 await mobile.goto(origin+'/studio/',{waitUntil:'domcontentloaded',timeout:35000});
 await mobile.waitForTimeout(700);
 const file=join(output,'10-studio-mobile.png');
 await mobile.screenshot({path:file,animations:'disabled'});
 report.screens.push({id:'10-studio-mobile',description:'Studio viewport movil autentico',file,sha256:await sha(file),bytes:(await readFile(file)).length,width:390,height:844});
 await mobile.close();
}finally{
 await browser.close();
 await writeFile(join(output,'capture-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({ok:report.errors.length===0,screens:report.screens.map(x=>({name:x.id,bytes:x.bytes})),errors:report.errors,limitations:report.limitations,ui:report.ui,preview:report.preview,viewer:report.viewer},null,2));
}
