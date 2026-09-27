# Document ingestion in the reference P2LRN Creator

## Boundary

P2LRN Core does not define how DOCX, PDF, PPTX, XLSX, ODT or other authoring files are parsed. Source-document ingestion is an authoring concern owned by the P2LRN Editor and the neutral `@p2lrn/document-reader` package.

An existing `.p2lrn` package never enters this document reader. Existing P2LRN packages open through `@p2lrn/toolkit/authoring`.

## Reference pipeline

```text
source document bytes
    -> @p2lrn/document-reader format detector
    -> registered neutral extractor
    -> canonical document + materialized assets
    -> document post-processors
    -> P2LRN Editor mapping
    -> @p2lrn/toolkit/authoring
    -> portable project/graph
    -> SHA-256 asset deduplication
    -> provenance/transformation.json
    -> P2LRN Builder
    -> final validator
    -> course.p2lrn
```

The canonical document boundary preserves source order, page/slide coordinates, tables, questions, multimodal observations, asset references and extraction provenance. Platform-local database IDs, private URLs, user IDs, authentication and storage objects are forbidden at this boundary.

## Implementation provenance

The first implementation of the neutral reader is being extracted from the mature document-reading work historically developed in `josemarcosfrodo/aulap2p` on branch `universal`. That repository is a source of proven algorithms and regression fixtures, not a runtime dependency or architectural authority of P2LRN.

After extraction, P2LRN owns its copy. AulaP2P may consume P2LRN like any other host.

## Provenance in generated packages

The generated package may contain `provenance/transformation.json` and link it from the graph creator extension. Entity-level provenance remains namespaced under `https://p2lrn.org/ext/provenance`.

This makes transformation auditable without polluting the neutral Core vocabulary.
