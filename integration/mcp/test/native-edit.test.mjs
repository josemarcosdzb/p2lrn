import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {P2LRNMcpService} from '../service.mjs';
import {P2LRNReadingSystem} from '../../../packages/toolkit/dist/reader/index.js';
import {createP2LRNStudioDocument} from '../../../packages/toolkit/web/studio/new-document.js';

const fixture=fileURLToPath(new URL('../../../examples/canonical/minimal-course.p2lrn',import.meta.url));
const server=fileURLToPath(new URL('../server.mjs',import.meta.url));
const HINT='https://p2lrn.org/ext/renderer-preference/1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

function quiz(prompt='¿Qué es el Sol?') {
  return {schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title:'Evaluación',
    language:'es',grading:{mode:'embedded-key'},questions:[
      {id:'q1',type:'single-choice',prompt,points:1,
        choices:[{id:'star',text:'Una estrella'},{id:'planet',text:'Un planeta'}],
        solution:{choiceIds:['star']}}]};
}
function root(){
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-edit-native-'));
  copyFileSync(fixture,join(dir,'protected.p2lrn'));
  return dir;
}
function readExportPayload(dir,exported,activityTitle){
  const reader=new P2LRNReadingSystem(join(dir,...exported.path.split('/')),{validateProfilePayloads:true});
  const entities=[...reader.reader.entities.values()];
  const activity=entities.find(x=>x.type==='activity'&&Object.values(x.title??{}).includes(activityTitle));
  assert.ok(activity,'Exported activity missing: '+activityTitle);
  const resource=reader.reader.entities.get(activity.resource);
  assert.ok(resource,'Exported activity resource missing');
  const rep=resource.representations.find(x=>x.location?.path);
  assert.ok(rep,'Native payload location missing');
  const bytes=reader.reader.readEmbeddedFile(rep.location.path);
  return {activity,payload:JSON.parse(new TextDecoder().decode(bytes))};
}

