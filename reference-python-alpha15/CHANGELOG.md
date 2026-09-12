# Changelog

## Unreleased - H5P web runtime integration candidate

- Added a first-party H5P browser/runtime-host path without translating H5P content into a proprietary P2RLN activity model; the original `.h5p` remains authoritative and is preserved bit-for-bit.
- Added strict inspection of `h5p.json`, `content/content.json` and exact H5P library identities (`machineName + majorVersion + minorVersion`), including `bundled` / `external` / `mixed` dependency-mode reconciliation.
- Added an isolated-origin H5P runtime shell using a transferred `MessageChannel`, bounded binary runtime sessions, aggregate memory/session caps, symlink-safe host resource resolution and closed-by-default CSP/network policy.
- Added host-library resolution with exact-version matching and explicit missing/version-conflict failures instead of silently substituting a different H5P library.
- Added learner-state resume/persistence through Host Adapter v1 and bounded, non-authoritative H5P xAPI forwarding; platform actor/authority/registration remain server-owned.
- Generated Web SDK runtime files from the same `p2rln_reader/web` source; no second H5P/P2RLN player fork was created.
- Real supplied H5P corpus: Boardgame is accepted as fully bundled; Crossword 0.5 and BranchingScenario 1.8 are correctly classified as external and fail closed until the host supplies those exact libraries.
- H5P remains advertised only as `validate` / `read` / `preserve`. General `deliver` is deliberately withheld until pinned real H5P Standalone browser execution and broader content-type/security gates are complete.
- The H5P work is now reconciled onto the reconstructed Alpha 15 sequencing behavior. It remains an H5P integration candidate and is not relabeled as Alpha 16.

## Unreleased - SCORM 2004 hierarchical sequencing alpha 15

- Extended the recovered Alpha 14 SCORM 2004 sequencer into a bounded hierarchical activity-tree engine without replacing the preserved SCORM manifest as authority.
- Added per-activity attempt state with active/suspended flags, previous-attempt progress snapshots and Host Adapter persistence alongside the existing CMI state.
- Execute supported pre-condition (`skip`, `disabled`, `hiddenFromChoice`), post-condition (`continue`, `previous`, `retry`, `retryAll`, `exitParent`, `exitAll`) and ancestor exit-condition (`exit`) rules using tri-state condition evaluation.
- Added direct-child rollup rule execution for `all`, `any`, `none`, `atLeastCount` and `atLeastPercent`, with completion/satisfaction actions and exact minimum thresholds.
- `exitParent` now closes the intended aggregation subtree and continues outside that cluster without terminating the virtual organization/course root.
- `suspendAll` now suspends the active path and serializes the suspended activity; restoring that state resumes the same attempts instead of incrementing attempt counts.
- `useCurrentAttemptProgressInfo=false` now permits previous-attempt progress to contribute to parent rollup when the current child attempt has no valid progress information; the default/true mode remains current-attempt-only.
- SCORM 2004 `Terminate()` now reports `_none` to the sequencer as well as explicit navigation requests so manifest post-condition rules can run after normal SCO termination.
- The first-party Reader remains the runtime source; the Web SDK is regenerated from `p2rln_reader/web` and is not a fork.
- Focused Alpha 15 SCORM gate: 29/29; joint SCORM + Web SDK distribution gate: 42/42. P2RLN Core remains 0.4.0 and blanket SCORM certification/`deliver` conformance is still not claimed.

## Unreleased - recovered SCORM 2004 navigation base alpha 14

