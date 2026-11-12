// Real-Chrome QA of the canonical Studio multipart control.
// Run only against a local build of the current commit; never use screenshots
// from production when the functionality is not deployed.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const origin=(process.argv.find(a=>a.startsWith('--origin='))?.slice(9)
  ||'http://127.0.0.1:5533').replace(/\/$/,'');
const output=join(root,'reports','studio-preview-evidence','site-guide');
const pw=join(root,'.p2lrn-i18n-ci','node_modules','playwright-core','index.mjs');
const {chromium}=await import(pathToFileURL(pw).href);
const browser=await chromium.launch({
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:true,args:['--no-first-run','--disable-sync','--disable-background-networking']
});
const captures=[];
try{
  await mkdir(output,{recursive:true});
  for(const [lang,path,menuTitle,entryTitle,fieldTitle] of [
    ['es','/studio/','Archivo','Dividir paquete (multipart)…','Tamaño de cada parte (MiB)'],
    ['en','/en/studio/','File','Split package (multipart)…','Part size (MiB)'],
  ]){
    const page=await browser.newPage({viewport:{width:1440,height:960},locale:lang==='es'?'es-ES':'en-US'});
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error.message)));
    const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:30000});
    if(response?.status()!==200)throw new Error(lang+' page HTTP '+response?.status());
    await page.waitForFunction(()=>document.documentElement.dataset.p2lrnStudioReady==='true');
    const menu=page.locator('summary').filter({hasText:menuTitle}).first();
    await menu.click();
    const trigger=page.locator('[data-studio-multipart-entry]');
    if((await trigger.innerText()).trim()!==entryTitle)throw new Error(lang+' multipart entry is not translated');
    await trigger.click();
    const dialog=page.locator('dialog.p2lrn-multipart-dialog');
    await dialog.waitFor({state:'visible'});
    const input=dialog.locator('input[data-studio-multipart-part-size]');
    if(!(await input.count()))throw new Error(lang+' part-size input missing');
    if((await input.inputValue())!=='25')throw new Error(lang+' default part size must be 25 MiB');
    const label=await input.locator('xpath=..').innerText();
    if(!label.includes(fieldTitle))throw new Error(lang+' accessible field label missing');
    const filename='multipart-studio-'+lang+'-chrome.png';
    const filepath=join(output,filename);
    await dialog.screenshot({path:filepath,animations:'disabled'});
    const bytes=await readFile(filepath);
    if(bytes.length<3500)throw new Error(lang+' screenshot is abnormally small');
    if(errors.length)throw new Error(lang+' browser exceptions: '+errors.join(' | '));
    captures.push({lang,filepath,size:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex'),
      field:fieldTitle,value:25,chrome:true});
    await page.close();
  }
}finally{await browser.close();}
const report={ok:true,source:'Real Chrome / locally built Studio, not production',
  origin,commit:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  captures};
await writeFile(join(output,'multipart-capture-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
