import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  LOCAL_CLIENTS, applyLocalRegistration, buildLocalClientSnippet,
  clientConfigLocation, defaultCourseDirectory, listDetectedClients,
  localStdioDefinition, makeClientEntry, planLocalRegistration
} from '../local-clients.mjs';
import {connectLocal, verifyLocalMcp} from '../connect-local.mjs';
import {makeClientEntry as legacyEntry} from '../install-client.mjs';

const fixture = fileURLToPath(new URL('../../../examples/canonical/minimal-course.p2lrn',import.meta.url));
const serverPath = fileURLToPath(new URL('../server.mjs',import.meta.url));
const temp = () => mkdtempSync(join(tmpdir(),'p2lrn-local-'));
const setup = () => {
  const home = temp(), root = join(home,'courses');
  mkdirSync(root);
  copyFileSync(fixture,join(root,'lesson.p2lrn'));
  return {home, root, appData:join(home,'AppData','Roaming'), platform:'win32',serverPath};
};
const close = options => rmSync(options.home,{recursive:true,force:true});

test('one core stdio connection works for all local MCP clients and retains permissions',() => {
  const o = setup();
  try {
    assert.deepEqual(legacyEntry({root:o.root,writeEnabled:true,serverPath}),
      makeClientEntry({root:o.root,writeEnabled:true,serverPath}));
    const entry = localStdioDefinition({root:o.root,enableDrafts:false,serverPath});
    assert.equal(entry.args.at(-1),'--stdio');
    assert.equal(entry.env.P2LRN_MCP_WRITE,'0');
    assert.equal(entry.env.P2LRN_MCP_ROOT,resolve(o.root));
    for (const name of [...LOCAL_CLIENTS,'generic']) {
      const fragment = buildLocalClientSnippet(name,entry);
      assert.equal((fragment[name==='vscode'?'servers':'mcpServers'].p2lrn).command,process.execPath);
      if(name==='vscode') assert.equal(fragment.servers.p2lrn.type,'stdio');
    }
    const openCode = buildLocalClientSnippet('opencode',entry);
    assert.equal(openCode.mcp.p2lrn.type,'local');
    assert.equal(openCode.mcp.p2lrn.environment.P2LRN_MCP_WRITE,'0');
    for (const name of ['codex','claude-code']) {
      const command = buildLocalClientSnippet(name,entry);
      assert.equal(command.kind,'command');
      assert.ok(command.args.includes('--stdio'));
    }
    const desktop = buildLocalClientSnippet('chatgpt-desktop',entry);
    assert.equal(desktop.kind,'desktop-only-plugin');
  } finally {close(o);}
});

test('real host-specific paths are confined to intended client configuration locations',() => {
  const o=setup();
  try {
    assert.equal(clientConfigLocation('claude',o),join(o.appData,'Claude','claude_desktop_config.json'));
    assert.equal(clientConfigLocation('windsurf',o),join(o.home,'.codeium','windsurf','mcp_config.json'));
    assert.equal(clientConfigLocation('gemini',o),join(o.home,'.gemini','settings.json'));
    assert.equal(clientConfigLocation('cursor',o),join(o.home,'.cursor','mcp.json'));
    const workspace=join(o.home,'demo-project');
    assert.equal(clientConfigLocation('vscode',{...o,workspace}),join(workspace,'.vscode','mcp.json'));
    assert.throws(()=>clientConfigLocation('vscode',o),/workspace/);
    assert.equal(defaultCourseDirectory(o),join(o.home,'Documents','P2LRN'));
    assert.equal(clientConfigLocation('claude',{home:o.home,platform:'darwin'}),
      join(o.home,'Library','Application Support','Claude','claude_desktop_config.json'));
  } finally {close(o);}
});

