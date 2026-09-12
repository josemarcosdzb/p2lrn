# P2RLN 0.6.1

P2RLN is an experimental portable learning graph and package format. This development snapshot is based on **P2RLN 0.6.1 / Core 0.4.0** and advances the first-party **Creator/Toolkit 0.4.0a15** and **Reading System 0.4.0a15** with the modular native runtime, alternative renderers, native activity composition and a versioned host-event contract. The reference integrations reuse AulaP2P canonical contracts without making AulaP2P a dependency of the P2RLN standard.

It remains pre-standard. The purpose of the 0.x line is to discover interoperability and reading-system failures before freezing 1.0.

## Included

- Core container and portable graph specification.
- JSON Schema 2020-12 schemas for manifest, graph, capabilities, profile descriptors and transformation reports.
- RFC 8785/JCS logical `contentRoot` with a Python implementation used by the installable reader; Node is no longer required to open/validate P2RLN.
- Course, passive Web Content, **native questionnaire**, **native composite activity**, QTI, H5P, SCORM, cmi5, Common Cartridge, legacy Tin Can, LTI, CASE, xAPI and accessibility profile drafts.
- Preservation-first source-package transformer.
- `p2rln_ref`: reusable validator/graph reader library.
- **`p2rln_reader`: first-party `.p2rln` Reading System with a local browser UI.**
- **`p2rln_creator`: first-party Creator/Packager with native authoring, external package conversion and canonical document ingestion.**
- safe graph navigation, resource resolution and capability negotiation.
- direct native delivery of passive P2RLN web content, browser media and declarative native questionnaires.
- embeddable browser player: `<p2rln-player src="/path/course.p2rln"></p2rln-player>`, with package integrity verification before rendering.
- host-side Renderer Registry + Dependency Registry with lazy module loading, optional presentation fallback and permission gates.
- thin-package model: generic player/game/3D/composite runtime code is installed once by the host instead of copied into every `.p2rln`.
- alternative renderers over the same native questionnaire: memory, matching, ordering, true/false, word search, crossword, rosco and a lightweight WebGL2 ordering/matching mode.
- thin native composite activities that reuse ordered `Activity.children` from the graph instead of duplicating child content or IDs in a second payload.
- thin native component instances with exact component/runtime/data versions, host-side migrations and non-selectable internal implementation renderers; reference Callout and Timeline components prove simple and collection-based authoring without bundling runtime code.
- versioned runtime-event envelope and Host Adapter v1 (`loadState`, `saveState`, `reportScore`, `emitEvent`) for platform integration without embedding learner state in the package.
- explicit runtime boundary for SCORM, cmi5, H5P, QTI and LTI: the SCORM path keeps its isolated-origin runtime-host and recovered sequencing work; the H5P integration candidate adds an isolated host runtime with exact library-version resolution, bounded sessions, state resume and non-authoritative xAPI forwarding. Blanket SCORM/H5P `deliver` remains withheld until each profile closes its remaining conformance gates.
- target-neutral LMS import plans, source recovery and logical round-trip tools.
- Linux/Windows file-association templates.
- experimental detached Ed25519 `.p2rln.sig` authenticity sidecars with explicit host trust-store checks; Core 0.4.0 remains unchanged.
- experimental detached `.p2rln.delta` resource-level updates that reuse unchanged base payloads and reconstruct an ordinary validated target package atomically.
- real-package corpus tests using the supplied SCORM, H5P, Common Cartridge and cmi5 material.


## Create a native `.p2rln`

The reference Creator deliberately separates authoring state from the interchange artifact:

```text
editable project -> P2RLN Creator -> course.p2rln -> P2RLN Reader
```

Create a project, add structure/resources, then build:

```bash
p2rln-create init my-course --title "Física I" --language es
p2rln-create add-unit my-course --key mechanics --title "Mecánica"
p2rln-create add-file my-course lesson.html --key intro --title "Introducción" --parent mechanics --profile https://p2rln.org/profile/web-content
p2rln-create build my-course fisica.p2rln --strict-profiles
```

Add a native questionnaire created independently from the package:

