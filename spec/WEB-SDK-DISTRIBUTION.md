> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Web SDK distribution

Status: experimental in Web SDK `0.4.0-alpha.15` / Toolkit and Reading System `0.4.0a15`. P2LRN Core remains `0.4.0`.

## Goal

A normal web host should need one trusted library load and one custom element:

```html
<script src="https://cdn.example/@p2lrn/player/0.4.0-alpha.15/dist/p2lrn.js"></script>
<p2lrn-player src="/courses/course.p2lrn"></p2lrn-player>
```

The CDN URL above is a distribution pattern, not a claim that that example hostname/package has already been published. Once an npm release exists, the same package tree can be served by an npm-backed CDN or self-hosted unchanged.

The package content remains thin. Player code, renderer modules, CSS, component implementations and Service Worker code stay in the host-installed Web SDK, not inside each `.p2lrn`.

## One runtime authority

`packages/toolkit/web` is the source runtime used by the Node.js/TypeScript Reading System. `p2lrn-build-web-sdk` copies the embeddable JS/CSS closure without rebundling or rewriting those runtime files.

The build deliberately excludes Reader-application UI files:

- `app.js`
- `index.html`
- `style.css`

It adds only distribution entrypoints/metadata:

- `p2lrn.js`: classic-script CDN loader;
- `p2lrn.esm.js`: ESM/npm public entrypoint;
- `release.json`: hashes, SRI strings and release versions;
- `runtime-host/scorm.html` + `runtime-host/scorm-host.js`: the trusted isolated SCORM parent-frame shell.

Dynamic renderer imports and `import.meta.url` stylesheet resolution are preserved. There is no second CDN renderer implementation.

## Classic-script CDN loader

`dist/p2lrn.js` contains no P2LRN renderer/runtime implementation. It obtains its own URL from `document.currentScript.src`, resolves `p2lrn.esm.js` beside it, imports that module and exposes the resulting API through `globalThis.P2LRN` and `globalThis.P2LRNReady`.

Loading the same classic loader more than once reuses its existing promise. Loading a different P2LRN Web SDK runtime on the same page fails explicitly with `P2LRN_VERSION_CONFLICT` rather than silently keeping whichever copy loaded first.

## ESM/npm

The generated npm package uses the same `dist/` tree:

```js
import '@p2lrn/player';
```

registers the element as a side effect. Named imports expose host APIs without requiring the global object:

```js
import {
  mountP2LRN,
  createHostAdapter,
  registerRenderer,
  registerComponent,
  configureRuntimeHost
} from '@p2lrn/player';
```

The current Node.js/TypeScript package line uses npm SemVer `0.5.0-alpha.1`; Alpha15 Python versioning is historical reference metadata only.

## Public browser API

`globalThis.P2LRN` exposes:

- `version`, `toolkitVersion`, `coreVersion`;
- `mount`, `PlayerElement`;
- `openPackageBytes`, `openPackageURL`;
- renderer/component/dependency registration and inspection;
- `setPermissionPolicy`;
- `createHostAdapter`;
- `configureRuntimeHost`, `getRuntimeHostConfig`;
- `installServiceWorker`.

`<p2lrn-player>` automatically chooses a compatible renderer when `renderer` is absent. The `renderer` attribute is an explicit strict request; there is no synthetic `renderer="auto"` value.

Runtime events retain their existing names, including `p2lrn:complete`.

## Server/runtime-host export

The npm package exposes `@p2lrn/player/server`. `createP2LRNRuntimeHandler({basePath: '/runtime'})` serves the trusted SCORM shell below a configurable path, and `startP2LRNRuntimeHost(...)` can start a dedicated Node HTTP origin for local or standalone deployments.

The path is not itself the security boundary. Canonical SCORM parent-frame discovery requires the runtime handler to be reachable through a different browser origin from the embedding application. The browser API rejects a same-origin `runtimeBaseUrl` with `P2LRN_SCORM_RUNTIME_ORIGIN_NOT_ISOLATED`.

The isolated host does not persist learner state and does not receive LMS credentials. Verified package files are transferred into the runtime for the launch; state and score return through Host Adapter v1 over a private `MessageChannel`.

## CSS and lazy modules

The Web Component creates stylesheet links inside its shadow root. The player stylesheet uses `new URL('./p2lrn-player.css', import.meta.url)`, and renderer-specific styles use the same relative-module rule. Therefore a versioned CDN/self-hosted tree can move as a whole without hard-coded absolute runtime asset URLs.

Questionnaire/game/component renderers keep their existing `import()` calls. A host downloading the entrypoint does not eagerly fetch every renderer.

## Cross-origin packages

The Web SDK itself may be served from a CDN while `.p2lrn` packages are served from another origin. The package origin must allow the browser to fetch it and must expose the headers required by the Range/ZIP64 reader when Range delivery is used. This distribution layer does not weaken the existing package-origin or integrity checks.

## Service Worker

Normal `<p2lrn-player>` playback does not require a Service Worker. The Alpha10 static seek bridge remains optional.

A Service Worker that controls a page must come from a permitted same-origin URL/scope. For npm installs, `p2lrn-copy-sw <public-dir>` copies the exact distributed `p2lrn-sw.js` to a host directory. For CDN-only use, the site must host that worker file on its own origin before calling `P2LRN.installServiceWorker(...)`.

The SDK never installs a worker automatically merely because the CDN loader was included.

## Distribution integrity

`dist/release.json` records SHA-256 and SHA-384 SRI strings for every distributed runtime file except the manifest itself. It is build metadata; it does not become P2LRN package identity and does not alter Core `contentRoot`.

The package is intentionally marked `UNLICENSED` until the project owner selects a publication license. No license has been invented as part of the Web SDK work.

## Release gate

A Web SDK release must prove at least:

1. generated runtime files are byte-identical to `packages/toolkit/web` except distribution-only entrypoints;
2. Reader-only UI files do not leak into npm/CDN output;
3. every local import/stylesheet URL resolves inside `dist/`;
4. build output is reproducible;
5. classic loader and ESM entrypoint both load;
6. version conflicts are explicit;
7. `npm pack` contains only public SDK files;
8. the packed tarball installs without network dependencies and imports by package name;
9. TypeScript declarations compile for custom-element/global/module use;
10. all inherited P2LRN tests and historical-package gates still pass;
11. the npm server export serves the runtime beneath a configurable path with restrictive headers;
12. isolated SCORM browser evidence proves parent/opener API discovery without application-document access.
