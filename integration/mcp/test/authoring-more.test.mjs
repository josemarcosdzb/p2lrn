import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {P2LRNMcpService} from '../service.mjs';

const fixture=fileURLToPath(new URL('../../../examples/canonical/minimal-course.p2lrn',import.meta.url));
const server=fileURLToPath(new URL('../server.mjs',import.meta.url));
function root() {
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-mcp-author-'));
  copyFileSync(fixture,join(dir,'original.p2lrn'));
  writeFileSync(join(dir,'document.txt'),'Texto local autorizado de prueba.\n');
  mkdirSync(join(dir,'website'),{recursive:true});
  writeFileSync(join(dir,'website','index.html'),'<!doctype html><html lang="es"><body>Lección web</body></html>');
  return dir;
}

test('same P2LRN Reader provides read plan and strict validation without enabling writes',()=>{
  const dir=root();
  try {
    const api=new P2LRNMcpService({root:dir});
    assert.ok(api.readPlan('original.p2lrn').plan);
    const report=api.validateCourse('original.p2lrn');
    assert.equal(report.valid,true);
    assert.equal(report.summary.contentRoot.startsWith('sha256:'),true);
    assert.throws(()=>api.createEmptyDraft({title:'No write'}),/disabled/);
    assert.throws(()=>api.readTextMember('original.p2lrn','../secrets.txt'),/path|invalid|missing|found|outside|ZIP/i);
    assert.throws(()=>api.readTextMember('original.p2lrn','content/graph.json',64000),/maximum/);
  }finally{rmSync(dir,{force:true,recursive:true});}
});

test('create new course and author files, web resources and ordered units through Toolkit without touching source',()=>{
  const dir=root();
  try {
    const api=new P2LRNMcpService({root:dir,writeEnabled:true});
    const original=readFileSync(join(dir,'original.p2lrn'));
    let draft=api.createEmptyDraft({title:'Curso nuevo con IA',language:'es'});
    assert.equal(draft.source,null);
    assert.equal(draft.baseContentRoot,null);
    let changed=api.addUnit(draft.draftId,draft.digest,{key:'unidad',title:'Unidad'});
    changed=api.addFile(draft.draftId,changed.digest,'document.txt',{key:'texto',title:'Documento',parent:'unidad'});
    assert.equal(changed.result.activityKey,'act-texto');
    changed=api.addWebContent(draft.draftId,changed.digest,'website',
      {key:'web',title:'Lección web',entrypoint:'index.html',parent:'unidad'});
    assert.equal(changed.result.activityKey,'act-web');
    changed=api.setChildren(draft.draftId,changed.digest,'unidad',['act-web','act-texto']);
    assert.deepEqual(changed.result.children,['act-web','act-texto']);
    assert.throws(()=>api.addFile(draft.draftId,changed.digest,'../outside.txt',{key:'x',title:'X'}),/traversal|Invalid/);
    assert.throws(()=>api.addWebContent(draft.draftId,changed.digest,'../outside',{key:'x',title:'X'}),/traversal|Invalid/);
    const exported=api.exportDraft(draft.draftId,changed.digest);
    assert.equal(exported.createdFromScratch,true);
    assert.equal(exported.source,null);
    assert.throws(()=>api.validateCourse(exported.path),/Internal MCP storage/);
    assert.deepEqual(readFileSync(join(dir,'original.p2lrn')),original);
  }finally{rmSync(dir,{force:true,recursive:true});}
});

test('MCP tool list advertises the same expanded authoring capabilities over stdio',async()=>{
  const dir=root();
  const transport=new StdioClientTransport({command:process.execPath,args:[server,'--stdio'],
    env:{...process.env,P2LRN_MCP_ROOT:dir,P2LRN_MCP_WRITE:'1'}});
  const client=new Client({name:'expanded-mcp-test',version:'0.1.0'});
  try {
    await client.connect(transport);
    const names=(await client.listTools()).tools.map(tool=>tool.name);
    for(const name of ['p2lrn_draft_new','p2lrn_draft_set_children','p2lrn_draft_add_file',
      'p2lrn_draft_add_web_content','p2lrn_validate_course','p2lrn_read_plan']) {
      assert.ok(names.includes(name),'Missing tool '+name);
    }
    const created=await client.callTool({name:'p2lrn_draft_new',arguments:{title:'Curso de IA'}});
    assert.equal(created.isError,undefined);
    const data=JSON.parse(created.content[0].text);
    assert.equal(data.summary.counts.units,0);
    const next=await client.callTool({name:'p2lrn_draft_add_unit',arguments:{
      draft_id:data.draftId,expected_digest:data.digest,key:'primer-bloque',title:'Primer bloque'}});
    assert.equal(next.isError,undefined);
    const out=JSON.parse(next.content[0].text);
    assert.equal(out.result.unitKey,'primer-bloque');
    const exported=await client.callTool({name:'p2lrn_draft_export',arguments:{
      draft_id:data.draftId,expected_digest:out.digest}});
    assert.equal(exported.isError,undefined);
    assert.equal(JSON.parse(exported.content[0].text).createdFromScratch,true);
  }finally {
    await client.close();
    rmSync(dir,{force:true,recursive:true});
  }
});