```bash
p2rln-create add-questionnaire my-course quiz.json --key quiz --parent mechanics \
  --renderer https://p2rln.org/renderer/questionnaire/memory \
  --renderer-version 1
p2rln-create build my-course fisica.p2rln --strict-profiles
```

Existing Activities can also be grouped as one thin native composite without copying their content:

```bash
p2rln-create add-composite my-course --key lesson --title "Lección compuesta" \
  --mode sequence --completion all --children act-intro act-quiz
p2rln-create build my-course fisica.p2rln --strict-profiles
```

The composite payload stores traversal/completion policy only; child identity and order remain solely in graph `Activity.children`.

The build assigns stable portable IDs, content-addresses embedded files, deduplicates identical bytes, writes `content/graph.json` and `META-INF/manifest.json`, computes `contentRoot`, creates the ZIP/ZIP64 package, then reopens it with the reference validator.

The reference workspace file `p2rln.project.json` is **not** part of the P2RLN interchange standard. Other authoring products may use any internal model as long as the emitted `.p2rln` conforms. See `spec/CREATOR-SYSTEM.md` and `spec/FLUJO-CREACION-ES.md`.


## Native declarative component profile

Alpha 5 adds `https://p2rln.org/profile/native-component`. A package stores only component identity/version data and its authored JSON. The trusted host resolves the implementation through `ComponentRegistry`, migrates old data versions in memory and delegates to an internal renderer that package hints cannot select directly.

```bash
p2rln-create add-component my-course component.json --key notice --parent mechanics
```

The bundled `callout` reference package is about 2 KB and contains no JavaScript. See `spec/NATIVE-COMPONENT.md` and `spec/COMPONENT-REGISTRY.md`.

Alpha 6 adds an external `component-catalog/0.1` plus declarative `component-editor/0.1`. JSON Schema remains the data authority; editor documents contain only UI hints. Alpha 7 extends the same editor contract with repeatable `collection` fields and reconciles a second reference component, `https://p2rln.org/component/timeline`; its runtime remains host-installed and its package instance is only authored data. This lets another Studio author the same components without importing runtime renderers. See `spec/COMPONENT-AUTHORING.md`.

## Native executable questionnaire profile

The first native executable profile is `https://p2rln.org/profile/native-questionnaire`. It is declarative JSON, independent of AulaP2P, and initially covers seven interaction families: single choice, multiple choice, true/false, free text, fill blanks, ordering and matching.

The model separates **content** from **runtime state**. The package may carry scoring rules and, for low-stakes/offline content, an embedded answer key. Learner answers, attempts, grades and persisted state stay outside `.p2rln`. A `host` grading mode intentionally emits answers without fabricating an authoritative score.

AulaP2P course ingestion reuses its existing questionnaire semantics. If an authoritative QTI sidecar exists, QTI remains authoritative. Otherwise the bridge can generate one native P2RLN questionnaire representation from the already-portable quiz design, without creating a duplicate Activity and without leaking database IDs.

See `spec/NATIVE-QUESTIONNAIRE.md` and `spec/NATIVE-ACTIVITY-RUNTIME.md`.

## Embed a `.p2rln` in a browser

Alpha 11 packages the existing first-party Web Component as a Web SDK without forking the Reader runtime. A plain page can load the generated classic-script loader once and then use the custom element directly:

```html
<script src="/p2rln-sdk/p2rln.js"></script>
<p2rln-player src="/courses/course.p2rln"></p2rln-player>
```

The same generated package supports ESM/npm with `import "@p2rln/player"`. The package name is prepared for publication but this source snapshot does not claim that it has been published to npm or a public CDN. `p2rln.js` only locates/imports the adjacent ESM entrypoint; the actual player and lazy renderer modules remain the same files used by `p2rln_reader/web`. See `spec/WEB-SDK-DISTRIBUTION.md`.

