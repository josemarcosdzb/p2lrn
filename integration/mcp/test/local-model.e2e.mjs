// Local-model-to-P2LRN MCP E2E. No cloud inference, no user courses, no downloads.
import {copyFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const fixture = fileURLToPath(new URL('../../../examples/canonical/minimal-course.p2lrn', import.meta.url));
const server = fileURLToPath(new URL('../server.mjs', import.meta.url));
const portHosts = ['http://127.0.0.1:11434', 'http://127.0.0.1:1234/v1', 'http://127.0.0.1:8080/v1'];
const explicitUrl = process.env.P2LRN_LOCAL_MODEL_URL;
if (explicitUrl) {
  const parsed = new URL(explicitUrl);
  if (!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname) || parsed.protocol !== 'http:') {
    throw new Error('P2LRN_LOCAL_MODEL_URL must be a local loopback HTTP endpoint');
  }
}
const candidates = explicitUrl ? [explicitUrl] : portHosts;
async function query(url, options = {}, timeout = 4000) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(timeout)});
  if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + (await response.text()).slice(0,400));
  return response.json();
}
async function detect() {
  for (const root of candidates) {
    try {
      const tags = await query(root.replace(/\/$/,'') + '/api/tags');
      const models = Array.isArray(tags.models)
        ? tags.models.filter(x => x && x.name).sort((a,b) => (Number(a.size)||0) - (Number(b.size)||0))
          .map(x => x.name).filter(x => !process.env.P2LRN_LOCAL_MODEL_NAME || x === process.env.P2LRN_LOCAL_MODEL_NAME)
        : [];
      for (const model of models) {
        try {
          const detail = await query(root.replace(/\/$/,'') + '/api/show',{
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({model})
          });
          if (!Array.isArray(detail.capabilities) || !detail.capabilities.includes('completion') || !detail.capabilities.includes('tools')) continue;
          return {kind:'ollama', root, model};
        } catch { continue; }
      }
    } catch {}
    try {
      const result = await query(root.replace(/\/$/,'') + '/models');
      const model = Array.isArray(result.data) ? result.data.find(x => x.id)?.id : null;
      if (model) return {kind:'openai-compatible',root,model};
    } catch {}
  }
  return null;
}
const found = await detect();
if (!found) {
  console.log('P2LRN_LOCAL_LLM_TEST=SKIPPED; reason=no installed model serving on 127.0.0.1:11434, 1234 or 8080; no cloud call made');
  process.exit(0);
}
console.log('P2LRN_LOCAL_LLM_DETECTED='+JSON.stringify({provider:found.kind,model:found.model,root:found.root}));
const dir = mkdtempSync(join(tmpdir(),'p2lrn-local-model-'));
const transport = new StdioClientTransport({command:process.execPath,args:[server,'--stdio'],
  env:{...process.env,P2LRN_MCP_ROOT:dir,P2LRN_MCP_WRITE:'0'}});
const client = new Client({name:'p2lrn-local-llm-e2e',version:'0.1.0'});
let connected = false;
try {
  copyFileSync(fixture,join(dir,'fixture.p2lrn'));
  await client.connect(transport);
  connected = true;
  const match = (await client.listTools()).tools.find(tool => tool.name === 'p2lrn_list_courses');
  if (!match) throw new Error('MCP list tool missing');
  const system = 'Tienes disponible un servidor MCP con cursos P2LRN. Debes invocar la herramienta p2lrn_list_courses para responder. No inventes nombres de cursos.';
  const user = 'Enumera los cursos P2LRN disponibles, usando la herramienta proporcionada.';
  const tool = {type:'function',function:{name:match.name,description:match.description,parameters:match.inputSchema}};
  let response;
  if (found.kind === 'ollama') {
    response = await query(found.root.replace(/\/$/,'') + '/api/chat', {
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:found.model,stream:false,options:{temperature:0,num_predict:128},
        messages:[{role:'system',content:system},{role:'user',content:user}],tools:[tool]})
    },180000);
  } else {
    response = await query(found.root.replace(/\/$/,'') + '/chat/completions', {
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:found.model,temperature:0,max_tokens:128,
        messages:[{role:'system',content:system},{role:'user',content:user}],tools:[tool],tool_choice:'auto'})
    },90000);
  }
  const calls = found.kind === 'ollama' ? response.message?.tool_calls : response.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls) || calls.length < 1) throw new Error('Local model did not issue an MCP tool call');
  const chosen = calls.find(call => call.function?.name === match.name);
  if (!chosen) throw new Error('Local model selected a different tool');
  const rawArgs = chosen.function.arguments;
  const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs ?? {};
  if (Object.keys(args).some(k => !['limit'].includes(k))) throw new Error('Unrecognized model arguments');
  const result = await client.callTool({name:match.name,arguments:{limit:Math.max(1,Math.min(10,Number(args.limit)||10))}});
  if (result.isError) throw new Error('MCP tool call returned error');
  const data = JSON.parse(result.content.find(x => x.type === 'text').text);
  if (!Array.isArray(data.courses) || !data.courses.some(x=>x.path==='fixture.p2lrn')) {
    throw new Error('The model-selected MCP tool did not return the fixture course');
  }
  console.log('P2LRN_LOCAL_LLM_TEST=PASS; model-issued tool='+match.name+'; real MCP course=fixture.p2lrn; no user data touched');
} catch(error) {
  console.error('P2LRN_LOCAL_LLM_TEST=FAIL; model='+found.model+'; reason='+(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  if (connected) await client.close();
  rmSync(dir,{recursive:true,force:true});
}
