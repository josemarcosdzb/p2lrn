> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN browser HTTP Range and ZIP64 transport

Status: implemented experimentally since Toolkit/Reading System 0.4.0a8; Alpha 9 adds the host virtual-resource bridge described in `VIRTUAL-RESOURCES.md`. This is a Reading System transport feature and does not widen P2LRN Core 0.4.0.

## 1. Goal

A browser must be able to open and navigate a very large `.p2lrn` without downloading the complete ZIP before it can inspect the package. Package size and runtime-module size are separate concerns: renderers remain host-installed, while HTTP Range avoids making the outer archive itself an eager download.

The reference player now has two archive transports with the same package-facing interface:

- `BufferZipArchive`: compatibility path for an already available `ArrayBuffer` or a small server that ignores Range.
- `RemoteZipArchive`: byte-range path for a URL that answers single HTTP byte ranges with `206 Partial Content`.

Both paths use the same manifest, graph, inventory and payload verification logic.

## 2. Remote open sequence

`openP2LRNPackageURL(url)` performs these steps:

1. request `Range: bytes=0-0` to learn the exact representation length and obtain a response validator;
2. request only the ZIP tail needed to locate EOCD;
3. when required, resolve the ZIP64 locator and ZIP64 EOCD record;
4. request the central directory only;
5. validate entry count, paths, methods, encryption flags, sizes, compression ratios and single-disk constraints;
6. request `META-INF/manifest.json` and `content/graph.json` only;
7. verify the graph bytes, manifest inventory, declared sizes, representation/profile references and `contentRoot`;
8. leave other payloads unread until a renderer actually selects them.

This means a multi-gigabyte archive can reach a safe structural/navigation state after reading only a small amount of data when its manifest, graph and central directory are small.

## 3. HTTP consistency rules

The Range transport requires byte-exact responses.

- A successful request must return `206` and a `Content-Range` matching the requested start, end and total length.
- A strong `ETag` is preferred as the `If-Range` validator. If no strong ETag is visible, `Last-Modified` is used when available.
- If a later request returns `200`, changes total length, or returns a different range, the open/read operation fails instead of combining bytes from different archive versions.
- HTTP content coding must be absent or `identity`; applying gzip/br to the ZIP response would make byte offsets ambiguous after Fetch decoding.
- A server that ignores Range may fall back to a bounded full download only when the response can be read within `packageBytes`. Unknown-length fallback is streamed into a bounded collector and is cancelled if it crosses that limit.

For cross-origin package URLs, the server must provide compatible CORS policy and expose `Content-Range` (and preferably `ETag`) so JavaScript can validate the response. Same-origin hosting needs no additional CORS exposure.

The first-party local Reader `/package.p2lrn` endpoint now implements single byte ranges, suffix ranges, `Accept-Ranges: bytes`, `206`, `416`, `Content-Range`, `ETag`, `Last-Modified` and `If-Range` behavior.

## 4. ZIP64

The browser transport now reads:

- classic EOCD;
- ZIP64 EOCD locator (`0x07064b50`);
- ZIP64 EOCD record (`0x06064b50`);
- ZIP64 Extended Information extra field (`0x0001`) for 64-bit uncompressed size, compressed size and local-header offset when the classic fields contain sentinel values.

Multi-disk ZIP/ZIP64 remains rejected. 64-bit values must fit JavaScript's safe integer range and the configured P2LRN browser safety limits.

ZIP64 support applies to both `openP2LRNPackageBytes()` and `openP2LRNPackageURL()`.

## 5. Lazy integrity model

Range mode does not claim that unread payload bytes have already been authenticated.

Initial `ready` means:

- central-directory structure/inventory checked;
- manifest parsed;
- graph bytes authenticated;
- graph semantics checked;
- `contentRoot` recomputed from the canonical manifest integrity input.

Every embedded payload is then authenticated when opened:

- ZIP uncompressed size and CRC;
- manifest `size`;
- manifest SHA-256 `byteDigest`;
- manifest `contentDigest` (including canonical JSON/JCS where applicable).

The UI labels Range mode as `Manifest/grafo verificados - payload bajo demanda` rather than claiming eager validation of bytes that were never fetched.

## 6. Payload API

A returned package exposes `payload(path)` with:

- `read()` - authenticated `Uint8Array`; intentionally bounded by `bufferedEntryBytes` for remote archives;
- `blob(type)` - binary payload streamed from the ZIP entry, incrementally SHA-256 checked, and exposed as a Blob only after complete verification;
- `stream()` - binary byte stream with size/SHA-256 verification at stream completion. Consumers must understand that bytes already consumed from a live stream cannot be retracted if the terminal integrity check fails.

Canonical JSON uses `read()` because its `contentDigest` is over JCS canonical form, not merely the original byte stream.

Without a host virtual-resource bridge, the built-in passive image/audio/video renderer uses `payload.blob()` in Range mode. With the Alpha 9 bridge, stored audio/video may instead receive a host-verified seekable URL while retaining Blob fallback for hosts that do not implement the bridge.

## 7. Large-media boundary

Alpha 8 solved **whole-package buffering**. Alpha 9 implements the next layer for hosts that opt in: a verified virtual-resource URL can expose a `stored` ZIP member as an ordinary byte-range resource, allowing native audio/video seek without materializing the complete member first. The first-party Reader implements this directly over the validated local ZIP.

The distinction remains important: ZIP method `0` has a direct byte mapping and is seekable; method `8` (`deflate`) cannot generally restart decompression from an arbitrary middle byte. The Creator therefore stores already-compressed media under a centralized seekability policy, and delta reconstruction preserves that same policy.

A static host that does not implement `resolveResourceUrl` keeps the Alpha-8 authenticated Blob fallback. See `spec/VIRTUAL-RESOURCES.md`.

## 8. Default browser limits

The 0.4.0a8 reference defaults are intentionally finite and host-overridable:

- full-buffer fallback package: 256 MiB;
- streamed outer archive: 64 GiB;
- one uncompressed ZIP entry: 16 GiB;
- one remote `read()` buffer: 256 MiB;
- total declared uncompressed bytes: 128 GiB;
- central directory: 64 MiB;
- entries: 5,000;
- maximum compression ratio: 250:1.

These are implementation safety limits, not P2LRN Core format maxima.

## 9. Conformance evidence in this repository

The Alpha 8 regression includes:

- real `206` reads against the first-party Reader server;
- lazy payload verification (graph first, activity payload only on demand);
- a virtual 3 GiB archive that opens through Range without allocating or serving the full archive;
- ZIP64 EOCD plus per-entry `0x0001` extended sizes/offsets through both buffer and Range paths;
- bounded fallback when Range is ignored;
- rejection when the HTTP representation changes between requests;
- incremental SHA-256 parity with Web Crypto;
- a binary payload forced above `bufferedEntryBytes` that succeeds through the streamed Blob path.
