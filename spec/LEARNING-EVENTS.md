# P2LRN Learning Events v1

Status: experimental Reading-System/Host contract. It does not place learner history inside the portable package.

## Purpose

`runtime-event/1` remains the canonical live event envelope emitted by Player/renderers. Learning Event v1 is a normalized host-side projection for analytics, audit and offline queues. It adds an event id, monotonic sequence, category and optional opaque session/attempt identifiers without changing the original runtime payload.

Schema: `https://p2lrn.org/schema/learning-event/1`.

## Categories

The reference projection classifies known runtime events into: `lifecycle`, `navigation`, `assessment`, `progress`, `completion`, `state`, `timing`, `attention`, `media`, `interop`, `capability`, `collaboration`, `adaptation` and `error`. Unknown valid `p2lrn:*` events remain legal and use `extension`.

The classification is intentionally smaller than xAPI. A host may map these events to xAPI/Caliper or its own analytics model.

## Privacy boundary

The portable event context contains package/graph identifiers. Learner identity, enrolment and authoritative attempt ownership are injected only by trusted host storage/transport. The package never receives server credentials or private learner history.

## Player API

`P2LRN.createLearningEvent(runtimeEvent, options)` converts one canonical runtime event.

`P2LRN.createLearningEventStream({sessionId, attemptId, onEvent})` assigns monotonic sequence values.

`P2LRN.observeLearningEvents({target: player, ...})` listens to the Player's runtime events and creates the normalized stream.

Current native questionnaires emit `p2lrn:attempt` phases plus privacy-bounded `p2lrn:interaction` actions. Media behavior is represented by `p2lrn:interaction` actions such as `media-play`, `media-pause`, `media-seek` and `media-ended`; resource consultation uses `resource-open`, and collaboration uses `collaboration-*`. The projection classifies those semantic actions without copying raw learner answers into generic analytics. Attention tracking remains opt-in.

## Offline

Learning events can be passed through the existing Host Adapter and Offline Host Adapter. The stable `offlineDeliveryId` remains the transport idempotency key. Learning Event `id` is an analytics event identifier; it does not weaken or replace the offline delivery ACK contract.