- Reconciled the SCORM 2004 manifest/sequencing path against AulaP2P `todo-funciona` commit `9f90e1f54d2add5e19c95bbbc510193fe627abff` instead of creating another independent parser/resolver.
- Added framework-neutral ports of the existing XML-lite parser and SCORM manifest parser, preserving organization/resource links, `isvisible`, navigation presentation metadata, `controlMode`, `deliveryControls`, pre/post/exit rules and rollup-rule attributes.
- Added the recovered linear `continue` / `previous` / targeted `choice` resolver to the P2RLN SCORM runtime, plus targeted `jump` request parsing for the 4th Edition runtime surface.
- Added read-only `adl.nav.request_valid.*` values and widened `adl.nav.request` validation to targeted choice/jump requests.
- Corrected runtime timing so a pending SCORM 2004 navigation request is dispatched only after successful `Terminate()`.
- Wired resolved target SCO launches through both the isolated runtime host and the opaque-sandbox fallback; the isolated host keeps a stable non-configurable parent API facade while its underlying per-launch Runtime API instance changes.
- Kept Host Adapter v1 as the only state/score persistence boundary and kept P2RLN Core 0.4.0 / `.p2rln` bytes unchanged.
- Added focused regressions for the recovered parser/resolver, request-valid behavior, Terminate-triggered navigation and both runtime topologies.
- The parsed sequencing rules and rollup metadata are not yet executed as a complete SCORM 2004 S&N algorithm, so blanket SCORM `deliver` conformance remains deliberately unadvertised.

## Unreleased - isolated SCORM runtime-host alpha 13

- Added the first-party `@p2rln/player/server` runtime-host export with a configurable route prefix such as `/runtime`.
- Added different-origin validation for `runtimeBaseUrl`; same-origin SCORM runtime deployment is rejected explicitly.
- Added isolated SCORM parent-frame topology with canonical `parent.API` / `parent.API_1484_11` placement and opener compatibility.
- Replaced URL-carried runtime capabilities with a private transferred `MessageChannel`; no control token is placed in the runtime URL or `.p2rln`.
- Preserved Host Adapter v1 as the only state/score persistence boundary; the runtime host remains stateless with respect to LMS credentials.
- Adapted the existing AulaP2P `todo-funciona` SCORM CMI rule model into the portable runtime: SCORM 1.2/2004 field limits, allowed values, numeric/range checks, time formats, objective/interaction rules and dynamic counts now share that proven behavior instead of a second simplified rule set.
- Kept the Alpha 12 opaque-sandbox mode as a compatibility fallback when no isolated runtime host is configured.
- Chromium gate verifies parent API discovery, opener compatibility, score 91/100, terminate/persist flow and blocked direct access to the embedding LMS document.
- P2RLN Core remains 0.4.0 and the `.p2rln` container format is unchanged.

## Unreleased - SCORM web runtime alpha 12

- Kept P2RLN Core at 0.4.0 and preserved the Alpha 11 Web SDK/distribution architecture instead of creating a second player.
- Added first-party resolution of `package-member` representations backed by an integrity-verified embedded ZIP.
- Added a dedicated SCORM renderer for preserved SCORM 1.2/2004 packages, including API lifecycle, CMI state, commit/terminate persistence and score forwarding through Host Adapter v1.
- Added an opaque sandbox execution shell with token-scoped `postMessage`, static nested-package resource mapping and CSP isolation from the embedding application origin.
- Added SCORM 1.2/2004 unit regressions plus real nested-member reading and renderer-selection coverage. Browser validation also exercises state/score flow while confirming the sandbox cannot read the parent document.
- Kept the global SCORM `deliver` capability unadvertised until parent-only API discovery, full SCORM 2004 sequencing and broader real-package conformance are closed; see `spec/SCORM-WEB-RUNTIME.md`.
- P2RLN Core and existing `.p2rln` package bytes remain compatible; Alpha 12 is a Reading-System/Web-SDK change.
- Local Alpha 12 regression: 174 passed, 12 skipped, 0 failed; 17/17 current examples validate strictly and open through the Web SDK; 83/83 JavaScript files pass syntax validation; isolated Chromium SCORM shell gate passed.

## Unreleased - Web SDK / CDN distribution alpha 11