Alpha 15 keeps the Alpha 13 isolated runtime-host and Alpha 14 recovered manifest/navigation base, then executes the bounded hierarchical SCORM 2004 rule/attempt/rollup subset needed for nested clusters: pre/post/exit conditions, resumable activity-attempt state, `exitParent`, `suspendAll`, rollup thresholds and `useCurrentAttemptProgressInfo`. The sequencing state is persisted alongside CMI through Host Adapter v1 and the generated Web SDK comes from the same `p2rln_reader/web` source. Blanket SCORM certification/deliver conformance is still not claimed. See `spec/SCORM-WEB-RUNTIME.md`.

A specific graph node can be selected with `node="..."`. An installed renderer can be requested explicitly with `renderer="..."`:

```html
<p2rln-player
  src="/courses/course.p2rln"
  node="urn:uuid:..."
  renderer="https://p2rln.org/renderer/questionnaire/crossword">
</p2rln-player>
```

The `<script>` is normally loaded once by the host platform. Every package on the page then uses only the `<p2rln-player>` tag. Renderer modules are lazy-loaded; the 3D module is not downloaded for a normal questionnaire, and renderer code is not copied into the `.p2rln` file. See `spec/RENDERER-REGISTRY.md` and `spec/THIN-PACKAGES.md`.

A package may also carry an optional preferred renderer URI. If that installed renderer cannot faithfully represent the entire questionnaire, the reference player falls back to the standard renderer; it never drops incompatible questions to force a game conversion. An explicit HTML `renderer` request remains strict and reports the incompatibility.

For an in-memory/small package the player can still verify every payload eagerly. For a URL served with HTTP byte ranges, Alpha 8 first reads only EOCD/ZIP64 metadata, the central directory, manifest and graph; it verifies `contentRoot` and graph semantics, then downloads/authenticates an embedded payload only when a renderer actually opens it. Alpha 9 adds host-verified virtual resource URLs: stored audio/video can be byte-seeked directly inside the ZIP, and passive HTML bundles can resolve declared relative CSS/images/fonts/media through the same host bridge. ZIP64 is supported in both buffer and Range paths. Semantic activities use DOM controls; the 3D alternative creates its own WebGL2 `<canvas>` inside the universal host element.

The Range transport uses `If-Range` consistency checks, bounded fallback when a server ignores Range, and streaming SHA-256 for large binary payloads. If the host implements `resolveResourceUrl`, Alpha 9 can expose a validated `ZIP_STORED` media member as a normal Range URL instead of first creating a whole-member Blob. The Creator stores already-compressed media with that seekable physical method and delta reconstruction preserves it. Passive multi-file HTML uses `https://p2rln.org/extension/web-content-bundle` to map logical relative paths to content-addressed payloads. Hosts without the bridge retain the authenticated Blob fallback. See `spec/HTTP-RANGE-ZIP64.md` and `spec/VIRTUAL-RESOURCES.md`.

Alpha 10 closes the plain-static-host gap without embedding player code in the package. Creator derives a 1 MiB SHA-256 chunk map for stored audio/video; a root-scoped `p2rln-sw.js` can then authenticate only the chunks covering a requested media range and return `206` without hashing the entire object first. The worker is installed explicitly once with `P2RLN.installServiceWorker(...)`; it never silently replaces an unrelated site Service Worker. Packages without chunk metadata remain backward compatible and simply use the Alpha-9 path. See `spec/STATIC-BROWSER-BRIDGE.md`.

Questionnaire timing declarations are now enforced by the shared session engine. Total-attempt deadlines persist across reloads/renderer changes; the standard renderer also enforces per-question deadlines. Alternative game renderers never reinterpret per-question clocks: an optional game preference falls back to the standard renderer, while a required/explicit incompatible renderer fails.

## Reuse the AulaP2P document reader

The Creator can ingest the existing AulaP2P `DocumentoExtraidoCanonico` instead of implementing another document parser:

```bash
p2rln-create ingest-aulap2p reader-output.json course.p2rln \
  --source-file source.docx \
  --asset-root ./materialized-assets
```

The adapter prefers `aulap2p.documento.multimodal.v2` when present, preserves source coordinates/confidence/provenance, content-addresses materialized assets, and explicitly strips local `archivoId`/Prisma identity and internal AulaP2P URLs. See `spec/AULAP2P-CREATOR-BRIDGE.md`.

