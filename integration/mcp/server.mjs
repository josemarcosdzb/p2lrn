#!/usr/bin/env node
import {createServer as createHttpServer} from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {McpServer, createMcpHandler} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {toNodeHandler, localhostHostValidation, localhostOriginValidation} from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
import {P2LRNMcpService} from './service.mjs';

const name = 'p2lrn';
const version = '0.1.0';
const jsonResult = (value) => ({content: [{type: 'text', text: JSON.stringify(value)}], structuredContent: value});

function register(server, tool, description, schema, action) {
  server.registerTool(tool, {description, inputSchema: schema}, async (input) => {
    try {
      return jsonResult(await action(input));
    } catch (error) {
      return {isError: true, content: [{type: 'text', text: JSON.stringify({error: error instanceof Error ? error.message : String(error)})}]};
    }
  });
}

export function createP2LRNMcpServer(service) {
  const server = new McpServer({name, version});
  register(server, 'p2lrn_list_courses',
    'List validated .p2lrn packages under the explicitly authorized directory; no external network access.',
    z.object({limit: z.number().int().min(1).max(500).optional()}),
    ({limit}) => service.listCourses({limit}));
  register(server, 'p2lrn_read_course',
    'Inspect the validated course summary and entity hierarchy without executing course content.',
    z.object({relative_path: z.string()}),
    ({relative_path}) => service.inspectCourse(relative_path));
  register(server, 'p2lrn_read_entity',
    'Read a single validated portable graph entity by its ID.',
    z.object({relative_path: z.string(), entity_id: z.string()}),
    ({relative_path, entity_id}) => service.readEntity(relative_path, entity_id));
  register(server, 'p2lrn_read_plan',
    'Get the validated Reader plan for learning content and its supported representations, without executing course files.',
    z.object({relative_path: z.string()}),
    ({relative_path}) => service.readPlan(relative_path));
  register(server, 'p2lrn_validate_course',
    'Validate an authorized package and native profile payloads using P2LRN Toolkit.',
    z.object({relative_path: z.string()}),
    ({relative_path}) => service.validateCourse(relative_path));
  register(server, 'p2lrn_read_text_member',
    'Read a small embedded text/HTML/JSON/XML resource; binary packages are never exposed as text and no code executes.',
    z.object({relative_path: z.string(), member: z.string(), max_bytes: z.number().int().min(1).max(32768).optional()}),
    ({relative_path, member, max_bytes}) => service.readTextMember(relative_path, member, max_bytes));

  register(server, 'p2lrn_search_metadata',
    'Search only titles, descriptions, and IDs in a validated course. This does not search opaque package payloads.',
    z.object({relative_path: z.string(), query: z.string(), limit: z.number().int().min(1).max(200).optional()}),
    ({relative_path, query, limit}) => service.searchMetadata(relative_path, query, limit));

  if (!service.writeEnabled) return server;

  const idAndDigest = {draft_id: z.string().uuid(), expected_digest: z.string().regex(/^[a-f0-9]{64}$/i)};
  register(server, 'p2lrn_draft_new',
    'Create a brand-new isolated P2LRN authoring draft via Toolkit; it will only export as a new course file.',
    z.object({title: z.string().min(1).max(500), language: z.string().optional(), description: z.string().optional()}),
    ({title,language,description}) => service.createEmptyDraft({title,language,description}));
  register(server, 'p2lrn_draft_create',
    'Create an isolated editable draft from a validated course; never alter the source package.',
    z.object({relative_path: z.string()}),
    ({relative_path}) => service.createDraft(relative_path));
  register(server, 'p2lrn_draft_read',
    'Inspect an isolated editable draft, its project digest, and optionally its authoring project.',
    z.object({draft_id: z.string().uuid(), include_project: z.boolean().optional()}),
    ({draft_id, include_project}) => service.inspectDraft(draft_id, include_project));
  register(server, 'p2lrn_draft_set_text',
    'Edit title or description in the isolated draft via the typed Authoring API; requires the last observed digest.',
    z.object({...idAndDigest, entity_key: z.string(), title: z.string().optional(), description: z.string().nullable().optional(), language: z.string().optional()}),
    ({draft_id, expected_digest, entity_key, title, description, language}) => service.setText(draft_id, expected_digest, entity_key,
      Object.fromEntries(Object.entries({title, description, language}).filter(([, value]) => value !== undefined))));
  register(server, 'p2lrn_draft_add_unit',
    'Add one course unit to the isolated draft using the validated Authoring API.',
    z.object({...idAndDigest, key: z.string(), title: z.string(), parent: z.string().optional(), language: z.string().optional()}),
    ({draft_id, expected_digest, ...unit}) => service.addUnit(draft_id, expected_digest, unit));
  register(server, 'p2lrn_draft_set_children',
    'Set ordered children for a draft course, unit or composite through typed Authoring API validation.',
    z.object({...idAndDigest, parent_key:z.string(), children:z.array(z.string())}),
    ({draft_id,expected_digest,parent_key,children}) => service.setChildren(draft_id,expected_digest,parent_key,children));
  register(server, 'p2lrn_draft_add_file',
    'Attach a file inside the authorized course directory to a draft; copies it into the isolated authoring workspace.',
    z.object({...idAndDigest, relative_source_path:z.string(), key:z.string(), title:z.string(),
      parent:z.string().optional(), language:z.string().optional(), media_type:z.string().optional(),
      profile:z.string().optional()}),
    ({draft_id,expected_digest,relative_source_path,key,title,parent,language,media_type,profile}) =>
      service.addFile(draft_id,expected_digest,relative_source_path,
        {key,title,parent,language,mediaType:media_type,profile}));
  register(server, 'p2lrn_draft_add_web_content',
    'Add a web directory inside authorized root to a draft; rejects symlinks and preserves assets through Toolkit.',
    z.object({...idAndDigest,relative_directory_path:z.string(),key:z.string(),title:z.string(),
      entrypoint:z.string().optional(),parent:z.string().optional(),language:z.string().optional()}),
    ({draft_id,expected_digest,relative_directory_path,key,title,entrypoint,parent,language}) =>
      service.addWebContent(draft_id,expected_digest,relative_directory_path,
        {key,title,entrypoint,parent,language}));
  register(server, 'p2lrn_draft_add_url',
    'Add an external URL resource descriptor to a draft without fetching or executing it.',
    z.object({...idAndDigest, key: z.string(), title: z.string(), url: z.string().url(), parent: z.string().optional()}),
    ({draft_id, expected_digest, ...resource}) => service.addUrl(draft_id, expected_digest, resource));
  register(server, 'p2lrn_draft_add_native_activity',
    'Add an existing P2LRN native questionnaire or component using its canonical validated payload schema; no new runtime or game type.',
    z.object({...idAndDigest, kind: z.enum(['questionnaire', 'component']), key: z.string(), title: z.string().optional(), parent: z.string().optional(), payload: z.record(z.string(), z.unknown())}),
    ({draft_id, expected_digest, kind, key, title, parent, payload}) => service.addNativeActivity(draft_id, expected_digest, kind, key, parent, title, payload));
  register(server, 'p2lrn_draft_add_composite',
    'Group existing draft activities into a native composite through the Authoring API.',
    z.object({...idAndDigest, key: z.string(), title: z.string(), children: z.array(z.string()).min(1), parent: z.string().optional(),
      mode: z.enum(['sequence', 'free']).optional(), completion: z.enum(['all', 'any']).optional(),
      navigation: z.enum(['linear', 'open']).optional(), moveChildren: z.boolean().optional()}),
    ({draft_id, expected_digest, ...options}) => service.addComposite(draft_id, expected_digest, options));
  register(server, 'p2lrn_draft_set_progression',
    'Set an optional progression rule on a draft course/unit/activity using the current Toolkit contract.',
    z.object({...idAndDigest, entity_key: z.string(), rule: z.record(z.string(), z.unknown()).nullable()}),
    ({draft_id, expected_digest, entity_key, rule}) => service.setProgression(draft_id, expected_digest, entity_key, rule));
  register(server, 'p2lrn_draft_export',
    'Validate and build a NEW independent .p2lrn in the export directory. Never overwrite the original or deploy to an LMS.',
    z.object(idAndDigest),
    ({draft_id, expected_digest}) => service.exportDraft(draft_id, expected_digest));
  return server;
}

