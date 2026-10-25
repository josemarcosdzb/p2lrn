#!/usr/bin/env node
import {existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, copyFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function option(name) {
  const index = process.argv.indexOf('--' + name);
  if (index < 0) return null;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw new Error('Missing --' + name + ' value');
  return process.argv[index + 1];
}

function destination(client) {
  if (client === 'claude') {
    return process.platform === 'win32'
      ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
        : join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
  }
  if (client === 'cursor') return join(homedir(), '.cursor', 'mcp.json');
  return null;
}

export function makeClientEntry({root, writeEnabled = false, nodePath = process.execPath, serverPath = join(here, 'server.mjs')} = {}) {
  if (typeof root !== 'string' || !isAbsolute(root) || !existsSync(root) || !statSync(root).isDirectory()) throw new Error('Use --root with an existing absolute course directory');
  if (!existsSync(serverPath)) throw new Error('P2LRN MCP server.mjs is missing');
  return {
    command: nodePath,
    args: [resolve(serverPath), '--stdio'],
    env: {P2LRN_MCP_ROOT: resolve(root), P2LRN_MCP_WRITE: writeEnabled ? '1' : '0'},
  };
}

function main() {
  const client = option('client') || 'generic';
  if (!['claude', 'cursor', 'generic', 'chatgpt'].includes(client)) throw new Error('Supported clients: claude, cursor, generic, chatgpt');
  const root = option('root');
  const writeEnabled = process.argv.includes('--enable-drafts');
  const write = process.argv.includes('--write');
  if (client === 'chatgpt') {
    if (write) throw new Error('ChatGPT web connections must be created in the ChatGPT Plugins settings; local files cannot install them');
    console.log(JSON.stringify({
      client, transport: 'streamable-http',
      instructions: 'Run P2LRN MCP with --http and a strong P2LRN_MCP_TOKEN, connect using an approved HTTPS endpoint or Secure MCP Tunnel, and configure authentication in ChatGPT Plugins.',
      remoteUrl: 'https://YOUR-SECURE-MCP-ENDPOINT/mcp',
      localOnly: 'http://127.0.0.1:37871/mcp',
      note: 'Never expose the loopback HTTP listener directly to the Internet; ChatGPT must be configured in its own UI.'
    }, null, 2));
    return;
  }
  const entry = makeClientEntry({root, writeEnabled});
  const path = destination(client);
  const fragment = {mcpServers: {p2lrn: entry}};
  if (!write || !path) {
    console.log(JSON.stringify({client, configPath: path, preview: fragment, applied: false}, null, 2));
    if (write && !path) throw new Error('Generic client configuration is not automatically writable');
    return;
  }
  const original = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const config = original ? JSON.parse(original) : {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid existing client configuration');
  if (config.mcpServers && (typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers))) throw new Error('Invalid mcpServers entry');
  if (config.mcpServers?.p2lrn && !process.argv.includes('--replace')) throw new Error('P2LRN is already configured; use --replace only after inspecting its current settings');
  config.mcpServers = {...(config.mcpServers || {}), p2lrn: entry};
  mkdirSync(dirname(path), {recursive: true});
  if (original !== null) copyFileSync(path, path + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-'));
  const temporary = path + '.tmp-' + process.pid;
  writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', {flag: 'wx'});
  renameSync(temporary, path);
  console.log(JSON.stringify({client, configPath: path, applied: true, writeEnabled, note: 'Restart the AI client to load the P2LRN MCP connection.'}, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error('P2LRN MCP installer:', error.message); process.exitCode = 1; }
}
