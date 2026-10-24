# P2LRN Connected Architecture — Implementation Matrix

Audit date: 2026-10-24  
Audited baseline: `main` at `3e2d18a2e3b1a8de32e962356fc83b2f8aff2f91` before this documentation commit.  
Scope: `spec/CONNECTED-ARCHITECTURE.md` checked against current Toolkit, Player, Studio, tests and browser verification.

## Status legend

- **IMPLEMENTED**: executable reference implementation exists, is wired into first-party Player/Studio where applicable, and has automated evidence.
- **PARTIAL**: the contract or an important part exists, but the complete end-to-end capability does not yet exist.
- **MISSING**: only the architectural slot/semantic namespace exists, or there is no first-party implementation yet.
- **HOST-EXTERNAL**: intentionally outside the portable `.p2lrn`; P2LRN exposes the contract but a deployment must provide the trusted service.

## Executive result

P2LRN already has working reference implementations for the hardest boundaries of the connected architecture: Host Adapter v1, ordered offline outbox, verified package cache, active-time tracking, semantic Host Capabilities, deny-by-default capability broker, restricted tool mapping, Player capability negotiation, a native connected component, digest-pinned remote resources and deterministic progression.

The largest remaining product-level gaps are:

1. a semantic context resolver so an MCP/AI provider can safely receive declared context such as `current_question`, objectives and previous answers;
2. a first-party shared resource library/content-addressed store by digest, plus authoring UX;
3. richer standardized learning-event semantics across renderers;
4. a reference collaboration layer/profile/provider;
5. a reference authoritative host/server for idempotent results, analytics and multi-device policy.

## 1. Portable package and Core boundary

| Capability | Status | Current evidence | What remains |
| --- | --- | --- | --- |
| Core graph/entities/representations/extensions | **IMPLEMENTED** | Core 0.4.0, Reader/Creator, strict validation and round-trip tests | Preserve compatibility; no parallel graph model |
| Native questionnaires/games/components/composites | **IMPLEMENTED** | Native runtime, component registry, composites, Studio and Player gates | Extend through registries/profiles |
| Deterministic progression rules | **IMPLEMENTED** | `progression-core.js`, `gateFollowing`, `unlockWhen`, viewed/completed/passed, `minScore` | More evidence types require explicit semantics first |
| Full deterministic adaptation model | **PARTIAL** | Progression can gate/adapt navigation using completion/pass/score | No standardized conditions for attempts, active-time, misconceptions or richer evidence |
| Host capability declarations in package | **IMPLEMENTED** | `https://p2lrn.org/ext/host-capabilities/1`, validation and Studio `setHostCapabilities()` | Extend semantic vocabulary without vendor coupling |
| Package-side fallbacks | **PARTIAL** | capability `fallback`, connected component `fallbackText`, embedded resource fallback | No global validator proves every optional connected feature has a meaningful fallback |
| Accessibility metadata/runtime structure | **PARTIAL** | semantic native renderers and accessible alternatives | No whole-system WCAG certification; legacy imports retain their own limits |
| Integrity/contentRoot/digests | **IMPLEMENTED** | manifest/graph/resource validation, SHA-256, `contentRoot` | None for this layer |
| Detached signatures | **IMPLEMENTED** | Ed25519 detached signatures | Trust policy remains host responsibility |
| Generic secret prohibition in arbitrary extensions | **PARTIAL** | capability tokens reject URLs/transport addresses; architecture excludes secrets | No universal secret scanner for arbitrary opaque extensions |

## 2. Host/runtime state, offline and active time

