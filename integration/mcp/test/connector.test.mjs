import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {request as httpRequest} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {unzipSync, strFromU8} from "fflate";
import {Client, StreamableHTTPClientTransport} from "@modelcontextprotocol/client";
import {P2LRNMcpService} from "../service.mjs";
import {startP2LRNMcpHttp, validatePublicOrigin} from "../server.mjs";
import {validateMcpEndpoint, buildConnectionKit, writeConnectionKit} from "../prepare-connectors.mjs";

const TOKEN = "p2lrn-tests-" + "X".repeat(40);
const PUBLIC = "https://private-courses.p2lrn.org";
const ENDPOINT = PUBLIC + "/mcp";

test("provider connector kit defines the same real URL for all three clients", () => {
  const kit = buildConnectionKit({endpoint:ENDPOINT});
  for (const name of ["chatgpt","claude","grok"]) {
    assert.equal(kit.providers[name].url, ENDPOINT);
    assert.equal(kit.providers[name].transport, "streamable-http");
  }
  const files = unzipSync(kit.files["chatgpt/p2lrn-plugin.zip"]);
  const keys = Object.keys(files);
  assert.ok(keys.includes("p2lrn-plugin/plugin.json"));
  assert.ok(keys.includes("p2lrn-plugin/mcp.json"));
  assert.ok(keys.includes("p2lrn-plugin/skills/p2lrn-courses/SKILL.md"));
  const mcp = JSON.parse(strFromU8(files["p2lrn-plugin/mcp.json"]));
  assert.equal(mcp.mcpServers.p2lrn.url, ENDPOINT);
  assert.deepEqual(mcp.mcpServers.p2lrn.extensions["com.openai"].auth, {type:"api_key", headerScheme:"bearer"});
  const manifest = JSON.parse(strFromU8(files["p2lrn-plugin/plugin.json"]));
  assert.equal(manifest.name, "p2lrn-courses");
  const combined = JSON.stringify(kit.providers) + JSON.stringify(mcp);
  assert.equal(combined.includes(TOKEN), false, "credentials never enter provider manifests");
});

test("connector kit rejects local, unsafe or credential-bearing URLs", () => {
  for (const url of [
    "http://courses.example.org/mcp", "https://localhost/mcp", "https://127.0.0.1/mcp",
    "https://10.0.0.1/mcp", "https://school.local/mcp", "https://school.internal/mcp",
    "https://name:password@school.example.org/mcp", "https://school.example.org/other",
    "https://school.example.org/mcp?token=leak", "https://school.example.org/mcp#anchor",
  ]) assert.throws(() => validateMcpEndpoint(url), /HTTPS|URL|required|public/i, url);
  assert.equal(validateMcpEndpoint(ENDPOINT), ENDPOINT);
});

test("provider kit is reproducible and does not overwrite user output silently", () => {
  const dir = mkdtempSync(join(tmpdir(), "p2lrn-web-connector-"));
  const target = join(dir, "kit");
  try {
    const result = writeConnectionKit({endpoint: ENDPOINT, outputDirectory:target});
    assert.equal(result.installed, false);
    assert.equal(result.files.length, 9);
    const p = JSON.parse(readFileSync(join(target, "chatgpt", "plugin.json"), "utf8"));
    assert.equal(p.name, "p2lrn-courses");
    const g = JSON.parse(readFileSync(join(target, "grok", "connection.json"), "utf8"));
    assert.equal(g.url, ENDPOINT);
    assert.throws(() => writeConnectionKit({endpoint: ENDPOINT, outputDirectory:target}), /exists/);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});

function requestStatus(url, {method="POST", host, origin, token} = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {};
    if (host) headers.Host = host;
    if (origin) headers.Origin = origin;
    if (token) headers.Authorization = "Bearer " + token;
    const req = httpRequest({hostname:u.hostname, port:u.port, path:u.pathname, method, headers}, res => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.once("error", reject);
    req.end();
  });
}

test("HTTP MCP requires bearer, rejects DNS rebinding and only permits declared HTTPS proxy host", async () => {
  const root = mkdtempSync(join(tmpdir(), "p2lrn-mcp-proxy-"));
  const service = new P2LRNMcpService({root});
  const started = await startP2LRNMcpHttp(service, {port:0, token:TOKEN, publicOrigin:PUBLIC});
  try {
    assert.equal(await requestStatus(started.url), 401);
    assert.equal(await requestStatus(started.url, {host:"evil.example.org",token:TOKEN}), 403);
    assert.equal(await requestStatus(started.url, {host:"private-courses.p2lrn.org"}), 401);
    assert.equal(await requestStatus(started.url, {host:"private-courses.p2lrn.org",token:TOKEN,origin:"https://evil.example.org"}), 403);
    assert.notEqual(await requestStatus(started.url, {host:"private-courses.p2lrn.org",token:TOKEN,origin:PUBLIC}), 403);
    assert.equal(await requestStatus(started.url, {host:"private-courses.p2lrn.org",token:"wrong"}), 401);
    assert.throws(() => validatePublicOrigin("http://private-courses.p2lrn.org"), /HTTPS/);
    assert.throws(() => validatePublicOrigin("https://private-courses.p2lrn.org/path"), /HTTPS/);
  } finally {
    await new Promise(resolve => started.server.close(resolve));
    rmSync(root, {recursive:true,force:true});
  }
});

test("a real MCP HTTP client negotiates and discovers the same P2LRN read tools", async () => {
  const root = mkdtempSync(join(tmpdir(), "p2lrn-http-client-"));
  const service = new P2LRNMcpService({root});
  const started = await startP2LRNMcpHttp(service, {port:0, token:TOKEN});
  const client = new Client({name:"p2lrn-http-e2e", version:"0.1.0"});
  const transport = new StreamableHTTPClientTransport(new URL(started.url), {
    requestInit: {headers: {Authorization: "Bearer " + TOKEN}}
  });
  try {
    await client.connect(transport);
    const names = (await client.listTools()).tools.map(t => t.name);
    assert.ok(names.includes("p2lrn_list_courses"));
    assert.ok(names.includes("p2lrn_read_course"));
    assert.ok(!names.includes("p2lrn_draft_create"));
  } finally {
    await client.close();
    await new Promise(resolve => started.server.close(resolve));
    rmSync(root, {recursive:true,force:true});
  }
});