test('editing native questions changes only the draft, retains IDs and strict P2LRN validation',()=>{
  const dir=root();
  try {
    const before=sha(readFileSync(join(dir,'protected.p2lrn')));
    const api=new P2LRNMcpService({root:dir,writeEnabled:true});
    let draft=api.createDraft('protected.p2lrn');
    draft=api.addNativeActivity(draft.draftId,draft.digest,'questionnaire','quiz-edit','course','Evaluación',quiz());
    const prior=draft.digest;
    draft=api.editNativeActivity(draft.draftId,draft.digest,'act-quiz-edit','questionnaire',quiz('¿Qué tipo de astro es el Sol?'));
    assert.notEqual(draft.digest,prior);
    assert.equal(draft.result.sourceReplacedInDraftOnly,true);
    assert.equal(draft.result.activityKey,'act-quiz-edit');
    const exported=api.exportDraft(draft.draftId,draft.digest);
    const content=readExportPayload(dir,exported,'Evaluación');
    assert.equal(content.payload.questions[0].prompt,'¿Qué tipo de astro es el Sol?');
    assert.equal(content.activity.resource!=null,true);
    assert.equal(sha(readFileSync(join(dir,'protected.p2lrn'))),before);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('editing an existing game preserves the real renderer and rejects incompatible replacement',async()=>{
  const dir=root();
  try {
    const doc=createP2LRNStudioDocument({title:'Demo',language:'es'});
    const game=doc.addGame(doc.rootId,{kind:'matching',title:'Relacionar'});
    const native=await doc.readQuestionnaire(game.id);
    const renderer=game.extensions?.[HINT]?.preferred;
    assert.ok(renderer&&native?.payload);
    const api=new P2LRNMcpService({root:dir,writeEnabled:true});
    let draft=api.createEmptyDraft({title:'Curso de juegos'});
    draft=api.addNativeActivity(draft.draftId,draft.digest,'questionnaire','game-edit','course','Relacionar',native.payload,renderer);
    const unchanged=draft.digest;
    assert.throws(()=>api.editNativeActivity(draft.draftId,draft.digest,'act-game-edit','questionnaire',quiz()),
      /incompatible/i);
    assert.equal(api.inspectDraft(draft.draftId).digest,unchanged);
    const nextPayload=structuredClone(native.payload);
    nextPayload.title='Relacionar actualizado';
    draft=api.editNativeActivity(draft.draftId,draft.digest,'act-game-edit','questionnaire',nextPayload);
    assert.equal(draft.result.renderer,renderer);
    const exported=api.exportDraft(draft.draftId,draft.digest);
    const content=readExportPayload(dir,exported,'Relacionar');
    assert.equal(content.activity.extensions?.[HINT]?.preferred,renderer);
    assert.equal(content.payload.title,'Relacionar actualizado');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('draft edit requires correct permissions, activity type and fresh expected digest',()=>{
  const dir=root();
  try{
    const readOnly=new P2LRNMcpService({root:dir});
    assert.throws(()=>readOnly.editNativeActivity('wrong','0'.repeat(64),'act-x','questionnaire',quiz()),/disabled/);
    const api=new P2LRNMcpService({root:dir,writeEnabled:true});
    let draft=api.createEmptyDraft({title:'Control'});
    draft=api.addNativeActivity(draft.draftId,draft.digest,'questionnaire','q','course','Evaluación',quiz());
    assert.throws(()=>api.editNativeActivity(draft.draftId,'0'.repeat(64),'act-q','questionnaire',quiz()),/Draft changed/);
    assert.throws(()=>api.editNativeActivity(draft.draftId,draft.digest,'act-q','component',{schema:'invalid'}));
    assert.throws(()=>api.editNativeActivity(draft.draftId,draft.digest,'act-missing','questionnaire',quiz()),/not found/);
    assert.throws(()=>api.editNativeActivity(draft.draftId,draft.digest,'act-q','questionnaire',quiz(),'https://untrusted.example/game'),/not installed/);
    assert.equal(api.inspectDraft(draft.draftId).digest,draft.digest);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('real MCP stdio advertises and executes native activity edits with safe structured output',async()=>{
  const dir=root(),client=new Client({name:'p2lrn-native-edit-test',version:'1.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[server,'--stdio'],
    env:{...process.env,P2LRN_MCP_ROOT:dir,P2LRN_MCP_WRITE:'1'}});
  try{
    await client.connect(transport);
    const list=await client.listTools();
    assert.ok(list.tools.some(x=>x.name==='p2lrn_draft_edit_native_activity'));
    const created=await client.callTool({name:'p2lrn_draft_new',arguments:{title:'Evaluación nueva'}});
    assert.notEqual(created.isError,true);
    let draft=created.structuredContent??JSON.parse(created.content[0].text);
    let added=await client.callTool({name:'p2lrn_draft_add_native_activity',arguments:{
      draft_id:draft.draftId,expected_digest:draft.digest,kind:'questionnaire',
      key:'quiz',title:'Evaluación',payload:quiz()}});
    assert.notEqual(added.isError,true,JSON.stringify(added.content));
    draft=added.structuredContent??JSON.parse(added.content[0].text);
    let edited=await client.callTool({name:'p2lrn_draft_edit_native_activity',arguments:{
      draft_id:draft.draftId,expected_digest:draft.digest,activity_key:'act-quiz',
      kind:'questionnaire',payload:quiz('¿Qué es una estrella?')}});
    assert.notEqual(edited.isError,true,JSON.stringify(edited.content));
    draft=edited.structuredContent??JSON.parse(edited.content[0].text);
    const exported=await client.callTool({name:'p2lrn_draft_export',arguments:{
      draft_id:draft.draftId,expected_digest:draft.digest}});
    assert.notEqual(exported.isError,true,JSON.stringify(exported.content));
    const result=exported.structuredContent??JSON.parse(exported.content[0].text);
    assert.equal(readExportPayload(dir,result,'Evaluación').payload.questions[0].prompt,'¿Qué es una estrella?');
  }finally{await client.close();rmSync(dir,{recursive:true,force:true});}
});
