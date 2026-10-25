// Evidence-grade agent evaluation. Each model invocation chooses an MCP tool and
// supplies the arguments. Failed model steps are recorded; a separate deterministic
// control completes the remaining scenario so all P2LRN capabilities are exercised.
// All activity occurs in a temporary course root, never in real user courses.
import {copyFileSync,mkdtempSync,readFileSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {P2LRNReadingSystem} from '../../../packages/toolkit/dist/reader/index.js';
import {createP2LRNStudioDocument} from '../../../packages/toolkit/web/studio/new-document.js';
import {buildQuestionnaireGame} from '../../../packages/toolkit/web/questionnaire-games-core.js';

const root=mkdtempSync(join(tmpdir(),'p2lrn-real-agent-'));
const model=process.env.P2LRN_LOCAL_AGENT_MODEL||'qwen3:4b';
const base=process.env.P2LRN_LOCAL_AGENT_URL||'http://127.0.0.1:11434';
const url=new URL(base);
if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password) {
  throw new Error('Local Ollama endpoint must be loopback HTTP without credentials');
}
const fixture=fileURLToPath(new URL('../../../examples/canonical/minimal-course.p2lrn',import.meta.url));
const server=fileURLToPath(new URL('../server.mjs',import.meta.url));
const evidence={model,provider:'Ollama local',transport:'MCP stdio',courseRoot:'temporary isolated',
  prompts:[],controls:[],integrity:[],startedAt:new Date().toISOString()};
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
let client=null,transport=null,connected=false;
let tools=new Map(),state=null,activities=[];
function resultError(result) {
  if(!result?.isError)return null;
  return result.content?.find(x=>x.type==='text')?.text || 'MCP operation failed';
}
function unpack(result) {
  const error=resultError(result);
  if(error)throw new Error('MCP failed: '+error.slice(0,450));
  return result.structuredContent??JSON.parse(result.content.find(x=>x.type==='text').text);
}
async function callTool(name,args) {
  if(!tools.has(name))throw new Error('MCP tool not advertised: '+name);
  return unpack(await client.callTool({name,arguments:args}));
}
function control(label,pass,detail) {
  evidence.controls.push({label,pass,detail:String(detail??'').slice(0,550)});
  if(!pass)console.error('P2LRN_AGENT_CONTROL=FAIL '+label+' '+String(detail).slice(0,250));
}
function assert(cond,message) {if(!cond)throw new Error(message);}
async function ask(toolsForPrompt,instruction,limit=256) {
  const valid=toolsForPrompt.map(name=>{
    const descriptor=tools.get(name);
    if(!descriptor)throw new Error('Unknown tool supplied to model: '+name);
    return {type:'function',function:{name,description:descriptor.description?.slice(0,170)||name,
      parameters:descriptor.inputSchema}};
  });
  const request={
    model,stream:false,think:false,keep_alive:'0',
    options:{temperature:0,num_predict:limit,num_ctx:3072,num_gpu:8},
    messages:[
      {role:'system',content:'You are an assistant using real P2LRN tools. ALWAYS call exactly the requested function with actual structured function arguments. Do not put tool calls inside text. No arbitrary filesystem paths. Preserve given draft IDs and digests exactly. The selected tool validates its own payload.'},
      {role:'user',content:instruction}
    ],
    tools:valid
  };
  const response=await fetch(new URL('/api/chat',base),{method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify(request),
    signal:AbortSignal.timeout(210000)});
  if(!response.ok)throw new Error('Ollama HTTP '+response.status+': '+(await response.text()).slice(0,250));
  const answer=await response.json();
  return {calls:answer.message?.tool_calls||[],text:answer.message?.content||''};
}
async function testAgent(label,expected,choices,instruction,validator,controlArguments,limit=256) {
  const item={label,expected,toolSetSize:choices.length,modelCalled:false,modelSucceeded:false,
    modelArgsAccepted:false,reason:null};
  let success=null;
  try{
    const reply=await ask(choices,instruction,limit);
    const calls=reply.calls;
    if(!Array.isArray(calls)||calls.length<1)throw new Error('Model returned no structured tool call; response='+reply.text.slice(0,150));
    if(calls.length!==1)throw new Error('Expected one tool invocation but got '+calls.length);
    const picked=calls[0].function?.name;
    if(picked!==expected)throw new Error('Wrong tool selected: '+picked);
    item.modelCalled=true;
    const raw=calls[0].function.arguments;
    const args=typeof raw==='string'?JSON.parse(raw):raw||{};
    if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Tool arguments must be a JSON object');
    const result=await callTool(expected,args);
    item.modelArgsAccepted=true;
    if(validator)await validator(result,args);
    item.modelSucceeded=true;
    success=result;
  }catch(error){
    item.reason=String(error instanceof Error?error.message:error).slice(0,450);
  }
  evidence.prompts.push(item);
  console.log('P2LRN_AGENT_STEP='+JSON.stringify(item));
  if(success!==null)return success;
  try{
    const fallback=typeof controlArguments==='function'?controlArguments():controlArguments;
    const result=await callTool(expected,fallback);
    if(validator)validator(result,fallback);
    control(label+' deterministic control',true,'Used validated MCP tool after model failure; not counted as model success');
    return result;
  }catch(error){
    control(label+' deterministic control',false,error instanceof Error?error.message:String(error));
    throw error;
  }
}
async function canonicalGame(kind) {
  const doc=createP2LRNStudioDocument({title:'Agente - juego de '+kind,language:'es'});
  const a=doc.addGame(doc.rootId,{kind,title:'Juego '+kind,language:'es'});
  const q=await doc.readQuestionnaire(a.id);
  const renderer=a.extensions?.['https://p2lrn.org/ext/renderer-preference/1']?.preferred;
  assert(Boolean(renderer&&q?.payload),'Missing Studio canonical game '+kind);
  const check=buildQuestionnaireGame(q.payload,renderer,{seedSource:'agent-matrix'});
  assert(check.compatible,'Studio game incompatible: '+kind+' '+JSON.stringify(check.reasons));
  return {payload:q.payload,renderer};
}
function quizPayload() {
  return {schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',
    title:'Evaluación de ciencias',language:'es',grading:{mode:'embedded-key'},questions:[
      {id:'q1',type:'single-choice',prompt:'¿Cuál es la estrella de nuestro sistema solar?',points:1,
        choices:[{id:'a',text:'Sol'},{id:'b',text:'Tierra'},{id:'c',text:'Luna'}],
        solution:{choiceIds:['a']}}]};
}
function componentPayload() {
  return {schema:'https://p2lrn.org/schema/native-component/0.1',version:'0.1',
    component:{id:'https://p2lrn.org/component/callout',componentVersion:'1',dataVersion:'1',runtimeContractVersion:'1'},
    data:{heading:'Recuerda',text:'La Tierra gira alrededor del Sol.',tone:'note'}};
}
function agentCaseArgs(name,args={}) { return {draft_id:state.draftId,expected_digest:state.digest,...args}; }
function advance(result){assert(result.digest&&result.digest!==state.digest,'Draft digest was not updated');state=result;return result;}
try {
  const original=readFileSync(fixture);
  copyFileSync(fixture,join(root,'protected.p2lrn'));
  writeFileSync(join(root,'lesson.txt'),'Lección autorizada: el Sol es una estrella y la Tierra un planeta.');
  mkdirSync(join(root,'web'),{recursive:true});
  writeFileSync(join(root,'web','index.html'),'<!doctype html><html lang="es"><body>Lección de ciencias</body></html>');
  transport=new StdioClientTransport({command:process.execPath,args:[server,'--stdio'],
    env:{...process.env,P2LRN_MCP_ROOT:root,P2LRN_MCP_WRITE:'1'}});
  client=new Client({name:'p2lrn-agent-matrix',version:'1.0'});
  await client.connect(transport);connected=true;
  tools=new Map((await client.listTools()).tools.map(tool=>[tool.name,tool]));
  evidence.tools=tools.size;
  const gameCatalog=await callTool('p2lrn_list_game_renderers',{});
  assert(gameCatalog.renderers?.some(x=>x.id.endsWith('/3d-order-match')),'Missing 3D game renderer');
  control('game renderer discovery',true,gameCatalog.renderers.length+' installed renderers');
  const originalListed=await testAgent('read existing course','p2lrn_list_courses',
    ['p2lrn_list_courses','p2lrn_read_course','p2lrn_draft_new'],
    'Find my existing P2LRN courses. Call p2lrn_list_courses with limit 10.',
    result=>assert(result.courses?.some(x=>x.path==='protected.p2lrn'),'Existing course not discovered'),
    {limit:10});
  state=await testAgent('create course','p2lrn_draft_new',
    ['p2lrn_draft_new','p2lrn_list_courses','p2lrn_draft_create'],
    'Create a NEW P2LRN course named "Ciencias del sistema solar" in Spanish. Call p2lrn_draft_new with title and language es.',
    result=>assert(result.draftId&&result.digest,'New draft missing'),
    {title:'Ciencias del sistema solar',language:'es'});
  state=await testAgent('edit course','p2lrn_draft_set_text',
    ['p2lrn_draft_read','p2lrn_draft_add_unit','p2lrn_draft_set_text'],
    'Change the title of the CURRENT NEW COURSE to "Ciencias y juegos 3D". You must call p2lrn_draft_set_text with entity_key course, draft_id '+state.draftId+' and expected_digest '+state.digest+'.',
    async (result)=>{advance(result);const inspected=await callTool('p2lrn_draft_read',{draft_id:state.draftId,include_project:true});assert(inspected.project.course.title.es==='Ciencias y juegos 3D','Edited title must match request');},
    ()=>agentCaseArgs('p2lrn_draft_set_text',{entity_key:'course',title:'Ciencias y juegos 3D'}));
  state=await testAgent('create unit','p2lrn_draft_add_unit',
    ['p2lrn_draft_add_unit','p2lrn_draft_add_url','p2lrn_draft_add_composite'],
    'Add a new unit with key science and title "Sistema solar". Use p2lrn_draft_add_unit with draft_id '+state.draftId+' and expected_digest '+state.digest+'.',
    result=>{assert(result.result.unitKey==='science','Wrong new unit');advance(result);},
    ()=>agentCaseArgs('p2lrn_draft_add_unit',{key:'science',title:'Sistema solar'}));
  state=await testAgent('create question','p2lrn_draft_add_native_activity',
    ['p2lrn_draft_add_native_activity','p2lrn_draft_add_unit','p2lrn_draft_add_url'],
    'Create one real evaluable single-choice questionnaire about the Sun. Use p2lrn_draft_add_native_activity with kind questionnaire, key quiz, parent science and title "Examen". The payload MUST follow: schema https://p2lrn.org/schema/native-questionnaire/0.4.0 ; version 0.4.0 ; title string ; grading {mode:"embedded-key"} ; questions:[{id:"q1",type:"single-choice",prompt:"¿Cuál es la estrella?",points:1,choices:[{id:"a",text:"Sol"},{id:"b",text:"Luna"}],solution:{choiceIds:["a"]}}]. The draft_id is '+state.draftId+' and expected_digest '+state.digest+'. No other properties needed.',
    result=>{advance(result);activities.push(result.result.activityKey);},
    ()=>agentCaseArgs('p2lrn_draft_add_native_activity',{kind:'questionnaire',key:'quiz',parent:'science',
      title:'Examen',payload:quizPayload()}),700);
  for(const gameKind of ['matching','3d-matching','word-search','rosco']) {
    const sample=await canonicalGame(gameKind);
    const label='game '+gameKind, key='game-'+gameKind;
    const renderer=sample.renderer;
    // Ask the LLM to produce full valid game data; don't silently repair its
    // payload. Failure is recorded, with canonical Studio data used only as a
    // separately marked control for the rest of the matrix.
    const example=JSON.stringify(sample.payload);
    state=await testAgent(label,'p2lrn_draft_add_native_activity',
      ['p2lrn_draft_add_native_activity','p2lrn_draft_add_unit','p2lrn_draft_add_url'],
      'Create a playable P2LRN '+gameKind+' game about science. Use p2lrn_draft_add_native_activity. Required: kind questionnaire, key '+key+', title "Juego '+gameKind+'", parent science, renderer '+renderer+', draft_id '+state.draftId+', expected_digest '+state.digest+'. The full native questionnaire payload must be valid and completely playable by this renderer. Here is an exact example of the required portable shape: '+example+' . You may use this reference payload unchanged or change ONLY the educational text without breaking IDs or solution constraints.',
      result=>{advance(result);activities.push(result.result.activityKey);},
      ()=>agentCaseArgs('p2lrn_draft_add_native_activity',{
        kind:'questionnaire',key,title:'Juego '+gameKind,parent:'science',renderer,payload:sample.payload
      }),900);
  }
  state=await testAgent('create component','p2lrn_draft_add_native_activity',
    ['p2lrn_draft_add_native_activity','p2lrn_draft_add_unit'],
    'Add an educational callout component under science using p2lrn_draft_add_native_activity, kind component, key advice, title "Consejo", parent science. Payload must be a P2LRN component instance using schema https://p2lrn.org/schema/native-component/0.1 ; version 0.1 ; component {id:"https://p2lrn.org/component/callout",componentVersion:"1",dataVersion:"1",runtimeContractVersion:"1"} ; data {heading:"Consejo",text:"Recuerda el Sol",tone:"note"}. draft_id '+state.draftId+', expected_digest '+state.digest+'.',
    result=>{advance(result);activities.push(result.result.activityKey);},
    ()=>agentCaseArgs('p2lrn_draft_add_native_activity',{
      kind:'component',key:'advice',title:'Consejo',parent:'science',payload:componentPayload()
    }),600);
  state=await testAgent('create composite','p2lrn_draft_add_composite',
    ['p2lrn_draft_add_composite','p2lrn_draft_add_unit','p2lrn_draft_set_children'],
    'Create one new P2LRN native composite activity for the first two existing activities. Use p2lrn_draft_add_composite with key composite, title "Repaso agrupado", parent science, mode sequence, completion all, children exactly '+JSON.stringify(activities.slice(0,2))+', draft_id '+state.draftId+' and expected_digest '+state.digest+'.',
    result=>advance(result),
    ()=>agentCaseArgs('p2lrn_draft_add_composite',{
      key:'composite',title:'Repaso agrupado',parent:'science',mode:'sequence',completion:'all',
      children:activities.slice(0,2)
    }));
  // Exercise file/web attachments independently. No model access to arbitrary disk.
  for(const [name,args] of [
    ['p2lrn_draft_add_file',{relative_source_path:'lesson.txt',key:'attached',title:'Ficha',parent:'science'}],
    ['p2lrn_draft_add_web_content',{relative_directory_path:'web',key:'website',title:'Lección web',parent:'science'}]
  ]) {
    const result=await callTool(name,agentCaseArgs(name,args));advance(result);
    control('safe '+name,true,'Tool copied a file under the authorized temporary root');
  }
  const stale=await client.callTool({name:'p2lrn_draft_add_unit',arguments:{
    draft_id:state.draftId,expected_digest:'0'.repeat(64),key:'forbidden',title:'Incorrect'}});
  control('stale digest rejected',stale.isError===true,'Expected MCP isError true');
  const traversal=await client.callTool({name:'p2lrn_draft_add_file',arguments:
    agentCaseArgs('p2lrn_draft_add_file',{relative_source_path:'../private.txt',key:'outside',title:'Outside',parent:'science'})});
  control('filesystem traversal rejected',traversal.isError===true,'Expected MCP isError true');
  const finalized=await testAgent('export new course','p2lrn_draft_export',
    ['p2lrn_draft_export','p2lrn_draft_read','p2lrn_draft_add_unit'],
    'Export and validate the NEW P2LRN course, keeping the original untouched. Use p2lrn_draft_export with draft_id '+state.draftId+' and expected_digest '+state.digest+'.',
    result=>assert(result.path?.endsWith('.p2lrn'),'Export path missing'),
    ()=>agentCaseArgs('p2lrn_draft_export'));
  const out=new P2LRNReadingSystem(join(root,...finalized.path.split('/')),{validateProfilePayloads:true});
  control('strict P2LRN Reader after export',out.summary().contentRoot.startsWith('sha256:'),out.summary().contentRoot);
  const entities=[...out.reader.entities.values()];
  control('exported native questionnaire',entities.some(e=>e.type==='activity'&&Object.values(e.title||{}).includes('Examen')),'Quiz activity exists');
  control('exported native games',entities.filter(e=>e.type==='activity'&&Object.values(e.title||{}).some(v=>String(v).startsWith('Juego '))).length>=4,'At least 4 game activities exist');
  control('exported component and composite',
    entities.some(e=>e.type==='activity'&&Object.values(e.title||{}).includes('Consejo'))&&
    entities.some(e=>e.type==='activity'&&Object.values(e.title||{}).includes('Repaso agrupado')),'Both component and composite exist');
  control('original SHA-256 unchanged',sha(readFileSync(join(root,'protected.p2lrn')))===sha(original),'No modification to original course');
} catch(error) {
  control('fatal harness error',false,error instanceof Error?error.stack:error);
} finally {
  if(connected)await client.close();
  rmSync(root,{recursive:true,force:true});
  evidence.finishedAt=new Date().toISOString();
  evidence.modelPassed=evidence.prompts.filter(x=>x.modelSucceeded).length;
  evidence.modelFailed=evidence.prompts.filter(x=>!x.modelSucceeded).length;
  evidence.controlsPassed=evidence.controls.filter(x=>x.pass).length;
  evidence.controlsFailed=evidence.controls.filter(x=>!x.pass).length;
  console.log('P2LRN_AGENT_MATRIX_RESULT='+JSON.stringify(evidence));
  if(evidence.controlsFailed||evidence.modelFailed)process.exitCode=1;
}