- Added a reproducible `web_sdk` distribution generated from the existing `p2rln_reader/web` runtime rather than creating a second browser player.
- Added `dist/p2rln.js`, a classic-script CDN/self-host loader that resolves the adjacent ESM entrypoint from its own URL and exposes `P2RLNReady`.
- Added `dist/p2rln.esm.js` and a prepared `@p2rln/player` npm package with public exports, TypeScript declarations and an optional `p2rln-copy-sw` helper.
- Reader-only UI files are excluded from Web SDK output; lazy renderer imports and `import.meta.url` stylesheet resolution are preserved byte-for-byte.
- Added explicit Web SDK/runtime version metadata and `P2RLN_VERSION_CONFLICT` handling instead of silently accepting a different already-loaded runtime.
- Added deterministic `dist/release.json` with SHA-256/SHA-384 SRI metadata plus a JSON Schema for that release manifest.
- Added regression coverage for reproducible builds, module closure, ESM/classic loading, npm pack/install, TypeScript declarations, version conflicts and source/distribution identity.
- P2RLN Core remains 0.4.0; the `.p2rln` package format is unchanged.
- Local Alpha 11 regression: 170 passed, 12 skipped, 0 failed. Alpha10 paths/tests/schema IDs remain reconciled with no inherited path or schema-ID loss.

## Unreleased - static browser bridge / range integrity alpha 10

- Kept P2RLN Core at 0.4.0 and preserved Alpha 9 as the reconciled compatibility baseline before adding new transport metadata.
- Added optional `org.p2rln.rangeIntegrity` graph metadata and an inventoried `application/vnd.p2rln.range-integrity+json` map with fixed-size SHA-256 chunks for embedded `ZIP_STORED` audio/video.
- Creator emits 1 MiB chunk digests automatically for seekable media, including media inside mapped passive web bundles; older packages without the map remain valid and use the previous Blob/host bridge fallback.
- Reference validator validates the new extension/index schemas, requires protected targets to be stored, checks manifest/index metadata equality and recomputes every chunk digest.
- Browser verifier loads the range map lazily, authenticates it like any other package payload and exposes per-payload chunk metadata only after cross-checking manifest descriptors and ZIP method.
- Added standalone `p2rln-sw.js` and `static-resource-bridge.js`. A controlling P2RLN Service Worker translates virtual media ranges to exact outer-package ranges and verifies complete covering chunks before returning requested bytes.
- Static passive-HTML assets share the same bridge. Small unchunked stored/deflated assets are fully SHA-256 verified; large unprotected resources are refused rather than silently buffered.
- Added explicit `P2RLN.installServiceWorker(...)`; it refuses to replace a different Service Worker that already owns the requested scope. A platform `resolveResourceUrl` remains preferred and Host Adapter stays at version 1.
- Added regressions for Creator chunk maps, semantic validator tamper rejection, old Alpha-9 package compatibility, verified virtual seek, tampered-chunk rejection and verified deflated static web assets.
- Local Alpha 10 regression after static-browser bridge integration: 159 passed, 12 skipped, 0 failed; 87/87 historical packages also pass strict validation and the current JavaScript package opener.

## Unreleased - virtual resources / seekable assets alpha 9

- Kept P2RLN Core at 0.4.0; virtual inner-resource delivery and physical ZIP compression policy are host/Reading-System concerns, not new Core graph semantics.
- Added a centralized physical ZIP policy: already-compressed audio/video/raster/PDF/archive/WASM payloads are stored with method 0 for direct byte mapping, while text/JSON/XML/SVG remain deflated. Detached-delta reconstruction uses the same policy so updates preserve media seekability.
- Added optional Host Adapter v1 `resolveResourceUrl` without changing the adapter version. The player accepts only host URLs explicitly asserted as integrity-verified and exposes ZIP method/seekability metadata to the host.
- Added first-party Reader `/virtual/outer/...` delivery with exact stored-member byte ranges, digest ETags, package-change detection, encrypted/local-header mismatch rejection and bounded fallback for small deflated assets. Large deflated virtual members are rejected instead of silently buffered.
- Added passive multi-file web-content bundles via `https://p2rln.org/extension/web-content-bundle` mapping v1. Logical relative paths remain stable while physical payloads are content-addressed and inventoried. The mapping uses a dedicated extension URI so it does not collide with imported QTI/webcontent preservation metadata.
- Added Creator `add-web-content` API/CLI and transactional directory copying with symlink rejection.
- Added sandboxed passive-HTML base resolution through `/virtual/web/...`; package `<base>` elements are removed, scripts/connect/frames/objects/forms remain blocked, and undeclared mappings are rejected.
- Added formal `VIRTUAL-RESOURCES.md` and web-content-bundle JSON Schema.
- Normalized Toolkit/Reader internal version reporting to 0.4.0a9.
- Local Alpha 9 regression: 153 passed, 12 skipped, 0 failed. The skips remain only external real-package corpus fixtures not bundled in this ZIP.

