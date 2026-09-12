> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# AulaP2P Reader -> P2LRN Creator Bridge 0.1.0

## Purpose

This bridge is an implementation integration, not part of the P2LRN Core standard. It allows the reference Creator to reuse AulaP2P's existing document ingestion pipeline instead of implementing a second PDF/DOCX/PPTX/XLSX/etc. reader.

AulaP2P authority reviewed for this integration:

```text
DetectorTipoArchivoService
        ->
LectorDocumentoService
        ->
DocumentoExtraidoCanonico (aulap2p.documento.extraido.v1)
        ->
DocumentoMultimodalCanonicoV2 when available
        ->
P2LRN AulaP2P adapter
        ->
P2LRN Builder
```

The bridge deliberately stops at the canonical document boundary. Prisma persistence, `archivoId`, AulaP2P URLs, users and storage implementation are not P2LRN identities.

## Accepted input

The Creator accepts either the raw canonical document:

```json
{
  "version": "aulap2p.documento.extraido.v1",
  "origen": {},
  "metadatos": {},
  "bloques": [],
  "tablas": [],
  "advertencias": []
}
```

or a bridge envelope:

```json
{
  "schema": "p2lrn.aulap2p-reader-envelope.v1",
  "document": { "version": "aulap2p.documento.extraido.v1" },
  "assets": [
    {
      "blockTempId": "asset_generico_...",
      "path": "materialized/image1.png"
    }
  ]
}
```

`path` refers to bytes materialized by the integration process. The P2LRN Creator never fetches an AulaP2P internal URL to recover an asset.

## CLI

```bash
p2lrn-create ingest-aulap2p reader-output.json course.p2lrn \
  --source-file source.docx \
  --asset-root ./bridge-assets
```

`--source-file` preserves the exact original document as a `source` representation. It is not inserted as a visible learning activity.

## Mapping rules

When `secuenciaMultimodal.version == aulap2p.documento.multimodal.v2`, it is the preferred ordered source. Otherwise `bloques` is used.

The adapter preserves, when supplied:

- node/block type and order;
- page, slide and sheet;
- bounding box;
- confidence;
- extraction engine/reference;
- reader warnings;
- detected source format and extraction strategy.

It never exports as portable identity:

- `archivoId`;
- Prisma IDs;
- `archivo.url` or internal AulaP2P URLs;
- local storage paths that have not been materialized as payload bytes.

Textual nodes become passive Web Content resources/activities. Image/graphic nodes become embedded content-addressed resources only when the bridge supplies their bytes. Unresolved local image references are explicitly recorded as transformation losses rather than silently converted into broken remote URLs.

## Why this integration exists

The reference Creator should reuse mature readers where they already exist. The P2LRN standard, however, remains neutral: another product may use its own reader and emit the same P2LRN graph.