## Import/export an AulaP2P course

P2RLN 0.6.1 adds a bridge over the existing `aulap2p.curso.v1` contract. It does not create a second AulaP2P course model.

```bash
p2rln-create ingest-aulap2p-course course.json course.p2rln --asset-root ./bridge-assets
p2rln-create extract-aulap2p-course course.p2rln import-envelope.json
```

The adapter strips installation-local IDs and internal URLs, preserves portable course structure, assets and QTI sidecars, and represents a professor-designed task as a single assignment specialization rather than exporting both the task and its backing `MaterialEjercicio` as duplicate activities. The task design contract preserves `titulo`, `descripcion`, `puntuacionMaxima`, `fechaEntrega`, `permiteRetraso`, `tituloVisible`, `obligatorio`, `positionKey` and `desbloqueadoEn`. Learner submissions, attempts, grades, feedback and local persistence IDs are rejected.

See `spec/AULAP2P-COURSE-BRIDGE.md`.

## Open a `.p2rln`

From the source distribution:

```bash
python3 -m p2rln_reader examples/web-course.p2rln
```

The reader binds only to `127.0.0.1`, creates an unguessable session token and opens a local UI. Merely opening a course does not perform remote HTTP/DNS requests and does not execute specialized package runtimes.

Inspect without UI:

```bash
python3 -m p2rln_reader examples/external/scorm12-real.p2rln --summary --tree --read-plan
```

The Python project also exposes console entry points when installed:

```bash
p2rln-reader course.p2rln
p2rln-validate course.p2rln --profile-payloads
```

See `p2rln_reader/README.md` and `spec/READING-SYSTEM.md`.

## What the generic reader can deliver now

The baseline reader directly delivers passive P2RLN Web Content, browser-native media and the native questionnaire profile. SCORM has an experimental first-party 1.2/2004 runtime path and H5P now has an isolated host-runtime candidate with exact dependency resolution, resumable state and xAPI forwarding. Neither SCORM nor H5P advertises blanket `deliver` conformance yet. cmi5/QTI/LTI remain delegated to their specialized runtimes.

### H5P runtime candidate gate

On the reconciled Alpha 15 sequencing tree plus the H5P candidate, the complete regression is **213 passed, 12 skipped, 0 failed** across 21 test modules, each executed in a clean process. The 12 skips remain only the pre-existing unavailable external corpus cases. The focused gates are **SCORM 29/29**, **H5P 12/12**, **Web SDK distribution 13/13**, and **SCORM + Web SDK 42/42**. Strict validation and Web SDK package opening are both **17/17**. The three supplied H5P packages transform with bit-for-bit source preservation; the runtime-session gate is **3/3** (Boardgame accepted as bundled with 12 resolved dependencies, Crossword/Arts of Europe rejected explicitly for their missing exact external libraries).

The exact previously sealed Alpha 15 source archive was not persisted, so byte-for-byte identity with that missing archive is not claimed. This tree is a reproducible reconciliation from the exact Alpha 14 source authority plus the recovered Alpha 15 sequencing behavior and gates. Its patch against Alpha 14 reconstructs the sealed reconciled tree exactly. It remains **Alpha 15 reconciled + H5P candidate**, not Alpha 16.

That distinction is intentional:

```text
locate != understand != execute
```

Finding a SCORM launch file and having the Alpha 15 runtime available still does not mean complete SCORM conformance; rule execution, rollup/objective state, exhaustive CMI behavior and broader corpus evidence remain separate gates.

## Transform existing learning packages

```bash
python3 tools/convert.py input.zip output.p2rln
```

Repository fixture:

```bash
python3 tools/convert.py CATAPULT-main.zip output.p2rln \
  --package-root CATAPULT-main/course_examples/single_au_basic_framed
```

The source package is preserved before semantic projection whenever possible.

## Validate

```bash
python3 tools/validate.py examples/minimal-course.p2rln --strict-profiles
```

Validate nested source profiles too:

