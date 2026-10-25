# P2LRN MCP integration — optional

This integration adds a **P2LRN-side MCP server** and a **client-side setup helper** without changing the P2LRN Core format, Reader, Player, Studio or four existing npm packages.

It uses the existing `@p2lrn/toolkit/reader` and `@p2lrn/toolkit/authoring` contracts. The server is a separate Node.js process and **never executes course payloads**. Imported/unsupported representations remain opaque.

## Build and install, Windows (PowerShell)

```powershell
cd path\to\p2lrn\packages\toolkit
npm install
npm run build
cd ..\..\integration\mcp
npm install
npm test
```

Use Node.js 22+. Until packaged in a release, installation is from the checked-out repository.

## Local MCP (recommended)

A client starts the server via stdio and specifies an absolute directory of **authorized** courses:

```powershell
$env:P2LRN_MCP_ROOT = 'C:\p2lrn-courses'
$env:P2LRN_MCP_WRITE = '0'
node .\integration\mcp\server.mjs --stdio
```

The server only lists/opens validated `.p2lrn` packages below the explicit directory. It rejects traversal, symlinks, and internal draft/export directories. By default only read tools are advertised.

To preview client integration (without editing the client's configuration):

```powershell
node .\integration\mcp\install-client.mjs --client claude --root C:\p2lrn-courses
node .\integration\mcp\install-client.mjs --client cursor --root C:\p2lrn-courses
```

After reviewing the printed JSON, add `--write` to configure the selected installed AI client. It preserves other configured servers and backs up the original JSON.

**Draft write tools are opt-in**: append `--enable-drafts` to the client setup command. They edit isolated authoring workspaces and produce a newly validated `.p2lrn` in `.p2lrn-mcp-exports/`, **never replacing the source** or deploying to a third-party LMS. Calls include an expected SHA-256 of the project JSON to reject stale writes. The model/client must display changes and obtain user consent before using write tools.

## HTTP for a protected local bridge

```powershell
$env:P2LRN_MCP_ROOT = 'C:\p2lrn-courses'
$env:P2LRN_MCP_TOKEN = '<a-long-random-secret-at-least-32-bytes>'
node .\integration\mcp\server.mjs --http
```

HTTP is bound to `127.0.0.1:37871/mcp` and requires `Authorization: Bearer <token>` plus host/origin validation. **Do not expose this loopback HTTP service directly to the internet or treat its static bearer as OAuth.** A public ChatGPT-compatible connector needs a separately managed authenticated HTTPS tunnel/bridge with OAuth (where required) and explicit user-account authorization. This project does **not** install an app into ChatGPT automatically.

```powershell
node .\integration\mcp\install-client.mjs --client chatgpt
```

This prints connection instructions, not a fake installation.

## Tool categories

Read: `p2lrn_list_courses`, `p2lrn_read_course`, `p2lrn_read_entity`, `p2lrn_search_metadata`. Search covers metadata, not opaque payloads.

Opt-in draft editing: `p2lrn_draft_create`, `p2lrn_draft_read`, `p2lrn_draft_set_text`, `p2lrn_draft_add_unit`, `p2lrn_draft_add_url`, `p2lrn_draft_add_native_activity`, `p2lrn_draft_add_composite`, `p2lrn_draft_set_progression`, `p2lrn_draft_export`. All edit paths call typed Toolkit authoring methods. A fully integrated Studio visual approval workflow and production OAuth connector remain separate delivery gates.

## Regression gates

Run `npm test` in this directory after building Toolkit, then the main Windows P2LRN CI. The MCP integration does not publish existing npm packages or modify local Studio/Player installations.
