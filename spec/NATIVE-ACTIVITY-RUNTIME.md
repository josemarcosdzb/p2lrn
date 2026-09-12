> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Native Activity Runtime - experimental contract

Status: experimental design implemented for `native-questionnaire`, graph-backed `native-composite` and data-only `native-component`. This document does not widen P2LRN Core 0.4.0.

## 1. Purpose

P2LRN packages need a native execution path in addition to preserving foreign standards such as SCORM, H5P, cmi5 and QTI. The native path must remain portable: a package contains data and declarative activity semantics, while an installed Reading System or embeddable player supplies executable runtime code.

```text
authoring tool -> .p2lrn -> Reading System / p2lrn-player -> native runtime
```

The authoring tool is not normative. P2LRN Studio, AulaP2P, a CLI or another product may all emit the same representation.

## 2. Runtime boundary

A native runtime receives a validated representation plus a host context. Learner state is never read from or written to the package itself.

Reference host adapter:

```text
loadState(context) -> state | null
saveState(state, context) -> void
reportScore(score, context) -> void
```

All adapter functions are optional. Without an adapter the reference runtime remains usable in-memory.

The host context identifies portable runtime scope such as package/content root, entity, resource and representation. It MUST NOT require AulaP2P database IDs.

## 3. Browser event contract

The reference runtime/player emits DOM CustomEvents:

- `p2lrn:ready`: outer package verified and initial rendering completed;
- `p2lrn:activityready`: native activity renderer mounted;
- `p2lrn:answer`: learner changed an answer;
- `p2lrn:progress`: normalized activity progress changed;
- `p2lrn:statechange`: serializable runtime state changed;
- `p2lrn:timeupdate`: remaining portable activity/question time changed;
- `p2lrn:timeout`: a declared attempt/question deadline expired;
- `p2lrn:score`: a scoring result is available;
- `p2lrn:complete`: activity completion was requested/computed;
- `p2lrn:error`: a load/state/reporting boundary failed.

These events are transport-neutral. A host may convert them to its own persistence model, xAPI, Caliper or another event protocol. P2LRN does not require learner event history to be embedded into the package.

## 4. Embeddable Web Component

Reference integration:

```html
<script type="module" src="/p2lrn/p2lrn-player.js"></script>
<p2lrn-player src="/courses/course.p2lrn"></p2lrn-player>
```

A graph node can be selected explicitly:

```html
<p2lrn-player src="/courses/course.p2lrn" node="urn:uuid:..."></p2lrn-player>
```

The host can also mount programmatically through `P2LRN.mount(...)`.

The Web Component is the universal host element. It is deliberately not a `<canvas>`: semantic content uses DOM/HTML controls, while a future game/3D renderer may create its own Canvas/WebGL surface inside the host.

The 0.4.0a7 questionnaire runtime implements timing through the shared external-state session engine. Total-attempt deadlines persist across reloads and renderer changes. The standard renderer also enforces per-question deadlines; game renderers reject per-question timing so an optional presentation can fall back without changing timing semantics. See `QUESTIONNAIRE-STATE.md`.

## 5. Security and integrity

Before navigation, the browser verifies ZIP central-directory structure/safe paths, exact package inventory, declared file sizes, outer `contentRoot`, the authenticated graph, graph entrypoints/resource references, declared representation profiles and embedded inventory membership.

For the full-buffer path it also verifies every payload digest eagerly. For HTTP Range, payload `byteDigest`/`contentDigest` verification is deferred until that payload is opened; canonical JSON is still fully read/JCS-checked before delivery.

The browser alpha rejects encrypted ZIP entries, unsupported compression, suspicious compression ratios and resource/total size limits. It does not execute passive HTML scripts and never auto-fetches remote resource representations.

Toolkit/Reader 0.4.0a8 adds ZIP64 plus a byte-range transport. Range mode verifies the central directory, exact inventory, manifest, graph and `contentRoot` before navigation; unread payload bytes are intentionally verified lazily when selected. `read()` remains bounded, while binary `blob()`/`stream()` can use the Range transport with incremental SHA-256. See `HTTP-RANGE-ZIP64.md`. Passive HTML still uses sandboxed `srcdoc`; Alpha 9 can now resolve declared relative package assets through the host-verified web-content bundle bridge without embedding runtime code in the package.

## 6. Native renderer registry

The 0.4.0a7 Reading System implements host-side Renderer, Dependency and Component registries. The player no longer contains hardcoded questionnaire/media execution branches. It selects a descriptor, checks host dependencies/permissions and only then lazy-imports the selected renderer module. Native component instances are first routed through exact component/version negotiation and deterministic host-side data migration before an internal implementation renderer is allowed to run.

```text
profile / representation
        |
        +-- standard questionnaire -> semantic DOM renderer
        +-- memory/matching/order/VF -> modular DOM game renderers
        +-- word-search/crossword/rosco -> modular game renderers
        +-- 3D order/match -> WebGL2 renderer + accessible DOM controls
        +-- passive text/media -> passive renderers
        +-- host-installed future renderers
```

All questionnaire presentations consume the same canonical native-questionnaire JSON and write to the same state/answer/scoring contract. They MUST NOT duplicate or mutate the source questionnaire merely to change presentation. Game conversion is all-or-nothing for the complete questionnaire: an optional incompatible game preference falls back to a compatible renderer instead of silently discarding questions.

A package MAY carry `https://p2lrn.org/ext/renderer-preference/1`. This contains only renderer identifiers/preferences; executable renderer modules remain installed by the trusted host. See `RENDERER-REGISTRY.md` and `THIN-PACKAGES.md`.

The reference host exposes registration APIs for trusted integrations. Renderer dependencies are resolved by host identifier (DOM, Canvas2D, WebGL2 or a host-registered future dependency). Declared privileged permissions are denied unless the host permission policy explicitly grants them; content cannot grant permissions to itself.

Native components extend the same boundary rather than creating a second runtime architecture. A `.p2lrn` contains only component identity/version/data. `P2LRN.registerComponent(...)` is a trusted host API; implementation renderers are normally non-selectable through package hints. See `NATIVE-COMPONENT.md` and `COMPONENT-REGISTRY.md`.

## 7. Foreign runtimes remain explicit

This native contract does not turn preserved H5P, SCORM, cmi5 or QTI into native P2LRN. Their standards remain authoritative unless an explicit semantic conversion is defined and loss is recorded. QTI is preferred for advanced assessment semantics that exceed the native questionnaire profile.
