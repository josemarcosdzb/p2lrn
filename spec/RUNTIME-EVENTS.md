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

Reference events currently include `p2lrn:ready`, `p2lrn:activityready`, `p2lrn:rendered`, `p2lrn:answer`, `p2lrn:progress`, `p2lrn:statechange`, `p2lrn:timeupdate`, `p2lrn:timeout`, `p2lrn:score`, `p2lrn:complete`, `p2lrn:progressionchange`, `p2lrn:xapi`, `p2lrn:navigation`, `p2lrn:capability`, `p2lrn:attempt`, `p2lrn:interaction`, opt-in `p2lrn:attention`/`p2lrn:active-time`, and `p2lrn:error`. Not every renderer emits every family.

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


## 6. Metrics extraction boundary

The host should treat state, score and event history as separate concerns:

- `loadState` / `saveState` are the resume snapshot for one activity/progression surface;
- `reportScore` is a normalized score channel and may be invoked multiple times by runtimes that commit repeatedly;
- `emitEvent` is the ordered event stream suitable for analytics/audit;
- progression state is stored separately as `p2lrn-progression-state/1`.

Portable `context` identifies package/content/entity/representation/renderer. Learner identity, enrolment and attempt ownership remain host data. A durable host key should combine its learner/attempt identifiers with the relevant P2LRN context, normally including `contentRoot` so state is not restored silently onto another content revision.

Native questionnaire scores expose `graded`, `raw`, `max`, `normalized` and per-question entries containing `questionId`, `graded`, `correct`, `hits`, `errors`, `pointsAwarded` and `pointsPossible`. Questionnaire `p2lrn:progress` is activity-local progress, not course progression.

SCORM state preserves the CMI key/value model. Score forwarding is derived from the available CMI score/status fields. SCORM interactions/objectives remain available through the saved CMI state when the SCO writes them.

H5P `p2lrn:xapi` payloads remain content-generated input and are marked `authoritative:false`. A host forwarding statements to an LRS must rebuild actor, authority, registration/attempt and other platform-owned fields server-side.

The event timestamp is runtime time. Hosts that need audit-grade ingestion time should additionally stamp events on receipt. The runtime-event envelope does not define a durable database event id; retry/idempotency policy belongs to the host.


## 7. Attention and active time

The reference Player does not enable human-activity tracking automatically. A host may opt in with `player.startActivityTracking()` or `mountP2LRN(..., {activityTracking: ...})`.

The tracker observes only coarse signals needed to distinguish active use from an open but inactive tab: document visibility, window focus and the occurrence of pointer, keyboard, touch or wheel interaction. By default those interaction signals are scoped to the Player element, so unrelated host-page interaction does not keep the course active. It does not record key values, typed text, pointer coordinates or other interaction content.

`p2lrn:attention` reports state transitions (`visible`, `focused`, `idle`, `active`) and accumulated active milliseconds. `p2lrn:active-time` is emitted when tracking stops. The idle threshold is configurable; the reference default is 60 seconds and is not a package-level pedagogical rule.

These runtime measurements are evidence, not identity proof. A host that stores them remains responsible for privacy notices, retention and any policy about how they affect analytics or assessment.

## 8. Host capability negotiation

`p2lrn:capability` reports negotiation of the additive Host Capability extension. It uses the same `runtime-event/1` envelope and contains package-declared requests plus availability/blocking results. Provider endpoints, credentials and secret configuration must never be included in this event.

See `HOST-CAPABILITIES.md`.

## 9. Offline forwarding

`createOfflineHostAdapter()` may queue `emitEvent` calls while disconnected and replay them later in their stored order. This does not change the event envelope or place learner event history inside the package. See `OFFLINE-SYNC.md` for ACK/retry and duplicate-delivery limitations.


## 10. Rich pedagogical interactions

`p2lrn:interaction` is the reference family for meaningful learning actions that are more detailed than score/progress but do not deserve a new transport or persistence API.

The first-party runtime currently emits privacy-bounded actions including:

- `answer-change`: a learner changed an already populated questionnaire answer. The interaction event records question identity/type and whether the new answer is meaningful; it does not duplicate free-text answer contents.
- `media-play`, `media-pause`, `media-seek`, `media-ended`: coarse audio/video behavior with media time rounded to tenths of a second.
- `resource-open`: a verified representation was successfully selected and rendered, with portable resource/representation/renderer identifiers and media type.
- collaboration actions such as vote, board contribution and peer-review submission/comment.

Raw pointer coordinates, key values and typed text are not part of this generic analytics family. The authoritative activity state may still contain learner-authored content where required for resume/assessment; analytics consumers should not infer that every state field is appropriate for behavioral telemetry.


## 11. Native assessment attempts

Native questionnaires emit `p2lrn:attempt` with explicit phases instead of inferring an attempt from answer events:

- `started`: a new native questionnaire attempt begins;
- `resumed`: persisted state for an unfinished attempt is restored;
- `submitted`: the attempt is finalized, with attempt number, completion reason, answered/total counts and normalized score summary.

The attempt event deliberately omits raw learner answers. Other activity families MUST NOT reuse these questionnaire semantics unless their own attempt lifecycle is explicitly defined.
