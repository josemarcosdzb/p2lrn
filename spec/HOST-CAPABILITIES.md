# P2LRN Host Capabilities v1

Status: experimental Reading-System contract. It is additive to P2LRN Core 0.4.0 and does not add fields to the Core manifest.

## Boundary

P2LRN already uses Profile/Capability documents to describe what a processor can validate, read, preserve or deliver. Host Capabilities are a different concept: they are trusted services made available by the embedding application at runtime.

A package never contains a provider implementation, MCP endpoint, API key, user token, database password or other deployment secret. It only declares semantic needs. The host selects the provider and remains responsible for authentication, authorization, privacy and rate limiting.

The reference extension identifier is:

`https://p2lrn.org/ext/host-capabilities/1`

It may appear in `extensions` on Course, Activity or Resource entities. Existing Core 0.4.0 processors can preserve this extension without changing the closed Core manifest schema.

## Declaration

```json
{
  "extensions": {
    "https://p2lrn.org/ext/host-capabilities/1": {
      "version": "1",
      "requests": [
        {
          "id": "ai.tutor",
          "required": false,
          "operations": ["explain", "hint"],
          "context": ["current_question", "attempts"],
          "fallback": "static-explanation"
        }
      ]
    }
  }
}
```

Course, Activity and Resource declarations are merged by capability ID. `required` is monotonic (if any scope requires it, it is required) and operation/context lists are unioned.

Capability IDs, operation IDs, context keys and fallbacks are semantic tokens such as `ai.tutor`, `hint` or `current_question`; they are not URLs, tool endpoints or provider addresses. The reference implementation bounds declarations to 128 requests, 64 operations per request and 64 context keys per request. Tokens are limited to 128 characters and descriptions to 2048 characters. These bounds are part of the runtime security model so package-authored declarations cannot become an unbounded transport/configuration channel.

An optional capability that is unavailable must not make otherwise portable content fail. A required capability that is unavailable must fail explicitly rather than silently pretending that the missing semantics were delivered.

## Authoring without provider coupling

Studio/authoring code may declare semantic requirements through the existing entity extension boundary:

```js
doc.setHostCapabilities(activityId, [
  {id:'ai.tutor', operations:['hint','explain'], context:['current_question'], required:false, fallback:'static-help'}
]);
```

This writes only the extension declaration. It does not add a provider, endpoint, credential or new Core manifest field. Empty requests remove the declaration.

## Trusted broker

The browser/npm Player exposes a host-side `CapabilityBroker`. Providers are registered by trusted application code, not package content.

```js
const broker = P2LRN.createCapabilityBroker({
  authorize: ({capabilityId, operation, context}) =>
    myPolicyAllows(capabilityId, operation, context),
  providers: [{
    id: 'ai.tutor',
    operations: ['explain', 'hint'],
    async invoke(operation, input, context) {
      return myTrustedProvider.invoke(operation, input, context);
    }
  }]
});

player.capabilityBroker = broker;
```

Authorization is deny-by-default. Provider availability and authorization are separate decisions.

A renderer can only call a capability declared by the current Course/Activity/Resource. The Player rejects undeclared calls with `P2LRN_CAPABILITY_UNDECLARED`.

## MCP binding

MCP is a valid host-side provider binding but is not the P2LRN wire contract. A host may map:

- `ai.tutor` to one or more MCP tools;
- `search.library` to an AulaP2P MCP server;
- `speech.tts` to a local Paula service;
- `data.query` to a restricted data broker;
- `collaboration.room` to a WebSocket service.

The `.p2lrn` file does not know the MCP URL, transport, credentials or model vendor. This preserves portability and permits local, cloud or non-AI implementations of the same semantic capability.

A host that already has an MCP/tool client can use the transport-neutral mapping helper:

```js
const tutor = P2LRN.createMcpCapabilityProvider({
  id:'ai.tutor',
  tools:{
    hint:'tutor.hint',
    explain:'tutor.explain'
  },
  callTool:(tool,input,context) => myMcpClient.callTool(tool,input,{context})
});

const broker=P2LRN.createCapabilityBroker({
  providers:[tutor],
  authorize:policyAllows
});
```

The mapping belongs to trusted host configuration. It is not serialized into the course, so an institution may map the same `ai.tutor.hint` operation to Paula, Cerebro, an MCP server, a local model or a deterministic service.


## Security rules

1. Package content cannot register a provider or change the authorization policy.
2. Provider credentials never enter package bytes or activity-visible context.
3. Context released to a provider is selected by trusted host/rendering code; a declaration is a request, not permission.
4. Capability invocation is not a general-purpose arbitrary MCP tool call. The broker exposes only registered capability IDs and operations.
5. Renderers receive negotiated status plus the restricted `invokeCapability()` bridge; the raw broker object is not passed into renderer context. Existing sandboxed SCORM/H5P/package runtimes do not gain direct broker access merely because the Player has a broker.


## Trusted semantic context projection

Capability `context` entries are requests for semantic keys, not values and not permission to read host state. A trusted host may set:

```js
player.capabilityContextResolver = async ({capabilityId, operation, requested, systemContext, input}) => ({
  'activity.objectives': await objectivesFor(systemContext.entityId),
  current_question: await currentQuestionFor(systemContext.entityId)
});
```

The Player applies `projectCapabilityContext()` and releases only keys explicitly declared by the negotiated capability request. Extra fields accidentally returned by host code are dropped. Providers receive the projected values under `context.capabilityContext`; package content never receives the resolver or the raw host context.

The native `capability-action` component can additionally declare `restrictions` such as `revealAnswer`, `allowExternalKnowledge` and bounded `maxOutputChars`. Package restrictions can narrow an activity's requested behavior but cannot grant provider permissions or override host authorization.

`createMcpCapabilityProvider()` is a named alias of the transport-neutral tool provider for hosts that bind semantic P2LRN operations to an MCP client. The MCP URL, credentials and tool transport remain outside the package.

Official state/result ingestion and offline idempotency are demonstrated separately by the reference Authoritative Host in `AUTHORITATIVE-HOST.md`.
## Runtime event

Negotiation emits `p2lrn:capability` using the existing `runtime-event/1` envelope. It reports requested/available capability IDs and blocked required capabilities. It must not include provider secrets.

## Reference collaboration binding

The first-party browser API includes `createMemoryCollaborationHub()` as a deliberately small reference host. It proves the contract without making P2LRN depend on a transport:

```js
const hub = P2LRN.createMemoryCollaborationHub();

const broker = P2LRN.createCapabilityBroker({
  providers: [hub.provider({participantId: hostOpaqueLearnerId})],
  authorize: ({capabilityId}) => capabilityId === 'collaboration.room'
});

await P2LRN.mount('#course', {
  src: '/course.p2lrn',
  capabilityBroker: broker
});
```

A production host replaces only the provider. The package and component continue invoking the same five semantic operations. WebSocket, SSE, long-poll, a local process or a clustered service are host implementation details.