## Unreleased - HTTP Range / ZIP64 alpha 8

- Kept P2RLN Core at 0.4.0; HTTP Range, ZIP64 and lazy payload delivery are Reading System/browser transport capabilities, not new package semantics.
- Added `RemoteZipArchive` with byte-range probing, EOCD tail reads, central-directory-only startup, `If-Range` consistency checks and bounded full-buffer fallback for small servers that ignore Range.
- Added ZIP64 EOCD locator/record parsing plus per-entry ZIP64 Extended Information (`0x0001`) sizes and local-header offsets in both buffer and Range paths; multi-disk remains rejected.
- Split initial Range integrity from lazy payload integrity: manifest/graph/inventory/`contentRoot` are checked before navigation, while unread payload SHA-256/JCS checks happen only when the payload is selected.
- Added `payload.read()`, `payload.blob()` and `payload.stream()` behavior for remote packages. Binary Blob delivery uses incremental SHA-256 and is only exposed after complete verification; streaming reports terminal integrity failures.
- Updated the passive media renderer to consume the payload API, avoiding whole-package buffering for a selected image/audio/video entry.
- Added real Range support to the first-party local Reader endpoint (`206`, `416`, suffix ranges, `Content-Range`, `Accept-Ranges`, `ETag`, `Last-Modified`, `If-Range`).
- Added regression coverage for a virtual 3 GiB archive, ZIP64 buffer/range opening, lazy fetch behavior, resource mutation rejection, safe no-Range fallback, incremental SHA-256 and a binary payload forced onto the streamed Blob path.
- Normalized Toolkit/Reader internal version reporting to 0.4.0a8.
- Local Alpha 8 regression: 146 passed, 12 skipped, 0 failed. The skips remain only external real-package corpus fixtures not bundled in this ZIP.

## Unreleased - trust/delta alpha 7

- Kept P2RLN Core at 0.4.0; signatures, deltas and richer component authoring remain detached/tooling layers rather than changing the package Core.
- Reconciled the reference Timeline component into the Alpha 6 component architecture instead of introducing a second component model. Timeline uses exact component/data/runtime-contract versions, the existing trusted host Component Registry and a data-only package instance.
- Extended declarative `component-editor/0.1` with repeatable `collection` fields and nested field definitions; JSON Schema remains the normative data authority.
- Added Timeline data/editor schemas, reference catalog/capability entries, lazy host renderer, Creator validation and a thin package example with no JavaScript.
- Added experimental detached Ed25519 signatures (`.p2rln.sig`) with JCS-canonical signing input, deterministic public-key IDs, `content` vs `package` scopes and an explicit separation between cryptographic validity and host trust. Core embedded signature locations remain reserved/rejected.
- Added optional `trust` dependency and `p2rln-trust` CLI for key generation, signing, inspection and verification against explicitly supplied trusted public keys.
- Added experimental detached resource-level deltas (`.p2rln.delta`). A delta stores the exact target manifest/graph and only payload bytes not reusable from the base by exact digest/size.
- Delta application verifies the required base root, target manifest/graph, every reused/changed payload and then the reconstructed package with the normal reference validator before atomically publishing it. Delta creation/application use temporary sibling outputs so failures do not replace a valid destination with a partial ZIP.
- Added `p2rln-delta` create/apply/inspect CLI, explicit delta ZIP safety/inventory checks and tamper/wrong-base/atomicity regressions.
- Normalized Toolkit/Reader internal version reporting to 0.4.0a7, matching package metadata and the local Reader server/capabilities.
- Local Alpha 7 regression after Timeline + detached trust/update integration: 138 passed, 12 skipped, 0 failed. The skips remain only the external real-package corpus fixtures not bundled in this ZIP.

## Unreleased - modular runtime alpha 6

