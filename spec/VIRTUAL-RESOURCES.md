> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN virtual resources and seekable embedded delivery

Status: experimental in Toolkit/Reading System 0.4.0a10. This is a host/Reading-System contract. It does not widen P2LRN Core 0.4.0 and does not put player code into `.p2lrn` packages.

## 1. Purpose

HTTP Range in Alpha 8 made the **outer** `.p2lrn` ZIP lazy. Alpha 9 adds the missing inner-resource bridge needed for two common cases:

1. a large embedded audio/video object needs a normal URL that a browser media element can byte-seek; and
2. passive HTML needs a stable base URL so its relative CSS, images, fonts and media can resolve without rewriting the portable graph.

The package still contains ordinary inventoried embedded payloads. A host exposes a verified URL view over those bytes when it has the capability to do so.

## 2. Host Adapter operation

Host Adapter v1 gains one optional backwards-compatible callback:

```js
resolveResourceUrl(request, context) -> null | {
  url: string,
  verified: true,
  seekable?: boolean
}
```

`verified: true` is not decoration. It is the host's assertion that the URL resolves to the exact P2LRN payload already authenticated against the package manifest. The reference player refuses a returned URL that is not explicitly marked verified.

For a normal embedded resource the request contains the inventoried path plus media type, size, byte/content digests, ZIP compression method and whether the ZIP entry itself is random-seekable. Audio/video requests can set `requireSeekable: true`.

For a passive web bundle the request uses `kind: "web-base"` and carries the representation id, logical entrypoint and logical directory. The returned URL is used only as the sandboxed document's `<base>`; every relative request still goes back through the host's mapped virtual-resource endpoint.

A host that does not implement this callback remains conformant. Normal small media falls back to the authenticated Blob path. A multi-file passive web bundle cannot claim complete relative-asset delivery without an equivalent verified bridge.

## 3. Physical ZIP seekability

Random access to an arbitrary uncompressed byte range is safe only when the member's compressed representation has a direct byte correspondence with its original bytes.

The reference packaging policy therefore uses ZIP method `0` (`stored`) for already-compressed or naturally stream-oriented payloads, including:

- `audio/*`;
- `video/*`;
- raster images;
- PDF;
- ZIP/gzip/7z/RAR payloads;
- WebAssembly.

Text, JSON, XML, SVG and similar material remain deflated by default.

This is a **physical packaging policy**, not Core semantics. Changing ZIP compression method does not change `contentRoot` when the logical P2LRN bytes/descriptors are otherwise identical.

The same policy is used by Creator builds and detached-delta reconstruction, so applying an update does not accidentally turn a seekable video back into a deflated member.

## 4. First-party Reader virtual endpoints

The reference Reader implements the host bridge with two loopback routes:

```text
/virtual/outer/<base64url embedded path>
/virtual/web/<base64url representation id>/<logical path>
```

The Reader fully validates the local package before serving it and records the package size/mtime identity. Every virtual lookup refuses to proceed if the package changes on disk after validation.

For a `stored` member, a client range `bytes=A-B` is translated directly to:

```text
outer ZIP offset = local-data-offset + A .. local-data-offset + B
```

No whole-member decompression or Blob materialization is required.

For a small deflated asset, the reference Reader may validate/decompress the complete member and then return the requested logical slice. Deflated virtual members above 64 MiB are rejected rather than silently buffering a large object. They should be rebuilt under the seekable packaging policy when byte-seek delivery is required.

The endpoint checks local/central ZIP method and filename agreement and rejects encrypted members before exposing raw stored bytes.

## 5. Passive web-content bundle mapping

A multi-file passive HTML representation uses the normal web-content profile plus a dedicated extension URI:

```text
https://p2lrn.org/extension/web-content-bundle
```

Mapping version `1` contains only data:

```json
{
  "version": "1",
  "entrypoint": "index.html",
  "assets": {
    "index.html": "assets/sha256/...",
    "styles/site.css": "assets/sha256/...",
    "images/diagram.png": "assets/sha256/..."
  }
}
```

Logical paths are relative, canonical and traversal-free. Every mapped target must already be an inventoried embedded payload. The representation's `location.path` must equal the mapped entrypoint payload.

This extension deliberately does **not** reuse the web-content profile URI as its extension key. Importers already use that profile namespace for preservation metadata (for example projected QTI `webcontent` resources), and those records must remain valid.

Creator command:

```bash
p2lrn-create add-web-content ./project ./lesson-web \
  --entrypoint index.html \
  --key lesson-web \
  --title "Interactive lesson"
```

The editable directory hierarchy is preserved as the logical asset map while the built package stores each payload by content address.

## 6. Sandboxing and network boundary

Passive HTML is still passive:

- iframe sandbox has no script/same-origin privileges;
- package-provided `<base>` elements are removed;
- a host-controlled `<base>` is inserted only for a validated bundle mapping;
- a restrictive CSP blocks scripts, connections, frames, objects and forms;
- remote origins are not enabled merely because HTML mentions them;
- only the host virtual origin plus bounded `data:`/`blob:` uses needed by passive content are allowed.

The virtual URL bridge is a delivery capability, not permission for a package to choose arbitrary filesystem/HTTP URLs.

## 7. Integrity boundary

There are two valid integrity strategies:

1. **Reference Reader:** validate the whole local package first, then expose exact bytes from that immutable validated file.
2. **Range-aware host:** authenticate the requested entry against manifest size/digests before claiming the returned virtual URL is `verified`.

A URL to bytes that have not been tied to the manifest MUST NOT be returned as `verified: true`.

The browser player records host-verified embedded paths separately from payloads it authenticated itself. This distinction avoids claiming that a browser fetched and hashed bytes that were actually validated by the host.

## 8. Remaining boundary

Alpha 10 adds the standardized reference static-browser path described in `STATIC-BROWSER-BRIDGE.md`. A site may install the standalone P2LRN Service Worker once; after that the player can resolve mapped passive-HTML assets and cryptographically verified byte-seekable stored media without an LMS endpoint. The player does not auto-replace an existing site Service Worker.

A package without Alpha-10 range-integrity metadata remains valid. It retains Alpha-8 lazy outer-ZIP reading and the Alpha-9 authenticated Blob/host bridge path, but it cannot claim independently verified arbitrary static seek.

Deflated members are still not claimed to support arbitrary random decompression from the middle of the compressed stream.
