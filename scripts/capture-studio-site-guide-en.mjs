import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..');
const dest=join(root,'reports','studio-preview-evidence','site-guide');
const {chromium}=await import(pathToFileURL(join(root,'.p2lrn-i18n-ci','node_modules','playwright-core','index.mjs')).href);
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run']});
const p=await b.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1,locale:'en-US'});
const entries=[],errors=[];p.on('pageerror',e=>errors.push(e.message));
async function shot(name,clip,description){
 const file=join(dest,name+'.png');
 await p.screenshot({path:file,clip,animations:'disabled'});
 const bytes=(await readFile(file)).length;
 if(bytes<3500)errors.push('Small screenshot '+name);
 entries.push({name,file,bytes,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),description,...clip});
}
try{
 const response=await p.goto('http://127.0.0.1:5533/en/studio/',{waitUntil:'domcontentloaded',timeout:25000});
 if(response.status()!==200)throw Error('English Studio not HTTP 200');
 await p.waitForFunction(()=>document.documentElement.dataset.p2lrnStudioReady==='true',{timeout:30000});
 await p.waitForTimeout(650);
 const initial=await p.evaluate(()=>({lang:document.documentElement.lang,newCourse:document.body.innerText.includes('New course'),toolbar:document.querySelector('[data-toolbar]')?.innerText.slice(0,300)}));
 if(initial.lang!=='en'||!initial.newCourse)throw Error('Not the expected English interface');
 await shot('en-editor-real',{x:16,y:370,width:1408,height:590},'Real English editor with the new course controls, format ribbon, course tree and lesson');
 await shot('en-new-open',{x:15,y:435,width:1410,height:85},'New course, Open file, Open URL options');
 await shot('en-action-toolbar',{x:16,y:532,width:1408,height:65},'Edit, Learner preview, Add content, New unit, New lesson and Save/Export');
 await shot('en-format-toolbar',{x:16,y:596,width:1408,height:64},'Paragraph, font, size, bold, italics, underline, strikethrough and alignment');
 await shot('en-course-tree',{x:16,y:674,width:280,height:285},'Course tree with New course, Unit 1 and First lesson');
 await shot('en-lesson-canvas',{x:309,y:674,width:1114,height:285},'First lesson editor, new course without made-up content');
 await shot('en-save-export',{x:890,y:532,width:532,height:65},'Save draft, Export .p2lrn, Offline delivery and Review delivery');
 await p.getByRole('button',{name:'Add content',exact:true}).click();
 await p.waitForTimeout(350);
 const dlg=p.locator('dialog:visible').first();
 if(!(await dlg.count())){errors.push('Add content dialog did not open')}
 else{
  const file=join(dest,'en-add-content-dialog.png');
  await dlg.screenshot({path:file,animations:'disabled'});
  entries.push({name:'en-add-content-dialog',file,bytes:(await readFile(file)).length,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),description:'Real Add content dialog in English'});
  await p.keyboard.press('Escape').catch(()=>{});
  if(await dlg.isVisible()){const c=dlg.getByRole('button',{name:/close|cerrar/i}).first();if(await c.count())await c.click()}
 }
 const preview=p.getByRole('button',{name:'Learner preview',exact:true});
 await preview.click();await p.waitForTimeout(1600);
 await shot('en-learner-preview',{x:16,y:370,width:1408,height:590},'Learner preview for a blank sample; no claims of results or scoring');
 const report={source:'Chrome, real /en/studio/ user interface',initial,entries,errors};
 await writeFile(join(dest,'capture-en-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({ok:errors.length===0,entries:entries.map(x=>({name:x.name,bytes:x.bytes})),errors,initial}));
}finally{await b.close()}
