> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN 0.4.0 Profiles and Capabilities

A Profile is a versioned semantic contract. A Capability is an implementation claim about what a processor can do with a profile.

## Profile declaration

A package declares profiles in its manifest:

```json
{
  "id": "https://p2lrn.org/profile/course",
  "version": "0.4.0",
  "requirement": "required"
}
```

`required` means a processor that does not understand the profile cannot claim complete semantic interpretation.

`optional` means Core interpretation remains possible without the profile. A round-trip or lossless-preservation processor still has to preserve the unsupported payload/extension where the profile permits opaque preservation.

## Capability modes

- `validate`: validates profile-specific structure.
- `read`: understands the profile semantics.
- `write`: can produce conforming profile content.
- `preserve`: can retain the profile's unsupported/original payload without semantic loss claims beyond preservation.
- `deliver`: can render, execute or launch the profile.

## Capability document

Products MAY publish a capability document conforming to `schemas/capabilities.schema.json`.

Example:

```json
{
  "p2lrnVersions": ["0.4.0"],
  "roles": ["validator", "importer", "exporter", "preserver", "player"],
  "profiles": [
    {
      "id": "https://p2lrn.org/profile/course",
      "version": "0.4.0",
      "modes": ["validate", "read", "write", "preserve", "deliver"]
    },
    {
      "id": "https://p2lrn.org/profile/h5p",
      "version": "0.4.0",
      "modes": ["preserve"]
    }
  ]
}
```

## Dependency rules

Profile descriptors can declare `requires` and `optionalDependencies`.

Profile dependency graphs MUST be acyclic.

## 0.4.0 registry

- `https://p2lrn.org/profile/course`
- `https://p2lrn.org/profile/web-content`
- `https://p2lrn.org/profile/native-questionnaire`
- `https://p2lrn.org/profile/native-composite`
- `https://p2lrn.org/profile/native-component`
- `https://p2lrn.org/profile/qti`
- `https://p2lrn.org/profile/h5p`
- `https://p2lrn.org/profile/scorm`
- `https://p2lrn.org/profile/cmi5`
- `https://p2lrn.org/profile/common-cartridge`
- `https://p2lrn.org/profile/tincan-package`
- `https://p2lrn.org/profile/lti`
- `https://p2lrn.org/profile/case`
- `https://p2lrn.org/profile/xapi`
- `https://p2lrn.org/profile/accessibility`
- `https://p2lrn.org/profile/multipart`

The real-world corpus drove the SCORM/cmi5/Common Cartridge/legacy Tin Can contracts and the H5P dependency modes. QTI now also has a direct packaged-QTI projection in addition to legacy QTI resources discovered inside Common Cartridge.

### Multipart

The multipart profile is transport-only. It allows a logical representation payload to be split into publisher-owned adjacent part files while preserving the semantic profile and media type. The shared P2LRN CDN supplies runtime code only; it does not become a course-content store. Each part and the reconstructed logical payload are SHA-256 verified before delivery. See `MULTIPART.md`.

### Native questionnaire

The native questionnaire profile is the first P2LRN-owned executable activity representation. It uses `application/vnd.p2lrn.questionnaire+json`, keeps learner state outside the package, and supports direct `deliver` conformance in the first-party Reading System. `embedded-key` mode is offline-capable but does not provide answer secrecy; `host` grading emits answers without inventing a score. Advanced assessment semantics remain QTI territory.

### Native composite

The native composite profile groups existing Activities using the enclosing graph `children` order as the single authority. Its embedded `application/vnd.p2lrn.composite+json` representation stores only traversal/completion policy; child content, renderer code and learner state are not duplicated. The first-party Reader delivers it recursively through the same Renderer Registry. See `NATIVE-COMPOSITE.md`.

### SCORM

P2LRN preserves the original SCORM ZIP. Organization/item/resource structure MAY be projected to Core. SCORM sequencing, navigation and runtime remain authoritative in the SCORM representation.

### cmi5

cmi5 Course maps naturally to Course, Block to Unit and AU to Activity. cmi5-specific launch and completion semantics remain profile metadata and the original `cmi5.xml` remains authoritative.

### Common Cartridge

P2LRN can project the cartridge organization and referenced resources while preserving the full original cartridge. This permits a receiver to understand the portable course structure even when it cannot execute every legacy resource type.

### Legacy Tin Can package

`tincan.xml` launch packages are supported only through a deliberately named legacy profile. They MUST NOT be described as the xAPI standard itself. xAPI runtime/event support belongs in the separate `https://p2lrn.org/profile/xapi` profile.

### QTI

Packaged QTI can be projected as Assessment Activities and Resources while the original package remains authoritative for item/test semantics. QTI 3 package manifests can be detected directly even when they contain no `organizations` tree. Legacy QTI 1.x found inside older Common Cartridge is preserved with its actual source version and MUST NOT be silently relabeled as QTI 3.

### LTI

P2LRN transports external-tool intent and portable link metadata, never platform secrets. An imported tool normally requires local registration/deployment binding before launch. Legacy Basic LTI discovered in cartridges is migration intent, not an already configured LTI 1.3 deployment.

### CASE

P2LRN Objectives can align to stable CASE identifiers. CASE services or documents remain authoritative for competency framework semantics; validators do not dereference CASE endpoints during package validation.

### xAPI

xAPI profile metadata describes activity/verb/profile semantics that delivered content may emit. Learner statement history, LRS credentials and runtime endpoint secrets are operational state and remain outside the portable course package.

### Accessibility

Accessible alternatives should be modeled as representations of the same Resource when semantically equivalent. Profile-specific accessibility semantics, especially QTI accessibility data, remain authoritative. Native web-content target is WCAG 2.2 AA, but package validity alone is not an accessibility certification.
