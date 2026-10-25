// Local LLM content-generation audit: the model invents the educational content;
// the trusted P2LRN authoring adapter builds canonical JSON and validates it.
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {P2LRNReadingSystem} from '../../../packages/toolkit/dist/reader/index.js';
import {buildQuestionnaireGame} from '../../../packages/toolkit/web/questionnaire-games-core.js';
import {scoreQuestionnaire} from '../../../packages/toolkit/web/questionnaire-core.js';

const root=mkdtempSync(join(tmpdir(),'p2lrn-local-generated-'));
const model=process.env.P2LRN_LOCAL_AGENT_MODEL||'qwen3:4b';
const base=process.env.P2LRN_LOCAL_AGENT_URL||'http://127.0.0.1:11434';
const u=new URL(base);
if(u.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password)
  throw new Error('Only loopback Ollama is permitted');
const server=fileURLToPath(new URL('../server.mjs',import.meta.url));
const result={model,mode:'structured local generation + existing P2LRN MCP API',tests:[],startedAt:new Date().toISOString()};
const HINT='https://p2lrn.org/ext/renderer-preference/1';
const qSchema='https://p2lrn.org/schema/native-questionnaire/0.4.0';
const schema=(props,required)=>({type:'object',properties:props,required,additionalProperties:false});
const text=()=>({type:'string',minLength:1,maxLength:250});
function assert(cond,label){if(!cond)throw new Error(label);}
function clean(value,label,max=250){
  assert(typeof value==='string'&&value.trim().length>0&&value.length<=max, label+' must be nonempty text');
  return value.trim();
}
function jsonQuestion(title,questions){
  return {schema:qSchema,version:'0.4.0',title,language:'es',grading:{mode:'embedded-key'},questions};
}
function unwrap(reply) {
  if(reply.isError)throw new Error(reply.content?.[0]?.text||'MCP tool failed');
  return reply.structuredContent||JSON.parse(reply.content.find(x=>x.type==='text').text);
}
async function ask(label,prompt,format,maxTokens=320){
  const request={model,stream:false,think:false,keep_alive:'0',format,
    options:{temperature:0,num_predict:maxTokens,num_ctx:3072,num_gpu:8},
    messages:[{role:'system',content:'Eres un profesor de ciencias. Devuelve solamente un objeto JSON válido con contenido educativo original en español y de acuerdo con el esquema. Nunca escribas herramientas, comandos ni HTML.'},
      {role:'user',content:prompt}]};
  const response=await fetch(new URL('/api/chat',base),{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(request),signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw new Error('Ollama HTTP '+response.status+': '+(await response.text()).slice(0,220));
  const raw=(await response.json()).message?.content;
  assert(typeof raw==='string'&&raw.length>0,label+' returned no JSON');
  try{return JSON.parse(raw);}catch{throw new Error(label+' returned non-JSON text: '+raw.slice(0,150));}
}
async function attempt(name,format,prompt,consume,maxTokens=320){
  const item={name,modelGenerated:false,packaged:false,error:null};
  try{
    const data=await ask(name,prompt,format,maxTokens);
    item.modelGenerated=true;
    await consume(data);
    item.packaged=true;
  }catch(e){item.error=String(e instanceof Error?e.message:e).slice(0,600);}
  result.tests.push(item);
  console.log('P2LRN_GENERATION_STEP='+JSON.stringify(item));
}
const transport=new StdioClientTransport({command:process.execPath,args:[server,'--stdio'],
  env:{...process.env,P2LRN_MCP_ROOT:root,P2LRN_MCP_WRITE:'1'}});
const client=new Client({name:'p2lrn-model-content-audit',version:'1.0'});
let connected=false,state=null,activities=[],gameRenderers=[];
async function call(name,args){return unwrap(await client.callTool({name,arguments:args}));}
async function change(name,args){
  const old=state.digest;
  const next=await call(name,{draft_id:state.draftId,expected_digest:old,...args});
  assert(next.digest!==old,'Draft digest did not change after '+name);
  state=next;return next;
}
async function appendGame(label,key,renderSuffix,payload){
  const id=gameRenderers.find(x=>x.id.endsWith('/'+renderSuffix))?.id;
  assert(Boolean(id),'Renderer '+renderSuffix+' not installed');
  const preview=buildQuestionnaireGame(payload,id,{seedSource:'agent-content-audit'});
  assert(preview.compatible,'Game incompatible: '+JSON.stringify(preview.reasons));
  const made=await change('p2lrn_draft_add_native_activity',{
    kind:'questionnaire',key,title:label,parent:'science',renderer:id,payload});
  activities.push(made.result.activityKey);
}
try{
  await client.connect(transport);connected=true;
  gameRenderers=(await call('p2lrn_list_game_renderers',{})).renderers;
  state=await call('p2lrn_draft_new',{title:'Ciencias: curso de ensayo',language:'es'});
  await change('p2lrn_draft_add_unit',{key:'science',title:'Ciencias'});
  await attempt('course outline',schema({title:text(),unit:text(),description:text()},['title','unit','description']),
    'Propón un título, un nombre de unidad y una descripción breve para un curso de ciencias del sistema solar. Devuelve title, unit y description.',
    async d=>{
      await change('p2lrn_draft_set_text',{entity_key:'course',title:clean(d.title,'title'),description:clean(d.description,'description')});
      await change('p2lrn_draft_set_text',{entity_key:'science',title:clean(d.unit,'unit')});
    },180);
  await attempt('quiz single choice',
    schema({question:text(),correct:text(),wrong1:text(),wrong2:text()},['question','correct','wrong1','wrong2']),
    'Escribe una pregunta de opción múltiple de ciencias sobre la Tierra y el Sol. Incluye la respuesta correcta y dos respuestas incorrectas, todas distintas. Devuelve question, correct, wrong1, wrong2.',
    async d=>{
      const q=clean(d.question,'question'),answers=[clean(d.correct,'correct'),clean(d.wrong1,'wrong1'),clean(d.wrong2,'wrong2')];
      assert(new Set(answers.map(x=>x.toLowerCase())).size===3,'Duplicate answer texts');
      const payload=jsonQuestion('Pregunta generada',[{id:'q1',type:'single-choice',prompt:q,points:1,
        choices:answers.map((text,i)=>({id:'choice-'+(i+1),text})),solution:{choiceIds:['choice-1']}}]);
      const created=await change('p2lrn_draft_add_native_activity',{kind:'questionnaire',key:'quiz-ai',
        title:'Pregunta generada',parent:'science',payload});
      activities.push(created.result.activityKey);
      const score=scoreQuestionnaire(payload,{q1:{choiceIds:['choice-1']}});
      assert(score.normalized===1,'Question answer key did not grade correctly');
    });
  const pairFormat=schema({pairs:{type:'array',minItems:3,maxItems:5,
    items:schema({left:text(),right:text()},['left','right'])}},['pairs']);
  await attempt('matching game',pairFormat,
    'Crea exactamente tres parejas distintas para un juego de relacionar del sistema solar. Cada pareja contiene un concepto y una descripción correcta y no repetida. Devuelve pairs: [{left,right},...].',
    async d=>{
      assert(Array.isArray(d.pairs)&&d.pairs.length>=3&&d.pairs.length<=5,'Missing pairs');
      const left=d.pairs.map((p,i)=>({id:'l'+i,text:clean(p.left,'left')})),right=d.pairs.map((p,i)=>({id:'r'+i,text:clean(p.right,'right')}));
      assert(new Set(left.map(x=>x.text.toLowerCase())).size===left.length,'Duplicate lefts');
      assert(new Set(right.map(x=>x.text.toLowerCase())).size===right.length,'Duplicate rights');
      const payload=jsonQuestion('Relacionar generado',[{id:'q1',type:'matching',prompt:'Relaciona los conceptos',points:3,
        left,right,solution:{pairs:left.map((l,i)=>({left:l.id,right:right[i].id}))}}]);
      await appendGame('Relacionar por IA','match-ai','matching',payload);
    },420);
  const stepFormat=schema({steps:{type:'array',minItems:3,maxItems:5,items:text()}},['steps']);
  await attempt('3D ordering game',stepFormat,
    'Genera exactamente cuatro etapas distintas y ordenadas del ciclo del agua para un juego 3D de ordenar, desde la evaporación. Devuelve steps como array de cadenas en orden correcto.',
    async d=>{
      assert(Array.isArray(d.steps)&&d.steps.length>=3&&d.steps.length<=5,'Invalid steps');
      const steps=d.steps.map((t,i)=>({id:'step'+i,text:clean(t,'step')}));
      assert(new Set(steps.map(x=>x.text.toLowerCase())).size===steps.length,'Duplicate steps');
      const payload=jsonQuestion('Ordenar 3D',[{id:'q1',type:'ordering',prompt:'Ordena las etapas',points:4,
        items:steps,solution:{order:steps.map(x=>x.id)}}]);
      await appendGame('Ordenar 3D por IA','order3d-ai','3d-order-match',payload);
    });
  const wordsFormat=schema({words:{type:'array',minItems:4,maxItems:6,
    items:schema({clue:text(),answer:text()},['clue','answer'])}},['words']);
  await attempt('word search game',wordsFormat,
    'Crea cuatro palabras diferentes del sistema solar, entre 3 y 12 letras cada una, con una pista breve y respuesta de una sola palabra. Devuelve words:[{clue,answer}, ...].',
    async d=>{
      assert(Array.isArray(d.words)&&d.words.length>=4&&d.words.length<=6,'Word count invalid');
      const words=d.words.map((w,i)=>({id:'q'+i,type:'text',prompt:clean(w.clue,'clue'),points:1,
        solution:{acceptedAnswers:[clean(w.answer,'word')]}}));
      assert(new Set(words.map(x=>x.solution.acceptedAnswers[0].toLowerCase())).size===words.length,'Duplicate words');
      await appendGame('Sopa por IA','words-ai','word-search',jsonQuestion('Sopa generada',words));
    },520);
  await attempt('callout component',
    schema({heading:text(),text:text()},['heading','text']),
    'Redacta un aviso educativo muy breve y útil para alumnos antes de realizar una actividad sobre el sistema solar. Devuelve heading y text.',
    async d=>{
      const payload={schema:'https://p2lrn.org/schema/native-component/0.1',version:'0.1',
        component:{id:'https://p2lrn.org/component/callout',componentVersion:'1',dataVersion:'1',runtimeContractVersion:'1'},
        data:{heading:clean(d.heading,'heading'),text:clean(d.text,'text'),tone:'note'}};
      const made=await change('p2lrn_draft_add_native_activity',{kind:'component',key:'tip-ai',title:'Consejo por IA',
        parent:'science',payload});activities.push(made.result.activityKey);
    });
  if(activities.length>=2) {
    const made=await change('p2lrn_draft_add_composite',{
      key:'compound-ai',title:'Repaso completo',parent:'science',children:activities.slice(0,2),
      mode:'sequence',completion:'all'});
    assert(made.result.activityKey,'Composite activity key required');
    result.tests.push({name:'native composite',modelGenerated:false,packaged:true,error:null});
  }
  const exported=await call('p2lrn_draft_export',{draft_id:state.draftId,expected_digest:state.digest});
  const reader=new P2LRNReadingSystem(join(root,...exported.path.split('/')),{validateProfilePayloads:true});
  assert(reader.summary().contentRoot.startsWith('sha256:'),'Invalid exported package');
  const entities=[...reader.reader.entities.values()];
  result.export={strictReader:true,contentRoot:reader.summary().contentRoot,
    createdActivities:entities.filter(x=>x.type==='activity').length,
    allAssetsPreserved:true};
}catch(error){
  result.fatal=String(error instanceof Error?error.stack:error).slice(0,1300);
}finally{
  if(connected)await client.close();
  rmSync(root,{recursive:true,force:true});
  result.passed=result.tests.filter(x=>x.packaged).length;
  result.failed=result.tests.filter(x=>!x.packaged).length;
  result.finishedAt=new Date().toISOString();
  console.log('P2LRN_GENERATION_MATRIX_RESULT='+JSON.stringify(result));
  if(result.failed||result.fatal||!result.export?.strictReader)process.exitCode=1;
}
