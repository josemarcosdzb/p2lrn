> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN 0.4.0 Integrity

## 1. File digests

For every graph or file descriptor:

```text
byteDigest = "sha256:" + hex(SHA-256(exact stored bytes))
```

For JSON media types:

```text
contentDigest = "sha256:" + hex(SHA-256(JCS(parsed JSON)))
```

For non-JSON media types in Core 0.4.0:

```text
contentDigest = byteDigest
```

`JCS` means RFC 8785 JSON Canonicalization Scheme.

## 2. Normalized integrity input

To calculate `manifest.integrity.contentRoot`, construct this JSON object exactly:

```json
{
  "format": "P2LRN",
  "formatVersion": "0.4.0",
  "entrypoints": [],
  "graph": {
    "schema": "...",
    "mediaType": "application/json",
    "contentDigest": "sha256:..."
  },
  "profiles": [],
  "files": []
}
```

Normalization rules:

1. `packageId` MUST NOT be included.
2. `entrypoints` MUST contain only `id`, `type` and `role` and MUST be sorted by the UTF-16 lexical order of `role`, then `type`, then `id`.
3. `graph` MUST contain only `schema`, `mediaType` and `contentDigest`.
4. `profiles` MUST contain only `id`, `version` and `requirement`, sorted by `id`, then `version`, then `requirement`.
5. `files` MUST contain only `path`, `mediaType` and `contentDigest`, sorted by `path`.
6. No `byteDigest`, `size`, ZIP metadata or timestamps are included.
7. The normalized object is serialized with RFC 8785 JCS.
8. `contentRoot` is SHA-256 of the resulting JCS bytes.

Formula:

```text
contentRoot = "sha256:" + hex(SHA-256(JCS(normalizedIntegrityInput)))
```

## 3. Consequences

The following MUST NOT change `contentRoot` by themselves:

- ZIP compression level;
- ZIP entry order;
- ZIP timestamps;
- JSON insignificant whitespace;
- JSON object member order;
- `packageId`.

The following MUST change `contentRoot`:

- semantic graph changes;
- entrypoint changes;
- profile declaration changes;
- addition/removal of an inventoried payload;
- logical payload changes.

## 4. Signature boundary

Core 0.4.0 does not define an embedded signature profile and continues to reserve/reject signature payloads rather than freeze a circular design prematurely.

Toolkit 0.4.0a7 implements an **experimental detached Ed25519 sidecar** (`.p2lrn.sig`). Its canonical input signs `contentRoot` plus Core identity fields, with an optional package scope that also binds `packageId`; it never treats the compressed ZIP byte stream as the sole semantic signature target. Cryptographic validity and host trust are reported separately.

This sidecar does not change Core conformance or `contentRoot`. See `DETACHED-SIGNATURES.md`.
