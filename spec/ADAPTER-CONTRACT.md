> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN 0.4.0 Adapter Contract

This document defines the boundary between P2LRN and an LMS-specific model.

## Export adapter

An LMS export adapter should expose these logical operations:

```text
snapshotCourse()
resolvePortableIdentity(localObject)
exportStructure()
exportObjectives()
exportResources()
exportProfileRepresentations()
exportAuthoringState()       optional
exportProvenance()           optional
```

The adapter MUST resolve local files to bytes/content digests. It MUST NOT emit database IDs or server-private URLs as portable identity.

For an existing imported object, the adapter SHOULD reuse the previously persisted P2LRN portable ID.

## Import adapter

An LMS import adapter should consume the reference reader/import plan through operations equivalent to:

```text
beginImport()
upsertCourse(portableId, ...)
upsertUnit(portableId, ...)
upsertActivity(portableId, ...)
upsertObjective(portableId, ...)
storeResource(portableId, selectedRepresentation, ...)
preserveOpaqueRepresentation(...)
bindProfile(...)
recordPortableIdMap(portableId, localId)
commitImport()
rollbackImport()
```

The concrete method names are implementation-specific. The behavioral boundary is normative.

## AulaP2P mapping direction

The intended AulaP2P boundary is:

```text
Prisma/domain
 -> existing canonical course contract (`aulap2p.curso.v1`)
 -> AulaP2P P2LRN export adapter
 -> P2LRN
```

and:

```text
P2LRN
 -> safe reader/import plan
 -> AulaP2P P2LRN import adapter
 -> canonical import structures
 -> portableId -> localId map
 -> transactional persistence
```

The adapter must replace installation-local `archivoId`/URLs with portable Resource/representation references on export and allocate new local IDs on import.

## Unsupported profiles

The LMS adapter MUST NOT use absence of native support as permission to delete a representation.

If `preserve` is supported, the representation remains associated with its Resource and can be re-exported later. If neither `read` nor `preserve` is supported for required semantics, lossless import fails explicitly.
