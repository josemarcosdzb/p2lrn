import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot=fileURLToPath(new URL('../../../',import.meta.url));
const read=(relative)=>readFileSync(join(repoRoot,relative),'utf8');

test('AI guide starts with creation without MCP and documents three safe connection modes',()=>{
  const ai=read('deploy/netlify/site/docs/conectores/ia/index.html');
  const local=read('deploy/netlify/site/docs/conectores/local/index.html');
  const index=read('deploy/netlify/site/docs/conectores/index.html');
  const readme=read('integration/mcp/README.md');
  const anchors=['skills-sin-mcp','chatgpt','claude','gemini','grok','conexion-local','chatgpt-pc','conexion-remota','ejemplos','solucion-problemas'];
  const indices=anchors.map(id=>ai.indexOf('id="'+id+'"'));
  assert(indices.every(i=>i>0),'A required AI section is missing');
  assert(indices.every((i,pos)=>!pos||i>indices[pos-1]),
    'Skills and all providers must appear before optional MCP infrastructure');
  assert(ai.includes('P2LRN – Crear y descargar'));
  assert(ai.includes('sin instalar MCP'));
  assert(ai.includes('P2LRN_MCP_WRITE=0'));
  assert(ai.includes('tunnel-client doctor --profile p2lrn-local --explain'));
  assert(ai.includes('tunnel-client run --profile p2lrn-local'));
  assert(ai.includes('id="conexion-remota"><h2>Opcional'));
  assert(ai.includes('ChatGPT web no puede abrir directamente'));
  assert(ai.includes('sin contratar un dominio'));
  assert(ai.includes('href="/downloads/p2lrn-conector-mcp.zip"'));
  assert(local.includes('No necesitas una web, dominio, HTTPS ni abrir puertos'));
  assert(index.includes('Conectores para IA'));
  assert(readme.includes('## ChatGPT web leyendo cursos del PC sin un dominio propio'));
  assert(readme.includes('## Crear cursos sin MCP: Skills P2LRN en ChatGPT, Claude y Gemini'));
  const server=read('integration/mcp/server.mjs');
  assert(server.includes("mode = process.argv[2] || '--stdio'"));
  assert(server.includes("'127.0.0.1'"));
});

test('local first-run --help still succeeds without installing MCP dependencies',()=>{
  const temp=mkdtempSync(join(tmpdir(),'p2lrn-mcp-quickstart-'));
  try{
    const source=join(repoRoot,'integration','mcp');
    for(const name of ['connect-local.mjs','local-clients.mjs'])
      copyFileSync(join(source,name),join(temp,name));
    const result=spawnSync(process.execPath,[join(temp,'connect-local.mjs'),'--help'],
      {cwd:temp,encoding:'utf8',timeout:10000,env:{...process.env}});
    assert.equal(result.status,0,result.stderr||result.stdout);
    assert.match(result.stdout,/P2LRN/);
    assert.match(result.stdout,/stdio/);
    assert.match(result.stdout,/HTTPS\/túnel/);
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test('sidebar advertises a single AI entry and retains nested LMS and LTI',()=>{
  const index=read('deploy/netlify/site/docs/conectores/index.html');
  const ai=read('deploy/netlify/site/docs/conectores/ia/index.html');
  const nav=read('deploy/netlify/site/p2lrn.js');
  const build=read('deploy/netlify/build-site.mjs');
  const sitemap=read('deploy/netlify/site/sitemap.xml');
  const grid=/<div class="docs-path-grid">([\s\S]*?)<\/div>/.exec(index)?.[1];
  assert(grid,'Connector index cards missing');
  const links=[...grid.matchAll(/href="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(links,[
    '/docs/conectores/ia/','/docs/conectores/lms/','/docs/conectores/lti/'
  ]);
  const childNav=/const DOC_SIDEBAR_CHILDREN = new Map\(\[([\s\S]*?)\]\);/.exec(nav)?.[1];
  assert(childNav,'Sidebar group missing');
  const connectorChild=/\['\/docs\/conectores\/',\[([\s\S]*?)\]\],/.exec(childNav)?.[1];
  assert(connectorChild,'Connector sidebar children missing');
  assert.deepEqual([...connectorChild.matchAll(/\['([^']+)','([^']+)'\]/g)].map(x=>x[1]),links);
  assert(connectorChild.includes('Conectores para IA'));
  assert(!connectorChild.includes('ChatGPT, Claude y Grok'));
  assert(!connectorChild.includes('Gemini web y CLI'));
  assert(!connectorChild.includes('Skills sin MCP'));
  assert(!connectorChild.includes('IA local'));
  assert(nav.includes('CONNECTOR_IA_DETAIL_ROUTES'));
  for(const detail of ['gemini','skills','local']){
    const route='/docs/conectores/'+detail+'/';
    assert(!links.includes(route),'AI subguide leaked into overview: '+route);
    assert(ai.includes('href="'+route+'"'),'Historical guide not linked from IA page: '+route);
    assert(sitemap.includes('https://p2lrn.netlify.app'+route),
      'Historical guide was removed from sitemap: '+route);
  }
  for(const route of ['','ia','lms','lti']){
    assert(sitemap.includes('https://p2lrn.netlify.app/docs/conectores/'+(route?route+'/':'')));
  }
  assert(build.includes('visibleConnectorSlugs'));
  assert(build.includes('Connector overview must present IA, LMS and LTI only'));
});

test('all four AI platforms have Skills/MCP options, examples, tests and honest availability',()=>{
  const ai=read('deploy/netlify/site/docs/conectores/ia/index.html');
  const gemini=read('deploy/netlify/site/docs/conectores/gemini/index.html');
  const skills=read('deploy/netlify/site/docs/conectores/skills/index.html');
  const local=read('deploy/netlify/site/docs/conectores/local/index.html');
  for(const platform of ['ChatGPT','Claude','Gemini','Grok']){
    assert(ai.includes('<h2>'+platform+'</h2>'),'Missing top-level platform section '+platform);
    assert(ai.includes('<strong>'+platform+'</strong>'),'Missing platform-specific example '+platform);
  }
  assert(ai.includes('Gemini web: Skills o Gems'));
  assert(ai.includes('Gemini CLI: Agent Skills sin MCP'));
  assert(ai.includes('gemini --install --verify'));
  assert(ai.includes('Claude Desktop'));
  assert(ai.includes('grok.com/connectors'));
  assert(ai.includes('No se anuncia una instalación de Skill inexistente'));
  assert(ai.includes('no dispone todavía como descarga pública')||
    ai.includes('no se ofrece todavía como descarga pública'));
  assert((ai.match(/class="codebox"/g)||[]).length>=7);
  assert((ai.match(/data-copy/g)||[]).length>=7);
  assert(ai.includes('p2lrn_list_courses')&&ai.includes('p2lrn_validate_course'));
  for(const html of [gemini,skills,local]){
    assert(html.includes('class="doc-content"'));
    assert((html.match(/<section class="doc-section"/g)||[]).length>=4);
  }
  assert(gemini.includes('No está verificada como Skill de Gemini web'));
  assert(skills.includes('no ofrece todavía un ZIP público'));
  assert(read('integration/mcp/README.md').includes('## Gemini CLI con el MCP local opcional'));
});
