# xAPI Runtime Intent Contract

Status: opt-in runtime statement-intent integration.

P2LRN does not store learner xAPI statement history, LRS credentials, actor identity or authority inside the portable course package.

## Authoring declaration

A P2LRN Activity may declare:

`extensions["https://p2lrn.org/profile/xapi"]`

with:

- `version: "2.0"`;
- stable `activityId`;
- optional xAPI Profile IRI;
- optional verb overrides for initialized, answered, scored and completed events.

The public Authoring API exposes `setXapiActivity()` so Studio does not need to mutate project internals.

## Runtime intents

When an opted-in Activity emits supported P2LRN runtime events, the Player derives a portable statement intent containing:

- timestamp;
- verb;
- Activity object;
- portable result fields;
- P2LRN package/entity/resource context.

The intent deliberately does not contain:

- actor;
- authority;
- LRS endpoint;
- LRS credentials;
- access token;
- learner statement history.

The host receives the intent through optional Host Adapter callback:

`emitXapiStatementIntent(intent, context)`

and is responsible for adding deployment/session identity, registration when applicable, authority and LRS transport.

## cmi5 exclusion

cmi5 runtime events do not generate these generic xAPI intents. cmi5 statement rules remain authoritative to the cmi5/LMS/LRS session, preventing duplicate normative statements.

## Gates

`packages/toolkit/test/xapi-intent.test.mjs` verifies declaration validation, event mapping, score/result projection, absence of actor/authority/endpoint and cmi5 exclusion.

`packages/toolkit/test/authoring-studio-boundary.test.mjs` verifies that a typed xAPI Activity declaration survives authoring/build and causes the xAPI profile to be declared in the package.
