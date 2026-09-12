> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN 0.4.0 Round-trip Model

P2LRN distinguishes three different round-trip claims. They MUST NOT be conflated.

## 1. Source-package preservation round-trip

```text
SCORM/H5P/QTI/IMSCC/...
 -> P2LRN
 -> recover preserved source
```

When `preservation=bit-exact`, the recovered source bytes MUST have the same SHA-256 as the original input package.

This proves preservation, not semantic conversion quality.

## 2. Neutral P2LRN logical round-trip

```text
P2LRN producer A
 -> generic Core reader
 -> generic Core writer B
 -> P2LRN
```

The physical ZIP, JSON whitespace, ZIP timestamps and `packageId` MAY differ.

For a lossless neutral repack, `contentRoot` MUST remain identical and all preservable payload bytes MUST survive unchanged.

The Node/TypeScript `p2lrn-repack` implementation demonstrates this without knowing SCORM/H5P/cmi5/QTI internals.

## 3. LMS semantic round-trip

```text
LMS A native model
 -> P2LRN
 -> LMS B native model
 -> P2LRN
```

This is the strongest interoperability claim and is not yet complete in 0.4.0.

A profile-aware semantic round-trip must compare, for the declared supported feature set:

- portable identities;
- hierarchy and ordering;
- relations;
- resource identity and digests;
- profile semantics;
- accessible alternatives;
- objectives/alignments;
- preserved opaque payloads;
- transformation losses/warnings.

Local database IDs are expected to differ.

## 4. Loss accounting

A round-trip tool MUST separate:

```text
exactly preserved
semantically projected
opaque but recoverable
irreversibly lost
```

Only the final category is a true transformation loss.

A processor cannot claim `Round-Trip` for a feature it silently discards.

## 5. Required future 1.0 gate

Before P2LRN can reasonably claim mature interoperability, the same conformance corpus should pass through at least two independent implementations and include a real LMS A -> P2LRN -> LMS B -> P2LRN semantic comparison.


## 6. Editable authoring round-trip

For the course-authoring surface, P2LRN additionally tests:

```text
canonical course.p2lrn
 -> @p2lrn/toolkit/authoring open
 -> editable project 0.3.0
 -> no changes
 -> build
 -> rebuilt.p2lrn
```

The no-op result MUST preserve the original `contentRoot`, imported portable entity/representation identities, entrypoints, entity order, profile declarations and opaque package payloads. This is stronger than merely opening the package in a Reader, but it does not require the ZIP bytes or generated `packageId` to be identical.

If an author changes semantic content, the `contentRoot` is expected to change while unaffected imported portable IDs remain stable. For preserved SCORM/H5P/cmi5/QTI source packages, wrapper edits MUST NOT rewrite the nested source bytes.
