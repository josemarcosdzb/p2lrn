> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Runtime Events and Host Adapter v1

Status: experimental Reading-System contract. It does not add learner event history to P2LRN Core packages.

## 1. Event envelope

Every reference-runtime event has a transport-neutral envelope:

```json
{
  "schema": "https://p2lrn.org/schema/runtime-event/1",
  "version": "1",
  "type": "p2lrn:complete",
  "timestamp": "2026-09-08T21:00:00.000Z",
  "context": {
    "packageId": "urn:uuid:...",
    "contentRoot": "sha256:...",
    "entityId": "urn:uuid:...",
    "resourceId": "urn:uuid:...",
    "representationId": "urn:uuid:...",
    "rendererId": "https://p2lrn.org/renderer/questionnaire/standard"
  },
  "payload": {}
}
```

Schema: `https://p2lrn.org/schema/runtime-event/1`.

The DOM CustomEvent name remains the event `type`. For compatibility, the reference player keeps previous payload fields directly on `event.detail` and additionally exposes the canonical envelope as `event.detail.event`.

## 2. Event families

Reference events currently include `p2lrn:ready`, `p2lrn:activityready`, `p2lrn:answer`, `p2lrn:progress`, `p2lrn:statechange`, `p2lrn:timeupdate`, `p2lrn:timeout`, `p2lrn:score`, `p2lrn:complete`, `p2lrn:rendered` and `p2lrn:error`.

The envelope is deliberately not xAPI or Caliper. A host may map the same event to xAPI, Caliper, local analytics or no persistent event log at all.

## 3. Host Adapter v1

Trusted host code may attach an adapter:

```js
const adapter = P2LRN.createHostAdapter({
  version: "1",
  loadState: async (context) => null,
  saveState: async (state, context) => {},
  reportScore: async (score, context) => {},
  emitEvent: async (event, context) => {},
  resolveResourceUrl: async (request, context) => null
});
```

All callbacks are optional. Unknown adapter versions or non-function callback values are rejected. `resolveResourceUrl` was added compatibly in 0.4.0a9 without changing Host Adapter version 1; it is a trusted delivery bridge for verified virtual inner-package resources and is specified in `VIRTUAL-RESOURCES.md`.

`emitEvent` calls are serialized in event order by the reference runtime. A forwarding failure produces `p2lrn:error` locally and does not recursively forward that generated error through the failing adapter.

## 4. Security and privacy boundary

The adapter belongs to the trusted host, never to untrusted package content. A `.p2lrn` cannot provide an adapter callback, endpoint credential or arbitrary event-upload URL.

User identity, enrolment, attempt ownership, credentials and durable event history remain host/runtime concerns. Portable event context uses package/graph identities rather than AulaP2P or LMS database IDs.

## 5. Nested activities

Composite activities and their children use the same event envelope. `context.entityId` identifies the activity that emitted an event. A composite only accepts events from its direct children and sequence mode accepts completion/score only from its current child, preventing out-of-order child events from advancing a linear block.
