> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# Document ingestion in the reference P2LRN Creator

## Boundary

P2LRN Core does not define how DOCX, PDF, PPTX, XLSX, ODT or other authoring files are parsed. The reference Creator exposes an ingestion boundary so mature external readers can supply a canonical document without becoming dependencies of the P2LRN standard.

## Reference pipeline with AulaP2P

```text
source document bytes
    -> AulaP2P format detector
    -> AulaP2P document reader/extractors
    -> canonical document + optional materialized assets
    -> P2LRN source adapter
    -> portable project/graph
    -> SHA-256 asset deduplication
    -> provenance/transformation.json
    -> P2LRN Builder
    -> final validator
    -> course.p2lrn
```

The source adapter is intentionally one-way with respect to local identity. It may use local IDs to correlate materialized bytes while ingesting, but those IDs are discarded at the P2LRN boundary.

## Provenance

The generated package contains `provenance/transformation.json` and links it from the graph creator extension. Entity-level provenance is namespaced under `https://p2lrn.org/ext/provenance`.

This makes transformation auditable without polluting the neutral Core vocabulary.
