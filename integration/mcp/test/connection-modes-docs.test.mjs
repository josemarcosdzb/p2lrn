import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot=fileURLToPath(new URL('../../../',import.meta.url));
const read=(relative)=>readFileSync(join(repoRoot,relative),'utf8');

test('website documents local PC first, ChatGPT private tunnel second, public HTTPS as optional',()=>{
  const ai=read('deploy/netlify/site/docs/conectores/ia/index.html');
  const local=read('deploy/netlify/site/docs/conectores/local/index.html');
  const index=read('deploy/netlify/site/docs/conectores/index.html');
  const readme=read('integration/mcp/README.md');
  const localAt=ai.indexOf('id="conexion-local"');
  const tunnelAt=ai.indexOf('id="chatgpt-pc"');
  const remoteAt=ai.indexOf('id="conexion-remota"');
  assert(localAt>0&&tunnelAt>localAt&&remoteAt>tunnelAt,
    'A local PC walkthrough must precede tunnel and optional public HTTP docs');
  for(const id of ['conexion-local','chatgpt-pc','conexion-remota']){
    assert(ai.includes('href="#'+id+'"'),'Missing navigation link for '+id);
  }
  assert(ai.includes('integration\\mcp\\Conectar-P2LRN.cmd'));
  assert(ai.includes('Secure MCP Tunnel'));
  assert(ai.includes('tunnel-client doctor --profile p2lrn-local --explain'));
  assert(ai.includes('tunnel-client run --profile p2lrn-local'));
  assert(ai.includes('id="conexion-remota"><h2>Opcional'));
  assert(ai.includes('ChatGPT web no conecta directamente'));
  assert(ai.includes('sin dominio propio'));
  assert(local.includes('No necesitas una web, dominio, HTTPS ni abrir puertos'));
  assert(local.includes('/docs/conectores/ia/#chatgpt-pc'));
  assert(index.includes('Conectar tus cursos del PC'));
  assert(readme.includes('## ChatGPT web leyendo cursos del PC sin un dominio propio'));
  assert(readme.includes('P2LRN_MCP_WRITE=0'));
  const server=read('integration/mcp/server.mjs');
  assert(server.includes("mode = process.argv[2] || '--stdio'"));
  assert(server.includes("'127.0.0.1'"));
});

test('local PC first-run --help succeeds without installing any MCP dependencies',()=>{
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


test('Gemini and no-MCP Skills stay separate from MCP across site navigation and docs',()=>{
  const index=read('deploy/netlify/site/docs/conectores/index.html');
  const ai=read('deploy/netlify/site/docs/conectores/ia/index.html');
  const local=read('deploy/netlify/site/docs/conectores/local/index.html');
  const gemini=read('deploy/netlify/site/docs/conectores/gemini/index.html');
  const skills=read('deploy/netlify/site/docs/conectores/skills/index.html');
  const navbar=read('deploy/netlify/site/p2lrn.js');
  const sitemap=read('deploy/netlify/site/sitemap.xml');
  const build=read('deploy/netlify/build-site.mjs');
  const readme=read('integration/mcp/README.md');

  assert.match(index,/Seis guías independientes/);
  for(const route of ['skills','gemini','ia','local','lms','lti']){
    assert(index.includes('href="/docs/conectores/'+route+'/"'),'Missing index card: '+route);
    assert(navbar.includes("['/docs/conectores/"+route+"/',"),'Missing shared sidebar entry: '+route);
    assert(sitemap.includes('https://p2lrn.netlify.app/docs/conectores/'+route+'/'),
      'Missing sitemap route: '+route);
    assert(build.includes("['"+route+"',"),'Build not guarding route: '+route);
  }
  assert(index.indexOf('href="/docs/conectores/skills/"')<index.indexOf('href="/docs/conectores/ia/"'),
    'No-MCP creation path must be visible before remote MCP');
  assert(ai.includes('Skill sin MCP')&&ai.includes('href="/docs/conectores/skills/"'));
  assert(local.includes('Skills sin MCP')&&local.includes('Gemini CLI'));
  assert.match(gemini,/Gemini en la web: Skills, sin MCP/);
  assert.match(gemini,/Gemini web: alternativa con Gems/);
  assert.match(gemini,/Gemini CLI: Agent Skills sin servidor MCP/);
  assert.match(gemini,/Gemini CLI: conectar tus cursos del PC mediante MCP/);
  assert.match(gemini,/--clients gemini --install --verify/);
  assert.match(gemini,/no está verificada como Skill de Gemini web/);
  assert.match(skills,/ChatGPT: «P2LRN – Crear y descargar»/);
  assert.match(skills,/Claude: Skills sin instalar el servidor P2LRN/);
  assert.match(skills,/Gemini: Skills o Gems web y Agent Skills en CLI/);
  assert.match(skills,/esta web <strong>no ofrece todavía un ZIP público/);
  assert(!skills.includes('href="/downloads/p2lrn-conector-mcp.zip"'),
    'No-MCP skill guide must not misdirect users to install MCP');
  assert.match(readme,/## Crear cursos sin MCP: Skills P2LRN en ChatGPT, Claude y Gemini/);
  assert.match(readme,/## Gemini CLI con el MCP local opcional/);
  for(const content of [gemini,skills]){
    assert(content.includes('class="doc-main"'));
    assert(content.includes('class="doc-sidebar"'));
    assert((content.match(/<section class="doc-section">/g)||[]).length>=5);
    assert(content.includes('class="doc-pager"'));
  }
});
