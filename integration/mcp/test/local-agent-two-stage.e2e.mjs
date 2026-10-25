// Real local two-stage MCP planner audit: Qwen decides the tool, then
// separately generates arguments constrained by the MCP tool's input schema.
// This is an experimental harness; NOT a production agent or a new MCP server.
import {mkdtempSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const endpoint=process.env.P2LRN_LOCAL_AGENT_URL||'http://127.0.0.1:11434';
const url=new URL(endpoint);
if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)
  throw new Error('Local inference must be loopback HTTP without credentials');
const model=process.env.P2LRN_LOCAL_AGENT_MODEL||'qwen3:4b';
const root=mkdtempSync(join(tmpdir(),'p2lrn-two-stage-'));
const server=fileURLToPath(new URL('../server.mjs',import.meta.url));
const fixture=fileURLToPath(new URL('../../../examples/canonical/minimal-course.p2lrn',import.meta.url));
const transport=new StdioClientTransport({command:process.execPath,args:[server,'--stdio'],
  env:{...process.env,P2LRN_MCP_ROOT:root,P2LRN_MCP_WRITE:'1'}});
const client=new Client({name:'p2lrn-local-planner-test',version:'0.1.0'});
let connected=false,tools=new Map();
const evidence={model,method:'two-stage JSON schema constrained planning',started:new Date().toISOString(),steps:[]};
function assert(x,message){if(!x)throw new Error(message);}
async function complete(prompt,schema,tokens=200) {
  const response=await fetch(new URL('/api/chat',endpoint),{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({model,think:false,stream:false,keep_alive:'0',
      options:{temperature:0,num_predict:tokens,num_ctx:2048,num_gpu:8},
      format:schema,
      messages:[{role:'system',content:'You are a P2LRN course assistant. Return exactly one JSON object complying with the schema. Never invent MCP parameters. No commentary.'},
        {role:'user',content:prompt}]}),signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw new Error('Ollama HTTP '+response.status+': '+(await response.text()).slice(0,250));
  const raw=(await response.json()).message?.content;
  try{return JSON.parse(raw);}catch{throw new Error('Malformed model JSON: '+String(raw).slice(0,180));}
}
async function stage(label,prompt,candidates,validate) {
  const record={label,candidateCount:candidates.length,selected:null,argumentsAccepted:false,toolResult:false,error:null};
  try{
    for(const name of candidates)assert(tools.has(name),'Missing MCP tool '+name);
    const names=candidates;
    const selectionSchema={type:'object',properties:{tool:{type:'string',enum:names}},
      required:['tool'],additionalProperties:false};
    const catalog=names.map(name=>({name,description:tools.get(name).description?.slice(0,140)}));
    const planning=await complete('User request: '+prompt+'\nAvailable MCP tools: '+JSON.stringify(catalog)+'\nChoose one tool by exact name in JSON field tool.',selectionSchema,96);
    assert(typeof planning.tool==='string'&&names.includes(planning.tool),'Model chose unknown tool');
    record.selected=planning.tool;
    const selected=tools.get(planning.tool);
    const schema=structuredClone(selected.inputSchema);
    schema.additionalProperties=false;
    const args=await complete('User request: '+prompt+'\nSelected tool: '+planning.tool+'\nTool description: '+selected.description+'\nReturn only the JSON arguments of the selected tool. Use only allowed properties and obey the exact field names and values in the user request.',
      schema,256);
    assert(args&&typeof args==='object'&&!Array.isArray(args),'Model parameters are not an object');
    const allowed=new Set(Object.keys(schema.properties||{}));
    assert(Object.keys(args).every(key=>allowed.has(key)),'Model invented MCP argument name: '+Object.keys(args).filter(k=>!allowed.has(k)));
    record.argumentsAccepted=true;
    const raw=await client.callTool({name:planning.tool,arguments:args});
    if(raw.isError)throw new Error('MCP rejected model arguments: '+raw.content?.[0]?.text?.slice(0,220));
    const parsed=raw.structuredContent||JSON.parse(raw.content.find(x=>x.type==='text').text);
    if(validate)validate(planning.tool,args,parsed);
    record.toolResult=true;
    return parsed;
  }catch(error){
    record.error=String(error instanceof Error?error.message:error).slice(0,430);
    return null;
  }finally{
    evidence.steps.push(record);
    console.log('P2LRN_TWO_STAGE_STEP='+JSON.stringify(record));
  }
}
try{
  copyFileSync(fixture,join(root,'fixture.p2lrn'));
  await client.connect(transport);connected=true;
  tools=new Map((await client.listTools()).tools.map(item=>[item.name,item]));
  const list=await stage('list courses','List my existing P2LRN courses. List up to 10; do not edit any course.',
    ['p2lrn_list_courses','p2lrn_read_course','p2lrn_draft_new'],
    (name,args,value)=>{
      assert(name==='p2lrn_list_courses','Wrong tool selected for listing');
      assert(Array.isArray(value.courses)&&value.courses.some(x=>x.path==='fixture.p2lrn'),'Fixture course not returned');
      assert(args.limit===undefined||Number(args.limit)<=10,'List limit too high');
    });
  const created=await stage('create course','Create a NEW course titled "Ciencias originales", language Spanish (es). Do not edit the existing course.',
    ['p2lrn_list_courses','p2lrn_draft_new','p2lrn_draft_create'],
    (name,args,value)=>{
      assert(name==='p2lrn_draft_new','Wrong tool selected for creation');
      assert(args.title==='Ciencias originales','Wrong course title');
      assert(value.draftId&&value.digest,'Course not created');
    });
  if(created){
    await stage('edit course title','Change the title of the newly created course to "Ciencias y juegos". The entity_key must be "course". Use draft_id '+created.draftId+' and expected_digest '+created.digest+'.',
      ['p2lrn_draft_read','p2lrn_draft_set_text','p2lrn_draft_add_unit'],
      (name,args,value)=>{
        assert(name==='p2lrn_draft_set_text','Wrong tool for editing title');
        assert(args.draft_id===created.draftId&&args.expected_digest===created.digest,'Model corrupted draft identifiers');
        assert(value.digest!==created.digest,'Draft did not change');
      });
  }
}catch(error){evidence.fatal=String(error instanceof Error?error.stack:error).slice(0,700);}
finally{
  if(connected)await client.close();
  rmSync(root,{recursive:true,force:true});
  evidence.passed=evidence.steps.filter(x=>x.toolResult).length;
  evidence.failed=evidence.steps.filter(x=>!x.toolResult).length;
  evidence.finished=new Date().toISOString();
  console.log('P2LRN_TWO_STAGE_RESULT='+JSON.stringify(evidence));
  if(evidence.failed||evidence.fatal)process.exitCode=1;
}
