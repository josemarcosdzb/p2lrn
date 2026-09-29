# @p2lrn/player

Embeddable browser runtime for P2LRN packages. The distributed player is generated from the same canonical runtime used by `@p2lrn/toolkit`; it is not a second implementation.

Current versions:

- Web SDK: `0.5.0-alpha.3`
- Node/TypeScript toolkit: `0.5.0-alpha.3`
- P2LRN Core: `0.4.0`

## CDN / plain HTML

```html
<script src="https://cdn.example/@p2lrn/player/0.5.0-alpha.3/dist/p2lrn.js"></script>
<p2lrn-player src="/courses/course.p2lrn"></p2lrn-player>
```

`p2lrn.js` derives the distribution base URL from its own `src`, imports `p2lrn.esm.js`, and exposes `window.P2LRNReady`. Renderers and styles remain lazy-loaded.

For packages hosted on another origin, that origin must allow CORS and expose the response headers required by the verified HTTP Range reader.

## ESM / npm

```js
import '@p2lrn/player';
import {mountP2LRN, createHostAdapter} from '@p2lrn/player';
```

The import registers `<p2lrn-player>` as a side effect.

## HTML contract

The canonical declarative surface is deliberately small:

```html
<p2lrn-player
  src="/courses/course.p2lrn"
  node="urn:uuid:optional-graph-node"
  renderer="https://p2lrn.org/renderer/optional-strict-choice"
  runtime-base-url="https://runtime.example.com/runtime/">
</p2lrn-player>
```

- `src` is required for playback and identifies the `.p2lrn` package URL.
- `node` is optional; when omitted the primary package entrypoint is used.
- `renderer` is optional and is a strict renderer request. When omitted the trusted runtime negotiates a compatible renderer.
- `runtime-base-url` is optional and points SCORM/H5P execution at an isolated trusted runtime host.

The same values are reflected by the runtime API. Host-specific persistence, telemetry and verified virtual-resource delivery use Host Adapter v1. Identity, authorization and enrolment are deliberately outside this HTML contract; a protected host must resolve `src` according to its own deployment contract rather than serialize long-lived credentials into package markup.

Changing `src` reloads and verifies the package. Changing `node`, `renderer` or `runtime-base-url` re-renders the already opened package when possible. `reload()` forces a fresh package load.

Runtime events are DOM `CustomEvent` values using the canonical `p2lrn:*` namespace, including `p2lrn:ready`, `p2lrn:rendered`, activity/progress/state/score/completion events and `p2lrn:error`. Host-specific persistence or telemetry belongs in Host Adapter v1, not in the package.

## Isolated SCORM/H5P runtime host

```js
import {createP2LRNRuntimeHandler} from '@p2lrn/player/server';

app.use(createP2LRNRuntimeHandler({
  basePath: '/runtime',
  allowedParentOrigins: ['https://app.example.com'],
  h5pStandaloneDir: '/srv/p2lrn/h5p-standalone-3.8.2/dist',
  h5pLibrariesDir: '/srv/p2lrn/h5p-libraries',
}));
```

SCORM and H5P execute on an isolated runtime origin. The control channel uses `MessageChannel`; runtime credentials are not placed in the package URL or package contents. H5P sessions are ephemeral and bounded.

Configure the runtime globally:

```js
import {configureRuntimeHost} from '@p2lrn/player';
configureRuntimeHost({baseUrl: 'https://runtime.example.com/runtime/'});
```

or per player with `runtimeBaseUrl`.

The H5P host validates required runtime assets and host-provided H5P libraries before execution. The generic P2LRN package does not claim unconditional H5P conformance when the required host runtime is unavailable.

## Static seek bridge

Normal playback does not require a Service Worker. For verified seekable media on a static host, copy the worker to the application origin:

```bash
p2lrn-copy-sw ./public
```

Then install it explicitly:

```js
await P2LRN.installServiceWorker({url: '/p2lrn-sw.js', scope: '/'});
```

A site that already owns the relevant Service Worker scope should integrate the P2LRN static-resource protocol rather than replace its worker.

## Alpha15 compatibility

The canonical API, package name, namespace, MIME identifiers, runtime events and service-worker routes use **P2LRN**. Compatibility aliases remain for pre-rename Alpha15 integrations: `P2RLN`, `<p2rln-player>`, `p2rln.js`, `p2rln.esm.js`, `p2rln-copy-sw`, historical runtime protocols and `.p2rln` packages. Legacy package bytes are verified before identifiers are normalized in memory.
