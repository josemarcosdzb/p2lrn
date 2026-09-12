> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN 0.4.0 Transformation Contract

Status: normative draft for the reference transformation pipeline.

## 1. Purpose

Transformation converts an external learning package or an LMS export into a P2LRN graph without making P2LRN pretend to be the source standard. The authoritative source payload is preserved whenever licensing and size policy permit it, while portable semantics are projected into Core entities and profile metadata.

The governing rule is:

```text
preserve -> inspect -> project -> report -> validate
```

A transformer MUST NOT destroy source information merely because the current P2LRN projector cannot model it.

## 2. Pipeline

A conforming preservation-first transformer executes these stages in order.

### T0. Intake and safety gate

Before semantic detection, the source is treated as untrusted bytes. Archive limits, path traversal checks, duplicate-name checks, encryption policy, compression-ratio limits, quota and malware policy belong here.

No source code is executed. No remote URL is fetched.

### T1. Content-based format detection

Detection MUST inspect authoritative package markers rather than rely only on the filename extension.

Current reference markers include:

| Source | Detection marker |
|---|---|
| H5P | root `h5p.json` |
| cmi5 | root `cmi5.xml` |
| legacy Tin Can launch package | root `tincan.xml` |
| QTI package | `imsmanifest.xml` identifying `QTI Package`, QTI packaging namespace or QTI resource types |
| Common Cartridge | `imsmanifest.xml` Common Cartridge schema/namespace |
| SCORM | `imsmanifest.xml` SCORM schema or SCORM-specific resource attributes |

Detection order matters because several standards use the same `imsmanifest.xml` filename.

### T2. Preserve the authoritative source

The educational source package SHOULD be stored as one content-addressed payload:

```text
packages/sha256/aa/bb/<sha256>
```

For a direct source package, preservation SHOULD be bit-exact.

For a course embedded inside a repository/archive, an explicitly selected subroot MAY be normalized into a standalone ZIP. That is `normalized-subpackage`, not bit-exact preservation of the repository archive.

The preservation claim is recorded in `provenance/transformation.json`.

### T3. Extract source metadata without executing content

The transformer reads only the metadata required by the source profile, for example:

- `imsmanifest.xml` for SCORM, Common Cartridge and packaged QTI;
- `cmi5.xml` for cmi5;
- `h5p.json` for H5P;
- `tincan.xml` for legacy launch packages.

Reading metadata MUST NOT imply launching a SCO, AU, H5P library, LTI tool or remote URL.

### T4. Project portable structure

The source is projected to the smallest P2LRN Core concepts that preserve cross-system meaning:

```text
source course/organization -> Course
source block/module/group   -> Unit
launchable/interactive item -> Activity
logical payload             -> Resource
competency/learning target  -> Objective
cross-link                   -> Relation
```

Profile-specific semantics remain under the profile namespace rather than being flattened into invented Core fields.

Examples:

```text
SCORM organization/item/resource
  -> Course / Unit or Activity / Resource
  -> SCORM sequencing remains authoritative in the SCORM payload

cmi5 Course/Block/AU
  -> Course / Unit / Activity
  -> moveOn/mastery/launch semantics remain cmi5 profile metadata

QTI item/test resource
  -> Activity / Resource
  -> response processing, scoring and interaction semantics remain QTI

Common Cartridge organization/resource
  -> Course hierarchy / Activity / Resource
  -> QTI and LTI resources receive their own profile representations
```

### T5. Resolve portable identity

If a source supplies a stable absolute URI that is valid portable identity, the transformer SHOULD preserve it.

If the source only supplies installation-local or package-local identifiers, the transformer creates P2LRN portable IDs and records the source-to-target mapping in the transformation report.

A target LMS MUST persist the P2LRN portable ID independently of its local database primary key if it wants stable future round-trips.

A source format that does not provide globally stable identity cannot guarantee that two independent first-time conversions of modified source archives invent the same P2LRN UUIDs. Once imported, the receiving implementation is responsible for persisting the assigned portable IDs.

### T6. Create representations

A Resource can expose more than one representation.

The reference transformer normally emits:

1. `original-package`: exact preserved source package;
2. a directly resolvable `package-member` when the source manifest identifies a member;
3. remote representation when the source standard explicitly points to an absolute remote resource;
4. generated/native representation only when an adapter can do so without falsely claiming source-standard equivalence.

This means the receiver can choose semantic convenience without losing the original.

### T7. Record provenance and fidelity

Every transformed package MUST record enough information to audit the transformation.

`provenance/transformation.json` records:

- source format and exact byte digest;
- preserved package digest and path;
- preservation mode;
- target entrypoint;
- structural projection fidelity;
- source locator -> P2LRN ID mappings;
- warnings;
- irreversible losses.

A warning is not the same as a loss. If semantics remain authoritative and recoverable from the preserved original package, that is normally a projection limitation, not irreversible data loss.

### T8. Build physical inventory and integrity

After graph/provenance generation, the transformer computes exact `byteDigest`, logical `contentDigest` and `contentRoot` according to `spec/INTEGRITY.md`.

### T9. Self-validate

A transformer MUST NOT emit a package it cannot validate itself.

Reference conversion therefore performs:

```text
Core validation
+ strict profile version validation
+ profile payload validation where implemented
```

before reporting success.

## 3. `package-member`

`package-member` is the bridge between lossless package preservation and easy reading.

Example:

```json
{
  "type": "package-member",
  "package": "packages/sha256/54/9f/549f...",
  "member": "shared/launchpage.html"
}
```

It means:

> the authoritative bytes remain inside the preserved nested package, but this representation identifies the exact member relevant to the P2LRN Resource.

The member is not copied into the outer P2LRN archive. This prevents duplication and preserves source-package integrity.

## 4. Transformation fidelity levels

`structuralProjection` has four levels:

- `complete`: all in-scope structural semantics are represented in P2LRN/profile data;
- `partial`: important portable structure is projected while some semantics remain solely in the source profile;
- `minimal`: only enough metadata is projected to identify/route the activity or resource;
- `opaque`: the source is only preserved.

These levels describe projection, not source preservation.

A package can therefore be:

```text
sourceBytes = exact
structuralProjection = partial
runtimeSemantics = delegated-to-source-profile
losses = []
```

This is a successful lossless-preservation transformation even though P2LRN Core does not understand every source-standard rule.

## 5. Failure policy

Transformation MUST fail rather than silently continue when:

- source format cannot be identified safely;
- mandatory source manifest is malformed;
- a referenced local launch/member required by the source package does not exist;
- source archive violates safety policy;
- generated graph is invalid;
- generated profile declarations are inconsistent;
- generated integrity values do not validate.

Unsupported semantics that remain recoverable from a preserved source package MAY produce warnings instead of failure.

## 6. Current reference adapters

The 0.4.0 reference transformer includes first-pass adapters for:

- SCORM 1.2 / SCORM 2004 packages;
- cmi5 packages;
- H5P packages;
- Common Cartridge, including legacy QTI and Basic LTI resources discovered in the supplied cartridge;
- packaged QTI 3 structure;
- legacy `tincan.xml` launch packages.

These adapters are intentionally projection adapters, not replacements for the source runtimes.
