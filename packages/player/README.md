# @p2lrn/player

Embeddable browser runtime for P2LRN packages. The distributed player is generated from the same canonical runtime used by `@p2lrn/toolkit`; it is not a second implementation.

Current versions:

- Web SDK: `0.5.0-alpha.12`
- Node/TypeScript toolkit: `0.5.0-alpha.12`
- P2LRN Core: `0.4.0`

## CDN / plain HTML

```html
<script src="https://p2lrn.netlify.app/player/current/dist/p2lrn.js"></script>
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
  renderer="https://p2lrn.org/renderer/optional-strict-choice">
</p2lrn-player>
```

- `src` is required for playback and identifies the `.p2lrn` package URL.
- `node` is optional; when omitted the primary package entrypoint is used.
- `renderer` is optional and is a strict renderer request. When omitted the trusted runtime negotiates a compatible renderer.
- `runtime-base-url` is an optional override for a separately managed runtime service. SCORM and H5P do not require it for normal playback: the default is a Player-managed opaque sandbox, regardless of whether Player assets use a CDN. Local HTML launches in cmi5, Tin Can, Common Cartridge and IMS Content Packages also use this sandbox. This does not provide an external LMS, LRS or server-side execution.

The same values are reflected by the runtime API. Host-specific persistence, telemetry and verified virtual-resource delivery use Host Adapter v1. Identity, authorization and enrolment are deliberately outside this HTML contract; a protected host must resolve `src` according to its own deployment contract rather than serialize long-lived credentials into package markup.

Changing `src` reloads and verifies the package. Changing `node`, `renderer` or `runtime-base-url` re-renders the already opened package when possible. `reload()` forces a fresh package load.

Runtime events are DOM `CustomEvent` values using the canonical `p2lrn:*` namespace, including `p2lrn:ready`, `p2lrn:rendered`, activity/progress/state/score/completion events and `p2lrn:error`. Host-specific persistence or telemetry belongs in Host Adapter v1, not in the package.

## Optional host capabilities and offline state

P2LRN keeps Host Adapter v1 unchanged. Additional connected services use a separate trusted capability broker, so a package can request semantic operations without learning provider credentials or private endpoints:

```js
const broker = P2LRN.createCapabilityBroker({
  authorize: ({capabilityId, operation}) => capabilityId === 'ai.tutor' && operation === 'hint',
  providers: [{
    id: 'ai.tutor',
    operations: ['hint'],
    invoke: (operation, input, context) => myProvider(operation, input, context)
  }]
});
player.capabilityBroker = broker;
```

The provider may internally use MCP, a local model, a remote service or a non-AI implementation. The `.p2lrn` package never contains MCP/API credentials.

For production collaboration, keep authentication and persistence in the Host. The browser-side provider maps the portable five-operation contract to an application endpoint:

```js
const collaboration = P2LRN.createHttpCollaborationProvider({
  endpoint: '/api/p2lrn/collaboration',
  getHeaders: () => ({Authorization: 'Bearer ' + hostToken})
});

player.capabilityBroker = P2LRN.createCapabilityBroker({
  providers: [collaboration],
  authorize: ({capabilityId}) => capabilityId === 'collaboration.room'
});
```

The server-side `@p2lrn/player/server` export provides `createP2LRNCollaborationHandler()`. It requires explicit origin allowlisting, authentication, trusted context resolution, authorization and a five-operation service. The package never supplies the learner identity or database/transport credentials.

For offline resume/event buffering, wrap the existing Host Adapter rather than changing it:

```js
const offline = P2LRN.createOfflineHostAdapter({
  remote: myHostAdapter,
  storageNamespace: opaqueLearnerPartition
});
player.adapter = offline;
// The application decides when to synchronize; no background scheduler is created.
await offline.sync();
```

Activity/idle telemetry is opt-in: `player.startActivityTracking()`. It reports coarse active/hidden/focused/idle state and never captures typed key values.

See `spec/CONNECTED-ARCHITECTURE.md`, `spec/HOST-CAPABILITIES.md`, `spec/OFFLINE-SYNC.md` and `spec/SHARED-RESOURCES.md` in the source repository for the experimental contracts and portability boundary.
## Automatic executable-content isolation

The browser/npm distribution includes the SCORM/H5P runtime assets and the pinned `h5p-standalone` core. When SCORM or H5P is embedded inside the `.p2lrn` package, the Player keeps the original content inside the package, prepares the required files in memory and executes them in an ephemeral sandbox.

By default SCORM, H5P and local HTML package launches use an opaque iframe sandbox with only `allow-scripts`. No extra runtime domain is required for this normal path. A single handshake checks the source window and opaque origin, then transfers a private MessagePort. Runtime ports live in closures and are never exposed to imported scripts. Global window messages cannot save platform state or submit grades.

H5P packages that omit reusable libraries can resolve them from the colocated shared-library corpus. Install and copy that corpus when those packages must be supported:

```bash
npm install @p2lrn/player @p2lrn/h5p-libraries
p2lrn-copy-runtime ./public/p2lrn
```

The copy command places the H5P library corpus under `runtime-host/h5p-libraries/`. The catalog includes the file manifest needed by the Player to fetch the required dependencies in the application context and transfer them into the opaque sandbox.

The public P2LRN CDN is built from these same distribution builders. It does not store user/course packages; it serves the generic Player/runtime and reusable shared H5P libraries.

### Capability boundaries and evidence

