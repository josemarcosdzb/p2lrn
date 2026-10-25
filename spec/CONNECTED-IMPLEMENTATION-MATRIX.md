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
4. production collaboration persistence/transport beyond the first-party lightweight room contract;
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
| Rich learning-event semantics | **PARTIAL** | `p2lrn:interaction` now covers answer changes, media play/pause/seek/end and native collaboration actions | still missing a broader standardized vocabulary for detailed 3D interaction, resource consultation and misconception evidence |
| Native questionnaire attempt lifecycle | **IMPLEMENTED** | `p2lrn:attempt` emits explicit started/resumed/submitted phases without raw answers | other activity families need their own explicit attempt semantics before reusing it |
| Global analytics aggregation/dashboard | **HOST-EXTERNAL** | event stream exists | no first-party analytics/LRS-like server here |

## 4. Shared resources and deduplication

| Capability | Status | Current evidence | What remains |
| --- | --- | --- | --- |
| Core remote representation | **IMPLEMENTED** | Core `location.type: remote` | None |
| Digest-pinned remote resource | **IMPLEMENTED** | `expectedDigest` required by first-party remote-media renderer | extend safely to more remote renderer families where useful |
| Trusted host resolution | **IMPLEMENTED** | Player uses Host Adapter `resolveResourceUrl()` | host must provide and verify bytes |
| Reject unverified remote media | **IMPLEMENTED** | `remote-media.js` requires `verified:true`; AV requires `seekable:true` | None |
| Embedded fallback | **IMPLEMENTED** | renderer negotiation falls through to embedded representation; tested | Studio can make this easier to author |
| Content-addressed shared store (`sha256 -> object`) | **PARTIAL** | digest resolver contract plus `createMemorySharedResourceStore()` prove one-copy/many-reference delivery | no first-party persistent multi-user library/server/catalog |
| Cross-course physical deduplication | **PARTIAL** | reference digest store deduplicates identical bytes and resolves the same verified object for multiple packages | persistent cross-process storage remains host-specific |
| Shared-resource discovery/search | **MISSING** | `search.library` can be a capability | no catalog protocol/provider implemented |
| Studio shared-library picker | **PARTIAL** | Studio can author a digest-pinned shared resource from logical URL + SHA-256 + media type | searchable host catalog/browser is still missing |
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
| Declare `collaboration.room` | **IMPLEMENTED** | Host Capability extension plus `COLLABORATION.md` five-operation contract | preserve the transport-neutral package contract |
| Broker can bind collaboration provider | **IMPLEMENTED** | memory reference plus `createHttpCollaborationProvider()` production HTTP binding | host selects its endpoint/auth policy |
| Native collaborative activity | **IMPLEMENTED** | one native collaboration component with poll, board and peer-review modes | independent interoperability evidence |
| Presence/room membership | **IMPLEMENTED** | reference hub plus authenticated HTTP handler; sessions remain bound to host-resolved actors/scopes | distributed presence storage remains host-specific |
| Shared board state | **IMPLEMENTED REFERENCE** | bounded semantic board events over the same room contract | no character-level CRDT by design |
| Live poll synchronization | **IMPLEMENTED** | two real Players synchronize through `createHttpCollaborationProvider()` and authenticated Node handler in browser E2E | production deployment/storage topology remains host-specific |
| Peer review / peer learning | **IMPLEMENTED REFERENCE** | native submission/comment flow over the same five-operation provider contract with host-owned identity | richer assignment/rubric policies can remain host workflows |
| Transport/auth boundary | **IMPLEMENTED** | HTTP provider + server handler require origin allowlist, authentication, trusted-context resolution and authorization; package cannot set participant identity | durable multi-node persistence remains host-specific |

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
| Resource Layer | **72%** | digest-pinned resolution/fallback, reference SHA-256 dedup store and Studio authoring exist; persistent searchable multi-user catalog remains |
| Capability Layer | **75%** | negotiation, security, tool mapping and connected component work; semantic context and provider reference bindings remain |
| Collaboration | **82%** | five-operation contract, native UI, memory reference, production HTTP provider/server security boundary and two-Player HTTP E2E exist; distributed durable persistence remains host-side |
| Learning events/analytics | **72%** | event envelope, active time, explicit native assessment attempts, answer changes, media behavior and collaboration interactions exist; broader 3D/resource-consultation vocabulary and aggregation remain |

The connected architecture is now roughly **75–80% implemented at reference/adapter level**. Durable production persistence, searchable catalogs, richer semantic context and independent interoperability remain deliberately separate from the portable package.

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

### P0 — Semantic context for connected capabilities

Keep the existing broker boundary and add a trusted resolver for explicitly requested/allowed context keys. Do not expose raw learner state or the broker itself. Useful next keys are objectives, current question, score/progression and opt-in active time.

### P0 — Finish the rich learning-event vocabulary

The runtime now has explicit questionnaire attempts, answer changes, media play/pause/seek/end and collaboration interactions. Next standardize resource consultation, native-game/3D interactions and abandonment/resume semantics without falling back to generic click logging.

### P1 — Persistent shared-resource catalog

The digest store, verified resolver and Studio authoring path are implemented at reference level. Add persistence/search on the host side while preserving the same `sha256 -> verified object` contract and self-contained embedded fallback.

### P1 — Authoritative Host reference

Demonstrate durable state keyed by host learner/attempt + P2LRN context, `offlineDeliveryId` idempotency, authoritative score/event ingestion and explicit multi-device conflict policy.

### P2 — Durable collaboration deployment

The production HTTP adapter boundary is now implemented and tested: browser provider, authenticated server handler, trusted context resolution, authorization and two-Player HTTP E2E. The remaining deployment work is the Host's durable/distributed room persistence, observability and scale policy without changing the `.p2lrn` format.

### P2 — Accessibility and interoperability hardening

Keep adding keyboard/screen-reader/browser evidence to native renderers and maintain the existing SCORM/H5P/cmi5/QTI/Common Cartridge regression gates. Do not claim WCAG certification or full external-standard conformance until their dedicated test corpora pass.

## 11. Release evidence gate

The release workflow now has an executable connected E2E matrix in `scripts/verify-connected-e2e-matrix.mjs`. It runs after the source tests, local browser E2E, Edge UI verification, installed npm tarballs, installed-package browser smoke, twelve-game visual gate, independent Express Host, generated site and npm/CDN byte-identity gate.

A passing run writes `.connected-e2e-matrix.json` and preserves it with the Windows evidence. The matrix requires explicit evidence for authoring round-trip, authenticated production HTTP collaboration, two-Player synchronization, shared-resource deduplication, rich analytics, accessibility checks, offline/cache playback, external-format regression, installed npm use, all native games, independent Host integration and distribution identity.

The prior baseline run `40190933100` was green before the production HTTP collaboration additions. It is not used as evidence for those newer changes; the release candidate must be restaged only from the new exact green `main` SHA.

## 12. Final verdict

`CONNECTED-ARCHITECTURE.md` is directionally correct and describes several features that are already working reference implementations rather than proposals. It should **not** be replaced by a different architecture.

The safe path is additive: keep Core, Host Adapter, progression, runtime events, resource resolution and sandbox boundaries; fill the missing semantic context/event contracts; build host-side reference services for resource deduplication and authoritative persistence; add collaboration only through the existing capability boundary; and bind MCP through `createToolCapabilityProvider()` rather than teaching `.p2lrn` about MCP transports.
