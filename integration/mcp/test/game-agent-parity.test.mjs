import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {P2LRNMcpService} from '../service.mjs';
import {P2LRNReadingSystem} from '../../../packages/toolkit/dist/reader/index.js';
import {createP2LRNStudioDocument} from '../../../packages/toolkit/web/studio/new-document.js';
import {buildQuestionnaireGame} from '../../../packages/toolkit/web/questionnaire-games-core.js';
import {scoreQuestionnaire, validateQuestionnaire} from '../../../packages/toolkit/web/questionnaire-core.js';

const HINT = 'https://p2lrn.org/ext/renderer-preference/1';
const kinds = ['memory','matching','ordering','classification','true-false','fill-blanks',
  'word-search','crossword','rosco','3d','3d-matching','3d-classification'];
const fixture = new URL('../../../examples/canonical/minimal-course.p2lrn', import.meta.url);
const sourceFile = new URL('../server.mjs', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function sandbox() {
  const root = mkdtempSync(join(tmpdir(),'p2lrn-agent-games-'));
  copyFileSync(fixture,join(root,'original.p2lrn'));
  return root;
}
function nativeComponent() {
  return {
    schema:'https://p2lrn.org/schema/native-component/0.1',
    version:'0.1',
    component:{id:'https://p2lrn.org/component/callout',componentVersion:'1',
      dataVersion:'1',runtimeContractVersion:'1'},
    data:{heading:'Consejo',text:'Lee las instrucciones antes de empezar.',tone:'note'}
  };
}
function getNativeQuiz() {
  return {
    schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',
    version:'0.4.0',title:'Diagnóstico de Ciencias',language:'es',
    grading:{mode:'embedded-key'},
    questions:[
      {id:'q1',type:'single-choice',prompt:'¿Cuál es la estrella central del sistema solar?',points:1,
        choices:[{id:'sol',text:'Sol'},{id:'luna',text:'Luna'},{id:'tierra',text:'Tierra'}],
        solution:{choiceIds:['sol']}},
      {id:'q2',type:'true-false',prompt:'La Tierra gira alrededor del Sol.',points:1,
        choices:[{id:'v',text:'Verdadero'},{id:'f',text:'Falso'}],solution:{choiceIds:['v']}}
    ]
  };
}
async function sampleGame(kind) {
  const doc = createP2LRNStudioDocument({title:'Test de juegos '+kind,language:'es'});
  const a = doc.addGame(doc.rootId,{kind,title:'Juego '+kind,language:'es'});
  const q = await doc.readQuestionnaire(a.id);
  const renderer = a.extensions?.[HINT]?.preferred;
  assert.ok(renderer,'Studio needs to declare a real game renderer: '+kind);
  assert.ok(q?.payload,'Studio needs questionnaire payload: '+kind);
  validateQuestionnaire(q.payload);
  const built = buildQuestionnaireGame(q.payload,renderer,{seedSource:'mcp-parity'});
  assert.equal(built.compatible,true,kind+': '+JSON.stringify(built.reasons));
  return {payload:q.payload,renderer};
}
function unwrap(result) {
  assert.notEqual(result.isError,true,'MCP failed: '+JSON.stringify(result.content));
  const data = result.structuredContent ?? JSON.parse(result.content.find(p=>p.type==='text').text);
  return data;
}

test('tool catalog discovers actual P2LRN renderer IDs without inventing game types',()=>{
  const root=sandbox();
  try {
    const readOnly=new P2LRNMcpService({root});
    const catalog=readOnly.listGameRenderers();
    assert.equal(catalog.catalog,'P2LRN Toolkit renderer registry');
    const unique=new Set(catalog.renderers.map(x=>x.id));
    assert.equal(unique.size,catalog.renderers.length);
    for(const id of ['matching','rosco','word-search','3d-order-match']) {
      assert.ok(catalog.renderers.some(x=>x.id.endsWith('/'+id)),'Missing renderer: '+id);
    }
    assert.throws(()=>readOnly.createEmptyDraft({title:'Forbidden'}),/disabled/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('P2LRN Studio -> MCP authoring -> export -> Reader preserves 12 real 2D/3D games, a quiz and a component',async()=>{
  const root=sandbox();
  try {
    const original=readFileSync(join(root,'original.p2lrn'));
    const api=new P2LRNMcpService({root,writeEnabled:true});
    let state=api.createEmptyDraft({title:'Ciencias con juegos y preguntas',description:'Curso de verificación de agente local'});
    const draftId=state.draftId;
    state=api.addUnit(draftId,state.digest,{key:'unidad-juegos',title:'Unidad de ciencias'});
    state=api.setText(draftId,state.digest,'course',{title:'Ciencias — curso editado'});
    const quiz=getNativeQuiz();
    state=api.addNativeActivity(draftId,state.digest,'questionnaire','quiz-base','unidad-juegos','Evaluación inicial',quiz);
    const activities=[state.result.activityKey];
    const gameEntries=[];
    for(const kind of kinds) {
      const {payload,renderer}=await sampleGame(kind);
      const key='juego-'+kind;
      state=api.addNativeActivity(draftId,state.digest,'questionnaire',key,'unidad-juegos','Juego '+kind,payload,renderer);
      activities.push(state.result.activityKey);
      gameEntries.push({kind,key,activityKey:state.result.activityKey,renderer});
    }
    state=api.addNativeActivity(draftId,state.digest,'component','aviso',
      'unidad-juegos','Consejo',nativeComponent());
    activities.push(state.result.activityKey);
    state=api.addComposite(draftId,state.digest,{
      key:'grupo-practica',title:'Actividades combinadas',parent:'unidad-juegos',
      children:[gameEntries[0].activityKey,gameEntries[1].activityKey],mode:'sequence',completion:'all'
    });
    state=api.setProgression(draftId,state.digest,'unidad-juegos',{required:true,completionRequirement:'completed'});
    const final=api.exportDraft(draftId,state.digest);
    assert.equal(final.createdFromScratch,true);
    const outputFile=join(root,...final.path.split('/'));
    const reader=new P2LRNReadingSystem(outputFile,{validateProfilePayloads:true});
    assert.match(reader.summary().contentRoot,/^sha256:/);
    const portable=[...reader.reader.entities.values()];
    const quizNode=portable.find(x=>x.type==='activity' && Object.values(x.title??{}).includes('Evaluación inicial'));
    assert.ok(quizNode,'Questionnaire must remain visible after export');
    const quizResource=reader.reader.entities.get(quizNode.resource);
    assert.ok(quizResource?.representations?.length,'Questionnaire representation must exist');
    const quizData=JSON.parse(new TextDecoder().decode(reader.reader.readEmbeddedFile(quizResource.representations[0].location.path)));
    assert.equal(scoreQuestionnaire(quizData,{q1:{choiceIds:['sol']},q2:{choiceIds:['v']}}).normalized,1);
    assert.ok(scoreQuestionnaire(quizData,{q1:{choiceIds:['luna']},q2:{choiceIds:['f']}}).normalized<1);
    for(const game of gameEntries) {
      const entity=portable.find(x=>x.type==='activity' && Object.values(x.title??{}).includes('Juego '+game.kind));
      assert.ok(entity,'Missing exported game '+game.kind);
      assert.equal(entity.extensions?.[HINT]?.preferred,game.renderer,'Game must retain its renderer hint: '+game.kind);
      const resource=reader.reader.entities.get(entity.resource);
      const bytes=reader.reader.readEmbeddedFile(resource.representations[0].location.path);
      const restored=JSON.parse(new TextDecoder().decode(bytes));
      const gameResult=buildQuestionnaireGame(restored,game.renderer,{seedSource:'mcp-parity'});
      assert.equal(gameResult.compatible,true,game.kind+': '+JSON.stringify(gameResult.reasons));
      if(game.kind.startsWith('3d'))assert.ok(gameResult.data?.trials?.length, '3D game must contain playable trials');
    }
    assert.ok(portable.find(x=>Object.values(x.title??{}).includes('Consejo')),'Component missing after export');
    assert.ok(portable.find(x=>Object.values(x.title??{}).includes('Actividades combinadas')),'Composite missing after export');
    assert.equal(digest(readFileSync(join(root,'original.p2lrn'))),digest(original),'Original input must remain bit-identical');
    assert.throws(()=>api.exportDraft(draftId,'0'.repeat(64)),/Draft changed/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('renderer guard rejects invalid games and keeps original draft digest unchanged',async()=>{
  const root=sandbox();
  try {
    const api=new P2LRNMcpService({root,writeEnabled:true});
    const state=api.createEmptyDraft({title:'Juego protegido'});
    const quiz=getNativeQuiz();
    const before=api.inspectDraft(state.draftId).digest;
    assert.throws(()=>api.addNativeActivity(state.draftId,state.digest,'questionnaire',
      'not-a-game','course','No es un rosco',quiz,'https://p2lrn.org/renderer/questionnaire/rosco'),
      /incompatible|no se|exige|repuestas|pregunta|letra/i);
    assert.throws(()=>api.addNativeActivity(state.draftId,state.digest,'questionnaire',
      'bad-renderer','course','Mala URL',quiz,'https://example.com/renderer/fake'),
      /not installed/);
    assert.throws(()=>api.addNativeActivity(state.draftId,state.digest,'component',
      'callout','course','Aviso',nativeComponent(),'https://p2lrn.org/renderer/questionnaire/rosco'),
      /only valid for/);
    assert.equal(api.inspectDraft(state.draftId).digest,before);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('real MCP stdio tools discover game catalog, create playable 3D game and export',async()=>{
  const root=sandbox();
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../server.mjs',import.meta.url)),'--stdio'],
    env:{...process.env,P2LRN_MCP_ROOT:root,P2LRN_MCP_WRITE:'1'}});
  const client=new Client({name:'p2lrn-game-test',version:'0.1.0'});
  try{
    await client.connect(transport);
    const catalog=unwrap(await client.callTool({name:'p2lrn_list_game_renderers',arguments:{}}));
    const id=catalog.renderers.find(x=>x.id.endsWith('/3d-order-match'))?.id;
    assert.ok(id);
    const state=unwrap(await client.callTool({name:'p2lrn_draft_new',arguments:{title:'Juego 3D por MCP'}}));
    const game=await sampleGame('3d-matching');
    const added=unwrap(await client.callTool({name:'p2lrn_draft_add_native_activity',arguments:{
      draft_id:state.draftId,expected_digest:state.digest,kind:'questionnaire',key:'juego-3d',
      title:'Juego 3D con relaciones',payload:game.payload,renderer:id
    }}));
    assert.equal(added.result.activityKey,'act-juego-3d');
    const output=unwrap(await client.callTool({name:'p2lrn_draft_export',arguments:{
      draft_id:state.draftId,expected_digest:added.digest}}));
    const reader=new P2LRNReadingSystem(join(root,...output.path.split('/')));
    assert.ok(reader.summary().contentRoot);
  }finally{
    await client.close();
    rmSync(root,{recursive:true,force:true});
  }
});
