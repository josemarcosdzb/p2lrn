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
const explicitModel = process.env.P2LRN_LOCAL_MODEL_NAME;
if (explicitUrl) {
  const parsed = new URL(explicitUrl);
  if (!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname) || parsed.protocol !== 'http:') {
    throw new Error('P2LRN_LOCAL_MODEL_URL must be a local loopback HTTP endpoint');
  }
}
const endpoints = explicitUrl ? [explicitUrl] : portHosts;

async function query(url, options = {}, timeout = 4000) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(timeout)});
  if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + (await response.text()).slice(0,400));
  return response.json();
}

async function detectCandidates() {
  const found=[];
  for (const root of endpoints) {
    try {
      const tags = await query(root.replace(/\/$/,'') + '/api/tags');
      const models = Array.isArray(tags.models)
        ? tags.models.filter(x => x && x.name)
          .sort((a,b) => (Number(a.size)||0) - (Number(b.size)||0))
          .filter(x => !explicitModel || x.name === explicitModel)
        : [];
      for (const item of models) {
        try {
          const detail = await query(root.replace(/\/$/,'') + '/api/show',{
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({model:item.name})
          });
          if (!Array.isArray(detail.capabilities) || !detail.capabilities.includes('completion') || !detail.capabilities.includes('tools')) continue;
          found.push({kind:'ollama',root,model:item.name,size:Number(item.size)||0});
        } catch {}
      }
    } catch {}
    try {
      const result = await query(root.replace(/\/$/,'') + '/models');
      const models = Array.isArray(result.data)
        ? result.data.filter(x=>x?.id).filter(x=>!explicitModel||x.id===explicitModel)
        : [];
      for (const item of models) found.push({kind:'openai-compatible',root,model:item.id,size:0});
    } catch {}
  }
  const unique=[];
  const seen=new Set();
  for (const item of found) {
    const key=item.kind+'|'+item.root+'|'+item.model;
    if (!seen.has(key)){seen.add(key);unique.push(item);}
  }
  return unique.slice(0,6);
}

async function askModel(found,tool,system,user) {
  if (found.kind === 'ollama') {
    return query(found.root.replace(/\/$/,'') + '/api/chat', {
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:found.model,stream:false,
        options:{temperature:0,num_predict:128},
        messages:[{role:'system',content:system},{role:'user',content:user}],
        tools:[tool]
      })
    },120000);
  }
  return query(found.root.replace(/\/$/,'') + '/chat/completions', {
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      model:found.model,temperature:0,max_tokens:128,
      messages:[{role:'system',content:system},{role:'user',content:user}],
      tools:[tool],tool_choice:'auto'
    })
  },90000);
}

function toolCalls(found,response) {
  return found.kind === 'ollama' ? response.message?.tool_calls : response.choices?.[0]?.message?.tool_calls;
}

const models = await detectCandidates();
if (!models.length) {
  console.log('P2LRN_LOCAL_LLM_TEST=SKIPPED; reason=no installed local model advertises completion+tools on 127.0.0.1:11434, 1234 or 8080; no cloud call made');
  process.exit(0);
}
console.log('P2LRN_LOCAL_LLM_CANDIDATES='+JSON.stringify(models.map(({kind,model,root})=>({provider:kind,model,root}))));

const dir = mkdtempSync(join(tmpdir(),'p2lrn-local-model-'));
const transport = new StdioClientTransport({
  command:process.execPath,args:[server,'--stdio'],
  env:{...process.env,P2LRN_MCP_ROOT:dir,P2LRN_MCP_WRITE:'0'}
});
const client = new Client({name:'p2lrn-local-llm-e2e',version:'0.1.0'});
let connected=false;
try {
  copyFileSync(fixture,join(dir,'fixture.p2lrn'));
  await client.connect(transport);
  connected=true;

  const match=(await client.listTools()).tools.find(tool=>tool.name==='p2lrn_list_courses');
  if (!match) throw new Error('MCP list tool missing');

  const system='Tienes disponible un servidor MCP con cursos P2LRN. Para responder debes llamar exactamente a la herramienta p2lrn_list_courses. No inventes cursos ni respondas sin usar la herramienta.';
  const user='Usa ahora p2lrn_list_courses y enumera los cursos P2LRN disponibles.';
  const tool={type:'function',function:{name:match.name,description:match.description,parameters:match.inputSchema}};
  const rejected=[];

  for (const found of models) {
    console.log('P2LRN_LOCAL_LLM_TRY='+JSON.stringify({provider:found.kind,model:found.model,root:found.root}));
    let response;
    try {
      response=await askModel(found,tool,system,user);
    } catch (error) {
      rejected.push({model:found.model,reason:error instanceof Error?error.message:String(error)});
      continue;
    }

    const calls=toolCalls(found,response);
    if (!Array.isArray(calls)||calls.length<1) {
      rejected.push({model:found.model,reason:'model returned no tool call'});
      continue;
    }
    const chosen=calls.find(call=>call.function?.name===match.name);
    if (!chosen) {
      rejected.push({model:found.model,reason:'model selected a different tool'});
      continue;
    }

    let args;
    try {
      const rawArgs=chosen.function.arguments;
      args=typeof rawArgs==='string'?JSON.parse(rawArgs):rawArgs??{};
    } catch {
      rejected.push({model:found.model,reason:'model emitted invalid JSON arguments'});
      continue;
    }
    if (Object.keys(args).some(k=>!['limit'].includes(k))) {
      rejected.push({model:found.model,reason:'model emitted unsupported arguments'});
      continue;
    }

    // From this point on, the local model selected the correct P2LRN MCP tool.
    // Any failure is an integration failure and must stay red.
    const result=await client.callTool({
      name:match.name,
      arguments:{limit:Math.max(1,Math.min(10,Number(args.limit)||10))}
    });
    if (result.isError) throw new Error('MCP tool call returned error for model '+found.model);
    const textPart=result.content.find(x=>x.type==='text');
    if (!textPart?.text) throw new Error('MCP tool call returned no text result for model '+found.model);
    const data=JSON.parse(textPart.text);
    if (!Array.isArray(data.courses)||!data.courses.some(x=>x.path==='fixture.p2lrn')) {
      throw new Error('The model-selected MCP tool did not return the fixture course for model '+found.model);
    }
    console.log('P2LRN_LOCAL_LLM_TEST=PASS; model='+found.model+'; model-issued tool='+match.name+'; real MCP course=fixture.p2lrn; no user data touched');
    process.exitCode=0;
    break;
  }

  if (!process.exitCode && rejected.length===models.length) {
    console.log('P2LRN_LOCAL_LLM_TEST=SKIPPED; reason=installed local models advertised tools but none emitted the requested tool call; MCP protocol/unit gates remain authoritative; attempts='+JSON.stringify(rejected));
  }
} catch (error) {
  console.error('P2LRN_LOCAL_LLM_TEST=FAIL; reason='+(error instanceof Error?error.message:String(error)));
  process.exitCode=1;
} finally {
  if (connected) await client.close();
  rmSync(dir,{recursive:true,force:true});
}
