import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {join,resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {renderSiteFooter} from '../deploy/netlify/site-footer.mjs';
import {existsSync} from 'node:fs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const built=process.argv.includes('--built');
const source=built?join(root,'.netlify-cdn'):join(root,'deploy','netlify','site');
const playwrightPath=join(root,'.license-browser-qa','node_modules','playwright-core','index.mjs');
const {chromium}=await import(pathToFileURL(playwrightPath).href);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.md':'text/markdown'};
function findChrome(){
  if(process.env.P2LRN_BROWSER_EXE&&existsSync(process.env.P2LRN_BROWSER_EXE))return process.env.P2LRN_BROWSER_EXE;
  for(const base of [process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA].filter(Boolean)){
    for(const path of ['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe']){
      const exe=join(base,path);if(existsSync(exe))return exe;
    }
  }
  throw new Error('Chrome/Edge not installed; browser QA not executed');
}
async function responseFile(pathname){
  const path=decodeURIComponent(pathname);
  if(path.includes('\\')||path.split('/').includes('..'))return null;
  const target=resolve(source,path.replace(/^\//,'')+(path.endsWith('/')?'index.html':''));
  if(!target.startsWith(source+sep))return null;
  try{const s=await stat(target);return s.isFile()?target:null;}catch{return null;}
}
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const requested=url.pathname==='/LICENSE'?join(root,'LICENSE'):url.pathname==='/NOTICE.md'?join(root,'NOTICE.md'):await responseFile(url.pathname);
    if(!requested){res.writeHead(404);res.end('Not found');return;}
    let bytes=await readFile(requested);
    if(extname(requested)==='.html'&&!built){
      const rel=url.pathname,lang=rel.startsWith('/en/')?'en':'es';
      let html=bytes.toString('utf8');
      const main=html.toLowerCase().lastIndexOf('</main>');
      const tail=html.slice(main+7);
      const match=/<footer\b[^>]*>[\s\S]*?<\/footer>/i.exec(tail);
      if(!match)throw new Error('Page footer missing: '+rel);
      html=html.slice(0,main+7)+tail.replace(match[0],renderSiteFooter(lang));
      bytes=Buffer.from(html);
    }
    res.writeHead(200,{'Content-Type':mime[extname(requested)]??'application/octet-stream','Cache-Control':'no-store'});
    res.end(bytes);
  }catch(error){res.writeHead(500);res.end(error.message);}
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:findChrome(),args:['--no-first-run']});
const page=await browser.newPage();
const result={ok:false,mode:built?'compiled-site':'source-with-shared-footer',viewports:[],routes:[],footerLinks:0,commercialForm:true};
try{
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:840});
    for(const lang of ['es','en']){
      const url=lang==='es'?'/licencia/':'/en/licencia/';
      const response=await page.goto(base+url,{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200,'Missing license route: '+url);
      const footer=page.locator('footer.site-footer');
      assert.equal(await footer.count(),1);
      const git=footer.locator('a[href="https://github.com/josemarcosdzb/p2lrn"]');
      assert.equal(await git.count(),1,'GitHub link missing');
      assert.equal(await git.getAttribute('target'),'_blank');
      assert.match(await git.getAttribute('rel'),/noopener noreferrer/);
      const credit=footer.locator('.site-footer__credit');
      assert.equal(await credit.count(),1,'Creator credit missing');
      assert.equal((await credit.innerText()).replace(/\s+/g,' ').trim(),(lang==='es'?'Creado por':'Created by')+' Jose Marcos Diaz');
      const geometry=await page.evaluate(()=>{
        const f=document.querySelector('footer.site-footer'),last=f.querySelector('.site-footer__bottom'),credit=f.querySelector('.site-footer__credit');
        const a=f.getBoundingClientRect(),b=last.getBoundingClientRect(),c=credit.getBoundingClientRect();
        return {footerWidth:a.width,documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,creditBelowBottom:c.top>=b.bottom-1,creditWithinFooter:c.bottom<=a.bottom+2};
      });
      assert(geometry.creditBelowBottom&&geometry.creditWithinFooter,'Credit is not beneath all legal links');
      assert(geometry.documentWidth<=width+3,'Unexpected horizontal overflow at '+width+' '+lang);
      const commercial=page.locator('a[href="'+(lang==='es'?'/contacto/':'/en/contacto/')+'#solicitar-licencia"]');
      assert.equal(await commercial.count(),1);
      const table=page.locator('.license-table-scroll');
      assert.equal(await table.count(),1);
      assert.equal(await table.getAttribute('tabindex'),'0');
      const disclosures=page.locator('.license-faq');
      assert.equal(await disclosures.count(),6);
      await disclosures.first().locator('summary').click();
      assert(await disclosures.first().evaluate(x=>x.open),'FAQ does not open');
      result.viewports.push({lang,width,geometry});
    }
  }
  for(const lang of ['es','en']){
    const href=(lang==='es'?'/contacto/':'/en/contacto/')+'#solicitar-licencia';
    await page.goto(base+href,{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('form#solicitar-licencia[data-contact-form]').count(),1);
    assert.equal(await page.locator('form#solicitar-licencia input[name="subject"]').count(),1);
    result.routes.push(href);
  }
  result.ok=true;
  result.footerLinks=1;
  console.log('P2LRN_LICENSE_FOOTER_BROWSER_QA='+JSON.stringify(result));
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
