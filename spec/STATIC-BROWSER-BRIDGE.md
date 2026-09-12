> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# Static browser bridge and range integrity

Status: experimental in Creator/Toolkit and Reading System 0.4.0a10. P2LRN Core remains 0.4.0.

## Goal

A plain HTTP(S) host should be able to serve one `.p2lrn` file and let the browser seek inside a large embedded audio/video resource without first downloading and hashing the complete media object.

Whole-file `byteDigest` is insufficient for that guarantee: a browser cannot authenticate an arbitrary middle byte range against a whole-file SHA-256 without reading the whole file. Alpha 10 therefore adds an optional derived range-integrity map plus a root-scoped Service Worker bridge.

## Range-integrity map

Creator emits `org.p2lrn.rangeIntegrity` in graph extensions when a package contains embedded seekable audio/video. The extension points to one inventoried JSON payload with media type `application/vnd.p2lrn.range-integrity+json`.

The map contains:

- fixed version `1`;
- algorithm `sha256`;
- chunk size (reference Creator: 1 MiB);
- for each protected embedded payload: exact size, whole-file byteDigest and ordered SHA-256 digest per chunk.

The map itself is an ordinary inventoried P2LRN payload and therefore participates in `contentRoot`. The validator requires every protected target to be `ZIP_STORED`, checks map/manifest metadata equality and recomputes every chunk digest.

Older packages without this extension remain valid and readable. They simply cannot claim independently verified static random seek and use the existing authenticated Blob/host bridge path.

## Service Worker

`p2lrn-sw.js` is intentionally standalone. A static deployment installs it once at a scope that controls the page, normally the site root:

```js
import {installP2LRNServiceWorker} from '/p2lrn/static-resource-bridge.js';
await installP2LRNServiceWorker({url: '/p2lrn-sw.js', scope: '/'});
```

The installer refuses to silently replace a different Service Worker that already owns the requested scope. Sites with an existing application Service Worker should integrate the P2LRN fetch/message contract into that worker instead of replacing it.

After installation, `<p2lrn-player>` detects the controlling P2LRN worker automatically. The player registers only verified package metadata and logical resource mappings. No package JavaScript is executed.

## Range delivery

For a protected stored member and a virtual request such as:

```http
Range: bytes=1100000-1160000
```

the worker:

1. validates the ZIP local header and embedded path;
2. determines the integrity chunks covering the requested interval;
3. fetches complete covering chunks from the outer `.p2lrn` with HTTP Range;
4. SHA-256 verifies each complete chunk;
5. returns only the requested sub-range with `206`, `Content-Range`, `Accept-Ranges` and an ETag derived from the whole payload byteDigest.

This makes verification bounded by chunk size rather than whole-media size.

## Passive HTML assets

The same worker can serve mapped web-content bundle resources. Stored media with a chunk map is seekable. Small stored or deflated assets without a chunk map are fetched completely, decompressed when required, checked against their manifest `byteDigest`, then returned. Large unprotected resources are refused rather than silently buffered without a bound.

## Security boundary

- the static bridge is same-origin only;
- package inventory, graph and range-index payload are validated by the player before registration;
- virtual resources are keyed by a route derived from package URL, contentRoot and representation/resource identity;
- stored-range bytes are never marked verified until all covering chunks pass SHA-256;
- deflated/random-middle seek is not claimed;
- the installer never automatically evicts another Service Worker;
- an Alpha 9 or older package without chunk integrity remains supported but cannot gain a false `verified + seekable` claim.

## Relationship to host adapter

A platform-provided `resolveResourceUrl` remains authoritative and is tried first. The static Service Worker is only the browser-host fallback when no host callback exists. Host Adapter v1 is unchanged.
