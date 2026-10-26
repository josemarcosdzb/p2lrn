import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {P2LRNMcpService} from '../service.mjs';
import {P2LRNReader} from '../../../packages/toolkit/dist/reader/index.js';
import {COURSE_RIGHTS_EXTENSION} from '../../../packages/toolkit/dist/core/course-rights.js';

const server=fileURLToPath(new URL('../server.mjs',import.meta.url));
const expected={author:'María López',createdAt:'2025-05-14',license:'CC BY 4.0',copyrightHolder:'María López'};
function response(result){
  assert.notEqual(result.isError,true,JSON.stringify(result.content));
  return result.structuredContent??JSON.parse(result.content.find(x=>x.type==='text').text);
}
test('MCP handles course rights via a real stdio connection and verified export',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-mcp-rights-'));
  const transport=new StdioClientTransport({command:process.execPath,args:[server,'--stdio'],env:{...process.env,P2LRN_MCP_ROOT:dir,P2LRN_MCP_WRITE:'1'}});
  const client=new Client({name:'rights-test',version:'1'});
  try{
    await client.connect(transport);
    const tools=await client.listTools();
    const rightsTool=tools.tools.find(x=>x.name==='p2lrn_draft_set_rights');
    assert.ok(rightsTool);
    for(const field of ['author','createdAt','license','copyrightHolder'])
      assert.ok(rightsTool.inputSchema.properties[field]);
    let state=response(await client.callTool({name:'p2lrn_draft_new',arguments:{title:'Curso con derechos'}}));
    const originalDigest=state.digest;
    state=response(await client.callTool({name:'p2lrn_draft_set_rights',arguments:{
      draft_id:state.draftId,expected_digest:state.digest,...expected
    }}));
    assert.notEqual(state.digest,originalDigest);
    assert.deepEqual(state.result.rights,expected);
    const stale=await client.callTool({name:'p2lrn_draft_set_rights',arguments:{
      draft_id:state.draftId,expected_digest:originalDigest,author:'Incorrecto'
    }});
    assert.equal(stale.isError,true);
    const invalid=await client.callTool({name:'p2lrn_draft_set_rights',arguments:{
      draft_id:state.draftId,expected_digest:state.digest,createdAt:'2025-02-30'
    }});
    assert.equal(invalid.isError,true);
    const out=response(await client.callTool({name:'p2lrn_draft_export',arguments:{
      draft_id:state.draftId,expected_digest:state.digest
    }}));
    const reader=new P2LRNReader(join(dir,...out.path.split('/')));
    const course=reader.entity(reader.primaryEntrypoint().id);
    assert.deepEqual(course.extensions[COURSE_RIGHTS_EXTENSION],expected);
  }finally{await client.close();rmSync(dir,{recursive:true,force:true});}
});

test('MCP write capability remains opt-in for rights as for all course edits',()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-mcp-rights-ro-'));
  try{
    const service=new P2LRNMcpService({root:dir});
    assert.throws(()=>service.setRights('draft','digest',{author:'X'}),/disabled/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