| Capability | Status | Current evidence | What remains |
| --- | --- | --- | --- |
| Host Adapter v1 | **IMPLEMENTED** | `loadState`, `saveState`, `reportScore`, `emitEvent`, `resolveResourceUrl` | Host implementation is deployment-specific |
| Offline wrapper reusing Host Adapter | **IMPLEMENTED** | `offline-host-adapter.js` | None at contract level |
| Local provisional resume state | **IMPLEMENTED** | memory and IndexedDB stores | Host chooses learner/session namespace |
| IndexedDB learner/session partition | **IMPLEMENTED** | namespace is mandatory for persistent store | Host derives namespace securely |
| Ordered offline event/score outbox | **IMPLEMENTED** | events/scores queued individually; writes serialized | None at runtime level |
| Coalesced state snapshots | **IMPLEMENTED** | newest pending state replaces older state for same context | None |
| Replay stops on first failure | **IMPLEMENTED** | failed work remains pending | None |
| Stable delivery/idempotency key | **IMPLEMENTED** | `offlineDeliveryId`, `offlineQueuedAt` survive retry | Server must deduplicate |
| Exactly-once server ACK | **HOST-EXTERNAL** | stable delivery ID enables it | no first-party authoritative ACK store |
| Conflict resolution hook | **IMPLEMENTED** | optional `conflictResolver()` | no universal merge for opaque state |
| Automatic reconnect scheduler | **MISSING BY DESIGN** | host chooses when `sync()` runs | app may listen for connectivity and call `sync()` |
| Verified full-package cache | **IMPLEMENTED** | `package-cache.js`, `cachePackageURL()`, `loadCachedPackage()` | retention/quota is host policy |
| Offline package-member playback | **IMPLEMENTED** | package cache + Service Worker/static-resource bridge | host may replace bridge for custom cache |
| Active/idle/focus tracker | **IMPLEMENTED** | `activity-tracker.js`, `p2lrn:attention`, `p2lrn:active-time` | opt-in; not itself a pedagogical rule |
| Active time as adaptation evidence | **PARTIAL** | measurable/reportable | no progression condition such as active-time threshold |
| Authoritative grade/result | **HOST-EXTERNAL** | Player reports via Host Adapter | server ownership/anti-cheat/durable record stay outside package |

## 3. Telemetry and learning events

| Capability | Status | Current evidence | What remains |
| --- | --- | --- | --- |
| Versioned runtime-event envelope | **IMPLEMENTED** | `runtime-events.js`, `runtime-event/1` | None at envelope level |
| Forward events to Host Adapter | **IMPLEMENTED** | ordered `emitEvent` forwarding | storage/analytics is external |
| Progress/score/completion/navigation events | **IMPLEMENTED** | first-party Player/renderers emit core families | coverage differs by renderer |
| Attention/active-time events | **IMPLEMENTED** | tracker emits coarse privacy-preserving state | host decides whether to enable/use |
| Rich learning-event semantics | **PARTIAL** | answer/xAPI/runtime events exist | no universal answer-change, media pause/seek, resource consultation, detailed 3D interaction or misconception contract |
| Universal pedagogical attempt event | **MISSING** | assessment configs can limit attempts | `p2lrn:answer` is deliberately not defined as one pedagogical attempt |
| Global analytics aggregation/dashboard | **HOST-EXTERNAL** | event stream exists | no first-party analytics/LRS-like server here |

## 4. Shared resources and deduplication

| Capability | Status | Current evidence | What remains |
| --- | --- | --- | --- |
| Core remote representation | **IMPLEMENTED** | Core `location.type: remote` | None |
| Digest-pinned remote resource | **IMPLEMENTED** | `expectedDigest` required by first-party remote-media renderer | extend safely to more remote renderer families where useful |
| Trusted host resolution | **IMPLEMENTED** | Player uses Host Adapter `resolveResourceUrl()` | host must provide and verify bytes |
| Reject unverified remote media | **IMPLEMENTED** | `remote-media.js` requires `verified:true`; AV requires `seekable:true` | None |
| Embedded fallback | **IMPLEMENTED** | renderer negotiation falls through to embedded representation; tested | Studio can make this easier to author |
| Content-addressed shared store (`sha256 -> object`) | **PARTIAL** | current digest + resolver contract can implement it | no first-party persistent library/server/catalog |
| Cross-course physical deduplication | **PARTIAL** | one-copy/many-reference is architecturally possible | no reference host implementation proves storage dedup across courses |
| Shared-resource discovery/search | **MISSING** | `search.library` can be a capability | no catalog protocol/provider implemented |
| Studio shared-library picker | **MISSING** | Studio can author resources but has no first-party hash-library browser | add UX without putting credentials in package |
| Portable self-contained export | **IMPLEMENTED** | embedded representations and normal package export remain valid | improve materialization from connected resource to embedded fallback |

## 5. Host Capabilities, AI and MCP

