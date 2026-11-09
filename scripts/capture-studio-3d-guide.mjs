import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..');
const {chromium}=await import(pathToFileURL(join(root,'.p2lrn-i18n-ci/node_modules/playwright-core/index.mjs')).href);
const origin=(process.argv.find(x=>x.startsWith('--origin='))?.slice('--origin='.length)||'http://127.0.0.1:5533').replace(/\/$/,'');
const dest=join(root,'reports/studio-preview-evidence/site-guide');
await mkdir(dest,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run','--disable-background-networking']});
const cases=[
 ['3d-order','Juego 3D'],
 ['3d-connect','Relacionar 3D'],
 ['3d-classify','Clasificar 3D'],
 ['3d-assembly','Ensamblaje 3D']
];
const report={origin,at:new Date().toISOString(),cases:[],errors:[]};
const sha=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
try{
 for(const [id,label] of cases){
  const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1,locale:'es-ES'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   const response=await page.goto(origin+'/studio/',{waitUntil:'domcontentloaded',timeout:30000});
   if(response?.status()!==200)throw Error('HTTP '+response?.status());
   await page.waitForFunction(()=>document.documentElement.dataset.p2lrnStudioReady==='true',{timeout:20000});
   await page.getByRole('tab',{name:'Insertar'}).click();
   await page.locator('button:visible').filter({hasText:/A.adir contenido/}).first().click();
   const dialog=page.locator('dialog.p2lrn-activity-picker').first();
   if(!(await dialog.count()))throw Error('Add content dialog missing');
   if(id==='3d-order'){
    const name='12-add-content-dialog.png',file=join(dest,name);
    await dialog.screenshot({path:file,animations:'disabled'});
    report.contentDialog={file,sha256:await sha(file)};
   }
   const option=dialog.locator('button').filter({hasText:new RegExp('^'+label)}).first();
   if(!(await option.count()))throw Error('Activity option not found: '+label);
   await option.click();
   await page.waitForTimeout(2400);
   const info=await page.evaluate(()=>{
    const visible=x=>!!x.getClientRects().length;
    return {
      title:document.title,
      canvases:[...document.querySelectorAll('canvas')].filter(visible).map(x=>({width:x.width,height:x.height})).slice(0,10),
      text:(document.querySelector('[data-editor-stage]')?.innerText||document.body.innerText).slice(-2000),
      buttons:[...document.querySelectorAll('button')].filter(visible).map(x=>x.textContent.trim().slice(0,50)).filter(Boolean).slice(-50)
    };
   });
   const file=join(dest,id+'-teacher.png');
   await page.screenshot({path:file,clip:{x:16,y:90,width:1408,height:852},animations:'disabled'});
   report.cases.push({id,label,created:true,errors,info,file,sha256:await sha(file)});
  }catch(e){errors.push(String(e));report.cases.push({id,label,created:false,errors});}
  await page.close();
 }
}finally{
 await browser.close();
 await writeFile(join(dest,'capture-3d-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2).slice(0,22500));
}
