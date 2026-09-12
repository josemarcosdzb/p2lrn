> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Core 0.4.0

Status: Experimental implementation draft.

## 1. Scope

P2LRN is a portable, versioned and verifiable package for exchanging the semantic graph of a learning experience and the resources needed to reproduce it. It is designed to be independent of any LMS database schema or vendor-specific runtime.

P2LRN Core does not replace QTI, LTI, H5P, SCORM, cmi5, xAPI, CASE, Caliper, Open Badges or CLR. Those standards are integrated by profiles when they are the authoritative representation for a specialized concern.

## 2. Package

A P2LRN package MUST be a ZIP or ZIP64 archive with extension `.p2lrn`.

The proposed media type for future registration is:

```text
application/vnd.p2lrn+zip
```

A package MUST contain exactly one:

```text
META-INF/manifest.json
content/graph.json
```

The following directories are reserved:

```text
META-INF/signatures/    # reserved; payloads forbidden in Core 0.4.0
assets/
packages/
provenance/
authoring/
extensions/
```

Empty reserved directories SHOULD NOT be emitted. Core 0.4.0 reserves `META-INF/signatures/` but MUST reject signature payloads until a signature profile and non-circular signature boundary are specified.

## 3. Two authorities

`META-INF/manifest.json` is the sole physical inventory and integrity authority.

`content/graph.json` is the sole Core semantic authority.

An implementation MUST NOT maintain another normative checksum inventory or another competing semantic course manifest.

## 4. Manifest

The manifest MUST conform to `schemas/manifest.schema.json`.

It declares:

- container format and version;
- package identity;
- semantic entrypoints;
- graph descriptor;
- profiles required or optionally used;
- physical files;
- package integrity root.

`packageId` identifies one package instance. It is deliberately excluded from `contentRoot`, so the same logical content can be repackaged with a new package identity without changing its logical integrity root.

## 5. Graph

The graph MUST conform to `schemas/graph.schema.json`.

P2LRN Core defines five entity types:

- `course`
- `unit`
- `resource`
- `activity`
- `objective`

and one edge structure:

- `relation`

Specialized concepts SHOULD be introduced by profiles rather than by adding vendor-specific entity types to Core.

## 6. Entity identity

Every entity MUST have a globally portable absolute URI identifier.

`urn:uuid:` identifiers are RECOMMENDED when no more meaningful persistent URI exists.

Database primary keys, installation-local numeric IDs and private API paths MUST NOT be used as portable identity.

Portable identifiers SHOULD survive export/import/export. A clone operation MAY create new portable identifiers but SHOULD preserve derivation/provenance.

## 7. Course

A Course is a root learning experience.

A Course Profile package MUST expose one primary Course entrypoint.

The order of `children` is semantically significant and is the sole Core authority for sibling ordering. Producers SHOULD NOT duplicate that ordering in a second `position` or `sequenceNumber` field.

## 8. Unit

A Unit is a structural grouping. `role` describes its pedagogical interpretation, for example `module`, `lesson`, `topic`, `chapter`, `week`, `section` or `path`.

A receiving system MAY map these roles into its local hierarchy without adopting their names internally.

## 9. Resource

A Resource is a logical educational resource and is not equivalent to a single file.

A Resource MAY have multiple representations, such as:

- source;
- rendered;
- fallback;
- accessible;
- thumbnail;
- transcript;
- package.

Representations can be `embedded`, `remote` or `package-member`.

`package-member` addresses one member inside a preserved content-addressed package without duplicating or flattening that member into the outer archive. This permits full, thin and hybrid packages while preserving legacy or specialized source packages intact.

## 10. Activity

An Activity represents something a learner is expected to do or experience.

Core does not define execution semantics for specialized activities. The `activityType` URI and the representation profile identify those semantics.

Examples include assessments, games, simulations, live-session templates, SCORM launches, H5P interactions and LTI tools.

## 11. Objective

An Objective represents a learning outcome, competency or skill target.

External competency identifiers SHOULD be referenced through `alignments`; CASE is the preferred profile when a CASE representation exists.

## 12. Relations

`children` represents hierarchy. `relations` represents non-hierarchical semantics.

Core relation predicates are URI-valued and may include `requires`, `precedes`, `relatedTo`, `alternativeTo`, `derivedFrom`, `teaches` and `assesses` through the P2LRN registry.

A relation source and target MUST resolve to an entity in the same graph unless a profile explicitly declares an external-reference predicate.

## 13. Embedded resources

Embedded resources MUST be declared in `manifest.files`.

Binary content-addressed assets SHOULD use:

```text
assets/sha256/<first-2>/<next-2>/<64-hex-byteDigest>
```

The final component MUST correspond to the raw-byte SHA-256 when this content-addressed layout is used.

## 14. Remote resources

Validation MUST NOT dereference remote URLs.

DNS resolution, HTTP requests, OAuth, LTI launch, IPFS retrieval or executable code are outside structural validation and require explicit runtime action.

This prevents validation from becoming an SSRF or side-effect surface.

## 15. JSON rules

Normative JSON documents MUST:

- be UTF-8;
- be valid JSON;
- follow I-JSON constraints;
- validate against their JSON Schema 2020-12 schemas.

Canonical JSON digests use RFC 8785 JSON Canonicalization Scheme (JCS).

## 16. Digest model

Every inventoried file declares:

