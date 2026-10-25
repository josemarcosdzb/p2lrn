# P2LRN connected E2E matrix — 0.5.0-alpha.11

Status: release gate. The executable authority is `scripts/verify-connected-e2e-matrix.mjs`; this document explains what each row proves.

| Row | Required evidence | Acceptance criterion |
| --- | --- | --- |
| Authoring round-trip | Toolkit tests | Studio creates poll, board and peer-review, exports them, reopens the same package and keeps the five-operation capability contract without transport credentials. |
| Production HTTP security | HTTP provider/server tests | Two authenticated host users synchronize one room; forged identity, missing authentication and untrusted origins are rejected. |
| Two-Player browser sync | Windows local-viewer E2E + screenshot | Two real `<p2lrn-player>` instances use `createHttpCollaborationProvider()`; a vote sent by one appears in the other through the HTTP host. |
| Shared-resource dedup | Store tests + browser E2E + screenshot | Equal bytes produce one SHA-256 object; Studio-authored digest reference resolves through Host Adapter and renders in Player. |
| Rich analytics | Toolkit tests | Native attempts emit started/resumed/submitted; answer-change events omit raw answers; media/resource/collaboration interactions keep their semantic event family. |
| Accessibility | Browser E2E | Collaboration has semantic fieldset/legend and live status; digest-resolved image inherits portable resource title as alt text; no horizontal regression in covered layouts. |
| Offline/cache | Browser E2E | Verified package cache survives source removal and playback resolves through the static-resource bridge. |
| External formats | Browser E2E | Current cmi5, H5P, SCORM and QTI regression fixtures continue to render under their existing contracts. |
| Installed npm browser | Windows package gate | Real tarballs install into an empty project and browser smoke runs from installed packages rather than monorepo aliases. |
| Native games visual | Windows visual gate | All twelve native games, including the asynchronous Three.js 3D modes, pass desktop/mobile visual checks. |
| Independent Host | Express E2E | Staged packages run inside a separate Express application with Host authorization/origin controls around Studio routes. |
| Distribution identity | Build/identity/release gates | npm tarball and generated CDN bytes match where required; generated runtime exists; candidate is staged only from the exact current main SHA. |

## Production collaboration boundary

The portable package still declares only `collaboration.room` with:

`join`, `send`, `listen`, `snapshot`, `leave`.

The production browser adapter is `createHttpCollaborationProvider()`. It forwards only portable package/activity identifiers plus operation input. It does not send a package-selected user identity.

The server adapter is `createP2LRNCollaborationHandler()`. Construction requires all of the following:

- an explicit trusted-origin allowlist;
- `authenticate(request)`;
- `resolveContext(...)`, which converts client package identifiers into the Host's trusted course/group scope;
- `authorize(...)`;
- a five-operation service whose persistence can be database, Redis, durable actor, local service or another Host implementation.

There is no open-by-default server mode. A request containing top-level `participantId`, `actorId`, `userId`, `identity` or `principal` is rejected before the service sees it.

The built-in per-process rate limit is a defensive baseline, not a replacement for a distributed/WAF rate limit in a clustered deployment.

## Release interpretation

A green matrix means the connected P2LRN implementation passed the covered source, browser, package and distribution gates on the exact tested commit. It does not mean:

- npm publication has occurred;
- Safari/Firefox certification exists;
- WCAG certification has been granted;
- every external SCORM/H5P/cmi5/QTI package is universally conformant;
- the reference in-memory resource/collaboration stores are production persistence.

For the alpha release, those claims remain deliberately separate from the executable E2E matrix.
