> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN 0.4.0 Conformance

P2LRN deliberately avoids a single vague "compatible" label.

## Core classes

### Core Validator
Validates ZIP safety, manifest/schema, graph/schema, inventory, digests, contentRoot and Core references.

### Core Reader
Understands Core graph semantics.

### Core Writer
Produces valid Core packages.

### Preserver
Can import and re-export declared preservable payloads it does not semantically understand.

### Course Importer / Exporter
Imports or exports Course Profile packages.

### Player
Can deliver only the activity/profile subsets for which the implementation declares and tests delivery.

### Round-Trip
For all declared supported features, export -> import -> export preserves semantic graph identity and preservable payloads. Byte-identical ZIP output is not required.

## Loss reporting

An implementation MUST report unsupported required profiles before claiming complete import.

An implementation MUST NOT silently discard an unsupported profile or extension and report a lossless import.

## Independent implementation gate

P2LRN must not be described as interoperable based solely on one producer and consumer. A future 1.0 release SHOULD require at least two independent implementations passing the same public conformance corpus.

## Profile payload validation

A processor MAY implement Core validation without opening preserved external packages semantically.

A processor claiming `<Profile> Validator` MUST additionally validate the minimum nested-package structure required by that profile.

The 0.4.0 Node reference implementation currently checks, without executing imported content:

- H5P: nested ZIP safety; `h5p.json`; `content/content.json`; valid JSON; non-empty `mainLibrary`; declared preloaded dependencies; embedded library descriptors; dependency-mode consistency when P2LRN metadata declares it.
- SCORM: nested ZIP safety; root `imsmanifest.xml`; valid XML; existing relative launch targets.
- cmi5: nested ZIP safety; root `cmi5.xml`; valid XML; existing relative AU launch targets. Remote AU URLs are not dereferenced.
- Common Cartridge: nested ZIP safety; root `imsmanifest.xml`; Common Cartridge identification; supported 1.1-1.4 source version family; unique resource identifiers; valid item `identifierref`; existing declared files/hrefs; valid dependency references.
- QTI: nested ZIP safety; root `imsmanifest.xml`; QTI package/resource identification; existing relative item/test members.
- legacy Tin Can package: nested ZIP safety; root `tincan.xml`; valid XML; existing relative launch target.

Remote URLs are not dereferenced by package validation.

## Semantic profile validation

The Core semantic validator also validates portable graph metadata when these profiles are declared:

- LTI: portable target Link URL metadata, HTTP(S) target, no embedded URL credentials and recursive rejection of credential-like fields such as client secrets, private keys and access/refresh tokens.
- CASE: CASE 1.1 Alignment references on Objective entities; target/framework URLs are validated locally and never dereferenced.
- xAPI: strict Activity declaration containing only portable `activityId`, optional profile id and declared verb overrides. LRS endpoint, tokens, actor and authority are not permitted in the portable declaration.
- Accessibility: structured representation metadata with a strict field set; metadata remains descriptive and does not certify WCAG conformance.

## Runtime delivery gates

Runtime support is deliberately narrower than preservation/import support.

### SCORM
The web runtime contains SCORM 1.2/2004 APIs and an explicit SCORM 2004 sequencing gate covering parser state, flow, pre-condition skip, choice/jump, rollup, suspend/resume and selected post-condition behavior.

This does not yet constitute a claim of complete SCORM 2004 sequencing/navigation conformance.

### H5P
The runtime host creates scoped H5P sessions, resolves packaged/shared libraries, verifies required assets, limits package/session capacity, protects session paths/origins and serves H5P runtime assets.

A real deployment still needs the required H5P libraries and browser/runtime integration.

### QTI
The built-in QTI 3 renderer is intentionally bounded. It supports QTI 3 Assessment Items with exactly one choice/text interaction and the standardized `match_correct` response-processing path. Unsupported processing/interactions fail explicitly instead of inventing scoring.

### cmi5
The Player validates and launches host-prepared cmi5 sessions. The host/LMS remains authoritative for actor, registration, Fetch URL, endpoint, xAPI session processing and terminal results. A reference LMS/LRS end-to-end gate is still required.

### LTI
The Player launches only a host-rebound LTI 1.3 session. Imported Basic LTI intent is never launched directly and is never relabeled as an already-registered LTI 1.3 deployment. OIDC/message signing/deployment/Advantage services remain host/LMS responsibilities.

### xAPI
Opted-in P2LRN activities emit actor-free statement intents to the Host Adapter. Intermediate answer edits do not become `answered` statements; only submitted/final answers do. The host adds actor, authority, registration and LRS transport.

## Transformation conformance

A preservation-first transformer additionally proves source detection, source preservation claim, transformation-report schema, explicit fidelity/loss accounting and self-validation of its output. See `spec/TRANSFORMATION.md`.

## Reader/import conformance

A Core Reader MUST keep structural reading side-effect free. An importer claiming lossless behavior MUST distinguish `interpretable`, `preservable` and `unsupported` resources and persist portable identity independently of target-local IDs. See `spec/READING.md`.

Source-document interpretation (PDF/DOCX/PPTX/etc.) belongs to the dedicated document Reader/authoring layer and is not a Core P2LRN package-reading responsibility.
