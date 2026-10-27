# P2LRN Shared Resources by Digest

Status: experimental delivery contract built on existing Core 0.4.0 remote representations and Host Adapter v1.

## Reuse the Core location model

Core 0.4.0 already permits:

```json
{
  "role": "primary",
  "mediaType": "video/mp4",
  "location": {
    "type": "remote",
    "href": "https://publisher.example/resources/video.mp4",
    "expectedDigest": "sha256:..."
  }
}
```

No new `location.type` is introduced for a content-addressed store.

For shared-library delivery, `expectedDigest` is mandatory in the first-party Player. The original `href` is metadata/input to trusted host resolution; the Player does not navigate to it directly.

## Host-verified resolution

A host may resolve the resource through existing `resolveResourceUrl(request, context)`. For remote resources the request contains `kind:'remote'`, `href`, `expectedDigest`, media type and purpose.

The host must verify that the bytes it exposes correspond to the declared digest and return:

```js
{url: 'https://host.example/verified/...', verified: true, seekable: true}
```

The Player rejects unverified results. Audio/video delivery additionally requires a seekable verified URL in the reference remote-media renderer.

This allows the host to implement a content-addressed store such as `sha256:<digest> -> one verified object` without putting database credentials or a private storage URL in the package.

## Portable fallback

A publisher may include both a remote primary representation and an embedded fallback representation for the same Resource. If the trusted remote resolver is unavailable or refuses the object, renderer negotiation can fall back to the embedded representation.

This yields one P2LRN format with two deployment modes rather than separate portable/connected formats.

## Trust boundary

`verified:true` is a host attestation. The Player does not treat an arbitrary network URL as verified merely because a package supplied `expectedDigest`. Hosts that implement a shared resource library must perform digest verification before exposing the resolved URL.

## First-party lightweight reference store

The browser API exposes `createMemorySharedResourceStore()` to prove content-addressed deduplication without requiring a storage product. `put(bytes)` computes SHA-256 and stores one byte object per digest. The same store can be connected directly to Host Adapter v1:

```js
const resources = P2LRN.createMemorySharedResourceStore();
const saved = await resources.put(videoBytes, {mediaType:'video/mp4'});

const adapter = P2LRN.createHostAdapter({
  resolveResourceUrl: (request) => resources.resolve(request)
});
```

Studio can author the corresponding remote representation with a logical URL, media type and `expectedDigest`. The memory store is for tests/local/reference use; a production catalog may persist the same digest contract in filesystem, object storage or another host-managed store. The `.p2lrn` remains unchanged.

## Persistent/searchable reference resource library

The browser SDK also provides a first-party resource-library layer:

- `createMemoryResourceLibrary()`
- `createCacheStorageResourceLibrary()`
- `createResourceLibraryResolver()`
- `createResourceLibraryCapabilityProvider()`
- `verifyResourceBytes()`

Entries are keyed by `sha256:<digest>`. `createCacheStorageResourceLibrary()` persists verified bytes across browser sessions where Cache Storage is available. `resource.library` exposes metadata-only `search`, `describe` and `has` operations; bytes stay behind the verified resolver boundary.

A Player may use `player.resourceResolver = resolver` or `mountP2LRN(...,{resourceResolver:resolver})`. The resolver checks local verified content before network retrieval and verifies SHA-256 before inserting a miss.

Studio supports both manual URL+digest authoring and an optional connected library picker. The npm Studio Web Component accepts a `resourceLibrary` object exposing `list()` and `get()`. The standalone Studio accepts the equivalent host hook through `globalThis.P2LRNStudioResourceLibrary` / `P2LRNStudioSetResourceLibrary()`. `materializeSharedResource()` can add an embedded fallback to the same Resource without creating a second format.

Production multi-user catalog persistence and authorization remain host deployment concerns.