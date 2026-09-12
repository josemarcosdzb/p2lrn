> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN 0.4.0 Reading and Import Contract

Status: normative draft for safe structural reading and target-LMS import planning.

## 1. Principle

Reading a P2LRN package is not the same as executing its content.

The safe read pipeline is:

```text
open
 -> validate Core
 -> index graph
 -> resolve entrypoint
 -> inspect target capabilities
 -> negotiate representations
 -> build side-effect-free plans
 -> target adapter imports or delivers explicitly
```

Opening or validating a package MUST NOT launch executable content and MUST NOT fetch remote URLs.

## 2. Reader stages

### R0. Open and Core validation

The reader validates ZIP safety, manifest, graph, inventory, digests, `contentRoot`, references and hierarchy cycles.

If Core is invalid, reading stops.

### R1. Profile support check

Required profile/version declarations are compared with processor capabilities.

Unknown required semantics prevent a claim of complete interpretation.

Unknown optional semantics may still be preserved.

### R2. Graph index

The reader indexes entities by portable ID and representations by representation ID.

Local database IDs do not exist at this stage.

### R3. Entrypoint selection

For the Course Profile, the primary Course entrypoint is selected. A future profile can define other entrypoint kinds without changing the Core reader algorithm.

### R4. Hierarchy traversal

The reader traverses `children` in declared order. `Course`, `Unit` and `Activity` are structural semantics; resources can also exist outside the reachable hierarchy because they may be dependencies or preserved source inventory.

### R5. Capability negotiation

For each Resource, the processor considers its representations and its capability modes.

The important distinction is:

```text
read      = understand semantics
preserve  = retain without pretending to understand
 deliver  = execute/render/launch
```

A processor that cannot read H5P but can preserve H5P must retain it opaquely rather than delete it.

### R6. Representation selection

A suitable representation is chosen according to requested mode and declared capabilities.

Typical preference for a read/delivery operation is:

```text
primary
rendered
accessible
fallback
source
original-package
```

The exact policy can be implementation-specific, but it MUST NOT select a profile for a mode the processor has not declared.

If a Resource exposes an explicit semantic representation (`primary`, `rendered`, `accessible` or `fallback`), a read/deliver negotiation MUST NOT fall back to an unrelated whole `original-package` merely because the receiver can read the outer source-package profile. For example, inability to read a QTI primary representation cannot be disguised by selecting the surrounding Common Cartridge ZIP as if QTI semantics had been understood. Preservation remains available through `preserve` mode.

### R7. Produce a read plan

Representation resolution returns a plan, not an automatic side effect.

Examples:

#### Embedded outer file

```json
{
  "kind": "embedded-file",
  "path": "assets/sha256/..."
}
```

#### Member inside preserved package

```json
{
  "kind": "package-member",
  "packagePath": "packages/sha256/...",
  "member": "shared/launchpage.html",
  "runtime": "scorm"
}
```

#### Remote cmi5 AU

```json
{
  "kind": "remote",
  "href": "https://example.org/launch",
  "runtime": "cmi5",
  "networkRequired": true
}
```

#### LTI

```json
{
  "kind": "external-tool",
  "runtime": "lti",
  "rebindRequired": true,
  "targetLinkUri": "https://tool.example/launch"
}
```

The reader never interprets the last two plans as permission to perform network I/O.

## 3. Target-neutral import plan

The reference reader can also emit an LMS-neutral import plan.

The plan contains:

- structural Course/Unit/Activity/Objective objects with portable IDs;
- every Resource, including unreferenced dependency resources;
- selected representation handling;
- whether a resource is `interpretable`, `preservable` or `unsupported`;
- explicit requirement for a target `portableId -> localId` map;
- source recovery availability.

It deliberately contains no target database IDs.

A concrete LMS adapter should consume it approximately as follows:

```text
BEGIN TRANSACTION

1. create/update Course using portableId
2. create Units in hierarchy order
3. create Activities
4. materialize/deduplicate assets and preserved packages
5. invoke supported profile adapters
6. preserve unsupported-but-preservable representations
7. persist portableId -> localId map
8. persist source/profile metadata required for round-trip

COMMIT
```

If any required operation fails, the target SHOULD roll back course persistence rather than leave a partially imported graph.

## 4. Resource handling states

### `interpretable`

The receiver declares `read` capability for a selected representation. It may project the representation into its native domain model while retaining source-profile information required for round-trip.

### `preservable`

The receiver cannot interpret the representation but declares `preserve`. It stores the bytes/metadata opaquely and keeps the graph relation intact.

### `unsupported`

Neither read nor preserve capability exists. A lossless import cannot continue silently.

The user/application must choose between rejecting the import or explicitly accepting a lossy import. A conforming lossless importer MUST reject.

## 5. Reading nested packages

A `package-member` reader SHOULD read only the requested nested member and MUST apply nested ZIP safety checks before returning its bytes.

It SHOULD NOT extract the entire package to a writable shared directory merely to read one launch file.

SCORM example:

```text
Activity
 -> Resource
 -> SCORM primary representation
 -> package-member
 -> shared/launchpage.html
```

The SCORM runtime is still responsible for SCORM execution semantics.

## 6. QTI reading

For packaged QTI 3, the P2LRN projector can expose each QTI item/test as an Activity/Resource and identify the exact XML member with `package-member`.

A generic P2LRN reader can therefore locate the QTI item without understanding response processing.

A processor may claim QTI `read`/`deliver` only if its QTI implementation actually understands the relevant QTI semantics. Structural P2LRN routing alone is not QTI delivery conformance.

## 7. LTI reading

An LTI representation is not fetched like a web page during import.

The reader emits external-tool intent. The receiving platform must bind it to local LTI registration/deployment state. Secrets, private keys and tokens are never recovered from P2LRN because they do not belong in the course package.

Legacy Basic LTI may be surfaced as migration intent but MUST NOT be relabeled as an already configured LTI 1.3 deployment.

## 8. Source recovery

If the transformation report says the original package was preserved, the reader can recover the exact preserved source payload.

For `preservation = bit-exact`:

```text
SHA-256(recovered bytes) == source.preservedPackageDigest
```

This provides a source-format round-trip independent of P2LRN semantic projection quality.

## 9. No-network validation and reading

Core validation and structural reading are offline operations.

The following require explicit later action and are never implicit in `open`, `validate`, `summary`, `tree`, `read plan` or `import plan`:

- HTTP requests;
- DNS lookups;
- OAuth/OIDC;
- LTI launches;
- cmi5 remote launch;
- IPFS or other remote CAS retrieval;
- JavaScript execution;
- SCORM runtime startup;
- H5P runtime startup.

## 10. Reference CLI

Inspect a package:

```bash
p2lrn-inspect course.p2lrn --summary --tree
```

Build activity read plans:

```bash
p2lrn-inspect course.p2lrn --plan --mode read
```

Build a target-neutral LMS import plan:

```bash
p2lrn-inspect course.p2lrn --import-plan
```

Inspect transformation provenance:

```bash
p2lrn-inspect course.p2lrn --transformation
```

## 11. First-party Reading System

Core structural APIs are also consumed by the first-party `p2lrn-reader` Node.js/TypeScript application. `READING.md` defines safe read semantics; `READING-SYSTEM.md` defines the user-facing host that owns the `.p2lrn` file association and delegates specialized execution to runtimes.
