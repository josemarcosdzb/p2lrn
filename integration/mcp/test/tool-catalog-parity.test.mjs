import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const readme=readFileSync(new URL('../README.md',import.meta.url),'utf8');
const names=[...server.matchAll(/register\(server,\s*'([^']+)'/g)].map(match=>match[1]);

test('MCP tool inventory is documented and write tools remain opt-in',()=>{
  assert.equal(new Set(names).size,names.length,'Duplicate MCP tool names');
  const firstWrite=server.indexOf("register(server, 'p2lrn_draft_new'");
  const guard=server.indexOf('if (!service.writeEnabled) return server;');
  assert.ok(guard>=0&&guard<firstWrite,'Write tool discovery must be gated');
  assert.equal(names.filter(name=>!name.startsWith('p2lrn_draft_')).length,8);
  assert.equal(names.filter(name=>name.startsWith('p2lrn_draft_')).length,15);
  for(const name of names)assert.ok(readme.includes('`'+name+'`'),'Undocumented tool: '+name);
  for(const expected of ['p2lrn_list_game_renderers','p2lrn_draft_set_rights','p2lrn_draft_edit_native_activity'])
    assert.ok(names.includes(expected));
  assert.match(readme,/no exporta paquetes offline/i);
});