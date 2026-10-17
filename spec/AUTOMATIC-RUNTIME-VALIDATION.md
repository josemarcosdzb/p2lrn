# Automatic executable-content runtime: implementation and evidence

Date: 2026-10-17. Base inspected: `02a8ff19e5a605cdf834ae66fb97588926fe9abf`.

The default browser path now creates opaque `srcdoc` sandboxes owned by Player for embedded SCORM, H5P and compatible local HTML package launches. It does not select a shared CDN runtime origin implicitly. An integrator can still explicitly select an isolated static/server runtime for content requiring its capabilities.

## Architecture

The verified outer package remains the source of its nested content. Player reads bounded nested payloads, creates a sandbox with only `allow-scripts`, rewrites supported local assets to ephemeral blob URLs and transfers the buffers over a MessageChannel. The initial handshake checks both `event.source` and `event.origin`; opaque frames have origin `null`, so only the initial port transfer uses target `*`. All later commands and activity-state messages use the private port. Unrelated frames and forged global window messages are not state/grade channels.

SCORM's opaque shell and H5P/package runtime implementations keep control ports in private closures. Native port send functions are bound before content executes. Imported scripts can call their own SCORM API or H5P dispatcher, but cannot obtain the platform adapter or private transport. Activity-origin scores remain client assertions; the platform must verify any authoritative result.

H5P's browser shell is part of the module dependency graph, rather than an ambient same-origin script fetch. The pinned H5P core and required library files are fetched by Player without credentials and transferred to the sandbox. Missing libraries generate an explicit error. A package can bundle reusable libraries or use the colocated, versioned library corpus distributed by `@p2lrn/h5p-libraries`. No dependency is silently invented or downloaded into an LMS account.

A rehydration test exposed a separate H5P defect: the old static integration supplied a standalone-style contentUserData array while the pinned core expects a map by sub-content ID and only forwards state when its own persistence is enabled. The browser adapter now supplies the map and forwards preloaded state through constructor extras while keeping core remote persistence disabled. Host Adapter remains the durable state boundary.

cmi5's local preview adapter uses synthetic identity, a synthetic launch endpoint, preview statements and activity-scoped state. Its State API loads/saves a bounded 2 MiB snapshot via Host Adapter using `runtime:'cmi5'`; it does not forward platform credentials. These events and scores are explicitly non-authoritative. This is not a production cmi5 LMS/LRS.

## Executed coverage

Local browser: Chromium 149.0.7827.0, Linux, Node 24.19.0. Windows runner execution is a separate CI gate and must be read from its actual result.

| Fixture / case | Evidence | Limits |
| --- | --- | --- |
| `examples/canonical/external/scorm12-real.p2lrn` | The unchanged repository SCORM 1.2 interactive demo launches, initializes its API, completes through its button and reports 100/100 | A working demo package, not evidence for every third-party SCORM package |
| `examples/canonical/external/h5p-crossword.p2lrn` | The unchanged real H5P Crossword content loads with its external library closure; Check emits the actual `answered` xAPI event | Empty-answer Check does not establish resumed state for this particular content |
| Synthetic SCORM 1.2 and 2004 | Initial bookmark is read through the respective API; a new bookmark is committed to Host Adapter | No full 2004 sequencing/conformance claim |
| Synthetic H5P activity using the actual pinned H5P core | Previous bookmark reaches constructor extras; xAPI triggers a changed state save | Tests the integration contract separately from Crossword |
| Synthetic local HTML package | Classic script/CSS assets launch; a local anchor changes the active member; runtime teardown removes its frame | No blanket support for dynamic module graphs, fetch URLs or framesets |
| Synthetic cmi5 preview | Previously saved state is read, changed state is saved and completion is emitted as non-authoritative | The real CATAPULT package has not been revalidated by this local gate; no production cmi5 conformance claim |
| Missing H5P library | Explicit resource-resolution failure | No fabricated successful launch |
| Hostile scripts in SCORM 1.2/2004, H5P, HTML and cmi5 | Parent DOM, host cookies, host local/session storage, private channel, host global identity, top navigation and popup access denied; fetch/image exfiltration attempts never reach the test HTTP server; forged global state messages do not persist | Not a claim of a universal network firewall or CPU/process isolation |

The focused Node suite covers 24 host/protocol/library/security checks. The additional distribution URL-contract test passes. `scripts/verify-automatic-runtimes.mjs` runs eight browser cases against the freshly built Player, including real package interactions and five hostile-content formats. Expected CSP violations in that gate are evidence of blocked attacks, not playback exceptions.

## Reproduce

```bash
node packages/player/scripts/build-dist.mjs
node packages/h5p-libraries/scripts/build.mjs
node --test packages/toolkit/test/automatic-runtime-boundaries.test.mjs packages/toolkit/test/h5p-auto-runtime.test.mjs packages/toolkit/test/security-boundaries.test.mjs packages/toolkit/test/package-host-regression.test.mjs packages/player/test/runtime-security.test.mjs
node --test --test-name-pattern="automatic runtime default is URL-resolved" packages/player/test/distribution.test.mjs
node scripts/verify-automatic-runtimes.mjs
```

The browser gate uses the existing Node/CDP Chrome driver. `CHROME_BIN` or `CHROMIUM_BIN` can locate Chrome; normal Windows Chrome installation paths are also detected. It adds no production browser-automation dependency. The canonical Windows workflow has a dedicated PR job for this gate.

## Restrictions retained explicitly

- Blob/srcdoc delivery does not provide stable HTTP paths for arbitrary dynamically constructed URLs, module import graphs, XHR/fetch loaders or parent-only API discovery in nested frames. Such packages may need an explicitly managed runtime origin or further format-specific adapters.
- Browser CSP inherited from the embedding page can block inline/bootstrap code or blob assets. Player does not relax the host's response headers or bypass browser policy.
- Audio/video autoplay, fullscreen, fonts, third-party services and cross-origin resources remain subject to browser policy, codecs, CORS and resource availability.
- PHP/JSP/ASP and plugins such as Flash do not execute in a browser sandbox. Packaging them preserves bytes, not a server or plugin runtime.
- The sandbox blocks host storage/DOM access and top navigation. Self-navigation and some browser-managed network behavior cannot all be governed by CSP; host APIs retain their normal authorization and CSRF responsibilities.
- Removing or navigating away from a page cannot guarantee asynchronous durable writes. Host Adapter writes must be awaited where the application controls completion; this change does not claim transactional unload persistence.
- Firefox/Safari, complete SCORM 2004 sequencing, real CATAPULT course completion and arbitrary third-party packages are not certified by these tests.
