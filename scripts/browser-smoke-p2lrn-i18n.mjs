import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,readdir,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,extname,join,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

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
  const candidates=[join(site,clean.slice(1))];
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
  const teacher=isEnglish?'/en/docs/colaboracion/':'/docs/colaboracion/';
  const developer=isEnglish?'/en/docs/desarrolladores/colaboracion/':'/docs/desarrolladores/colaboracion/';
  const portal=isEnglish?'/en/docs/developers/':'/docs/desarrolladores/';
  const npm=isEnglish?'/en/docs/npm/':'/docs/npm/';
  const teacherResponse=await page.goto(base+teacher,{waitUntil:'domcontentloaded'});
  assert.equal(teacherResponse?.status(),200,'Teacher collaboration page not found');
  await page.locator('.doc-sidebar a').first().waitFor({timeout:10000});
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

try{
  if(process.argv.includes('--docs-only')){
    await questionnaireDocsVisualQA();
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