export function serviceFromEnvironment(env = process.env) {
  return new P2LRNMcpService({root: env.P2LRN_MCP_ROOT, writeEnabled: env.P2LRN_MCP_WRITE === '1'});
}

function authorized(header, token) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice(7), 'utf8');
  const wanted = Buffer.from(token, 'utf8');
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}

export function validatePublicOrigin(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('P2LRN_MCP_PUBLIC_ORIGIN must be a URL');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Invalid P2LRN_MCP_PUBLIC_ORIGIN URL'); }
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error('P2LRN_MCP_PUBLIC_ORIGIN must be an HTTPS origin without credentials, path, query or fragment');
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('P2LRN_MCP_PUBLIC_ORIGIN must be a genuine public HTTPS origin');
  }
  return parsed.origin;
}

export async function startP2LRNMcpHttp(service, {token, port = 37871, publicOrigin = null} = {}) {
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32) throw new Error('HTTP requires P2LRN_MCP_TOKEN with at least 32 bytes');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid HTTP port');
  const handler = createMcpHandler(() => createP2LRNMcpServer(service));
  const nodeHandler = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  // A TLS-terminating reverse proxy can forward the actual public Host header.
  // Never trust X-Forwarded-Host, X-Forwarded-Proto or unconfigured origins.
  const declaredOrigin = validatePublicOrigin(publicOrigin);
  const publicHost = declaredOrigin ? new URL(declaredOrigin).host.toLowerCase() : null;
  const remoteHosts = publicHost ? new Set([publicHost, publicHost + (publicHost.includes(':') ? '' : ':443')]) : new Set();
  const reject = (res) => {
    res.writeHead(403, {'Content-Type': 'text/plain', 'Cache-Control': 'no-store'});
    res.end('Forbidden');
  };
  const listener = createHttpServer((req, res) => {
    const host = typeof req.headers.host === 'string' ? req.headers.host.toLowerCase() : '';
    if (remoteHosts.has(host)) {
      if (req.headers.origin && req.headers.origin !== declaredOrigin) { reject(res); return; }
    } else if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    if (req.url?.split('?')[0] !== '/mcp') {
      res.writeHead(404, {'Content-Type': 'text/plain', 'Cache-Control': 'no-store'});
      res.end('Not Found');
      return;
    }
    if (!authorized(req.headers.authorization, token)) {
      res.writeHead(401, {'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer'});
      res.end('Unauthorized');
      return;
    }
    void Promise.resolve(nodeHandler(req, res)).catch((error) => {
      console.error('P2LRN MCP HTTP handler failed:', error instanceof Error ? error.message : String(error));
      if (!res.headersSent) res.writeHead(500, {'Content-Type': 'text/plain'});
      res.end();
    });
  });
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(port, '127.0.0.1', resolve);
  });
  const bound = listener.address();
  return {server: listener, handler, url: 'http://127.0.0.1:' + bound.port + '/mcp'};
}

async function main() {
  const mode = process.argv[2] || '--stdio';
  const service = serviceFromEnvironment();
  if (mode === '--stdio') {
    serveStdio(() => createP2LRNMcpServer(service));
    console.error('P2LRN MCP stdio ready; root configured; writes ' + (service.writeEnabled ? 'enabled (drafts only)' : 'disabled'));
  } else if (mode === '--http') {
    const port = Number(process.env.P2LRN_MCP_PORT || '37871');
    const started = await startP2LRNMcpHttp(service, {token: process.env.P2LRN_MCP_TOKEN, port, publicOrigin: process.env.P2LRN_MCP_PUBLIC_ORIGIN});
    console.error('P2LRN MCP HTTP listening on ' + started.url + ' (loopback only)');
  } else {
    throw new Error('Use --stdio or --http');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error('P2LRN MCP:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
