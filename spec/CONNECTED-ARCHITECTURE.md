# P2LRN Connected Architecture

Status: experimental Reading-System architecture. This document defines boundaries between portable package semantics and connected runtime services. It is additive to Core 0.4.0.

## 1. Non-negotiable portability rule

A `.p2lrn` package must remain an educational object that can still be opened when a particular LMS, AI vendor, MCP server or cloud service no longer exists. Core educational meaning travels with the package; identity, secrets, authoritative learner state and provider implementations do not.

P2LRN therefore has four runtime categories:

| Category | Lives where | Network required | Examples |
| --- | --- | --- | --- |
| `embedded` | package | no | graph, content, questionnaires, games, progression rules, accessibility metadata, integrity, capability declarations |
| `local-runtime` | Player/browser/app | no | Service Worker, IndexedDB partition, offline outbox, active-time tracker, local provisional state |
| `host-service` | trusted embedding host/server | eventually | identity, authoritative score, persistence, synchronization, verified shared resources |
| `live-capability` | trusted provider selected by host | yes unless local provider exists | AI/MCP, collaboration, live data, TTS/STT, search, simulations |

These are layers of one format, not four package formats.

## 2. Reuse existing P2LRN mechanisms

This architecture must extend the mechanisms that already exist rather than create parallel APIs.

- Package structure remains Core 0.4.0 graph/entities/representations/extensions.
- Deterministic sequencing/adaptation continues to use `https://p2lrn.org/profile/progression`.
- Runtime telemetry continues to use the existing `p2lrn:*` runtime-event envelope.
- Host persistence continues to use Host Adapter v1.
- Offline support wraps Host Adapter v1 with `createOfflineHostAdapter()`; it does not replace the adapter contract.
- Shared resources reuse Core remote representations plus `expectedDigest` and Host Adapter `resolveResourceUrl()`.
- Connected tools use Host Capabilities; MCP is one possible provider binding behind the trusted broker.
- Existing SCORM/H5P/package sandboxes remain isolated and receive no direct capability-broker authority.

## 3. Package boundary

The package may contain:

- course graph, objectives, sequencing and progression rules;
- embedded assets and/or digest-pinned remote representations;
- questionnaires, native components, composites and games;
- deterministic offline pedagogical rules;
- accessibility metadata and fallbacks;
- integrity and signature metadata;
- declarations of semantic host capabilities required or optionally used.

The package must not contain learner passwords, LMS roles, enrollment, API keys, permanent user tokens, MCP credentials, private database connection strings, signing private keys, authoritative grades or other learners' private data.

## 4. Deterministic adaptation

P2LRN already has progression state and rules for viewed/completed/passed, score thresholds, prerequisites and navigation gating. Those mechanisms are the base for deterministic offline adaptation.

Do not add a separate AI adaptation engine to the package. New deterministic evidence such as attempts or active-time thresholds must first receive explicit semantics in the progression/event contracts. A generic `p2lrn:answer` event must not be guessed to mean one pedagogical attempt.

AI-driven analysis is a live capability such as `ai.misconception-analysis`; the package may request it and must provide a non-AI fallback when it is optional.

## 5. Host capabilities and MCP

Packages request semantic capability IDs and explicit operations through `https://p2lrn.org/ext/host-capabilities/1` on Course, Activity or Resource entities.

The host registers providers in `CapabilityBroker`. The provider may internally be:

- an MCP server;
- a local model;
- Paula/Cerebro or another local process;
- a WebSocket collaboration service;
- a search/data service;
- a deterministic non-AI implementation.

The package never receives provider endpoints or credentials. A renderer may invoke only a capability and operation explicitly declared for the current Course/Activity/Resource, and host authorization remains deny-by-default. `createToolCapabilityProvider()` can map those semantic operations onto MCP/tool names entirely in trusted host configuration.

Examples of extensible semantic namespaces include `ai.tutor`, `search.library`, `speech.tts`, `speech.stt`, `data.query`, `simulation.physics`, `collaboration.room` and `collaboration.poll`. They are not vendor bindings.

## 6. Offline state and synchronization

`createOfflineHostAdapter()` stores provisional resume state and an ordered outbox outside package bytes. Persistent browser storage requires a host-supplied opaque namespace so two learners on a shared device do not share one partition.

State snapshots may coalesce to the latest snapshot for the same context. Events and scores remain ordered. Once any item is pending, new writes are queued instead of bypassing the outbox after connectivity returns; this prevents newer server writes from overtaking older offline work.

An outbox item is removed only after its remote Host Adapter callback resolves. Replay stops at the first failure. Delivery is at-least-once; exactly-once requires host-side idempotency/ACK semantics.

The host decides when `sync()` runs. P2LRN creates no background scheduler.

## 7. Active time

Active-time tracking is opt-in. Visibility/focus belongs to the containing document, while interaction signals are scoped by default to the Player element so clicking unrelated host UI does not keep a course artificially active.

The tracker records only coarse state/timing. It does not capture key values, typed text or pointer coordinates. These signals are evidence for analytics, not proof of learner identity.

## 8. Shared resources

Shared resource delivery uses existing remote representations with mandatory `expectedDigest` for the first-party remote-media renderer. The trusted host resolves the object and attests verified bytes through `resolveResourceUrl()`.

A course may also carry an embedded representation as fallback. This supports both connected deduplication and self-contained export without inventing a second P2LRN format.

## 9. Collaboration

Collaboration definitions belong in package semantics; live presence and shared state belong to host/live capabilities. The initial integration should therefore use capabilities such as `collaboration.room` and `collaboration.poll` rather than hardcoding a WebSocket URL or Redis model into Core.

A future native collaborative activity profile may standardize activity payloads, but its transport, identity, permissions and persistence still remain host concerns.

## 10. Compatibility rule

Every connected feature must answer three questions:

1. What educational meaning remains when the provider is unavailable?
2. Is the capability required or optional, and what is the fallback?
3. Can an older Core 0.4.0 processor preserve the declaration without corrupting the package?

If these answers are not explicit, the feature must not be embedded into the package contract.

## 11. Current reference implementation

- `host-adapter.js`: existing host persistence boundary.
- `offline-host-adapter.js`: local state/outbox wrapper with ACK-by-resolution semantics.
- `capability-broker.js`: semantic capability negotiation, explicit-operation enforcement and deny-by-default authorization.
- `activity-tracker.js`: opt-in active/idle timing.
- `static-resource-bridge.js`: existing package resource delivery bridge.
- `renderers/remote-media.js`: digest-pinned shared media resolved by trusted host.
- `progression-core.js`: deterministic local progression/adaptation base.
- `runtime-events.js`: telemetry envelope reused for attention and capability events.

This architecture deliberately leaves provider-specific MCP transport, collaboration servers and authoritative learner databases outside the package.


## Verified package caching

Offline continuation has two independent parts: learner state/outbox (OFFLINE-SYNC.md) and verified course bytes (PACKAGE-CACHE.md). The reference Player can explicitly cache a bounded full package after verification and reopen it later by contentRoot; the package remains unchanged and contains no learner state.