| Capability | Status | Current evidence | What remains |
| --- | --- | --- | --- |
| Semantic capability extension | **IMPLEMENTED** | bounded Course/Activity/Resource declarations | keep IDs vendor-neutral |
| Capability request validation | **IMPLEMENTED** | bounds, semantic tokens and graph-location validation | None |
| Merge scoped requirements | **IMPLEMENTED** | `mergeCapabilityRequirements()` | None |
| Capability negotiation | **IMPLEMENTED** | Player negotiates before renderer and blocks missing required capabilities | None |
| Deny-by-default authorization | **IMPLEMENTED** | `CapabilityBroker` defaults to deny | host supplies policy |
| Restrict renderer to declared capability | **IMPLEMENTED** | undeclared capability rejected | None |
| Restrict renderer to declared operation | **IMPLEMENTED** | undeclared operation rejected | None |
| Hide raw broker/provider from package | **IMPLEMENTED** | renderer gets restricted `invokeCapability()` only; browser gate checks isolation | preserve boundary |
| Semantic operation -> tool mapping | **IMPLEMENTED** | `createToolCapabilityProvider()` | host supplies `callTool()` |
| Native connected action component | **IMPLEMENTED** | `component/capability-action`, Studio editor, Player renderer and fallback | generic action UI, not full tutor conversation protocol |
| Browser E2E through tool provider | **IMPLEMENTED** | browser gate returns `Pista MCP: ...` and confirms broker is not exposed | proves P2LRN-side integration, not a specific MCP transport |
| Actual MCP transport/client inside P2LRN | **MISSING BY DESIGN** | no MCP URL, credential or client in package | trusted host binds its MCP client to `callTool()` |
| AI vendor/model binding | **MISSING BY DESIGN** | semantic `ai.tutor` rather than vendor IDs | host can bind Paula, Cerebro, OpenAI, Ollama, etc. |
| Declared semantic context keys | **PARTIAL** | capability requests can list `context` tokens | Player does not yet resolve those tokens to standardized privacy-filtered values |
| Activity-aware AI context | **MISSING** | broker currently gets package/entity/resource/renderer context plus component input | add trusted context resolver for current question, objectives, answers, progression, etc. |
| Machine-readable AI restrictions | **MISSING** | instruction/fallback can express intent as text | define policy vocabulary such as answer-reveal restrictions if needed |
| Misconception/adaptive AI analysis | **PARTIAL** | can already be requested as a semantic capability | no standard input/output contract or context resolver yet |
| Search/TTS/STT/data/simulation providers | **PARTIAL** | generic broker can host them | no first-party reference provider contract for each family |

### MCP conclusion

The P2LRN side of the MCP architecture is already functional. P2LRN should **not** gain a direct package-to-MCP connection. The intended path is:

`P2LRN capability -> CapabilityBroker -> createToolCapabilityProvider -> trusted host MCP client -> MCP tool`

For “connect it and it knows what to do”, the most important missing piece is the **semantic context layer**, not a second MCP protocol.

## 6. Collaboration

| Capability | Status | Current evidence | What remains |
| --- | --- | --- | --- |
| Declare `collaboration.room` / `collaboration.poll` | **IMPLEMENTED AS SUBSTRATE** | Host Capability extension accepts semantic namespaces | no collaboration behavior yet |
| Broker can bind collaboration provider | **IMPLEMENTED AS SUBSTRATE** | generic provider model supports it | no reference collaboration provider |
| Native collaborative activity profile | **MISSING** | architecture reserves the slot | define portable board/poll/peer activity semantics |
| Presence/room membership | **MISSING** | no runtime provider/profile | host/live service required |
| Shared document/board state | **MISSING** | no CRDT/shared-state contract | define activity semantics + provider contract |
| Live poll synchronization | **MISSING** | namespace only | reference provider + activity contract |
| Peer review / peer learning | **MISSING** | no native contract | define identity-safe host workflow and portable activity definition |
| Transport/auth/persistence | **HOST-EXTERNAL** | correctly excluded from package | reference service can be supplied separately |

## 7. Security boundaries for connected architecture

| Capability | Status | Current evidence | What remains |
| --- | --- | --- | --- |
| Legacy active-content sandboxing | **IMPLEMENTED** | SCORM/H5P/HTML/package runtimes remain isolated | keep broker inaccessible from sandboxes |
| Provider credentials outside package | **IMPLEMENTED BY DESIGN** | provider registration is host-side; semantic tokens reject transport addresses | deployment must honor contract |
| Package integrity before cache/playback | **IMPLEMENTED** | cache verifies before storage and re-verifies on open | None |
| Remote resource host attestation | **IMPLEMENTED** | `verified:true` required | host must actually verify digest before attesting |
| Client-only anti-cheat / authoritative assessment | **PARTIAL** | package integrity and host score reporting exist | no generic server challenge/event-signing/authoritative assessment protocol |
| Learner identity privacy boundary | **IMPLEMENTED BY CONTRACT** | portable context contains no learner identity | future semantic context resolver must preserve this boundary |

## 8. Coverage by architecture layer

These are engineering estimates for the specific Connected Architecture, not overall P2LRN product readiness.