- SCORM 1.2: the repository interactive package completes with score 100/100 in Chromium. A synthetic SCORM 2004 activity verifies its API and state writes; this is not SCORM 2004 conformance certification. Parent-only API discovery, framesets and URL-dependent scripts can require an explicitly managed runtime origin.
- H5P: the real Crossword package loads its external library closure and emits xAPI on Check. A separate synthetic activity verifies isolation and state persistence. The pinned core ships with Player; missing reusable libraries need the colocated `@p2lrn/h5p-libraries` corpus or a package that bundles them. Missing resources fail explicitly.
- HTML packages: scripts, rewritten CSS/media and local anchor navigation are portable. Dynamic URL loading, ES module dependency graphs and nested same-origin frames are not generally emulated by blob/srcdoc delivery.
- cmi5: the portable adapter offers synthetic launch data, in-memory State API behavior and preview statements. Preview state can be loaded/saved through Host Adapter with `runtime:'cmi5'`. It is not a production LMS/LRS or proof of complete cmi5 conformance. Statements and scores are non-authoritative.
- PHP/JSP/ASP, Flash/plugins and external authenticated services do not become executable merely by packaging them. The browser cannot supply those servers or plugins.

Platform identity is not forwarded to the automatic SCORM API. Cookies, local/session storage, credentials, authorization and adapters remain outside the activity. H5P's storage shim is ephemeral. Durable activity state uses the host's activity-scoped adapter. The application must authorize those writes and verify grades server-side when authoritative results are needed.

The opaque sandbox denies forms, popups, top navigation, downloads and access to host storage. CSP blocks remote fetch/image/script loads in the portable path. Browser sandboxing is not a universal network firewall: self-navigation and browser-managed requests are not all covered by CSP. Host APIs still need their normal authentication, authorization and CSRF protections. The host CSP must permit the Player-created `srcdoc`/blob runtime; a stricter inherited policy can prevent execution. Browser-only code cannot provision a DNS origin or bypass browser policy.

Reproduce the checks with `node scripts/verify-automatic-runtimes.mjs` after building Player and the H5P corpus. See [`spec/AUTOMATIC-RUNTIME-VALIDATION.md`](../../spec/AUTOMATIC-RUNTIME-VALIDATION.md) for exact fixture coverage and limits.

## Optional Node runtime host

```js
import {createP2LRNRuntimeHandler} from '@p2lrn/player/server';

app.use(createP2LRNRuntimeHandler({
  basePath: '/runtime',
  allowedParentOrigins: ['https://app.example.com'],
  h5pStandaloneDir: '/srv/p2lrn/h5p-standalone-3.8.2/dist',
  h5pLibrariesDir: '/srv/p2lrn/h5p-libraries',
}));
```

The Node host is optional. Use it when server-created H5P sessions, server-managed shared libraries or a controlled runtime service are preferred. Static browser delivery does not require Node. Automatic browser playback isolates SCORM/H5P in an opaque sandbox; the Node host provides an explicit separately managed runtime origin. Both modes use a message-based control channel.

Configure the runtime globally:

```js
import {configureRuntimeHost} from '@p2lrn/player';
configureRuntimeHost({baseUrl: 'https://runtime.example.com/runtime/'});
```

or per player with `runtimeBaseUrl`.

The H5P host validates required runtime assets and libraries before execution. Static CDN/npm delivery resolves shared libraries from the colocated `h5p-libraries/` corpus; the optional Node host can instead use its configured library directory.

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

## License

This first-party package is distributed under **P2LRN Non-Commercial Source License 1.0 (P2LRN-NCSL 1.0)**.

Commercial use is not granted. See [LICENSE](./LICENSE) for the complete terms and [NOTICE.md](./NOTICE.md) for scope and third-party exceptions.



### Verified offline package cache

Persistent course bytes are opt-in and separate from learner state. Use P2LRN.createCacheStoragePackageCache(), P2LRN.cachePackageURL() and player.packageCache/player.loadCachedPackage(contentRoot). Packages are verified before storage and again when reopened; see spec/PACKAGE-CACHE.md.

## Resultados comunes de Player (.p2lrn-result)

Los modos web e integrados pueden registrar los eventos y puntuaciones del curso en el mismo formato de resultados que las entregas offline. La identidad se configura **antes de realizar las actividades** y el archivo se descarga o conserva explícitamente, nunca se sube automáticamente.

```js
import {mountP2LRN} from '@p2lrn/player';

const player = await mountP2LRN('#player', {
  src: '/cursos/curso.p2lrn',
  resultIdentity: {
    mode: 'code',
    issuer: 'mi-centro',
    code: codigoAsignadoPorProfesor,
    label: nombreAlumno
  }
});

document.getElementById('descargar').addEventListener('click', () =>
  player.resultRecorder.download('alumno.p2lrn-result')
);
```

Cuando existe una plataforma que **ya ha autenticado al usuario**, sustituye `resultIdentity` por `{mode:'platform',issuer:sesion.issuer,subjectId:sesion.userId,label:sesion.nombre}`. Los datos deben proceder del host de confianza, no de parámetros editables en la URL.

También puedes llamar a `createResultRecorder(player,{identity})` o `player.startResultCapture({identity})` con el componente montado. `finish()` entrega el resultado estructurado y `download()` crea el archivo `.p2lrn-result` en el navegador. La operación mantiene `packageId`, identidad, intento, eventos, puntuaciones informativas y SHA-256. No convierte puntuaciones locales en notas oficiales.

`@p2lrn/analytics` puede leer directamente estos archivos desde su atributo `src`, o importar varios resultados. No requiere base de datos. **Importante:** el archivo no llega al profesor automáticamente: en web hay que guardar y entregar los ficheros o proporcionar acceso autorizado a sus rutas. El SHA-256 no prueba la identidad real del alumno.
