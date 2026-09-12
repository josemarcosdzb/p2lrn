# @p2rln/player

Embeddable browser runtime for P2RLN packages. This package is generated from the same `p2rln_reader/web` runtime used by the reference Reading System; it is not a second player implementation.

## CDN / plain HTML

```html
<script src="https://cdn.example/@p2rln/player/0.4.0-alpha.15/dist/p2rln.js"></script>
<p2rln-player src="/courses/course.p2rln"></p2rln-player>
```

`p2rln.js` is a small classic-script loader. It derives the distribution base URL from its own `src`, dynamically imports `p2rln.esm.js`, and exposes `window.P2RLNReady`. Renderers and their styles remain lazy-loaded from the same distribution tree.

For a package hosted on another origin, that origin must allow CORS and expose the response headers required by the P2RLN Range reader.

## ESM / npm

```js
import '@p2rln/player';
```

or:

```js
import {mountP2RLN, createHostAdapter} from '@p2rln/player';
```

The import registers `<p2rln-player>` as a side effect.

## Isolated SCORM runtime host

The npm package also exposes the trusted runtime-host server side:

```js
import {createP2RLNRuntimeHandler} from '@p2rln/player/server';

app.use(createP2RLNRuntimeHandler({
  basePath: '/runtime',
  allowedParentOrigins: ['https://app.example.com'],
}));
```

The route prefix can be `/runtime` or another normal path. For SCORM `parent.API` / `parent.API_1484_11` compatibility, the resulting runtime URL must be exposed on an origin different from the application, for example `https://runtime.example.com/runtime/`. P2RLN rejects a same-origin runtime URL instead of weakening the application-origin boundary.

Configure it globally:

```js
import {configureRuntimeHost} from '@p2rln/player';
configureRuntimeHost({baseUrl: 'https://runtime.example.com/runtime/'});
```

or per player with `runtimeBaseUrl`. The browser/runtime control channel uses a transferred `MessageChannel`; no runtime token is placed in the URL or in the `.p2rln` package.

### H5P runtime candidate

The same isolated runtime host now has an H5P path. H5P core is installed once by the host rather than copied into every `.p2rln`:

```js
app.use(createP2RLNRuntimeHandler({
  basePath: '/runtime',
  allowedParentOrigins: ['https://app.example.com'],
  h5pStandaloneDir: '/srv/p2rln/h5p-standalone-3.8.2/dist',
  h5pLibrariesDir: '/srv/p2rln/h5p-libraries',
  maxH5pSessionBytesTotal: 1024 * 1024 * 1024,
}));
```

The implementation target is `h5p-standalone` 3.8.2. The host refuses H5P startup when `main.bundle.js`, `frame.bundle.js` or `styles/h5p.css` is absent. Bundled and host-provided H5P libraries are resolved by exact `machineName + majorVersion + minorVersion`; missing or conflicting versions fail explicitly. H5P sessions are ephemeral, bounded and never persisted into the course package.

H5P state is returned through the Host Adapter and H5P xAPI is forwarded as non-authoritative content-runtime input. A receiving LMS must reconstruct actor/authority/registration server-side before writing to an LRS. The H5P CSP has no arbitrary external network access by default.

This source candidate does **not** advertise unconditional H5P `deliver`: the upstream H5P Standalone bytes are host-provided and the real-browser 3.8.2 gate still has to pass. See `spec/H5P-WEB-RUNTIME.md`.

## Static seek bridge

Normal playback does not require a Service Worker. For verified seekable media on a plain static host, copy the worker onto the application's own origin:

```bash
p2rln-copy-sw ./public
```

and install it explicitly:

```js
await P2RLN.installServiceWorker({url: '/p2rln-sw.js', scope: '/'});
```

A site that already owns the relevant Service Worker scope should integrate the P2RLN protocol instead of replacing its worker.

## Versioning

Web SDK version: `0.4.0-alpha.15`.
Toolkit/Reader version: `0.4.0a15`.
P2RLN Core remains `0.4.0`.

Loading a different P2RLN runtime version into the same page fails explicitly with `P2RLN_VERSION_CONFLICT` instead of silently keeping whichever copy loaded first.

Host-provided H5P libraries are validated beyond `library.json`: every recursively required file declared in `preloadedJs` and `preloadedCss` must exist physically under the configured library root. Incomplete library folders are rejected during session creation with `P2RLN_H5P_LIBRARY_ASSETS_MISSING` rather than failing later in the browser.