| Layer | Estimate | Reason |
| --- | ---: | --- |
| Core/package boundary | **90%** | graph, integrity, progression and capability declarations exist; richer deterministic evidence/fallback enforcement remain |
| Host/local runtime | **85%** | Host Adapter, offline outbox, package cache and active-time tracker work; authoritative server is external |
| Resource Layer | **60%** | digest-pinned resolution/fallback works; central catalog/store/dedup UX is absent |
| Capability Layer | **75%** | negotiation, security, tool mapping and connected component work; semantic context and provider reference bindings remain |
| Collaboration | **15%** | generic capability substrate exists; actual collaboration semantics/runtime do not |
| Learning events/analytics | **55%** | event envelope and important events exist; detailed pedagogical vocabulary/aggregation are incomplete |

A simple average is about **63%**, but that hides the key fact: **architectural boundaries and security are much further along than the server-side services built on top of them**.

## 9. What must not be changed while completing this architecture

1. Do not put learner identity, credentials, API keys, MCP endpoints or provider secrets in `.p2lrn`.
2. Do not let package-authored code register providers or alter broker authorization.
3. Do not give SCORM/H5P/legacy sandboxes direct `CapabilityBroker` access.
4. Do not create a second adaptation engine parallel to the progression profile.
5. Do not redefine generic `p2lrn:answer` as an attempt without an explicit semantic contract.
6. Do not create a second package format for connected courses; use representations/fallbacks in the same P2LRN model.
7. Do not add a new remote-resource location type just to model a hash library; reuse remote representation + digest + trusted resolution unless Core semantics genuinely require more.
8. Do not make MCP a P2LRN wire dependency. Bind MCP behind Host Capabilities.
9. Do not move learner state/outbox into package bytes.
10. Do not make hidden background synchronization mandatory inside Core; host policy decides when to sync.
11. Do not remove sandboxing merely to claim “no iframe”; native P2LRN stays DOM-native while untrusted legacy code stays isolated.

## 10. Recommended implementation order

### P0 — Semantic context for capabilities

Add a trusted context resolver that resolves only context keys explicitly requested by the package and explicitly allowed by the host.

First useful keys:

- `activity.objectives`
- `current_question`
- `current_answer`
- `previous_answers`
- `score`
- `progression.state`
- `attempts` only after attempt semantics are standardized
- `active_time` only when host policy allows it

The renderer must continue receiving only `invokeCapability()`, never raw learner/host state.

### P0 — Learning Event Model additions

Define explicit event/evidence semantics for assessment attempt started/submitted, answer changed, media play/pause/seek/completed, resource consulted, native-game and 3D interaction/result, and activity abandonment/resume. Do not infer these from generic clicks or `p2lrn:answer`.

### P1 — Shared Resource Library reference host

Build a reference host around the existing resource contract: `sha256 -> verified object` store, upload/verify/deduplicate, `resolveResourceUrl()` adapter, seekable AV delivery, optional catalog/search capability, and a Studio picker that can also embed a fallback.

### P1 — Authoritative Host reference

Demonstrate state persistence keyed by host learner/attempt + P2LRN context, `offlineDeliveryId` idempotency, authoritative score storage, runtime-event ingestion, explicit synchronization policy and multi-device conflict policy.

### P2 — Collaboration profile + provider

After capability/context semantics are stable, define one small native collaborative activity first, preferably poll or board, keep room identity/auth/presence/persistence in the host provider, and add a reference `collaboration.room` provider.

## 11. Evidence run for this audit

Targeted Node verification on 2026-10-24:

- `host-capability-offline.test.mjs`
- `progression.test.mjs`
- `package-cache.test.mjs`
- `remote-resource-fallback.test.mjs`
- `studio-browser-export.test.mjs`

Result: **27/27 PASS**.

Browser verification with `scripts/verify-local-viewer.mjs` also passed with `failures: []` and proved:

- a Studio-authored capability-action package invokes a host tool mapping and receives `Pista MCP: ...`;
- the raw broker is not exposed to package-authored DOM;
- a verified package is persisted in the package cache;
- after the source package is removed, the cached package reopens through the P2LRN static-resource bridge.

## 12. Final verdict

`CONNECTED-ARCHITECTURE.md` is directionally correct and describes several features that are already working reference implementations rather than proposals. It should **not** be replaced by a different architecture.

The safe path is additive: keep Core, Host Adapter, progression, runtime events, resource resolution and sandbox boundaries; fill the missing semantic context/event contracts; build host-side reference services for resource deduplication and authoritative persistence; add collaboration only through the existing capability boundary; and bind MCP through `createToolCapabilityProvider()` rather than teaching `.p2lrn` about MCP transports.
