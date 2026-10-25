#!/usr/bin/env node
// Backward-compatible launcher. All client definitions and writes come from
// the universal local-clients module, shared by the guided installer.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyLocalRegistration, buildLocalClientSnippet, localStdioDefinition, makeClientEntry, planLocalRegistration} from './local-clients.mjs';

export {makeClientEntry};

function option(name) {
  const index = process.argv.indexOf('--' + name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error('Missing --' + name + ' value');
  return value;
}

function main() {
  const client = option('client') || 'generic';
  const root = option('root');
  const enableDrafts = process.argv.includes('--enable-drafts');
  const write = process.argv.includes('--write');
  const replace = process.argv.includes('--replace');
  if (client === 'chatgpt' || client === 'grok' || client === 'claude-web') {
    if (write) throw new Error('Web AI connectors must be authorized in the provider account, not written into local config files');
    console.log(JSON.stringify({
      client,
      local: 'To connect an AI app on this computer, run node connect-local.mjs or double-click Conectar-P2LRN.cmd on Windows.',
      web: 'To connect from a browser, use the authenticated HTTPS MCP endpoint or a supported secure tunnel.',
      docs: 'integration/mcp/README.md'
    }, null, 2));
    return;
  }
  if (client === 'generic') {
    if (write) throw new Error('Generic clients need an explicit configuration path; run connect-local.mjs --export');
    const entry = localStdioDefinition({root, enableDrafts});
    console.log(JSON.stringify({client, preview:buildLocalClientSnippet('generic',entry), applied:false},null,2));
    return;
  }
  const allowed = new Set(['claude','cursor','windsurf','gemini','vscode']);
  if (!allowed.has(client)) throw new Error('Unsupported automatic client: ' + client + '; use connect-local.mjs for other MCP clients');
  const options = {root, enableDrafts, replace,workspace:option('workspace')};
  const result = write ? applyLocalRegistration(client,options) : {...planLocalRegistration(client,options),applied:false};
  console.log(JSON.stringify(result,null,2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error('P2LRN MCP client setup: ' + error.message); process.exitCode = 1; }
}