- `byteDigest`: SHA-256 of exact stored bytes;
- `contentDigest`: logical digest.

For JSON media types, `contentDigest` is SHA-256 of JCS(parsed JSON).

For all other payloads, `contentDigest` MUST equal `byteDigest` in Core 0.4.0.

This allows insignificant JSON whitespace or key-order changes without changing the logical content root while preserving exact-byte integrity independently.

## 17. contentRoot

`contentRoot` is defined normatively in `spec/INTEGRITY.md`.

It is independent of ZIP compression, ZIP timestamps and `packageId`.

It changes when the semantic graph, entrypoints, required/optional profiles or inventoried logical payloads change.

## 18. Profiles

Profiles add semantics without expanding Core.

A profile is identified by an absolute URI and an explicit version.

A package declares each profile as `required` or `optional`.

Unknown required profiles prevent a processor from claiming complete interpretation. Unknown optional profiles MUST NOT be silently deleted by a processor claiming lossless preservation or round-trip capability.

## 19. Capability modes

P2LRN defines five capability modes:

- `validate`
- `read`
- `write`
- `preserve`
- `deliver`

These are independent. For example, a system MAY preserve an H5P package without being able to deliver it.

## 20. Safety and active content

Core itself does not authorize arbitrary script execution.

A representation that requires active code MUST use a profile whose delivery contract defines the required runtime and security boundary.

The Web Content 0.4.0 profile is deliberately passive and does not permit content to depend on arbitrary executable JavaScript.

## 21. Personal and operational state

The following are outside P2LRN Core course portability:

- users and learners;
- enrolments;
- progress;
- historical attempts;
- individual grades;
- actual attendance;
- payments and invoices;
- runtime tokens and credentials;
- API secrets and private keys;
- domains and DNS;
- database dumps;
- infrastructure configuration.

Definitions such as an assignment, rubric, achievement criterion or session template MAY be portable. A learner's submission, score, issued credential or attendance record is not.

## 22. Preservation rule

A conforming importer MUST NOT silently discard unsupported semantic content and still claim a lossless import.

It MUST do one of:

1. understand it;
2. preserve it opaquely when permitted;
3. report that lossless import is unavailable.

## 23. Evolution

New functionality SHOULD begin as a profile or namespaced extension.

Core SHOULD only grow when independent implementations demonstrate that a concept is universal and cannot be cleanly represented by profiles.

## 24. Preserved package payloads

External educational packages SHOULD be preserved as single content-addressed payloads when the source standard remains authoritative for runtime semantics.

The RECOMMENDED layout is:

```text
packages/sha256/<first-2>/<next-2>/<64-hex-byteDigest>
```

When this layout is used, the final component MUST equal the raw-byte SHA-256 of the package payload.

A Resource representation MAY reference the same preserved package as other Resource representations. When a specific nested file is semantically addressable, the representation SHOULD use `location.type = package-member` with the preserved package path and safe member path. Profile-specific metadata retains source identifiers, sequencing/runtime information and other source-standard semantics without duplicating package bytes.

This design intentionally permits legacy filenames and paths to remain untouched inside a preserved SCORM, H5P, cmi5 or Common Cartridge archive while keeping the outer P2LRN namespace strict and portable.

## 25. Representation extensions

A Resource representation MAY include `extensions`, keyed by absolute profile or extension URIs.

These extensions are the correct place for representation-specific data such as:

- SCORM resource identifiers and launch hrefs;
- cmi5 AU IDs, `moveOn`, `masteryScore` and launch information;
- H5P main-library and dependency information;
- Common Cartridge source resource types/identifiers;
- legacy Tin Can launch metadata.

A representation that declares `profile` MUST reference a profile declared by the package manifest.

Core processors that do not understand an optional representation extension MUST preserve it when claiming lossless preservation.

## 26. Core versus profile validation

Core validity and profile validity are different claims.

Core validation proves the P2LRN container, graph, inventory, digests and references are valid.

Profile validation additionally proves that a preserved external package satisfies the minimum structural rules required by that profile. The reference validator can perform this second layer with `--validate-profile-payloads`.

Profile validation MUST NOT execute package code, launch a tool, resolve DNS or fetch remote content.

## 27. Transformation boundary

Source-package transformation is preservation-first and is defined in `spec/TRANSFORMATION.md`. The Core graph is a portable semantic projection; a preserved source-standard package MAY remain authoritative for semantics not represented by Core/profile data. Transformations that claim auditability SHOULD emit `provenance/transformation.json` conforming to `schemas/transformation-report.schema.json`.

## 28. Reading boundary

Safe structural reading and representation negotiation are defined in `spec/READING.md`. Opening, validating or structurally reading P2LRN MUST remain side-effect free: remote retrieval and executable runtimes require an explicit later operation.

## 29. Adapter and round-trip boundary

LMS-specific import/export behavior is separated from Core by `spec/ADAPTER-CONTRACT.md`. Round-trip claims are defined in `spec/ROUND-TRIP.md`; exact source preservation, neutral P2LRN repacking and cross-LMS semantic round-trip are distinct conformance claims.

## Reading System separation

Core defines portable data, not an embedded executable. A conforming ecosystem SHOULD provide a P2LRN Reading System capable of opening `.p2lrn` directly. Reader behavior, runtime delegation and the no-network-on-open boundary are specified in `READING-SYSTEM.md`.