- Kept P2RLN Core at 0.4.0 and extended the component tooling layer outside Core; package instances remain data-only and thin.
- Added external `component-catalog/0.1` and declarative `component-editor/0.1` contracts so independent authoring tools can discover component versions, data schemas and editor hints without importing runtime code.
- Kept JSON Schema as the normative data authority. Editor documents carry only field ordering, controls, localized labels/help/placeholders and options; they do not contain executable modules.
- Added reference Callout data schemas v1 and v2 plus an editor schema for authoring data v2. Existing v1 packages stay valid and continue to migrate in memory to runtime data v2.
- Added a reference component catalog resolved locally by document URI with duplicate-ID protection, schema self-validation and separation between structural package validity and catalog/runtime compatibility.
- Added Creator `component-catalog` and `validate-component-authoring` CLI commands while keeping generic `add-component` capable of packaging third-party/future components for preservation.
- Extended the host Component Registry and separate component-capabilities document with authoring data/schema identifiers; no renderer/editor JavaScript is copied into `.p2rln`.
- Added legacy-v1 and authoring-v2 component examples and end-to-end tests proving catalog validation, CLI authoring validation, runtime migration and thin packaging.
- Toolkit development version is 0.4.0a6; Reading System development version is 0.4.0a6.
- Local Alpha 6 regression after declarative component-authoring integration: 124 passed, 12 skipped, 0 failed. The skips remain only the external real-package corpus fixtures not bundled in this ZIP.

## Unreleased - modular runtime alpha 5

- Kept P2RLN Core at 0.4.0 and added the experimental `native-component` profile/tooling layer rather than embedding a component runtime into Core.
- Added declarative native-component instances with independent `componentVersion`, `dataVersion` and `runtimeContractVersion`; package instances carry data only.
- Added host-side `ComponentRegistry` with exact component/version lookup, deterministic in-memory migration paths, prepared-data validation and explicit incompatibility error codes.
- Added a generic native-component router plus non-selectable internal implementation renderers, preventing package/HTML renderer hints from bypassing component negotiation.
- Added trusted host APIs `P2RLN.registerComponent`, `unregisterComponent` and `components`; implementation/migration code remains host-installed and permissions still flow through the existing renderer/dependency gates.
- Added reference `https://p2rln.org/component/callout` component version 1 with data migration 1 -> 2 as an end-to-end conformance/example implementation.
- Added Creator `add-component` API/CLI with pre-mutation validation and thin Resource + Activity packaging.
- Separated native-component format validity from local runtime compatibility so future runtime-contract instances remain valid/preservable even when the current Reader cannot deliver them.
- Added `component-capabilities/0.1` as a separate tooling capability document rather than widening the existing Core 0.4.0 capability schema.
- Fixed the local Reader UI so native composite and native component Activities, not only native questionnaires, are routed through the shared `<p2rln-player>`.
- Added a real native-component example package of about 2 KB with three ZIP entries and no JavaScript.
- Toolkit development version is 0.4.0a5; Reading System development version is 0.4.0a5.
- Local Alpha 5 regression after native-component integration: 115 passed, 12 skipped, 0 failed. The skips remain only the external real-package corpus fixtures not bundled in this ZIP.

## Unreleased - modular runtime alpha 4

- Kept P2RLN Core at 0.4.0 and added the experimental `native-composite` profile as a thin profile/tooling layer rather than widening Core.
- Added native composite schema/profile/runtime using graph `Activity.children` as the sole source of child identity and order; the small composite JSON stores only traversal/completion policy.
- Added Creator `add-composite` with sequence/free navigation, all/any completion, default reparenting to avoid duplicate hierarchy placement, cycle detection and transactional project mutation/config writes.
- Added recursive composite delivery through the existing host Renderer Registry; child runtimes are lazy-loaded normally and are never copied into the `.p2rln`.
- Added external `p2rln-composite-state/0.1`; sequence restoration is hardened to a contiguous completed prefix and out-of-order child completion/score events cannot advance a linear composite.
- Added versioned `runtime-event/1` envelopes while preserving the existing DOM CustomEvent detail fields.
- Added Host Adapter v1 with optional `loadState`, `saveState`, `reportScore` and ordered `emitEvent`; direct runtime use no longer depends on a Web Component-specific `target.adapter` property.
- Hardened browser graph verification with duplicate-child checks, hierarchy cycle detection and native-composite Activity/resource/profile/media-type validation before rendering.
- Fixed a modular-player regression where the top-level HTML `renderer` attribute could be shadowed by the nested-render default.
- Added a real 3.57 KB native-composite example package. It contains no player/renderer JavaScript and reuses a deduplicated questionnaire payload.
- Toolkit development version is 0.4.0a4; Reading System development version is 0.4.0a4.
- Local regression after composite/event integration: 100 passed, 12 skipped because the external real-package corpus is not bundled in this ZIP.

