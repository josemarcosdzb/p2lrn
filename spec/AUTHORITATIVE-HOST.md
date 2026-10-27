# P2LRN Reference Authoritative Host v1

Status: reference host/server implementation for Host Adapter v1. It is not package content.

## Boundary

The portable `.p2lrn` never owns learner identity, enrolment, roles, server credentials or the official grade. A trusted deployment supplies `partitionKey(context)` from authenticated host context. The resulting partition is combined with package/entity/runtime identifiers so two learners, attempts or devices cannot silently share authoritative state.

The reference implementation lives at `@p2lrn/toolkit/host` and exposes:

- `createReferenceAuthoritativeHost()`
- `createMemoryAuthoritativeHostStore()`
- `createJsonFileAuthoritativeHostStore()`

The returned `adapter` implements Host Adapter v1.

## Idempotency and offline ACK

Offline Host Adapter deliveries carry a stable `offlineDeliveryId`. The authoritative host persists every accepted delivery id. Repeating the same state/event/score delivery after reconnect or process restart is therefore acknowledged without applying it twice.

A production database may implement the same store contract with a unique constraint or transaction on `offlineDeliveryId`.

## State conflicts

Reference policy is explicit:

- `last-write`: accepted incoming state replaces current state;
- `server-wins`: an existing authoritative state is retained;
- `mergeState({current,incoming,context})`: deployment-defined deterministic merge.

The package does not choose this policy.

## Authoritative grades

`reportScore()` never turns a client score into an official score automatically. A deployment must supply `grade({reportedScore, context, state, events})`.

The grader must return an object containing `authoritative:true`; otherwise the host rejects the result. This is the point where a deployment can re-evaluate answers, validate attempts, enforce assessment policy, consult protected question keys or require server-side evidence.

This reference contract solves idempotency and authority boundaries. It does not claim that arbitrary browser interactions are cryptographically unforgeable; that depends on the deployed grader, identity/session controls and assessment policy.

## Persistence

The in-memory store is for tests/local demonstrations. The JSON file store demonstrates durable restart semantics with atomic replace. Production deployments should bind `AuthoritativeHostStore` to their transactional database.

## Multi-device

Multi-device behavior is a host policy, not a package policy. Use a shared authoritative store plus `server-wins` or a deterministic `mergeState` implementation. Offline clients keep their local outbox until the authoritative host acknowledges each delivery.
