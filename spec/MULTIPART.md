# P2LRN Multipart Payload Profile

Status: experimental profile for P2LRN Core 0.4.0.

## Purpose

Multipart solves hosting limits on individual file size without turning the P2LRN CDN into a content store.

A publisher may keep:

```text
/courses/course/
├── course.p2lrn
├── course.part001
├── course.part002
└── course.part003
```

All files remain on the publisher's own origin. The shared P2LRN CDN supplies only generic runtime code.

## Representation model

The representation keeps its semantic profile and logical media type. For example, a SCORM representation remains:

```json
{
  "profile": "https://p2lrn.org/profile/scorm",
  "mediaType": "application/zip"
}
```

Its `location` points to a small embedded multipart descriptor:

```json
{
  "location": {
    "type": "embedded",
    "path": "multipart/scorm.json"
  },
  "extensions": {
    "https://p2lrn.org/profile/multipart": {
      "version": "1"
    }
  }
}
```

The descriptor is inventoried in the outer manifest as
`application/vnd.p2lrn.multipart+json` and conforms to
`https://p2lrn.org/schema/multipart/1`.

Example descriptor:

```json
{
  "version": "1",
  "mediaType": "application/zip",
  "size": 73400320,
  "byteDigest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "parts": [
    {
      "href": "course.part001",
      "size": 26214400,
      "byteDigest": "sha256:..."
    },
    {
      "href": "course.part002",
      "size": 26214400,
      "byteDigest": "sha256:..."
    },
    {
      "href": "course.part003",
      "size": 20971520,
      "byteDigest": "sha256:..."
    }
  ]
}
```

## URL resolution

Every `href` is a safe relative path and is resolved against the URL of the outer
`.p2lrn` file.

If the package is loaded from:

```text
https://academy.example/courses/course/course.p2lrn
```

then `course.part001` resolves to:

```text
https://academy.example/courses/course/course.part001
```

The format does not redirect payload ownership to `p2lrn.netlify.app` or any
other P2LRN-operated service.

## Integrity

Readers MUST:

1. fetch parts in descriptor order;
2. enforce the declared size of every part;
3. verify each part SHA-256;
4. concatenate only verified bytes;
5. verify the final logical payload size;
6. verify the final logical payload SHA-256;
7. expose the logical payload to the semantic renderer only after verification.

The descriptor itself is inside the verified P2LRN graph/manifest closure, so an
attacker cannot replace the part list or digests without invalidating the outer
package.

## Semantics

Multipart is transport only. The reconstructed bytes are handed to the same
renderer that would have received an embedded payload:

- H5P remains H5P;
- SCORM remains SCORM;
- cmi5 remains cmi5;
- QTI remains QTI;
- Common Cartridge remains Common Cartridge;
- legacy Tin Can remains legacy Tin Can;
- native or future binary profiles can use the same transport where appropriate.

## Packaging guidance

A practical default part size for constrained shared hosting is 25 MiB. A
publisher MAY choose another size according to its hosting limits. Part size is
not a format constant.

For a 50,000 KiB upload limit, 25 MiB parts leave sufficient margin for hosting
control-panel overhead and future metadata growth.

## Failure behavior

Missing parts, cross-origin substitutions, unsafe relative paths, incorrect
sizes, incorrect per-part digests and incorrect final digest are fatal delivery
errors. Readers MUST NOT silently continue with partial content.