## Unreleased - modular runtime alpha 3

- Consolidated standard-questionnaire and game execution on one `QuestionnaireSession` state/scoring/persistence engine instead of maintaining duplicate session logic.
- Added external state envelope `p2rln-questionnaire-state/0.2` plus JSON Schema and v0.1 migration. Learner state remains outside the `.p2rln`.
- Implemented resumable `attemptPolicy.timeLimitSeconds`; persisted deadlines survive reloads and renderer changes and timeout completion uses the answers already present.
- Implemented per-question timing in the standard renderer for both one-at-a-time and all-question presentation; expired questions become read-only.
- Game renderers continue to support total-attempt timing but explicitly report `P2RLN_TIMING_UNSUPPORTED` for per-question timing, allowing optional renderer hints to fall back without changing semantics.
- Added `p2rln:timeupdate` and `p2rln:timeout` events and visible timer status in standard/game presentation.
- Deterministic question shuffling is now seeded from portable runtime context + attempt number rather than `Math.random()`, so state reconstruction is stable across compatible hosts.
- Toolkit development version is 0.4.0a3; Reading System development version is 0.4.0a3.
- Local regression after shared-session/timing integration: 84 passed, 12 skipped because the external real-package corpus is not bundled in this ZIP.

## Unreleased - modular runtime alpha 2

- Kept P2RLN Core at 0.4.0 and the native-questionnaire profile at 0.4.0; modular playback remains a Reading-System/tooling layer rather than a Core expansion.
- Replaced the Web Component's hardcoded questionnaire/media branches with a host-side Renderer Registry and Dependency Registry.
- Added lazy ES-module loading: the standard questionnaire runtime, individual 2D games and WebGL renderer are loaded only when selected and then reuse browser module caching.
- Added declarative renderer preference extension `https://p2rln.org/ext/renderer-preference/1` and Creator `add-questionnaire --renderer`; the hint stores only a URI and never bundles renderer JavaScript.
- Added optional-renderer fallback: incompatible/unavailable optional presentation hints fall back to another compatible installed renderer, while an explicit HTML `renderer` request or required package hint fails explicitly.
- Ported the existing AulaP2P full-questionnaire compatibility rules into framework-neutral P2RLN game transforms: word search, crossword, rosco, memory, matching, ordering and fast true/false. Partial conversion is rejected.
- Added a lightweight WebGL2 3D renderer for complete questionnaires composed of ordering/matching activities, using the same canonical answers/state instead of a second game data model.
- Added a shared questionnaire game state/score adapter and retained the existing `p2rln:*` event contract for every presentation.
- Added runtime permission policy and host dependency gates. Package content cannot grant itself privileged browser capabilities or inject arbitrary runtime URLs.
- The first-party local Reader now uses the same `<p2rln-player>` path for native questionnaires instead of maintaining a second execution implementation.
- Added normative-draft guidance for thin packages: generic player/renderers stay host-installed; `.p2rln` carries content and content-specific assets.
- Toolkit development version is 0.4.0a2; Reading System development version is 0.3.0a2.
- Local regression after modularization: 81 passed, 12 skipped because the external real-package corpus is not bundled in this ZIP.

## Unreleased - native runtime alpha 1

