# P2LRN Verified Package Cache v1

Status: experimental Reading-System capability. It does not change P2LRN Core 0.4.0 or place learner state inside the package.

## Purpose

A host may explicitly cache a complete, already verified `.p2lrn` so the same source can be reopened when the network is unavailable. Package bytes and learner state remain separate stores: the package cache contains course bytes; Offline Host Adapter contains learner/session state and its outbox.

The reference cache is opt-in. P2LRN does not silently persist every course opened by a learner.

The standard browser cache uses the fixed name `p2lrn-package-cache-v1` so the P2LRN Service Worker can serve verified package members while offline. A host may supply another `P2LRNPackageCache` implementation or another CacheStorage name for package-level reopening, but passive web/package-member playback through the standard Service Worker uses the standard cache name unless the host supplies its own resource bridge.

## Security and integrity

`cacheP2LRNPackageURL()` downloads a bounded full package, opens it through the normal P2LRN verifier and only stores it after manifest, graph and package integrity checks succeed. A cached package is verified again when reopened. Cache metadata is therefore never treated as proof of package integrity.

The default full-buffer cache uses the existing `DEFAULT_LIMITS.packageBytes` safety limit. Large streamed packages may use a host-provided `P2LRNPackageCache` implementation with a different bounded storage policy; the Core format is unchanged.

Package cache records contain package bytes plus package ID, content root, source URL and cache time. They do not contain learner identity, grades, credentials, MCP configuration or private state.

## Browser API

```js
const cache = P2LRN.createCacheStoragePackageCache();

const saved = await P2LRN.cachePackageURL('/courses/algebra.p2lrn', {
  store: cache
});

player.packageCache = cache;
// Normal src loading is network-first and falls back to the verified cache.
player.src = '/courses/algebra.p2lrn';

// Or reopen explicitly by immutable content identity.
await player.loadCachedPackage(saved.contentRoot);
```

`openPackageURL(url, {packageCache})` preserves the original logical source URL. This matters for passive HTML/web-bundle resources: the static-resource Service Worker can resolve ZIP ranges from the verified package cache when the original same-origin source is offline.

## Relationship with offline sync

Package cache answers: **can I still open the course bytes?**

Offline Host Adapter answers: **can I keep learner state/events while disconnected and synchronize them later?**

Both are optional and independent. A deployment can use either or both.

## Eviction

Storage quotas and retention are host policy. The cache exposes `list()`, `deleteByUrl()`, `deleteByContentRoot()` and optional `clear()`; the package cannot prevent host eviction.
