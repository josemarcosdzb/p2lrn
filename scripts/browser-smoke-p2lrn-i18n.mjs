import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,extname,join,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const site=join(repo,'deploy','netlify','site');
const toolkit=join(repo,'packages','toolkit','web');
const playwrightFile=join(repo,'.p2lrn-i18n-ci','node_modules','playwright-core','index.mjs');
const {chromium}=await import(pathToFileURL(playwrightFile).href);
const contentTypes={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
function chromeBinary(){
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
  const routes=[
    ['/toolkit-web/',toolkit],
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
    const target=await fileFor(new URL(req.url,'http://localhost').pathname);
    if(!target){res.writeHead(404);res.end('Not found');return;}
    const bytes=await readFile(target);
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
        '3d':/Select an object/
      };
      if(uiMarker[cfg.slug])assert.match(snapshot.status,uiMarker[cfg.slug],'Untranslated game instructions: '+cfg.slug);
    }
    console.log('BROWSER_GAME_'+cfg.slug.toUpperCase()+'_'+language.toUpperCase()+'=pass');
  }
}

try{
  await siteParity();
  await browserNavigation();
  await standardQuiz('en');
  await standardQuiz('es');
  await trueFalseGame('en');
  await trueFalseGame('es');
  await additionalGameRenderers('en');
  await additionalGameRenderers('es');
  assert.deepEqual(exceptions,[],'Browser uncaught errors: '+exceptions.join('; '));
  console.log('P2LRN_BROWSER_I18N_SUITE=PASS');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
