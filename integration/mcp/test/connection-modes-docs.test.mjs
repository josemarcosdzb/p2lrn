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

test('overview has only three clear destinations in the same order as sidebar',()=>{
  const index=read('deploy/netlify/site/docs/conectores/index.html');
  const nav=read('deploy/netlify/site/p2lrn.js');
  const cardGroup=/<div class="docs-path-grid">([\s\S]*?)<\/div>/.exec(index)?.[1];
  assert(cardGroup,'Overview navigation cards missing');
  const cards=[...cardGroup.matchAll(/<a href="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(cards,routes.slice(1).map(x=>x[0]));
  const childGroup=/\['\/docs\/conectores\/',\[([\s\S]*?)\]\],/.exec(nav)?.[1];
  assert(childGroup,'Connector sidebar links missing');
  const children=[...childGroup.matchAll(/\['([^']+)','([^']+)'\]/g)].map(x=>[x[1],x[2]]);
  assert.deepEqual(children,routes.slice(1));
  assert(index.includes('Qué necesitas conectar'));
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
  const sidebar=read('deploy/netlify/site/p2lrn.js');
  const css=read('deploy/netlify/site/p2lrn.css');
  for(const [id,label] of sections){
    assert(sidebar.includes("['"+id+"','"+({
      'para-que':'Qué puedes hacer',
      'crear-cursos':'Crear cursos',
      'conectar-ordenador':'Conectar tu ordenador',
      'servicios-web':'Acceso desde la web',
      'comprobar':'Comprobaciones',
    }[id]||label)+"']"),'Sidebar missing topic '+id);
  }
  assert(sidebar.includes("topics.setAttribute('aria-label','Apartados de Conectores para IA')"));
  assert(sidebar.includes("link.dataset.targetId===sectionId"),'Scroll position is not reflected in sidebar');
  assert(css.includes('.doc-sidebar .doc-ai-topics a[aria-current="location"]'));
  assert(css.includes('.doc-section[id],.doc-anchor-alias[id]'));
  assert(ai.includes('<html lang="es" class="doc-instant-anchor">'),
    'AI guide needs instant anchors to keep its active sidebar in sync');
  assert(css.includes('html.doc-instant-anchor{scroll-behavior:auto}'));
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
    assert(!sitemap.includes('https://p2lrn.netlify.app'+route));
    assert(!nav.includes("['"+route+"','"),'Orphan route advertised in navigation: '+slug);
  }
  for(const [route] of routes)assert(sitemap.includes('https://p2lrn.netlify.app'+route));
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
