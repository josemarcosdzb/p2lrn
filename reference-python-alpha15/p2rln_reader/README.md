# P2RLN Reading System 0.4.0a15

This is the first-party reference reader for the `.p2rln` extension.

It is deliberately separate from AulaP2P. A `.p2rln` can be opened and inspected without installing or connecting to an LMS.

## What the reader owns

- safe package opening and P2RLN validation;
- graph indexing and navigation;
- language-aware titles and course tree;
- capability negotiation;
- native delivery of passive P2RLN web/media resources;
- safe nested-member resolution;
- read/import plans for specialized profiles;
- preservation/source recovery information;
- no network access merely because a package was opened.

## What stays in runtime plugins

SCORM, cmi5, H5P, QTI and LTI execution semantics are not faked by the generic reader. The reader delegates them to profile runtimes and only advertises a general `deliver` capability after the corresponding conformance boundary is met.

Alpha 14 keeps the bounded SCORM 1.2/2004 browser runtime and Alpha 13 isolated runtime-host topology, then recovers the existing AulaP2P `todo-funciona` SCORM 2004 XML/manifest/linear navigation base. `adl.nav.request_valid.*` is exposed read-only and pending navigation is processed after `Terminate()`. Parsed condition/rollup rules are preserved but not yet executed as a complete S&N engine, so blanket SCORM delivery conformance remains outside the claim. See `spec/SCORM-WEB-RUNTIME.md`.

The H5P runtime candidate preserves that same rule: the reader can validate/read/preserve an H5P profile, but playback is delegated to an isolated host runtime. The candidate adds exact library-version resolution, bounded ephemeral sessions, H5P state resume and non-authoritative xAPI forwarding without claiming general H5P `deliver` until the real-browser runtime gate passes. See `spec/H5P-WEB-RUNTIME.md`.

## Run

```bash
python3 -m p2rln_reader examples/web-course.p2rln
```

Headless:

```bash
python3 -m p2rln_reader examples/web-course.p2rln --no-browser
```

Inspect only:

```bash
python3 -m p2rln_reader examples/external/scorm12-real.p2rln --summary --tree --read-plan
```

The UI binds only to loopback, uses an unguessable session token and does not fetch remote resources automatically.

## Native questionnaire runtime and browser embedding

The Reading System now validates and directly renders `https://p2rln.org/profile/native-questionnaire`. Its runtime is DOM-based and exposes host hooks for state/score integration without persisting learner state inside the package.
Timed native questionnaires are delivered by the shared state/session engine in 0.4.0a7. Total-attempt deadlines survive reloads and renderer changes; the standard renderer also enforces per-question deadlines. Game renderers accept total-attempt timing but deliberately fall back for per-question timing rather than reinterpret it.

The same runtime is reused by the embeddable Web Component:

```html
<script type="module" src="/p2rln-player.js"></script>
<p2rln-player src="/content/course.p2rln"></p2rln-player>
```

Events include `p2rln:ready`, `p2rln:activityready`, `p2rln:answer`, `p2rln:progress`, `p2rln:statechange`, `p2rln:score`, `p2rln:complete` and `p2rln:error`. The host can provide `loadState`, `saveState`, `reportScore` and ordered `emitEvent` callbacks through Host Adapter v1. Every DOM event also carries a versioned `runtime-event/1` envelope in `detail.event`.

The browser player now supports HTTP byte-range opening and ZIP64. In Range mode it validates the central-directory inventory, manifest, graph and `contentRoot` before navigation, then authenticates each unread payload only when a renderer opens it. Small servers that ignore Range retain a bounded full-buffer fallback. Passive HTML still receives no script privileges.

The local Reader `/package.p2rln` endpoint serves `206 Partial Content`, `Content-Range`, `ETag`/`If-Range` and `416` so the same `<p2rln-player>` path is exercised locally.

In 0.4.0a9 Host Adapter v1 also has an optional `resolveResourceUrl` callback. The first-party Reader implements it with `/virtual/outer/...` and `/virtual/web/...`: validated `ZIP_STORED` audio/video can be byte-seeked directly inside the package, while passive web-content bundles receive a mapped base URL for relative CSS/images/fonts/media. Returned virtual URLs must be explicitly host-verified; otherwise the player rejects them. Hosts without this bridge retain the authenticated Blob fallback for ordinary media. See `spec/HTTP-RANGE-ZIP64.md` and `spec/VIRTUAL-RESOURCES.md`.


## Native composite runtime

`https://p2rln.org/profile/native-composite` is delivered by the same modular player. A composite resolves its children from graph `Activity.children`, recursively invokes the installed Renderer Registry, and stores only external composite progress state. Sequence mode refuses restored gaps or out-of-order completion events, so a host state blob cannot unlock a later child without the preceding portable children being complete. See `spec/NATIVE-COMPOSITE.md` and `spec/RUNTIME-EVENTS.md`.


## Native component runtime

`https://p2rln.org/profile/native-component` is routed through a host-side Component Registry. The package carries only the declarative instance; exact component/version/runtime-contract negotiation and deterministic data migration happen in trusted host code. Component implementation renderers are non-selectable by package/HTML renderer hints. The Reader advertises installed implementations in `component-capabilities.json` rather than widening the Core capability schema.



## Web SDK distribution (0.4.0a15)

`tools/build_web_sdk.py` publishes the embeddable subset of this exact runtime as `web_sdk/dist/`; it does not maintain a second player. `dist/p2rln.js` is a classic-script loader for CDN/plain HTML, while `dist/p2rln.esm.js` is the npm/ESM entrypoint. Reader UI files are excluded, lazy renderer imports and relative CSS URLs are preserved, and runtime version conflicts fail explicitly. See `spec/WEB-SDK-DISTRIBUTION.md`.

## Static browser bridge (0.4.0a10)

If the page is controlled by the standalone `p2rln-sw.js`, the Web Component automatically uses it when no host `resolveResourceUrl` callback is present. Install it explicitly with `P2RLN.installServiceWorker({url: "/p2rln-sw.js", scope: "/"})`. The installer refuses to evict a different Service Worker. Chunk-protected stored media is served with verified HTTP ranges; mapped small web assets are fully verified. See `spec/STATIC-BROWSER-BRIDGE.md`.
