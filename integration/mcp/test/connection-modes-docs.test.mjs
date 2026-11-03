import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync,mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const read=relative=>readFileSync(join(root,relative),'utf8');
const routes=[
  ['/docs/conectores/','Conectores e integración'],
  ['/docs/conectores/ia/','Conectores para IA'],
  ['/docs/conectores/lms/','Plataformas LMS'],
  ['/docs/conectores/lti/','Módulo LTI 1.3'],
];
const legacy=new Map([
  ['gemini','gemini'],['skills','crear-cursos'],['local','conectar-ordenador'],
]);

test('overview keeps three connection modes and exposes Skills as a separate resource',()=>{
  const index=read('deploy/netlify/site/docs/conectores/index.html');
  const nav=read('deploy/netlify/site/p2lrn.js');
  const cardGroup=/<div class="docs-path-grid">([\s\S]*?)<\/div>/.exec(index)?.[1];
  assert(cardGroup,'Overview navigation cards missing');
  const cards=[...cardGroup.matchAll(/<a href="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(cards,routes.slice(1).map(x=>x[0]));
  const childGroup=/\['\/docs\/conectores\/',\[([\s\S]*?)\]\],/.exec(nav)?.[1];
  assert(childGroup,'Connector sidebar links missing');
  const children=[...childGroup.matchAll(/\['([^']+)','([^']+)'\]/g)].map(x=>[x[1],x[2]]);
  assert.deepEqual(children,[
    routes[1],
    ['/docs/skills/','Skills P2LRN para IA'],
    routes[2],
    routes[3],
  ]);
  assert(index.includes('Qué necesitas conectar'));
  assert(index.includes('href="/skills/"'));
  assert(index.includes('href="/docs/skills/"'));
  assert(!index.includes('IA local'));
  assert(!index.includes('Skills sin MCP'));
  assert(!index.includes('href="/docs/conectores/local/"'));
});

test('one AI guide explains concepts once and documents all four platforms',()=>{
  const ai=read('deploy/netlify/site/docs/conectores/ia/index.html');
  const sections=[
    ['para-que','¿Qué quieres hacer?'],
    ['crear-cursos','Crear y descargar un curso con una Skill'],
    ['chatgpt','ChatGPT'],
    ['claude','Claude'],
    ['gemini','Gemini'],
    ['grok','Grok'],
    ['conectar-ordenador','Instalar el conector en tu ordenador'],
    ['servicios-web','Conectar desde un servicio web'],
    ['comprobar','Comprobaciones y problemas frecuentes'],
  ];
  let previous=-1;
  for(const [id,label] of sections){
    const pattern='<section class="doc-section" id="'+id+'">';
    const pos=ai.indexOf(pattern);
    assert(pos>previous,'Section missing or out of order: '+id);previous=pos;
    assert(ai.includes('<h2>'+label+'</h2>'),'Section label missing: '+label);
  }
  assert(ai.indexOf('Una Skill proporciona instrucciones')<ai.indexOf('<h2>ChatGPT</h2>'));
  assert(ai.includes('«P2LRN – Crear y descargar»'));
  assert(ai.includes('p2lrn_list_courses')&&ai.includes('p2lrn_validate_course'));
  assert(ai.includes('P2LRN_MCP_WRITE=0'));
  assert(ai.includes('href="/downloads/p2lrn-conector-mcp.zip"'));
  assert(ai.includes('Claude Desktop')&&ai.includes('Gemini CLI')&&ai.includes('Grok Connectors'));
  assert(!ai.includes('href="/docs/conectores/skills/"'));
  assert(!ai.includes('href="/docs/conectores/gemini/"'));
  assert(!ai.includes('href="/docs/conectores/local/"'));
  assert(!/<h2>.*sin MCP/i.test(ai),'MCP status must not dominate headings');
  assert((ai.match(/class="codebox"/g)||[]).length>=4);
  const spanishNav=read('deploy/netlify/site/p2lrn.js');
  const englishNav=read('deploy/netlify/site/en/p2lrn.js');
  const css=read('deploy/netlify/site/p2lrn.css');
  for(const nav of [spanishNav,englishNav]){
    // Sections stay in the content and in the right-hand in-page table of
    // contents. They must not also appear under the left connector menu.
    assert(!nav.includes('DOC_AI_TOPICS'),'Legacy left-side IA topic list must not be present');
    assert(!nav.includes('doc-ai-topics'),'The left menu must not duplicate the page TOC');
    assert(nav.includes("aside.className='doc-page-toc'"),'Right-hand page index must remain');
    assert(nav.includes("a.href='#'+heading.id"),'In-page section links must remain');
    assert(nav.includes("a.setAttribute('aria-current','location')"),'Keyboard/screen-reader current-section semantics must remain');
  }
  assert(!css.includes('.doc-sidebar .doc-ai-topics'),'Dead duplicate-sidebar styles must be removed');
  assert(css.includes('.doc-section[id],.doc-anchor-alias[id]'));
  assert(ai.includes('<html lang="es" class="doc-instant-anchor">'));
  assert(css.includes('html.doc-instant-anchor{scroll-behavior:auto}'));
});

test('LTI bilingual docs have a real deployment workflow and distinguish implemented features',()=>{
  const guides=[
    {path:'deploy/netlify/site/docs/conectores/lti/index.html',language:'es',title:'Guía práctica: conectar P2LRN con un LMS'},
    {path:'deploy/netlify/site/en/docs/conectores/lti/index.html',language:'en',title:'Practical guide: connect P2LRN to an LMS'}
  ];
  for(const guide of guides){
    const html=read(guide.path);
    assert(html.includes(guide.title),'Missing actionable LTI guide: '+guide.language);
    for(const endpoint of ['/lti/login','/lti/launch','/lti/jwks','/lti/deep-link',
      '/lti/admin/platforms','/lti/admin/catalog','/lti/admin/bindings',
      '/lti/admin/grades','/lti/admin/ags/pending','/lti/health']){
      assert(html.includes(endpoint),'LTI endpoint undocumented: '+endpoint+' ('+guide.language+')');
    }
    for(const item of ['P2LRN_LTI_BASE_URL','P2LRN_LTI_ADMIN_TOKEN_FILE',
      'P2LRN_LTI_KEY_FILE','P2LRN_LTI_DATA_DIR','packageId','contentRoot',
      'issuer','clientId','deploymentId','JWKS','Deep Linking','AGS','NRPS']){
      assert(html.includes(item),'LTI configuration missing: '+item+' ('+guide.language+')');
    }
    assert(html.includes('rel="canonical"'),'Missing canonical: '+guide.language);
    assert(html.includes('hreflang="en"')&&html.includes('hreflang="es"'),
      'Missing bilingual alternates: '+guide.language);
    assert(!/NRPS is implemented/i.test(html),'NRPS must not be marked as implemented');
    assert(html.includes('<section class="doc-section" id="lti-')&&html.includes('class="codebox"'),
      'LTI guide must have readable sections and copyable examples');
  }
});

test('legacy links redirect to canonical section and are excluded from navigation',()=>{
  const nav=read('deploy/netlify/site/p2lrn.js');
  const sitemap=read('deploy/netlify/site/sitemap.xml');
  const config=read('netlify.toml');
  const redirectBlocks=config.split('[[redirects]]').slice(1);
  for(const [slug,anchor] of legacy){
    const route='/docs/conectores/'+slug+'/';
    const destination='/docs/conectores/ia/#'+anchor;
    const page=read('deploy/netlify/site/docs/conectores/'+slug+'/index.html');
    assert(page.includes('content="0;url='+destination+'"'),'Local fallback missing: '+slug);
    assert(page.includes('name="robots" content="noindex,follow"'));
    assert(page.includes('rel="canonical"'));
    assert(redirectBlocks.some(block=>block.includes('from = "'+route+'"')&&
      block.includes('to = "'+destination+'"')&&block.includes('status = 301')&&
      block.includes('force = true')),'Production redirect missing '+slug);
    assert(!sitemap.includes('https://p2lrn.org'+route));
    assert(!nav.includes("['"+route+"','"),'Orphan route advertised in navigation: '+slug);
  }
  for(const [route] of routes)assert(sitemap.includes('https://p2lrn.org'+route));
  const lms=read('deploy/netlify/site/docs/conectores/lms/index.html');
  assert(lms.includes('class="prev" href="/docs/conectores/ia/"'));
});

test('no documentation link opens a hidden old AI page',()=>{
  const docs=join(root,'deploy','netlify','site','docs');
  function* files(dir){
    for(const entry of readdirSync(dir,{withFileTypes:true})){
      const full=join(dir,entry.name);
      if(entry.isDirectory())yield* files(full);
      else if(entry.name.endsWith('.html'))yield full;
    }
  }
  let checked=0;
  for(const file of files(docs)){
    if(/[\\/]conectores[\\/](gemini|skills|local)[\\/]index\.html$/.test(file))continue;
    const html=readFileSync(file,'utf8');
    for(const slug of legacy.keys())
      assert(!html.includes('href="/docs/conectores/'+slug+'/'),
        'Hidden legacy connector link still used in: '+file);
    checked++;
  }
  assert(checked>35,'Whole documentation site was not inspected');
});

test('every documentation page is represented in the shared sidebar',()=>{
  const nav=read('deploy/netlify/site/p2lrn.js');
  const docs=join(root,'deploy','netlify','site','docs');
  function* pages(dir){
    for(const entry of readdirSync(dir,{withFileTypes:true})){
      const full=join(dir,entry.name);
      if(entry.isDirectory())yield* pages(full);
      else if(entry.name==='index.html')yield full;
    }
  }
  let checked=0;
  for(const file of pages(docs)){
    const relative=file.slice(docs.length).replaceAll('\\','/').replace(/^\/+/, '');
    const parts=relative.split('/');
    const slug=parts.length>2&&parts[0]==='conectores'?parts[1]:null;
    if(slug&&legacy.has(slug))continue;
    const route='/docs/'+parts.slice(0,-1).join('/')+(parts.length>1?'/':'');
    assert(nav.includes("'"+route+"'"),'Documentation page missing from sidebar/navigation: '+route);
    checked++;
  }
  assert(checked>40,'Documentation page inventory incomplete');
});

test('local connector first-run help works with no installed MCP package',()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-connector-help-'));
  try{
    for(const name of ['connect-local.mjs','local-clients.mjs'])
      copyFileSync(join(root,'integration','mcp',name),join(dir,name));
    const result=spawnSync(process.execPath,[join(dir,'connect-local.mjs'),'--help'],
      {cwd:dir,encoding:'utf8',timeout:10000,env:{...process.env}});
    assert.equal(result.status,0,result.stderr||result.stdout);
    assert.match(result.stdout,/P2LRN/);
    assert.match(result.stdout,/stdio/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