test('installer preserves unrelated MCP servers and other settings, backs up, and is idempotent',() => {
  const o=setup();
  try {
    const path=clientConfigLocation('cursor',o);
    mkdirSync(resolve(path,'..'),{recursive:true});
    writeFileSync(path,JSON.stringify({settings:{theme:'dark'},mcpServers:{existing:{command:'other'}}},null,2));
    const before=readFileSync(path,'utf8');
    const preview=planLocalRegistration('cursor',{...o,enableDrafts:false});
    assert.equal(preview.fragment.mcpServers.p2lrn.env.P2LRN_MCP_WRITE,'0');
    assert.equal(readFileSync(path,'utf8'),before,'preview must not mutate client configuration');
    const result=applyLocalRegistration('cursor',{...o});
    assert.equal(result.status,'installed');
    assert.equal(readFileSync(result.backup,'utf8'),before);
    const saved=JSON.parse(readFileSync(path,'utf8'));
    assert.deepEqual(saved.settings,{theme:'dark'});
    assert.equal(saved.mcpServers.existing.command,'other');
    assert.equal(saved.mcpServers.p2lrn.env.P2LRN_MCP_WRITE,'0');
    const another=applyLocalRegistration('cursor',{...o});
    assert.equal(another.status,'already-configured');
    assert.equal(another.applied,false);
    assert.throws(()=>applyLocalRegistration('cursor',{...o,enableDrafts:true}),/already configured/);
    const updated=applyLocalRegistration('cursor',{...o,enableDrafts:true,replace:true});
    assert.equal(updated.status,'installed');
    assert.equal(JSON.parse(readFileSync(path,'utf8')).mcpServers.p2lrn.env.P2LRN_MCP_WRITE,'1');
  } finally {close(o);}
});

test('invalid and symlinked client configurations are never overwritten',t=>{
  const o=setup();
  try {
    const path=clientConfigLocation('gemini',o);
    mkdirSync(resolve(path,'..'),{recursive:true});
    writeFileSync(path,'{bad JSON');
    assert.throws(()=>applyLocalRegistration('gemini',o),/invalid/);
    assert.equal(readFileSync(path,'utf8'),'{bad JSON');
    rmSync(path);
    try {symlinkSync(join(o.root,'lesson.p2lrn'),path,'file');}
    catch (error) {t.diagnostic('Symlink permission unavailable: '+error.code);return;}
    assert.throws(()=>applyLocalRegistration('gemini',o),/symlink/);
  } finally {close(o);}
});

test('explicit multi-client configuration installs only the selected clients, not undeclared ones',async()=>{
  const o=setup();
  try {
    const cursor=clientConfigLocation('cursor',o);
    const windsurf=clientConfigLocation('windsurf',o);
    const out=await connectLocal({...o,clients:['cursor','windsurf'],install:true,enableDrafts:true});
    assert.equal(out.installed.length,2);
    assert.equal(out.mode,'drafts');
    assert.ok(existsSync(cursor));
    assert.ok(existsSync(windsurf));
    assert.ok(!existsSync(clientConfigLocation('gemini',o)));
    assert.equal(JSON.parse(readFileSync(cursor,'utf8')).mcpServers.p2lrn.env.P2LRN_MCP_WRITE,'1');
    assert.equal(JSON.parse(readFileSync(windsurf,'utf8')).mcpServers.p2lrn.env.P2LRN_MCP_WRITE,'1');
  } finally {close(o);}
});

test('automatic client detection only identifies existing client configuration folders',()=>{
  const o=setup();
  try {
    assert.deepEqual(listDetectedClients(o),[]);
    mkdirSync(resolve(clientConfigLocation('claude',o),'..'),{recursive:true});
    mkdirSync(resolve(clientConfigLocation('gemini',o),'..'),{recursive:true});
    assert.deepEqual(listDetectedClients(o),['claude','gemini']);
  } finally {close(o);}
});

test('a real generic local MCP client negotiates read and draft tools with zero public URL',async()=>{
  const o=setup();
  try {
    const read=await verifyLocalMcp(localStdioDefinition({root:o.root,enableDrafts:false,serverPath}));
    assert.equal(read.negotiated,true);
    assert.equal(read.courseListingWorked,true);
    assert.equal(read.writeToolsAdvertised,false);
    assert.ok(read.tools.includes('p2lrn_read_entity'));
    const authoring=await verifyLocalMcp(localStdioDefinition({root:o.root,enableDrafts:true,serverPath}));
    assert.equal(authoring.writeToolsAdvertised,true);
    assert.ok(authoring.tools.includes('p2lrn_draft_export'));
  } finally {close(o);}
});
