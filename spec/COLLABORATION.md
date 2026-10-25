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

## Production HTTP binding

The browser distribution now includes `createHttpCollaborationProvider()`. It maps the same five semantic operations to one Host-owned HTTP endpoint without changing the package contract:

```js
const provider = P2LRN.createHttpCollaborationProvider({
  endpoint: '/api/p2lrn/collaboration',
  getHeaders: () => ({Authorization: 'Bearer ' + shortLivedHostToken})
});

player.capabilityBroker = P2LRN.createCapabilityBroker({
  providers: [provider],
  authorize: ({capabilityId}) => capabilityId === 'collaboration.room'
});
```

Only `contentRoot`, `packageId` and `entityId` are eligible to cross the browser transport as portable context. The browser provider does not serialize learner identity, arbitrary host state or package-selected credentials. Absolute non-local endpoints must use HTTPS and embedded URL credentials are rejected.

The Node server export `@p2lrn/player/server` includes `createP2LRNCollaborationHandler()`. It intentionally has no open/default deployment mode. Construction requires:

- an explicit trusted `allowedOrigins` list;
- `authenticate(request)` to resolve the Host principal;
- `resolveContext(...)` to translate portable package/activity identifiers into the Host's trusted tenant/course/group scope;
- `authorize(...)` for the requested operation;
- a five-operation service implementation.

Example:

```js
import {
  createP2LRNCollaborationHandler
} from '@p2lrn/player/server';

app.post('/api/p2lrn/collaboration',
  createP2LRNCollaborationHandler({
    allowedOrigins: ['https://learn.example.com'],
    authenticate: (req) => sessionUser(req),
    resolveContext: ({actor, clientContext}) =>
      resolveEnrolmentScope(actor, clientContext),
    authorize: ({actor, operation, context}) =>
      canCollaborate(actor, operation, context),
    service: collaborationStore
  })
);
```

The service may use PostgreSQL, Redis, a durable actor/service, filesystem-backed development storage or another Host-managed implementation. P2LRN does not prescribe that storage product. Top-level package input attempting to set `participantId`, `actorId`, `userId`, `identity` or `principal` is rejected before the service receives the operation.

The built-in per-process request limit is a defensive baseline only. Clustered production deployments should still apply their normal distributed rate limiting, CSRF/session policy, observability and abuse controls.

## Native UI

The first-party component provides three modes over the same five operations:

- `poll`: live voting and aggregated results;
- `board`: shared text notes;
- `peer-review`: participant submissions and peer comments.

Studio authors these visually and declares `collaboration.room` automatically. When the capability is optional and unavailable, the Player renders an individual fallback rather than making the course unreadable.

## Security, accessibility and telemetry

The provider derives authorization and identity from trusted host state. Renderers receive only the restricted `invokeCapability()` bridge. The native UI uses semantic form controls, labels, status announcements and keyboard-operable actions. Meaningful learner actions emit `p2lrn:interaction` through the existing runtime-event envelope.

This contract does not change SCORM, H5P, cmi5, QTI, Common Cartridge, the Core graph, Host Adapter or package format.
