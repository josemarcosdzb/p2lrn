import {randomUUID} from 'node:crypto';
import {copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Host-specific differences are limited to configuration formats and locations.
// The same P2LRN stdio server and the same MCP tools serve every client.
export const LOCAL_CLIENTS = Object.freeze(['claude','cursor','windsurf','gemini','vscode']);
export const OTHER_CLIENTS = Object.freeze(['claude-code','codex','opencode','generic','chatgpt-desktop']);
const here = dirname(fileURLToPath(import.meta.url));

function profileHome(options = {}) { return resolve(options.home ?? homedir()); }
export function defaultCourseDirectory(options = {}) {
  return join(profileHome(options), 'Documents', 'P2LRN');
}

export function clientConfigLocation(client, options = {}) {
  const home = profileHome(options);
  const platform = options.platform ?? process.platform;
  const roaming = options.appData ?? (platform === 'win32' ? join(home, 'AppData','Roaming') : join(home,'.config'));
  if (client === 'claude') {
    return platform === 'darwin' ? join(home,'Library','Application Support','Claude','claude_desktop_config.json')
      : join(roaming, 'Claude','claude_desktop_config.json');
  }
  if (client === 'cursor') return join(home,'.cursor','mcp.json');
  if (client === 'windsurf') return join(home,'.codeium','windsurf','mcp_config.json');
  if (client === 'gemini') return join(home,'.gemini','settings.json');
  if (client === 'vscode') {
    if (!options.workspace || !isAbsolute(options.workspace)) throw new Error('VS Code requires an absolute --workspace for a project-scoped .vscode/mcp.json');
    return join(resolve(options.workspace),'.vscode','mcp.json');
  }
  throw new Error('No automatic local installer for ' + client + '; export a generic MCP configuration');
}

export function listDetectedClients(options = {}) {
  return LOCAL_CLIENTS.filter(name => {
    if (name === 'vscode' && !options.workspace) return false;
    try {
      const config = clientConfigLocation(name, options);
      return existsSync(config) || existsSync(dirname(config));
    } catch { return false; }
  });
}

export function makeClientEntry({root, writeEnabled = false, nodePath = process.execPath, serverPath = join(here,'server.mjs')} = {}) {
  if (typeof root !== 'string' || !isAbsolute(root) || !existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
    throw new Error('Select an existing absolute directory of authorized P2LRN courses');
  }
  if (typeof serverPath !== 'string' || !existsSync(serverPath)) throw new Error('The P2LRN MCP server is not installed at ' + serverPath);
  return {command: resolve(nodePath), args: [realpathSync(serverPath), '--stdio'],
    env: {P2LRN_MCP_ROOT: realpathSync(root), P2LRN_MCP_WRITE: writeEnabled ? '1' : '0'}};
}

export function localStdioDefinition({root, enableDrafts = false, nodePath = process.execPath, serverPath = join(here,'server.mjs')} = {}) {
  return makeClientEntry({root, writeEnabled:enableDrafts, nodePath, serverPath});
}

export function buildLocalClientEntry(client, entry) {
  const base = structuredClone(entry);
  if (client === 'vscode') return {type:'stdio',...base};
  return base;
}

export function buildLocalClientSnippet(client, entry) {
  if (LOCAL_CLIENTS.includes(client)) {
    const group = client === 'vscode' ? 'servers' : 'mcpServers';
    return {[group]: {p2lrn: buildLocalClientEntry(client, entry)}};
  }
  if (client === 'opencode') {
    // OpenCode has changed configuration layout between releases.
    // This legacy-compatible snippet is for explicit manual review only.
    return {mcp: {p2lrn: {type:'local', command:[entry.command, ...entry.args], environment:entry.env}}};
  }
  if (client === 'generic') return {mcpServers: {p2lrn: entry}};
  if (client === 'codex') {
    return {kind:'command', executable:'codex', args:[
      'mcp','add','p2lrn','--env','P2LRN_MCP_ROOT='+entry.env.P2LRN_MCP_ROOT,
      '--env','P2LRN_MCP_WRITE='+entry.env.P2LRN_MCP_WRITE,
      '--', entry.command, ...entry.args]};
  }
  if (client === 'claude-code') {
    return {kind:'command', executable:'claude', args:[
      'mcp','add','--scope','user','--transport','stdio',
      '--env','P2LRN_MCP_ROOT='+entry.env.P2LRN_MCP_ROOT,
      '--env','P2LRN_MCP_WRITE='+entry.env.P2LRN_MCP_WRITE,
      'p2lrn','--',entry.command,...entry.args]};
  }
  if (client === 'chatgpt-desktop') {
    return {kind:'desktop-only-plugin', transport:'stdio',
      connection: {type:'stdio',command:entry.command,args:entry.args,env:entry.env},
      note:'Local ChatGPT desktop MCP plugin install requires OpenAI-approved partner eligibility; do not claim installed.'};
  }
  throw new Error('Unsupported client ' + client);
}

function ensureNoSymlinks(file) {
  let current = resolve(file);
  while (true) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Refusing symlinked config path: ' + current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function jsonObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid ' + name + ': expected a JSON object');
  return value;
}

export function planLocalRegistration(client, options = {}) {
  if (!LOCAL_CLIENTS.includes(client)) throw new Error('Only supported local config clients can be installed automatically; use manual export for ' + client);
  const path = clientConfigLocation(client, options);
  const entry = localStdioDefinition(options);
  const fragment = buildLocalClientSnippet(client, entry);
  return {client, path, fragment};
}

export function applyLocalRegistration(client, options = {}) {
  const plan = planLocalRegistration(client, options);
  ensureNoSymlinks(plan.path);
  const original = existsSync(plan.path) ? readFileSync(plan.path,'utf8') : null;
  let config;
  try { config = original === null ? {} : jsonObject(JSON.parse(original),'client config'); }
  catch (error) { throw new Error('Client configuration is invalid; left unchanged: ' + error.message); }
  const group = client === 'vscode' ? 'servers' : 'mcpServers';
  const values = config[group] === undefined ? {} : jsonObject(config[group],group);
  const existing = values.p2lrn;
  const nextEntry = plan.fragment[group].p2lrn;
  if (existing !== undefined) {
    if (JSON.stringify(existing) === JSON.stringify(nextEntry)) return {...plan,status:'already-configured',applied:false};
    if (options.replace !== true) throw new Error('P2LRN already configured in ' + plan.path + '; use --replace only after reviewing it');
  }
  const next = {...config,[group]: {...values,p2lrn: nextEntry}};
  const newText = JSON.stringify(next,null,2) + '\n';
  mkdirSync(dirname(plan.path),{recursive:true});
  ensureNoSymlinks(plan.path);
  let backup = null;
  if (original !== null) {
    backup = plan.path + '.bak-p2lrn-' + new Date().toISOString().replaceAll(':','-').replaceAll('.','-') + '-' + randomUUID();
    copyFileSync(plan.path,backup,0);
  }
  const tmp = plan.path + '.tmp-' + randomUUID();
  try {
    writeFileSync(tmp,newText,{flag:'wx',mode:0o600});
    renameSync(tmp,plan.path);
  } finally {
    if (existsSync(tmp)) {
      try { rmSync(tmp,{force:true}); } catch {}
    }
  }
  return {...plan,status:'installed',backup,applied:true};
}
