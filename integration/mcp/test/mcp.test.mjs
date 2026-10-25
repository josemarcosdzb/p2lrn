import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {P2LRNMcpService} from '../service.mjs';
import {createP2LRNMcpServer} from '../server.mjs';

const fixture = resolve('examples/canonical/minimal-course.p2lrn');
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const makeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), 'p2lrn-mcp-test-'));
  copyFileSync(fixture, join(root, 'course.p2lrn'));
  return root;
};

test('MCP reads validated course metadata, graph entities and rejects path traversal', () => {
  const root = makeRoot();
  try {
    const api = new P2LRNMcpService({root});
    const results = api.listCourses();
    assert.equal(results.courses.length, 1);
    assert.equal(results.courses[0].path, 'course.p2lrn');
    const course = api.inspectCourse('course.p2lrn');
    assert.equal(course.summary.format, 'P2LRN');
    assert.ok(course.summary.contentRoot.startsWith('sha256:'));
    assert.ok(course.tree.id);
    assert.equal(api.readEntity('course.p2lrn', course.tree.id).entity.id, course.tree.id);
    assert.equal(api.searchMetadata('course.p2lrn', course.tree.title.substring(0, 2)).scope, 'metadata');
    assert.throws(() => api.inspectCourse('../course.p2lrn'), /Path|Invalid|traversal/);
    assert.throws(() => api.inspectCourse('.p2lrn-mcp-drafts/anything.p2lrn'), /Internal|not accessible/);
    assert.throws(() => api.createDraft('course.p2lrn'), /disabled/);
  } finally { rmSync(root, {force: true, recursive: true}); }
});

test('MCP draft round-trip preserves original, rejects stale edits, and exports separately', () => {
  const root = makeRoot();
  try {
    const source = join(root, 'course.p2lrn');
    const sourceDigest = digest(source);
    const api = new P2LRNMcpService({root, writeEnabled: true});
    const before = api.inspectCourse('course.p2lrn').summary.contentRoot;
    const draft = api.createDraft('course.p2lrn');
    assert.ok(draft.draftId);
    assert.equal(draft.baseContentRoot, before);
    const unchanged = api.exportDraft(draft.draftId, draft.digest);
    assert.equal(unchanged.contentRoot, before);
    assert.equal(unchanged.originalContentRoot, before);
    assert.equal(digest(source), sourceDigest);
    const change = api.setText(draft.draftId, draft.digest, 'course', {title: 'MCP edited course'});
    assert.notEqual(change.digest, draft.digest);
    assert.throws(() => api.addUnit(draft.draftId, draft.digest, {key: 'lesson', title: 'Lesson 1'}), /Draft changed/);
    const extended = api.addUnit(draft.draftId, change.digest, {key: 'new-module', title: 'New module'});
    assert.notEqual(extended.digest, change.digest);
    const exported = api.exportDraft(draft.draftId, extended.digest);
    assert.notEqual(exported.contentRoot, before);
    assert.equal(digest(source), sourceDigest);
    assert.equal(api.inspectCourse('course.p2lrn').summary.contentRoot, before);
    assert.equal(exported.path.startsWith('.p2lrn-mcp-exports/'), true);
  } finally { rmSync(root, {force: true, recursive: true}); }
});

test('MCP refuses exporting against a changed original', () => {
  const root = makeRoot();
  try {
    const api = new P2LRNMcpService({root, writeEnabled: true});
    const draft = api.createDraft('course.p2lrn');
    writeFileSync(join(root, 'course.p2lrn'), 'tampered source');
    assert.throws(() => api.exportDraft(draft.draftId, draft.digest));
  } finally { rmSync(root, {force: true, recursive: true}); }
});

test('MCP rejects symlinked course sources', (t) => {
  const root = makeRoot();
  try {
    try { symlinkSync(join(root, 'course.p2lrn'), join(root, 'linked.p2lrn'), 'file'); }
    catch (error) { t.skip('Symlink creation unavailable: ' + error.code); return; }
    const api = new P2LRNMcpService({root});
    assert.throws(() => api.inspectCourse('linked.p2lrn'), /Symlinks/);
    assert.equal(api.listCourses().courses.length, 1);
  } finally { rmSync(root, {force: true, recursive: true}); }
});

test('MCP over real stdio negotiates protocol and exposes only read tools by default', async () => {
  const root = makeRoot();
  const server = resolve('integration/mcp/server.mjs');
  const transport = new StdioClientTransport({
    command: process.execPath, args: [server, '--stdio'],
    env: {...process.env, P2LRN_MCP_ROOT: root, P2LRN_MCP_WRITE: '0'},
  });
  const client = new Client({name: 'p2lrn-test', version: '0.1.0'});
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === 'p2lrn_read_course'));
    assert.equal(listed.tools.some((tool) => tool.name === 'p2lrn_draft_create'), false);
    const response = await client.callTool({name: 'p2lrn_list_courses', arguments: {limit: 10}});
    assert.equal(response.isError, undefined);
    const data = JSON.parse(response.content[0].text);
    assert.equal(data.courses[0].path, 'course.p2lrn');
  } finally {
    await client.close();
    rmSync(root, {force: true, recursive: true});
  }
});

test('MCP server factory registers distinct write tools only for opted-in services', async () => {
  const root = makeRoot();
  try {
    const server = createP2LRNMcpServer(new P2LRNMcpService({root, writeEnabled: true}));
    assert.ok(server);
    await server.close();
  } finally { rmSync(root, {force: true, recursive: true}); }
});
