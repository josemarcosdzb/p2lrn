# P2LRN Collaboration v1

Status: experimental first-party reference contract layered on Host Capabilities v1. It does not change P2LRN Core 0.4.0.

## Boundary

Portable activity semantics live in the `.p2lrn`; identity, room membership, transport, authorization and durable shared state live in the trusted host. A package MUST NOT contain WebSocket URLs, user tokens, database credentials or Redis configuration.

A collaborative native component declares the existing semantic capability `collaboration.room` with exactly five reference operations: `join`, `send`, `listen`, `snapshot`, `leave`.

## Room identity

A package supplies only a local room name such as `main` or `team-1`. The host scopes it with trusted package/activity and enrolment/group context. Learner identity is assigned by the host and cannot be selected by package input.

## Operations

- `join({room})` returns an opaque session, participant, revision and presence.
- `send({sessionId,type,payload})` appends one bounded semantic event.
- `listen({sessionId,cursor})` returns events after a revision cursor. The host can implement polling, long-poll, SSE, WebSocket or another transport.
- `snapshot({sessionId})` restores current shared state/history after open or reconnect.
- `leave({sessionId})` removes live membership.

The first-party memory hub is only a reference provider for tests, local demos and host prototypes. Production persistence and multi-server synchronization remain host responsibilities.

## Native UI

The first-party component provides three modes over the same five operations:

- `poll`: live voting and aggregated results;
- `board`: shared text notes;
- `peer-review`: participant submissions and peer comments.

Studio authors these visually and declares `collaboration.room` automatically. When the capability is optional and unavailable, the Player renders an individual fallback rather than making the course unreadable.

## Security, accessibility and telemetry

The provider derives authorization and identity from trusted host state. Renderers receive only the restricted `invokeCapability()` bridge. The native UI uses semantic form controls, labels, status announcements and keyboard-operable actions. Meaningful learner actions emit `p2lrn:interaction` through the existing runtime-event envelope.

This contract does not change SCORM, H5P, cmi5, QTI, Common Cartridge, the Core graph, Host Adapter or package format.