- Kept P2RLN Core at 0.4.0; no Core contract was widened.
- Added experimental `native-questionnaire` profile/schema with seven portable interaction families and explicit `embedded-key` vs `host` grading.
- Added deterministic Python validation/scoring and a framework-neutral DOM runtime with external state/score adapters and standard P2RLN events.
- Added `<p2rln-player src="...">` browser Web Component that verifies the outer package before rendering and can select a graph node via `node`.
- Reused AulaP2P questionnaire semantics without importing its database/runtime state; local IDs are remapped to portable activity-internal IDs.
- AulaP2P course bridge now emits a native questionnaire representation only when no authoritative QTI sidecar exists, preserving the existing canonical extension for round-trip.
- Added `p2rln-create add-questionnaire` and a seven-interaction example package.
- First-party Reading System now delivers the native questionnaire profile directly; SCORM/cmi5/H5P/QTI/LTI runtime claims remain unchanged.
- Timed native questionnaires fail closed in the alpha Reader/player until timer lifecycle semantics are implemented; declared limits are never silently ignored.
- Toolkit development version is 0.4.0a1; Reading System development version is 0.2.0a1.
- Local regression: 71 passed, 12 skipped because the external real-package corpus is not bundled in this ZIP.

## 0.6.1

- Kept P2RLN Core at 0.4.0 and bumped the installable toolkit to 0.3.1.
- Added `aulap2p.curso.v1` import/export bridge and CLI commands `ingest-aulap2p-course` / `extract-aulap2p-course`.
- Removed generic AulaP2P local `id` values, Prisma/local IDs and configured internal URLs from portable identity and payloads.
- Added content-addressed asset and QTI sidecar mapping for the course bridge.
- Added professor-designed `Tarea` portability as a specialization of its existing `MaterialEjercicio + RecursoCurso`, preventing duplicate activity export.
- Preserves task design fields: `titulo`, `descripcion`, `puntuacionMaxima`, `fechaEntrega`, `permiteRetraso`, `tituloVisible`, `obligatorio`, `positionKey`, `desbloqueadoEn`.
- Rejects learner/runtime/local task state such as `alumnoId`, submissions, attempts, grades, feedback and persistence IDs.
- Added 17 course/task regressions; full suite is 69/69.

## 0.6.0

- Introduced the AulaP2P canonical course bridge over the existing P2RLN Core graph.
- Added deterministic portable identity derived from portable course content when no bridge `projectId` exists.
- Added round-trip import envelopes for AulaP2P persistence adapters.

## 0.5.0

- Creator System 0.2.0: added `ingest-aulap2p` canonical document ingestion.
- Reuses the real AulaP2P Reader boundary (`DocumentoExtraidoCanonico` / multimodal v2) instead of introducing a second document parser.
- Added transformation provenance payload and graph linkage.
- Added explicit local-ID/internal-URL stripping and materialized-asset bridge rules.
- Added source-document bit preservation without exposing it as a visible course activity.
- Added three regression tests covering provenance/source preservation, local-reference stripping and materialized image bytes.


## 0.4.1

P2RLN Core remains **0.4.0**. This release adds creation tooling without changing the package contract.

- Added P2RLN Creator System 0.1.0.
- Added editable `p2rln.project.json` reference workspace schema; it is explicitly non-normative for interchange.
- Added `p2rln-create init`, `add-unit`, `add-file`, `add-url`, `show`, `build` and `convert` workflows.
- Added reusable `p2rln_creator` Python API.
- Native Builder now generates stable portable IDs from project identity + keys.
- Identical project builds are byte reproducible.
- Embedded assets are content-addressed under `assets/sha256` and duplicate bytes are stored once.
- Remote resources are recorded without network fetch during creation.
- Final packages are self-validated before a successful build is reported.
- Existing preservation-first transformation is exposed through the Creator rather than treated as a separate product.
- Added `spec/CREATOR-SYSTEM.md` and Spanish creation-flow documentation.
- Added Creator regressions for valid builds, stable IDs/reproducibility, deduplication, no-network remote resources and workspace path escape rejection.

## 0.4.0

- Added first-party P2RLN Reading System.
- Added installable reader/validator library and local browser UI.
- Kept specialized runtimes explicit rather than claiming false delivery support.

- Hardened H5P host-library resolution: exact metadata no longer suffices when declared `preloadedJs`/`preloadedCss` files are absent. Session creation now fails closed with `P2RLN_H5P_LIBRARY_ASSETS_MISSING` instead of returning a session that would later 404 in the browser.