```bash
python3 tools/validate.py examples/external/scorm12-real.p2rln \
  --strict-profiles \
  --validate-profile-payloads
```

## Detached signatures and trust

Alpha 7 deliberately keeps signatures outside Core 0.4.0. A publisher may create a sibling Ed25519 signature without changing the `.p2rln` package or its `contentRoot`:

```bash
pip install 'p2rln-toolkit[trust]'
p2rln-trust keygen publisher-private.pem publisher-public.pem
p2rln-trust sign course.p2rln publisher-private.pem --scope content
p2rln-trust verify course.p2rln course.p2rln.sig \
  --trust-key publisher-public.pem --require-trusted
```

`content` scope follows logical `contentRoot`; `package` scope also binds `packageId`. A cryptographically valid self-described public key is **not** automatically trusted: trust is only elevated when the host supplies the matching key. See `spec/DETACHED-SIGNATURES.md`.

## Detached delta updates

For large packages whose next revision reuses most payload bytes, Alpha 7 can build a detached resource-level update:

```bash
p2rln-delta create old.p2rln new.p2rln update.p2rln.delta
p2rln-delta inspect update.p2rln.delta
p2rln-delta apply old.p2rln update.p2rln.delta reconstructed.p2rln
```

The sidecar stores the exact target manifest/graph and only payloads not reusable from the base by exact digest/size. Application validates the required base root and every reconstructed byte, then runs the ordinary P2RLN validator before atomically publishing the target. It is not a merge format or a second graph authority. See `spec/DELTA-UPDATES.md`.

## Architecture boundaries

1. P2RLN is neutral and is not the AulaP2P database/domain model.
2. `.p2rln` contains data, not a copy of the reader executable.
3. One installed P2RLN Reading System opens all compatible `.p2rln` files.
4. Core remains small; specialized standards stay authoritative through profiles/runtimes.
5. `META-INF/manifest.json` is the physical authority.
6. `content/graph.json` is the Core semantic authority.
7. Original standard packages may be retained bit-for-bit under `packages/sha256/...`.
8. Unknown content is never silently discarded by a lossless processor.
9. Opening/validation never implies network access or executable-content startup.
10. Users, enrolments, attempts, grades, payments, secrets and infrastructure state remain outside course portability.

## Verification

Alpha 13 adds the isolated SCORM runtime-host and its NPM server export. Its dedicated Chromium gate confirms `parent.API`, opener compatibility, score/state persistence and denial of direct LMS-document access. The complete Alpha 13 regression figures are recorded in the reconciliation gate generated with the release artifacts.

Alpha 14 recovers the `todo-funciona` XML/manifest/sequencing base and connects it to the existing runtime without changing the package Core. Focused gates cover the parser, navigation state, request-valid surface and target relaunch; the full S&N algorithm remains explicitly open.

The Alpha 11 regression is **170 passed, 12 skipped, 0 failed**. The 11 new Web SDK tests cover reproducible distribution, ESM/classic loading, version conflict handling, npm pack/install, TypeScript declarations, Service Worker copying and source/distribution identity. The 12 skips are the pre-existing real-package corpus tests whose external SCORM/H5P/cmi5/Common Cartridge fixtures are not present in this ZIP. The native/modular regressions cover all seven questionnaire types, Python/JavaScript scoring parity, host-grading boundaries, AulaP2P ID stripping/mapping, strict thin packaging, renderer/dependency/permission/version gates, 2D/3D full-questionnaire fidelity, shared state migration, total/per-question timing, graph-backed native composites, nested composite event propagation, Host Adapter/runtime-event ordering, transactional composite authoring, declarative Callout/Timeline authoring, component migrations, Reader delivery, QTI precedence, CSP-safe runtime assets, browser cycle/semantic verification, detached Ed25519 verification/trust boundaries, detached-delta reuse/reconstruction/atomicity and tamper rejection, HTTP Range lazy opening, ZIP64 EOCD/entry parsing, resource-change rejection, incremental SHA-256, streamed binary Blob delivery, stored-member seekability, virtual inner-resource Range delivery and mapped passive-HTML relative assets.

## Status

Experimental / pre-standard.
