import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,stat,readdir,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,extname,join,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {ENGLISH_ROUTES,SPANISH_ROUTES,englishRouteFor} from '../deploy/netlify/site-routes.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const site=join(repo,'deploy','netlify','site');
const toolkit=join(repo,'packages','toolkit','web');
const analyticsSrc=join(repo,'packages','analytics','src');
const playwrightFile=join(repo,'.p2lrn-i18n-ci','node_modules','playwright-core','index.mjs');
const {chromium}=await import(pathToFileURL(playwrightFile).href);
const contentTypes={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
function chromeBinary(){
  if(process.platform!=='win32'){
    const installed=chromium.executablePath();
    if(existsSync(installed))return installed;
    throw Error('Playwright Chromium is not installed on the Linux browser runner.');
  }
  const bases=[process.env.P2LRN_BROWSER_EXE,process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA].filter(Boolean);
  if(process.env.P2LRN_BROWSER_EXE&&existsSync(process.env.P2LRN_BROWSER_EXE))return process.env.P2LRN_BROWSER_EXE;
  for(const root of bases){
    for(const name of ['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe'])
      if(existsSync(join(root,name)))return join(root,name);
  }
  throw Error('No Chrome/Edge executable available on the Windows runner. Browser tests are NOT certified.');
}
async function fileFor(urlPath){
  const clean=decodeURIComponent(urlPath.split('?')[0]);
  if(clean.includes('\\')||clean.split('/').includes('..'))return null;
  // Serve exactly the immutable open-source assets copied by the CDN build.
  const vendor={
    '/toolkit-web/vendor/three.module.js':join(repo,'.p2lrn-i18n-ci','node_modules','three','build','three.module.js'),
    '/toolkit-web/vendor/three.core.js':join(repo,'.p2lrn-i18n-ci','node_modules','three','build','three.core.js'),
    '/toolkit-web/vendor/rapier3d.mjs':join(repo,'.p2lrn-i18n-ci','node_modules','@dimforge','rapier3d-compat','dist','rapier.mjs')
  };
  if(Object.hasOwn(vendor,clean))return existsSync(vendor[clean])?vendor[clean]:null;
  // The real Player vendor build also copies these Three.js addons and
  // rewrites their bare "three" imports. Reproduce that exact import layout
  // in the isolated browser test instead of serving incomplete source files.
  const addonRoot=join(repo,'.p2lrn-i18n-ci','node_modules','three','examples','jsm');
  const addons={
    '/toolkit-web/vendor/loaders/GLTFLoader.js':join(addonRoot,'loaders','GLTFLoader.js'),
    '/toolkit-web/vendor/utils/BufferGeometryUtils.js':join(addonRoot,'utils','BufferGeometryUtils.js'),
    '/toolkit-web/vendor/utils/SkeletonUtils.js':join(addonRoot,'utils','SkeletonUtils.js'),
  };
  if(Object.hasOwn(addons,clean))return existsSync(addons[clean])?addons[clean]:null;
  const routes=[
    ['/toolkit-web/',toolkit],
    ['/analytics-src/',analyticsSrc],
    ['/studio/runtime/',join(toolkit,'studio')],
    ['/studio/',join(toolkit,'')], // fallback only, source site takes precedence
  ];
  // Netlify publishes canonical English routes even though authored pages retain
  // their Spanish-named source directories. Resolve aliases like production does.
  const candidates=[join(site,clean.slice(1))];
  if(Object.hasOwn(SPANISH_ROUTES,clean))
    candidates.push(join(site,'en',SPANISH_ROUTES[clean].slice(1)));
  for(const [prefix,root] of routes)if(clean.startsWith(prefix))candidates.push(join(root,clean.slice(prefix.length)));
  for(let target of candidates){
    if(!target.startsWith(repo+sep))continue;
    try{
      let info=await stat(target);
      if(info.isDirectory())target=join(target,'index.html');
      info=await stat(target);
      if(info.isFile())return target;
    }catch{}
  }
  return null;
}
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const target=await fileFor(pathname);
    if(!target){res.writeHead(404);res.end('Not found');return;}
    let bytes=await readFile(target);
    if(/^\/toolkit-web\/vendor\/(?:loaders|utils)\/(?:GLTFLoader|SkeletonUtils|BufferGeometryUtils)\.js$/.test(pathname)){
      const source=bytes.toString('utf8');
      if(!source.includes("from 'three'"))throw Error('Pinned Three.js addon imports changed: '+pathname);
      bytes=Buffer.from(source.replaceAll("from 'three'","from '../three.module.js'"));
    }
    // The production Netlify build prepends these exact public route maps to
    // both JS bundles. Serve the same mapping in Chromium's isolated source server.
    if(pathname==='/p2lrn.js'||pathname==='/en/p2lrn.js'){
      const preamble='globalThis.__P2LRN_ENGLISH_ROUTES='+JSON.stringify(ENGLISH_ROUTES)+';\n'+
        'globalThis.__P2LRN_SPANISH_ROUTES='+JSON.stringify(SPANISH_ROUTES)+';\n';
      bytes=Buffer.from(preamble+bytes.toString('utf8'),'utf8');
    }
    res.writeHead(200,{'Content-Type':contentTypes[extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(bytes);
  }catch(e){res.writeHead(500);res.end(String(e));}
});
await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
const base='http://127.0.0.1:'+server.address().port;

const browser=await chromium.launch({executablePath:chromeBinary(),headless:true,args:['--no-first-run','--no-default-browser-check']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const exceptions=[];
page.on('pageerror',error=>exceptions.push(error.message));
page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());

async function siteParity(){
  async function pages(root,prefix=''){
    const out=[];
    for(const ent of await readdir(root,{withFileTypes:true})){
      if(ent.isDirectory()&&prefix===''&&ent.name==='en')continue;
      if(ent.isDirectory())out.push(...await pages(join(root,ent.name),prefix+ent.name+'/'));
      else if(ent.name==='index.html')out.push(prefix+'index.html');
    }
    return out;
  }
  const filenames=await pages(site);
  assert.ok(filenames.length>=60,'Spanish site has unexpectedly few pages');
  for(const filename of filenames){
    const [spanish,english]=await Promise.all([
      readFile(join(site,filename),'utf8'),readFile(join(site,'en',filename),'utf8')
    ]);
    assert.match(spanish,/<html[^>]+lang=["']es["']/i,'Missing ES language for '+filename);
    assert.match(english,/<html[^>]+lang=["']en["']/i,'Missing EN language for '+filename);
    for(const tag of ['form','input','button']){
      const pattern=new RegExp('<'+tag+'(?:\\s|>)','gi');
      assert.equal((spanish.match(pattern)||[]).length,(english.match(pattern)||[]).length,
        'Functional HTML parity error ('+tag+'): '+filename);
    }
  }
  const {updateHtml}=await import('./../deploy/netlify/site-seo-a11y.mjs');
  for(const [route,file] of [['/en/',join(site,'en','index.html')],['/en/docs/',join(site,'en','docs','index.html')]]){
    const html=updateHtml(await readFile(file,'utf8'),route);
    assert.match(html,/hreflang="es"/);
    assert.match(html,/hreflang="en"/);
    assert.match(html,/rel="canonical"/);
  }
  console.log('BROWSER_SITE_PARITY='+filenames.length+' ES/EN HTML route pairs');
}
async function browserNavigation(){
  for(const [route,english] of [['/',false],['/en/',true],['/docs/',false],['/en/docs/',true]]){
    const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    await page.locator('body > nav.language-switch').waitFor({timeout:7000});
    assert.equal(await page.locator('html').getAttribute('lang'),english?'en':'es');
    const nav=page.locator('body > nav.language-switch');
    assert.equal(await nav.locator('a[hreflang="es"]').count(),1);
    assert.equal(await nav.locator('a[hreflang="en"]').count(),1);
    assert.equal(await nav.locator('a[aria-current="page"]').getAttribute('hreflang'),english?'en':'es');
  }
  await page.goto(base+'/en/docs/',{waitUntil:'domcontentloaded'});
  await page.locator('nav.language-switch a[hreflang="es"]').click();
  await page.waitForURL(base+'/docs/');
  assert.equal(await page.locator('html').getAttribute('lang'),'es');
  await page.locator('nav.language-switch a[hreflang="en"]').click();
  await page.waitForURL(base+'/en/docs/');
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  console.log('BROWSER_LANGUAGE_SWITCH=pass');
}
async function docsRoleNavigationChrome(language){
  const isEnglish=language==='en';
  const evidence=join(repo,'.p2lrn-i18n-ci','evidence');
  await mkdir(evidence,{recursive:true});
  const teacher=isEnglish?'/en/docs/collaboration/':'/docs/colaboracion/';
  const developer=isEnglish?'/en/docs/developers/collaboration/':'/docs/desarrolladores/colaboracion/';
  const portal=isEnglish?'/en/docs/developers/':'/docs/desarrolladores/';
  const npm=isEnglish?'/en/docs/npm/':'/docs/npm/';
  const teacherResponse=await page.goto(base+teacher,{waitUntil:'domcontentloaded'});
  assert.equal(teacherResponse?.status(),200,'Teacher collaboration page not found');
  await page.locator('.doc-sidebar a').first().waitFor({timeout:10000});
  if(isEnglish)console.log('BROWSER_EN_NAV_LINKS='+JSON.stringify(await page.locator('#nav a').evaluateAll(links=>links.map(link=>({href:link.getAttribute('href'),text:link.textContent?.trim(),visible:Boolean(link.getClientRects().length)})))));
  await page.locator('#nav > a[href="'+portal+'"]').waitFor({timeout:10000});
  assert.equal(await page.locator('#nav > details').count(),0,'Developer access must not be hidden in a dropdown');
  assert.equal(await page.locator('.doc-sidebar a[href="'+npm+'"]').count(),0,'Teacher sidebar must not display npm instructions');
  assert.equal(await page.locator('article.doc-content pre').count(),0,'Teacher guide must not require code');
  await page.screenshot({path:join(evidence,'docs-'+language+'-teacher.png'),fullPage:false});
  const devResponse=await page.goto(base+developer,{waitUntil:'domcontentloaded'});
  assert.equal(devResponse?.status(),200,'Developer collaboration page not found');
  await page.locator('.doc-sidebar a[href="'+npm+'"]').waitFor({timeout:10000});
  assert.ok(await page.locator('article.doc-content pre').count()>=2,'Developer reference lost its browser/server examples');
  assert.equal(await page.locator('#nav > details').count(),0,'Developer navigation must be directly visible');
  await page.screenshot({path:join(evidence,'docs-'+language+'-developer.png'),fullPage:false});
  console.log('BROWSER_DOCS_'+language.toUpperCase()+'_AUDIENCE_SEPARATION=PASS');
}

async function editorialDocsChrome(language){
  const en=language==='en';
  const evidence=join(repo,'.p2lrn-i18n-ci','evidence');
  await mkdir(evidence,{recursive:true});
  const guide=en?'/en/docs/studio/':'/docs/studio/';
  const developers=en?'/en/docs/developers/':'/docs/desarrolladores/';
  const gallery=en?'/en/docs/3d-games/':'/docs/juegos-3d/';
  const commercial=en?'/en/create-interactive-courses/':'/crear-cursos-interactivos/';
  const studioResponse=await page.goto(base+guide,{waitUntil:'domcontentloaded'});
  assert.equal(studioResponse?.status(),200,'Studio guide unavailable: '+language);
  const advice=page.locator('#studio-doc-informacion-adicional');
  assert.equal(await advice.locator('section.doc-section > h3').count(),9,
    'Studio guide must preserve nine clearly visible authoring topics');
  assert.equal(await page.locator('details.studio-doc-appendix').count(),0,
    'Teacher guidance must not remain hidden in a technical accordion');
  const first=advice.locator('#studio-apendice-1');
  await first.scrollIntoViewIfNeeded();
  assert.equal(await first.isVisible(),true,'First teacher topic is not visible');
  await page.screenshot({path:join(evidence,'editorial-'+language+'-studio-guidance.png')});
  await advice.locator('a[href="'+developers+'"]').click();
  await page.waitForURL(base+developers);
  assert.ok(await page.locator('h1').first().isVisible(),
    'The independent developer documentation did not open');

  const galleryResponse=await page.goto(base+gallery,{waitUntil:'domcontentloaded'});
  assert.equal(galleryResponse?.status(),200,'3D authoring guide unavailable');
  const area=page.locator('#ejemplos-reales-3d');
  assert.equal(await area.locator('img[src^="/assets/activity-examples/1"]').count(),4,
    'Expected four real 3D opening-screen images');
  const label=en?'Opening screen only:':'Pantalla inicial del juego:';
  assert.equal(await area.locator('figcaption').filter({hasText:label}).count(),4,
    'All 3D entry images must explicitly disclaim completion');
  const first3D=area.locator('figcaption').filter({hasText:label}).first();
  const openingImage=area.locator('#juego-3d-ordenar .p2lrn-example-shot img').first();
  await openingImage.scrollIntoViewIfNeeded();
  // A lazy-loaded image can have a visible <img> box with zero real pixels.
  // Never submit a blank screenshot as visual proof.
  await page.waitForFunction(()=>{
    const image=document.querySelector('#juego-3d-ordenar .p2lrn-example-shot img');
    return image?.complete&&image.naturalWidth>100&&image.naturalHeight>100;
  },null,{timeout:12000});
  await first3D.scrollIntoViewIfNeeded();
  await page.screenshot({path:join(evidence,'editorial-'+language+'-3d-entry.png')});

  const landingResponse=await page.goto(base+commercial,{waitUntil:'domcontentloaded'});
  assert.equal(landingResponse?.status(),200,'Commercial Studio page unavailable');
  const sourceText=en?'local Studio installation':'instalación local de Studio';
  const note=page.locator('p.studio-guide-warning').filter({hasText:sourceText}).first();
  await note.scrollIntoViewIfNeeded();
  assert.equal(await note.isVisible(),true,'Source of real Studio captures is not explained');
  await page.screenshot({path:join(evidence,'editorial-'+language+'-studio-provenance.png')});
  console.log('BROWSER_EDITORIAL_DOCS_'+language.toUpperCase()+'=PASS');
}

async function standardQuiz(language){
  await page.goto(base+(language==='en'?'/en/':'/'),{waitUntil:'domcontentloaded'});
  await page.locator('body > nav.language-switch').waitFor();
  await page.evaluate(async()=>{
    document.body.replaceChildren(Object.assign(document.createElement('div'),{id:'test-root'}));
    const {renderQuestionnaire}=await import('/toolkit-web/questionnaire-runtime.js');
    const payload={
      schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
      version:'0.4.0',title:'Mi cuestionario privado',
      grading:{mode:'embedded-key'},presentation:{questionMode:'one-at-a-time',showFeedback:'after-submit'},
      attemptPolicy:{maxAttempts:2},
      questions:[
        {id:'q1',type:'single-choice',prompt:'¿Capital de España?',points:1,
          choices:[{id:'a',text:'Madrid'},{id:'b',text:'París'}],solution:{choiceIds:['a']}},
        {id:'q2',type:'true-false',prompt:'¿Es cierta esta frase?',points:1,
          choices:[{id:'t',text:'Verdadero'},{id:'f',text:'Falso'}],solution:{choiceIds:['t']}}
      ]
    };
    window.quiz=await renderQuestionnaire(document.getElementById('test-root'),payload);
  });
  assert.equal(await page.locator('.p2lrn-q-header h2').textContent(),'Mi cuestionario privado');
  assert.equal(await page.locator('.p2lrn-q-prompt').textContent(),'¿Capital de España?');
  assert.match(await page.locator('.p2lrn-q-progress').innerText(),language==='en'?/Question 1 of 2/:/Pregunta 1 de 2/);
  await page.locator('.p2lrn-q-option input').first().check();
  await page.getByRole('button',{name:language==='en'?'Next':'Siguiente'}).click();
  await page.locator('.p2lrn-q-option input').first().check();
  await page.getByRole('button',{name:language==='en'?'Finish':'Finalizar'}).click();
  await page.locator('.p2lrn-q-result').waitFor();
  assert.match(await page.locator('.p2lrn-q-result').innerText(),language==='en'?/Result/:/Resultado/);
  assert.ok(await page.getByRole('button',{name:language==='en'?'Retry':'Repetir'}).count());
  console.log('BROWSER_QUIZ_'+language.toUpperCase()+'=pass');
}
async function trueFalseGame(language){
  await page.goto(base+(language==='en'?'/en/':'/'),{waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
    document.body.replaceChildren(Object.assign(document.createElement('div'),{id:'test-game'}));
    const {render}=await import('/toolkit-web/renderers/questionnaire-true-false.js');
    const payload={schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',
      title:'Juego privado de clase',grading:{mode:'embedded-key'},questions:[
        {id:'t1',type:'true-false',prompt:'¿Es verdadera?',points:1,
        choices:[{id:'t',text:'Verdadero'},{id:'f',text:'Falso'}],solution:{choiceIds:['t']}},
        {id:'t2',type:'true-false',prompt:'¿Es falsa?',points:1,
        choices:[{id:'t',text:'Verdadero'},{id:'f',text:'Falso'}],solution:{choiceIds:['f']}}
      ]};
    await render({container:document.getElementById('test-game'),bytes:new TextEncoder().encode(JSON.stringify(payload)),
      decodeJson:(bytes)=>JSON.parse(new TextDecoder().decode(bytes)),context:{}});
  });
  assert.equal(await page.getByRole('button',{name:language==='en'?'True':'Verdadero'}).count(),1);
  assert.equal(await page.getByRole('button',{name:language==='en'?'False':'Falso'}).count(),1);
  console.log('BROWSER_GAME_TF_'+language.toUpperCase()+'=pass');
}

async function additionalGameRenderers(language){
  const mk=(type,id,prompt,extra)=>({id,type,prompt,points:1,...extra});
  const matching=mk('matching','m1','Pregunta privada de emparejar',{
    left:[{id:'l1',text:'Red'},{id:'l2',text:'Blue'},{id:'l3',text:'Green'}],
    right:[{id:'r1',text:'Rojo'},{id:'r2',text:'Azul'},{id:'r3',text:'Verde'}],
    solution:{pairs:[{left:'l1',right:'r1'},{left:'l2',right:'r2'},{left:'l3',right:'r3'}]}
  });
  const ordering=mk('ordering','o1','Pregunta privada de ordenar',{
    items:[{id:'o1',text:'First'},{id:'o2',text:'Second'},{id:'o3',text:'Third'}],
    solution:{order:['o1','o2','o3']}
  });
  const classification=mk('classification','c1','Pregunta privada de clasificar',{
    items:[{id:'i1',text:'Cat'},{id:'i2',text:'Sparrow'}],
    categories:[{id:'a',text:'Mammal'},{id:'b',text:'Bird'}],
    solution:{assignments:[{item:'i1',category:'a'},{item:'i2',category:'b'}]}
  });
  const lexical=(words)=>words.map((w,i)=>mk('text','word-'+i,'Clue '+(i+1),{solution:{acceptedAnswers:[w]}}));
  const fillBlanks=mk('fill-blanks','fill1','Complete the sentence',{
    body:'The capital is {{b1}}',inputMode:'text',blanks:[{id:'b1'}],
    solution:{answers:{b1:['Madrid']}}
  });
  const fixture=[
    {slug:'memory',questions:[matching]},
    {slug:'matching',questions:[matching]},
    {slug:'ordering',questions:[ordering]},
    {slug:'classification',questions:[classification]},
    {slug:'word-search',questions:lexical(['TREE','BEAR','EARTH'])},
    {slug:'crossword',questions:lexical(['TREE','TEAR','RATE','EAT'])},
    {slug:'rosco',questions:lexical(['APPLE','BANANA','CARROT'])},
    {slug:'fill-blanks',questions:[fillBlanks]},
    {slug:'3d',questions:[ordering,matching,classification]}
  ];
  for(const cfg of fixture){
    await page.goto(base+(language==='en'?'/en/':'/'),{waitUntil:'domcontentloaded'});
    const snapshot=await page.evaluate(async({cfg})=>{
      document.body.replaceChildren(Object.assign(document.createElement('div'),{id:'game-mount'}));
      const {render}=await import('/toolkit-web/renderers/questionnaire-'+cfg.slug+'.js');
      const pkg={
        schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
        version:'0.4.0',title:'Título redactado por el profesor',
        grading:{mode:'embedded-key'},
        presentation:{showFeedback:'after-submit'},
        questions:cfg.questions
      };
      const container=document.getElementById('game-mount');
      const bytes=new TextEncoder().encode(JSON.stringify(pkg));
      const runtime=await render({container,bytes,representation:{mediaType:'application/vnd.p2lrn.questionnaire+json'},
        decodeJson:(input)=>JSON.parse(new TextDecoder().decode(input)),context:{}});
      const status=[...container.querySelectorAll('.p2lrn-game-status')].map(x=>x.textContent).filter(Boolean).join(' | ')
        ||container.querySelector('.p2lrn-q-progress')?.textContent||'';
      const buttons=[...container.querySelectorAll('button')].slice(0,16).map(x=>x.textContent.trim());
      const header=container.querySelector('.p2lrn-game-header h2,.p2lrn-q-header h2')?.textContent;
      const hasShell=Boolean(container.querySelector('.p2lrn-game-shell,.p2lrn-q-shell'));
      return {status,buttons,header,hasShell,hasInteractive:container.querySelectorAll('button,input,select,textarea').length>0};
    },{cfg});
    assert.equal(snapshot.hasShell,true,'Missing game UI shell: '+cfg.slug+' '+language);
    assert.equal(snapshot.hasInteractive,true,'No active controls: '+cfg.slug+' '+language);
    assert.equal(snapshot.header,'Título redactado por el profesor','Course-authored titles must not be translated');
    if(language==='en'){
      const uiMarker={
        memory:/Memorize the cards/,
        matching:/Select an item on the left/,
        ordering:/Drag and drop/,
        classification:/Drag each card/,
        'word-search':/Drag across a word/,
        crossword:/Choose a clue/,
        rosco:/Type your answer/,
        '3d':/Select items in the scene|Choose answers|Select an object|Tap or drag the boxes in the scene to answer/
      };
      if(uiMarker[cfg.slug])assert.match(snapshot.status,uiMarker[cfg.slug],'Untranslated game instructions: '+cfg.slug);
    }
    console.log('BROWSER_GAME_'+cfg.slug.toUpperCase()+'_'+language.toUpperCase()+'=pass');
  }
}

async function studioChrome(language){
  const evidence=join(repo,'.p2lrn-i18n-ci','evidence');
  await mkdir(evidence,{recursive:true});
  const prefix='studio-'+language;
  try{
    const response=await page.goto(base+(language==='en'?'/en/studio/':'/studio/'),{waitUntil:'domcontentloaded'});
    assert.equal(response?.status(),200,'Studio page did not load: '+language);
    assert.equal(await page.locator('html').getAttribute('lang'),language);
    await page.waitForFunction(()=>document.documentElement.dataset.p2lrnStudioReady==='true',null,{timeout:20000});
    const ribbon=page.locator('.p2lrn-studio-ribbon');
    await ribbon.waitFor({timeout:15000});
    await page.locator('[data-studio-html-surface="true"]').waitFor({timeout:12000});
    await ribbon.getByRole('tab',{name:language==='en'?'Insert':'Insertar'}).click();
    if(language==='en'){
      await ribbon.getByRole('button',{name:'Two columns',exact:true}).waitFor();
      await ribbon.getByText('Drop zones',{exact:true}).waitFor();
      assert.equal(await ribbon.getByText('Dos columnas',{exact:true}).count(),0,'English visual block buttons still contain Spanish text');
    }
    const endCaret=page.locator('p[data-p2lrn-end-caret]').first();
    await endCaret.waitFor({timeout:10000});
    const instruction=await endCaret.evaluate(node=>getComputedStyle(node,'::before').content);
    assert.match(instruction,language==='en'?/Write or insert/:/Escribe o inserta/,'Lesson end-caret language mismatch');
    await page.screenshot({path:join(evidence,prefix+'-editor.png'),fullPage:false});
    await ribbon.getByRole('button',{name:language==='en'?'Two columns':'Dos columnas',exact:true}).click();
    const section=page.locator('[data-p2lrn-layout="columns"]');
    await section.waitFor({timeout:12000});
    assert.equal((await section.locator('h2').first().textContent()).trim(),language==='en'?'Comparison':'Comparación');
    assert.equal((await section.locator('h3').first().textContent()).trim(),language==='en'?'First column':'Primera columna');
    await page.screenshot({path:join(evidence,prefix+'-two-columns.png'),fullPage:false});

    // Real-browser WCAG inspection, not a substitute for screen-reader review.
    const auditStudio=async(label)=>{
      await page.addScriptTag({path:join(repo,'.p2lrn-i18n-ci','node_modules','axe-core','axe.min.js')});
      const report=await page.evaluate(async()=>{
        const data=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
        return {violations:data.violations.map(({id,impact,description,nodes})=>({id,impact,description,nodes:nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,15)})),
          incomplete:data.incomplete.map(({id,impact,nodes})=>({id,impact,count:nodes.length}))};
      });
      await writeFile(join(evidence,prefix+'-'+label+'-wcag.json'),JSON.stringify(report,null,2));
      console.log('BROWSER_STUDIO_'+language.toUpperCase()+'_'+label.toUpperCase()+'_WCAG_ISSUES='+report.violations.length);
      assert.equal(report.violations.length,0,'WCAG automated violations in '+language+' '+label+': '+JSON.stringify(report.violations));
    };
    await auditStudio('editor');
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:join(evidence,prefix+'-mobile.png'),fullPage:false});
    const mobile=await page.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    await writeFile(join(evidence,prefix+'-mobile.json'),JSON.stringify(mobile,null,2));
    console.log('BROWSER_STUDIO_'+language.toUpperCase()+'_MOBILE_OVERFLOW='+(mobile.scrollWidth-mobile.width));
    assert.ok(mobile.scrollWidth<=mobile.width+1,'Studio has horizontal mobile overflow: '+JSON.stringify(mobile));
    await page.setViewportSize({width:1280,height:800});
    // Inserting a layout selects its formatting tab. Re-enter Insert before adding content.
    await ribbon.getByRole('tab',{name:language==='en'?'Insert':'Insertar'}).click();
    await ribbon.getByRole('button',{name:language==='en'?'Add content':'Añadir contenido',exact:true}).click();
    const dialog=page.locator('dialog.p2lrn-activity-picker');
    await dialog.waitFor({state:'visible',timeout:10000});
    if(language==='en')assert.match(await dialog.locator('input[type=search]').getAttribute('placeholder'),/Search lessons/,'Picker search placeholder not translated');
    const samePage=dialog.locator('input[type="radio"][value="same-page"]');
    assert.equal(await samePage.isDisabled(),false,'Same-page authoring is unavailable: '+language);
    await samePage.check();
    await page.screenshot({path:join(evidence,prefix+'-picker.png'),fullPage:false});
    await dialog.locator('[data-activity-kind="memory"]').click();
    await page.waitForFunction(()=>/^(Memory|Memoria)$/.test(document.querySelector('h1.studio-title')?.textContent?.trim()??''),null,{timeout:15000});
    assert.equal((await page.locator('h1.studio-title').textContent()).trim(),language==='en'?'Memory':'Memoria');
    assert.equal(await dialog.evaluate(el=>el.open),false,'Activity picker did not close');
    const treeTitles=await page.locator('.studio-tree-node .title').allTextContents();
    assert.ok(treeTitles.includes(language==='en'?'Activity page':'Página de actividades'),
      'Stacked page should not reuse the lesson title: '+treeTitles.join(', '));
    await page.screenshot({path:join(evidence,prefix+'-activity.png'),fullPage:false});
    await auditStudio('activity');
    console.log('BROWSER_STUDIO_'+language.toUpperCase()+'_PICKER=PASS');
  }catch(error){
    await page.screenshot({path:join(evidence,prefix+'-error.png'),fullPage:false}).catch(()=>{});
    throw error;
  }
}


async function analyticsChrome(language){
  const folder=join(repo,'.p2lrn-i18n-ci','evidence');
  await mkdir(folder,{recursive:true});
  const suffix=language==='en'?'en':'es';
  const response=await page.goto(base+(suffix==='en'?'/en/analytics/':'/analytics/'),{waitUntil:'domcontentloaded'});
  assert.equal(response?.status(),200,'Analytics site must load');
  await page.evaluate(async lang=>{
    await import('/analytics-src/p2lrn-analytics.js');
    const panel=document.createElement('p2lrn-analytics');
    panel.setAttribute('locale',lang==='en'?'en-US':'es-ES');
    document.body.replaceChildren(panel);
    const past=new Date(Date.now()-35*86_400_000).toISOString();
    const recent=new Date().toISOString();
    panel.data={
      learners:[{id:'ana',name:'Ana Example',email:'ana@school.example'},{id:'leo',name:'Leo Example',email:'leo@school.example'}],
      courses:[{id:'course-1',title:'Learning course'},{id:'course-2',title:'Second course'}],
      enrollments:[{learnerId:'ana',courseId:'course-1',progress:.2},{learnerId:'leo',courseId:'course-1',progress:1,completedAt:recent}],
      attempts:[
        {id:'ana-1',learnerId:'ana',courseId:'course-1',status:'failed',progress:.2,startedAt:past,activeTimeMs:10000},
        {id:'ana-2',learnerId:'ana',courseId:'course-1',status:'failed',progress:.2,startedAt:past,activeTimeMs:8000},
        {id:'leo-1',learnerId:'leo',courseId:'course-1',status:'completed',progress:1,startedAt:recent,completedAt:recent}
      ],
      grades:[
        {id:'grade-a',learnerId:'ana',courseId:'course-1',value:4,maxValue:10,authoritative:true,updatedAt:past},
        {id:'grade-l',learnerId:'leo',courseId:'course-1',value:9,maxValue:10,authoritative:true,updatedAt:recent},
        {id:'grade-quiz',learnerId:'ana',courseId:'course-1',entityId:'quiz-1',value:10,maxValue:10,authoritative:true,updatedAt:recent},
        {id:'grade-offline',learnerId:'ana',courseId:'course-2',value:10,maxValue:10,authoritative:false,updatedAt:recent}
      ],
      events:[{id:'event-a',type:'p2lrn:interaction',learnerId:'ana',courseId:'course-1',timestamp:past}]
    };
    panel.view='learners';
    window.analyticsQA=panel;
  },suffix);
  const panel=page.locator('p2lrn-analytics');
  const query=panel.locator('[data-query]');
  await query.pressSequentially('Ana',{delay:40});
  assert.equal(await query.inputValue(),'Ana','Full multi-character search must retain its value');
  assert.equal(await query.evaluate(el=>el.getRootNode().activeElement===el),true,'Search must retain keyboard focus');
  assert.equal(await panel.locator('.main tbody tr').count(),1,'Filtered list must show only Ana');
  const learnersCsv=await page.evaluate(()=>window.analyticsQA.exportCsv('learners'));
  assert.match(learnersCsv,/Ana Example/);
  assert.doesNotMatch(learnersCsv,/Leo Example|leo@school/,'Filtered CSV cannot include hidden learners');
  await page.screenshot({path:join(folder,'analytics-'+suffix+'-filtered-learners.png'),fullPage:false});
  await panel.locator('[data-learner="ana"]').first().click();
  const official=await panel.locator('.detail .detail-stat').filter({hasText:/Nota oficial|Official grade/}).innerText();
  assert.match(official,/40\s*%/,'A recent activity grade must not replace the course-level official grade');
  await panel.locator('[data-close-detail]').click();
  await panel.locator('[data-view="grades"]').click();
  await panel.locator('[data-course-filter]').selectOption('course-1');
  assert.equal(await panel.locator('.main table tbody tr').count(),2,'Gradebook must follow active learner filter and course');
  const gradesCsv=await page.evaluate(()=>window.analyticsQA.exportCsv('grades'));
  assert.match(gradesCsv,/grade-a/);
  assert.doesNotMatch(gradesCsv,/grade-l|Leo Example/);
  await page.screenshot({path:join(folder,'analytics-'+suffix+'-filtered-grades.png'),fullPage:false});
  await query.fill('');
  await panel.locator('[data-risk-filter]').selectOption('high');
  await panel.locator('[data-view="learners"]').click();
  assert.equal(await panel.locator('.main tbody tr').count(),1,'Risk filter must select the high-risk learner only');
  assert.match(await panel.locator('.main tbody').innerText(),/Ana Example/);
  const riskCsv=await page.evaluate(()=>window.analyticsQA.exportCsv('learners'));
  assert.doesNotMatch(riskCsv,/Leo Example/,'Risk CSV cannot export excluded learners');
  await panel.locator('[data-risk-filter]').selectOption('all');
  await panel.locator('[data-course-filter]').selectOption('course-2');
  assert.equal(await panel.locator('.main tbody tr').count(),1,'Course filter must exclude unrelated learners');
  assert.match(await panel.locator('.main tbody').innerText(),/Ana Example/);
  assert.equal((await page.evaluate(()=>window.analyticsQA.data.grades.find(x=>x.id==='grade-offline')?.authoritative)),false,
    'Offline grades must stay informational');
  console.log('BROWSER_ANALYTICS_'+suffix.toUpperCase()+'_FILTERS_CSV_SECURITY=PASS');
}



// Coverage beyond the illustrated guides: crawl every authored public page
// using the same real Chromium renderer and axe-core that validate Studio.
// This checks deterministic HTML accessibility in ES/EN and both viewports;
// keyboard/AT usability and deployed output must be reviewed separately.
async function fullSiteAccessibilityChrome(){
  const folder=join(repo,'.p2lrn-i18n-ci','evidence','full-site-a11y');
  await mkdir(folder,{recursive:true});
  async function listPages(dir,prefix=''){
    const found=[];
    for(const ent of await readdir(dir,{withFileTypes:true})){
      if(prefix===''&&ent.name==='en')continue;
      const full=join(dir,ent.name);
      if(ent.isDirectory())found.push(...await listPages(full,prefix+ent.name+'/'));
      else if(ent.isFile()&&ent.name==='index.html')found.push(prefix+'index.html');
    }
    return found;
  }
  const allPages=(await listPages(site)).sort();
  assert.ok(allPages.length>=70,'Too few original pages for complete site coverage');
  // WCAG 1.4.10: check 320 CSS px reflow, not just common 390px mobiles.
  const views=[{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844},
    {name:'reflow-320',width:320,height:720}];
  const auditPage=await browser.newPage({viewport:{width:1280,height:800}});
  await auditPage.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
  const issues=[],incomplete=[],skipped=[],tested=[];
  try{
    for(const rel of allPages){
      const html=await readFile(join(site,rel),'utf8');
      if(/<meta\b[^>]*http-equiv=["']refresh["']/i.test(html)){
        skipped.push(rel+' redirects to its canonical page');
        continue;
      }
      const es=rel==='index.html'?'/':'/'+rel.slice(0,-'index.html'.length);
      for(const [lang,route] of [['es',es],['en',englishRouteFor(es)]]){
        for(const v of views){
          const label=route+' '+v.name;
          try{
            await auditPage.setViewportSize({width:v.width,height:v.height});
            const response=await auditPage.goto(base+route,{waitUntil:'load',timeout:20000});
            if(response?.status()!==200)throw Error('HTTP '+response?.status());
            await auditPage.addScriptTag({path:join(repo,'.p2lrn-i18n-ci','node_modules','axe-core','axe.min.js')});
            const result=await auditPage.evaluate(async expectedLang=>{
              const a=await window.axe.run(document,{runOnly:{type:'tag',
                values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
              const violations=a.violations.map(v=>({id:v.id,impact:v.impact,
                nodes:v.nodes.slice(0,8).map(n=>({target:n.target,summary:n.failureSummary}))}));
              const incomplete=a.incomplete.map(v=>({id:v.id,nodes:v.nodes.length,
                samples:v.nodes.slice(0,10).map(n=>({target:n.target,
                  summary:n.failureSummary,html:n.html?.slice(0,320)}))}));
              return {lang:document.documentElement.lang,violations,incomplete,
                overflow:Math.max(0,document.documentElement.scrollWidth-window.innerWidth),
                overflowElements:document.documentElement.scrollWidth>window.innerWidth+2?
                  [...document.body.querySelectorAll('*')].filter(el=>{
                    if(!el.getClientRects().length)return false;
                    const rect=el.getBoundingClientRect();
                    return rect.right>window.innerWidth+2||rect.left< -2;
                  }).slice(0,25).map(el=>({
                    tag:el.tagName,className:el.className?.toString().slice(0,150),
                    width:Math.round(el.getBoundingClientRect().width),
                    left:Math.round(el.getBoundingClientRect().left),
                    right:Math.round(el.getBoundingClientRect().right),
                    minWidth:getComputedStyle(el).minWidth,
                    overflowX:getComputedStyle(el).overflowX,
                    sample:el.outerHTML.slice(0,170)
                  })):[],
                h1:document.querySelectorAll('h1').length,
                headingInfo:[...document.querySelectorAll('h1')].map(el=>({
                  text:el.textContent?.trim().slice(0,90),role:el.getAttribute('role'),
                  editable:!!el.closest('[contenteditable="true"],.studio-sheet,.studio-editor'),
                  classes:el.className?.toString().slice(0,120)})),
                badMedia:[...document.querySelectorAll('video')].filter(video=>
                  !video.poster||!video.querySelector('track[kind="captions"]')).length,
                brokenAnchors:[...document.querySelectorAll('a[href^="#"]')]
                  .filter(a=>a.hash.length>1&&!document.getElementById(decodeURIComponent(a.hash.slice(1))))
                  .map(a=>a.getAttribute('href')).slice(0,10)};
            },lang);
            tested.push({route,viewport:v.name,violationCount:result.violations.length,
              incompleteCount:result.incomplete.length,overflow:result.overflow});
            if(result.lang!==lang)issues.push({label,rule:'html-lang',detail:result.lang});
            // The Studio HTML has one page H1 plus two user-authored editable
            // lesson headings. Do not mistake the content being edited for
            // the application page's own heading; still require one page H1.
            const studioRoute=route==='/studio/'||route==='/en/studio/';
            const pageHeadings=studioRoute
              ?result.headingInfo.filter(h=>!h.editable).length
              :result.h1;
            if(pageHeadings!==1)issues.push({label,rule:'page-h1',
              detail:{count:pageHeadings,raw:result.h1,headings:result.headingInfo}});
            if(studioRoute&&result.headingInfo.some(h=>h.editable&&h.role==='heading'))
              issues.push({label,rule:'studio-editor-heading-role',
                detail:result.headingInfo});
            if(result.overflow>2)issues.push({label,rule:'mobile-or-desktop-overflow',detail:{pixels:result.overflow,elements:result.overflowElements}});
            if(result.badMedia)issues.push({label,rule:'video-no-poster-or-captions',detail:result.badMedia});
            if(result.brokenAnchors.length)issues.push({label,rule:'broken-anchor',detail:result.brokenAnchors});
            for(const error of result.violations)issues.push({label,rule:'wcag22-aa',detail:error});
            for(const item of result.incomplete){
              // Axe marks unsupported ARIA labelling as inconclusive. It is
              // actionable: naming a generic div/pre without a suitable role
              // fails assistive-technology semantics. Do not silently pass it.
              if(item.id==='aria-prohibited-attr')
                issues.push({label,rule:'unsupported-aria-label',detail:item.samples});
              incomplete.push({label,...item});
            }
          }catch(error){
            issues.push({label,rule:'test-or-runtime-error',detail:String(error)});
            if(issues.length===1)await auditPage.screenshot({
              path:join(folder,'first-failure.png'),fullPage:false}).catch(()=>{});
          }
        }
      }
    }
    // Verify that the first Tab on critical routes lands on an actual
    // keyboard-accessible control. Mouse-only controls must be reviewed manually.
    for(const route of ['/', '/en/', '/docs/', '/en/docs/',
      '/crear-cursos-interactivos/',englishRouteFor('/crear-cursos-interactivos/'),
      '/analytics/',englishRouteFor('/analytics/')]){
      await auditPage.goto(base+route,{waitUntil:'load'});
      await auditPage.keyboard.press('Tab');
      const keyboard=await auditPage.evaluate(()=>{
        const el=document.activeElement;
        return {tag:el?.tagName,rects:el?.getClientRects().length??0,
          tabindex:el?.getAttribute('tabindex'),text:(el?.textContent||'').trim().slice(0,70)};
      });
      if(!keyboard.tag||keyboard.tag==='BODY'||keyboard.rects===0)
        issues.push({label:route,rule:'keyboard-first-tab',detail:keyboard});
    }
  } finally {
    await auditPage.close();
  }
  const report={source:'Actual P2LRN authored HTML in local Chromium, not public deployment',
    requiredStandard:'WCAG 2.2 A/AA automated checks; manual AT review still mandatory',
    pages:allPages.length,views:tested.length,expectedViews:(allPages.length-skipped.length)*views.length*2,
    skipped,issues,incomplete,tested};
  await writeFile(join(folder,'full-site-a11y.json'),JSON.stringify(report,null,2)+'\n','utf8');
  console.log('P2LRN_FULL_SITE_A11Y='+JSON.stringify({pages:report.pages,views:report.views,
    expectedViews:report.expectedViews,errors:issues.length,incomplete:incomplete.length,
    skipped:skipped.length,firstErrors:issues.slice(0,10)}));
  assert.equal(tested.length,report.expectedViews,'Full site page coverage was incomplete');
  assert.equal(issues.length,0,'WCAG/browser regressions across the full bilingual site');
}

async function questionnaireDocsVisualQA(){
  // Browser-certify the documentation actually served by this checkout.
  // Screenshots are evidence of documentation rendering, NOT evidence of game completion.
  const evidence=join(repo,'.p2lrn-i18n-ci','evidence','questionnaires');
  await mkdir(evidence,{recursive:true});
  const gameSlugs=['standard','memory','matching','ordering','classification',
    'true-false','word-search','crossword','rosco','3d'];
  const pages=[...gameSlugs.map(slug=>({slug,route:'questionnaires/'+slug+'/',
    anchor:'#ejemplo-vista-alumno',expectedImg:2})),
    {slug:'fill-blanks',route:'questionnaires/',anchor:'#ejemplos-huecos-arrastre',expectedImg:3},
    {slug:'3d-gallery',route:'juegos-3d/',anchor:'#juego-3d-ordenar',expectedImg:8}];
  const auditPage=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
  await auditPage.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
  const failures=[],passed=[],accessibilityResults=[];
  let currentRoute='',pageErrors=[];
  auditPage.on('pageerror',error=>pageErrors.push(currentRoute+': '+error.message));
  try{
    for(const language of ['es','en']){
      for(const entry of pages){
        const route=(language==='en'?'/en/docs/':'/docs/')+entry.route;
        currentRoute=route;
        for(const viewport of [{name:'desktop',width:1280,height:800},
                                 {name:'mobile',width:390,height:844}]){
          await auditPage.setViewportSize({width:viewport.width,height:viewport.height});
          const response=await auditPage.goto(base+route,{waitUntil:'load',timeout:30000}).catch(()=>null);
          if(response?.status()!==200){failures.push(route+' '+viewport.name+' HTTP '+response?.status());continue;}
          const details=await auditPage.evaluate(async ({anchor,slug,lang})=>{
            const images=[...document.querySelectorAll('article.doc-content img')];
            for(const img of images)img.loading='eager';
            await Promise.all(images.map(img=>img.decode().catch(()=>{})));
            const brokenImages=images.filter(img=>!img.complete||img.naturalWidth<1)
              .map(img=>img.getAttribute('src'));
            const missingAlternatives=images.filter(img=>!img.hasAttribute('alt')||
              !Number(img.getAttribute('width'))||!Number(img.getAttribute('height')))
              .map(img=>img.getAttribute('src'));
            const section=document.querySelector(anchor);
            const text=section?.innerText||'';
            const expected=slug==='3d-gallery'
              ?(lang==='es'?'Qué debe hacer el alumno':'What the learner must do')
              :slug==='fill-blanks'
                ?(lang==='es'?'Las otras tres fichas son distractores':'The other three are distractors')
                :(lang==='es'?'Cómo se responde':'How the learner responds');
            const invalidAnchors=[...document.querySelectorAll('article.doc-content a[href^="#"]')]
              .map(a=>a.getAttribute('href')).filter(h=>h.length>1&&!document.getElementById(h.slice(1)));
            return {lang:document.documentElement.lang,hasArticle:!!document.querySelector('article.doc-content'),
              hasTarget:!!section,hasExplanation:text.includes(expected),visibleText:(document.body?.innerText||'').length,
              imageCount:images.length,brokenImages,missingAlternatives,
              horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
              invalidAnchors};
          },{anchor:entry.anchor,slug:entry.slug,lang:language});
          await auditPage.addScriptTag({path:join(repo,'.p2lrn-i18n-ci','node_modules','axe-core','axe.min.js')});
          const accessibility=await auditPage.evaluate(async()=>{
            const report=await window.axe.run(document,{runOnly:{type:'tag',
              values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
            return {violations:report.violations.map(v=>({id:v.id,impact:v.impact,
              description:v.help,nodes:v.nodes.slice(0,8).map(n=>({target:n.target,
                summary:n.failureSummary}))})),
              incomplete:report.incomplete.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length}))};
          });
          accessibilityResults.push({route,viewport:viewport.name,...accessibility});
          const problems=[];
          if(accessibility.violations.length)problems.push('WCAG 2.2 AA: '+JSON.stringify(accessibility.violations));
          if(details.lang!==language)problems.push('lang='+details.lang);
          if(!details.hasArticle||!details.hasTarget||!details.hasExplanation)problems.push('missing meaningful learner instructions');
          if(details.visibleText<400)problems.push('empty/too short');
          if(details.imageCount<entry.expectedImg)problems.push('missing screenshot count '+details.imageCount);
          if(details.brokenImages.length)problems.push('broken images '+details.brokenImages.join(','));
          if(details.missingAlternatives.length)problems.push('invalid image alt/dimensions '+details.missingAlternatives.join(','));
          if(details.horizontalOverflow>3)problems.push('horizontal overflow '+details.horizontalOverflow+'px');
          if(details.invalidAnchors.length)problems.push('broken anchors '+details.invalidAnchors.join(','));
          const prefix='docs-'+language+'-'+entry.slug+'-'+viewport.name;
          if(details.hasTarget){
            await auditPage.locator(entry.anchor).evaluate(node=>
              node.scrollIntoView({block:'start',behavior:'instant'}));
            const anchorLayout=await auditPage.evaluate(anchor=>{
              const target=document.querySelector(anchor);
              const header=document.querySelector('.site-header');
              const toggle=document.querySelector('.docs-sidebar-toggle');
              const overlays=[header,toggle].filter(Boolean).map(node=>node.getBoundingClientRect());
              const visibleBottom=Math.max(...overlays.filter(rect=>rect.height>0).map(rect=>rect.bottom),0);
              return {targetTop:target?.getBoundingClientRect().top??0,
                overlaysBottom:visibleBottom,scrollY:window.scrollY,
                maxScroll:document.documentElement.scrollHeight-innerHeight};
            },entry.anchor);
            if(anchorLayout.targetTop+2<anchorLayout.overlaysBottom &&
              anchorLayout.scrollY<anchorLayout.maxScroll-2)
              problems.push('Anchor title hidden under sticky navigation: '+JSON.stringify(anchorLayout));
            await auditPage.screenshot({path:join(evidence,prefix+'.png'),fullPage:false});
          }
          if(problems.length)failures.push(route+' '+viewport.name+': '+problems.join('; '));
          else passed.push({route,viewport:viewport.name,images:details.imageCount});
        }
      }
    }
    failures.push(...pageErrors);
    await writeFile(join(evidence,'accessibility-report.json'),
      JSON.stringify(accessibilityResults,null,2)+'\n','utf8');
    await writeFile(join(evidence,'browser-report.json'),
      JSON.stringify({passed,failures,expectedPages:24,expectedViewports:48,
        accessibilityAudits:accessibilityResults.length},null,2)+'\n','utf8');
    console.log('P2LRN_DOCS_VISUAL_QA='+JSON.stringify({passed:passed.length,failed:failures.length,
      evidence,firstFailures:failures.slice(0,12)}));
    assert.deepEqual(failures,[],'Documentation browser visual QA failed');
    assert.equal(passed.length,48,'Must render all 24 Spanish/English pages in desktop and mobile');
  }finally{
    await auditPage.close();
  }
}


async function captureFillBlanksAuthoring(){
  // Genuine Studio controls, not an imitation or a generated illustration.
  const evidence=join(repo,'.p2lrn-i18n-ci','evidence','authoring');
  await mkdir(evidence,{recursive:true});
  await page.setViewportSize({width:1440,height:1200});
  const response=await page.goto(base+'/studio/',{waitUntil:'domcontentloaded'});
  assert.equal(response?.status(),200);
  await page.waitForFunction(()=>document.documentElement.dataset.p2lrnStudioReady==='true',null,{timeout:20000});
  const ribbon=page.locator('.p2lrn-studio-ribbon');
  await ribbon.getByRole('tab',{name:'Insertar'}).click();
  await ribbon.getByRole('button',{name:'Añadir contenido',exact:true}).click();
  const dialog=page.locator('dialog.p2lrn-activity-picker');
  await dialog.waitFor({state:'visible'});
  await dialog.locator('input[type="radio"][value="same-page"]').check();
  await dialog.locator('[data-activity-kind="fill-blanks"]').click();
  await page.waitForFunction(()=>document.querySelector('h1.studio-title')?.textContent?.includes('Rellenar huecos'),null,{timeout:15000});
  const card=page.locator('.q-card').first();
  try {
    await card.waitFor({timeout:12000});
  } catch (error) {
    const diagnostics=await page.evaluate(()=>({
      title:document.querySelector('h1.studio-title')?.textContent,
      editing:!!document.querySelector('.questionnaire-visual-editor'),
      cardCount:document.querySelectorAll('.q-card').length,
      bodyText:document.body?.innerText?.slice(0,2500)
    }));
    await page.screenshot({path:join(evidence,'fill-blanks-authoring-error.png'),fullPage:false});
    await writeFile(join(evidence,'fill-blanks-authoring-error.json'),JSON.stringify(diagnostics,null,2));
    throw Error('Real Studio authoring editor not visible: '+JSON.stringify(diagnostics)+'; '+String(error));
  }
  const template=card.locator('.q-blank-template-editor');
  await template.fill('La Tierra gira alrededor del Sol.');
  await card.locator('.q-prompt-input').fill('Elige la palabra correcta para completar la frase.');
  await template.evaluate(node=>{
    const start=node.value.indexOf('Sol');
    if(start<0)throw Error('Missing Sol in the real editor');
    node.focus();node.setSelectionRange(start,start+3);
  });
  await card.screenshot({path:join(evidence,'before-converting-selection.png'),animations:'disabled'});
  await card.locator('.q-blank-convert').click();
  assert.equal(await page.locator('.q-card .q-blank-row').count(),2,
    'Studio did not create the blank from the selected word');
  // New activities start with a placeholder question. Remove the unused
  // initial blank using Studio's Delete button, retaining the selected "Sol".
  await page.locator('.q-card .q-blank-row').first().getByRole('button',{name:'Eliminar'}).click();
  assert.equal(await page.locator('.q-card .q-blank-row').count(),1);
  await page.locator('.q-card .q-field--mode select').selectOption('drag');
  await page.locator('.q-card .q-answer-list').fill('Luna\nMarte');
  // Make the teacher's score feedback visible after submission, using the
  // official authoring control rather than changing a global default.
  await page.locator('.questionnaire-visual-editor label').filter({hasText:'Mostrar resultados al alumno'}).locator('select').selectOption('after-submit');
  const state=await page.evaluate(()=>{
    const card=document.querySelector('.q-card');
    const area=card?.querySelector('.q-blank-template-editor');
    const selected=card?.querySelector('.q-field--mode select');
    const extras=card?.querySelector('.q-answer-list');
    const answer=card?.querySelector('.q-blank-row input');
    return {prompt:card?.querySelector('.q-prompt-input')?.value,
      sentence:area?.value,mode:selected?.value,distractors:extras?.value,
      answer:answer?.value,blankRows:card?.querySelectorAll('.q-blank-row').length??0,
      autoMarkers:(area?.value?.match(/\{\{[^{}]+\}\}/g)||[]).length};
  });
  assert.equal(state.mode,'drag');
  assert.equal(state.answer,'Sol');
  assert.equal(state.distractors,'Luna\nMarte');
  assert.equal(state.blankRows,1);
  assert.equal(state.autoMarkers,1,
    'The author should select the source word; Studio creates the internal blank');
  await page.locator('.q-card').first().screenshot({
    path:join(evidence,'studio-fill-blanks-drag-words-real.png'),animations:'disabled'});
  await writeFile(join(evidence,'capture-report.json'),
    JSON.stringify({source:'Real Studio at locally served project source in Chrome',
      state,notProduction:true},null,2)+'\n','utf8');
  console.log('P2LRN_REAL_STUDIO_DRAG_WORDS_CAPTURE='+JSON.stringify(state));

  // Use the actual exported Studio package inside its learner preview.
  // The student must see the word bank, place words, correct a mistake and finish.
  try {
    // The standalone test server serves source modules and does not contain the
    // CDN-generated /player/current/dist bundle. Load the REAL official Player
    // module before exercising Studio; never install a mock API or fake Player.
    await page.evaluate(async()=>{
      const sdk=await import('/toolkit-web/p2lrn-player.js');
      if(typeof sdk.openP2LRNPackageBytes!=='function' ||
          typeof globalThis.P2LRN?.openPackageBytes!=='function')
        throw Error('The official P2LRN Player runtime was not initialized');
      globalThis.P2LRNReady=Promise.resolve(globalThis.P2LRN);
      await globalThis.P2LRNReady;
    });
    // Use the visible Student preview control, not the hidden legacy toolbar.
    await page.locator('.p2lrn-studio-ribbon [data-ui-action="preview"]').click();
    const student=page.locator('[data-preview-stage] p2lrn-player');
    const slot=student.locator('.p2lrn-fill-slot').first();
    await slot.waitFor({state:'visible',timeout:30000});
    const wordButtons=student.locator('.p2lrn-fill-chip');
    const words=(await wordButtons.allTextContents()).map(x=>x.trim());
    assert.deepEqual([...words].sort(),['Luna','Marte','Sol'].sort(),
      'Learner word bank must contain the correct answer and two distractors');
    const maskedSentence=await student.locator('.p2lrn-fill-template').innerText();
    assert.doesNotMatch(maskedSentence,/\{\{[^{}]+\}\}/,
      'Technical blank identifiers must not appear to learners');
    assert.doesNotMatch(maskedSentence,/\bSol\b/,
      'Correct answer must not leak into the unfinished sentence');
    await page.screenshot({path:join(evidence,'student-unanswered.png'),fullPage:false});
    await student.getByRole('button',{name:'Finalizar',exact:true}).click();
    assert.equal(await slot.count(),1,'Student finished an unanswered activity');
    // Real HTML5 pointer drag (in addition to the accessible select+place path).
    await wordButtons.filter({hasText:'Luna'}).first().dragTo(slot);
    assert.equal((await slot.textContent()).trim(),'Luna','Real drag did not place distractor');
    assert.equal(await student.locator('.p2lrn-q-notice[role="alert"]').count(),0,
      'Required-answer warning must disappear once the learner answers');
    await page.screenshot({path:join(evidence,'student-distractor-selected.png'),fullPage:false});
    await slot.click();
    assert.notEqual((await slot.textContent()).trim(),'Luna','Cannot remove placed word');
    await wordButtons.filter({hasText:'Sol'}).first().click();
    await slot.click();
    assert.equal((await slot.textContent()).trim(),'Sol','Correct word was not placed in blank');
    await page.screenshot({path:join(evidence,'student-answer-corrected.png'),fullPage:false});
    await student.getByRole('button',{name:'Finalizar',exact:true}).click();
    await student.locator('.p2lrn-q-result').waitFor({timeout:18000});
    const result=(await student.locator('.p2lrn-q-result').innerText()).slice(0,1000);
    assert.match(result,/1\s*\/\s*1/, 'Student must see the score when the teacher enables feedback');
    await page.screenshot({path:join(evidence,'student-submitted-result.png'),fullPage:false});
    await writeFile(join(evidence,'student-interaction-report.json'),
      JSON.stringify({source:'real Studio preview, original edited package',words,maskedSentence,
        incompleteFinishBlocked:true,distractorRemoved:true,correctWordPlaced:true,result},null,2)+'\n','utf8');
    console.log('P2LRN_REAL_STUDENT_FILL_BLANKS='+JSON.stringify({words,maskedSentence,result}));

    // Professor returns to the editor, exports the same real package and opens
    // that downloaded file through Studio's File control. No API fixture.
    await page.locator('.p2lrn-studio-ribbon [data-ui-action="edit"]').click();
    await page.locator('.p2lrn-studio-ribbon .p2lrn-file-menu > summary').filter({hasText:/^Archivo$/}).click();
    const pendingDownload=page.waitForEvent('download',{timeout:30000});
    await page.locator('.p2lrn-studio-ribbon .p2lrn-file-menu [data-ui-action="export"]').click();
    const exported=await pendingDownload;
    const filePath=join(evidence,'studio-fill-blanks-roundtrip.p2lrn');
    await exported.saveAs(filePath);
    const originalBytes=await readFile(filePath);
    assert.ok(originalBytes.length>1500,'Exported course is unexpectedly empty');
    const hash='sha256:'+createHash('sha256').update(originalBytes).digest('hex');
    await page.locator('input[data-file]').setInputFiles(filePath);
    const restoredActivity=page.locator('.studio-tree-node button').filter({hasText:'Rellenar huecos'}).last();
    await restoredActivity.waitFor({state:'visible',timeout:30000});
    await restoredActivity.click();
    const restoredCard=page.locator('.q-card').first();
    await restoredCard.waitFor({state:'visible',timeout:20000});
    const restored=await restoredCard.evaluate(card=>({
      sentence:card.querySelector('.q-blank-template-editor')?.value,
      mode:card.querySelector('.q-field--mode select')?.value,
      correct:card.querySelector('.q-blank-row input')?.value,
      distractors:card.querySelector('.q-answer-list')?.value,
      blankCount:card.querySelectorAll('.q-blank-row').length,
      feedback:[...document.querySelectorAll('.questionnaire-visual-editor label')]
        .find(label=>label.textContent?.includes('Mostrar resultados al alumno'))?.querySelector('select')?.value
    }));
    assert.equal(restored.mode,'drag');
    assert.equal(restored.correct,'Sol');
    assert.equal(restored.distractors,'Luna\nMarte');
    assert.equal(restored.blankCount,1);
    assert.equal(restored.feedback,'after-submit');
    assert.match(restored.sentence,/La Tierra gira alrededor del \{\{[^{}]+\}\}\./);
    await page.screenshot({path:join(evidence,'studio-reopened-exported-course.png'),fullPage:false});
    await writeFile(join(evidence,'export-roundtrip-report.json'),
      JSON.stringify({file:exported.suggestedFilename(),bytes:originalBytes.length,sha256:hash,
        restored,originalAuthoring:state,verified: true},null,2)+'\n','utf8');
    console.log('P2LRN_REAL_STUDIO_EXPORT_ROUNDTRIP='+JSON.stringify({
      bytes:originalBytes.length,sha256:hash,restored}));

  }catch(error){
    await page.screenshot({path:join(evidence,'student-interaction-error.png'),fullPage:false}).catch(()=>{});
    await writeFile(join(evidence,'student-interaction-error.json'),
      JSON.stringify({message:String(error),url:page.url()},null,2)+'\n','utf8');
    throw error;
  }
}

async function captureMultipartStudioChrome(){
  const folder=join(repo,'.p2lrn-i18n-ci','evidence','multipart');
  await mkdir(folder,{recursive:true});
  const captures=[];
  for(const [lang,url,entryLabel,fieldLabel] of [
    ['es','/studio/','Dividir paquete (multipart)…','Tamaño de cada parte (MiB)'],
    ['en','/en/studio/','Split package (multipart)…','Part size (MiB)']
  ]){
    const response=await page.goto(base+url,{waitUntil:'domcontentloaded',timeout:30000});
    assert.equal(response?.status(),200,lang+' Studio HTTP 200');
    await page.waitForFunction(()=>document.documentElement.dataset.p2lrnStudioReady==='true',{timeout:30000});
    await page.locator('.p2lrn-file-menu > summary').click();
    const option=page.locator('[data-studio-multipart-entry]');
    await option.waitFor({state:'visible'});
    assert.equal((await option.innerText()).trim(),entryLabel);
    const menuFile=join(folder,'studio-multipart-menu-'+lang+'.png');
    await page.screenshot({path:menuFile,animations:'disabled'});
    await option.click();
    const dialog=page.locator('dialog.p2lrn-multipart-dialog');
    await dialog.waitFor({state:'visible'});
    const field=dialog.locator('input[data-studio-multipart-part-size]');
    assert.equal(await field.inputValue(),'25');
    assert.ok((await field.locator('xpath=..').innerText()).includes(fieldLabel));
    await field.fill('0');
    await dialog.locator('button[type=submit]').click();
    assert.match(await dialog.locator('[role=status]').innerText(),/1.*64/);
    await field.fill('25');
    const fieldFile=join(folder,'studio-multipart-field-'+lang+'.png');
    await page.screenshot({path:fieldFile,animations:'disabled'});
    for(const file of [menuFile,fieldFile]){
      const bytes=await readFile(file);
      assert.ok(bytes.length>5000,'Browser screenshot unexpectedly small: '+file);
      captures.push({lang,file,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
  }
  assert.deepEqual(exceptions,[],'Uncaught multipart Studio browser errors');
  await writeFile(join(folder,'multipart-browser-report.json'),
    JSON.stringify({ok:true,captures,source:'Real Chromium rendering candidate Studio source'},null,2)+'\n');
  console.log('P2LRN_MULTIPART_STUDIO_CHROME='+JSON.stringify({ok:true,captures}));
}

try{
  if(process.argv.includes('--capture-multipart')){
    await captureMultipartStudioChrome();
  } else if(process.argv.includes('--site-a11y')){
    await fullSiteAccessibilityChrome();
  } else if(process.argv.includes('--capture-fill-blanks')){
    await captureFillBlanksAuthoring();
  } else if(process.argv.includes('--docs-only')){
    await siteParity();
    await browserNavigation();
    await questionnaireDocsVisualQA();
    await docsRoleNavigationChrome('es');
    await docsRoleNavigationChrome('en');
    await editorialDocsChrome('es');
    await editorialDocsChrome('en');
    assert.deepEqual(exceptions,[],'Browser uncaught errors during docs QA: '+exceptions.join('; '));
    console.log('P2LRN_BROWSER_DOCS_ONLY=PASS');
  } else {
  await siteParity();
  await browserNavigation();
  await questionnaireDocsVisualQA();
  await docsRoleNavigationChrome('es');
  await docsRoleNavigationChrome('en');
  await standardQuiz('en');
  await standardQuiz('es');
  await trueFalseGame('en');
  await trueFalseGame('es');
  await additionalGameRenderers('en');
  await additionalGameRenderers('es');
  await studioChrome('es');
  await studioChrome('en');
  await analyticsChrome('es');
  await analyticsChrome('en');
  assert.deepEqual(exceptions,[],'Browser uncaught errors: '+exceptions.join('; '));
  console.log('P2LRN_BROWSER_I18N_SUITE=PASS');
  }
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
