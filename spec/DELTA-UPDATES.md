> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Detached Delta Updates - experimental 0.1

Status: implemented in the reference Toolkit 0.4.0a7 as a detached update sidecar. It does not widen P2LRN Core 0.4.0 and it is not a second course/graph authority.

## 1. Purpose

A full `.p2lrn` may contain large media or preserved source packages. When a new revision changes only the graph or a small resource, retransmitting every unchanged byte is unnecessary.

Alpha 7 introduces an experimental resource-level sidecar:

```text
base.p2lrn + base-to-target.p2lrn.delta -> target.p2lrn
```

The result is always an ordinary, independently valid `.p2lrn` package.

## 2. Authority model

The delta does not invent another semantic graph. It carries the exact target:

- `META-INF/manifest.json` bytes;
- `content/graph.json` bytes;
- only target payload bytes that cannot be reused exactly from the base package.

The target manifest remains the physical authority and the target graph remains the semantic authority after reconstruction.

## 3. Reuse rule

A target payload may be omitted from the delta only when the base contains bytes with the same:

- `byteDigest`;
- `size`.

At apply time the bytes are read from the base and verified again against the target descriptor, including `contentDigest`.

Reuse is content based rather than path based. An unchanged content-addressed asset therefore does not need to be retransmitted merely because another layer refers to it differently.

## 4. Delta container

The sidecar itself is ZIP/ZIP64 with an explicit inventory:

```text
META-INF/delta.json
target/META-INF/manifest.json
target/content/graph.json
payloads/<target-path>      # only changed/new payloads
```

`META-INF/delta.json` declares the required base `contentRoot`, target `contentRoot`/`packageId`, target manifest/graph byte digests and every included payload.

Extra, duplicate, encrypted, unsafe-path, symbolic-link or unreasonably compressed entries are rejected by the reference implementation.

## 5. Creation

```bash
p2lrn-delta create base.p2lrn target.p2lrn update.p2lrn.delta
```

Creation:

1. validates both P2LRN packages normally;
2. requires the same Core `formatVersion`;
3. identifies reusable target payloads by exact digest/size;
4. stores exact target manifest/graph bytes;
5. stores only non-reusable payloads;
6. validates the completed delta inventory;
7. publishes the sidecar only after successful construction.

The operation uses a temporary sibling file followed by `os.replace`; an exception during construction does not publish a partial delta over the requested destination.

## 6. Application

```bash
p2lrn-delta apply base.p2lrn update.p2lrn.delta reconstructed.p2lrn
```

Application fails unless the base `formatVersion` and `contentRoot` exactly match the sidecar declaration. It then verifies target manifest/graph digests, target `contentRoot`, every included/reused payload and all content digests.

The reconstructed package is built into a temporary file and passed through the ordinary P2LRN reference validator. It is atomically moved to the requested output path only after that validation succeeds.

This makes the normal P2LRN validator the final gate rather than trusting the delta operation itself.

## 7. Inspect

```bash
p2lrn-delta inspect update.p2lrn.delta
```

Inspection validates the sidecar ZIP safety/inventory and returns its detached delta document. It does not apply the update.

## 8. Signatures and trust

A delta is not itself a substitute for package authenticity. After reconstruction, a publisher may distribute/verify the target package's detached signature as described in `DETACHED-SIGNATURES.md`.

Signing the delta container itself, update channels, rollback protection and trusted version feeds are not defined by 0.1.

## 9. Deliberate limitations

This first contract is resource-level and preservation-oriented. It does not claim:

- binary block/chunk diffs inside one changed file;
- three-way merge or conflict resolution;
- cross-Core-version transformation;
- version-history DAG semantics;
- remote/external CAS transfer;
- streaming application of arbitrarily large packages;
- rollback/update-channel policy.

For tiny packages, delta metadata may be larger than simply transferring the target package. A host should choose a delta only when it provides a real transport benefit.
