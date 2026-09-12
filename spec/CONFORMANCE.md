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
Can deliver the subset of activities for which it declares `deliver` capability.

### Round-Trip
For all declared supported features, export -> import -> export preserves semantic graph identity and preservable payloads. Byte-identical ZIP output is not required.

## Loss reporting

An implementation MUST report unsupported required profiles before claiming complete import.

An implementation MUST NOT silently discard an unsupported profile or extension and report a lossless import.

## Independent implementation gate

P2LRN must not be described as interoperable based solely on one AulaP2P producer and consumer. A future 1.0 release SHOULD require at least two independent implementations passing the same public conformance corpus.

## Profile payload validation

A processor MAY implement Core validation without opening preserved external packages semantically.

A processor claiming `<Profile> Validator` MUST additionally validate the minimum nested-package structure required by that profile.

The 0.4.0 reference implementation currently checks, without executing content:

- H5P: nested ZIP safety, `h5p.json`, `content/content.json`, valid JSON;
- SCORM: nested ZIP safety, root `imsmanifest.xml`, valid XML and existing relative resource launch targets;
- cmi5: nested ZIP safety, root `cmi5.xml`, valid XML and existing relative AU launch targets;
- Common Cartridge: nested ZIP safety and root `imsmanifest.xml` XML validity;
- QTI: nested ZIP safety, root `imsmanifest.xml`, QTI package/resource identification and existing relative resource members;
- legacy Tin Can package: nested ZIP safety, root `tincan.xml`, valid XML and existing relative launch target.

Remote URLs are not dereferenced by validation.


## Transformation conformance

A preservation-first transformer additionally proves source detection, source preservation claim, transformation-report schema, explicit fidelity/loss accounting and self-validation of its output. See `spec/TRANSFORMATION.md`.

## Reader/import conformance

A Core Reader MUST keep structural reading side-effect free. An importer claiming lossless behavior MUST distinguish `interpretable`, `preservable` and `unsupported` resources and persist portable identity independently of target-local IDs. See `spec/READING.md`.
