# AulaP2P integration for the P2LRN Creator

Reviewed authority: `josemarcosfrodo/aulap2p`, branch `universal`.

The integration intentionally reuses the existing AulaP2P Reader boundary instead of copying its extractors into P2LRN:

- `backend/src/conversion/aulap2p/aulap2p-reader.adapter.ts`
- `backend/src/cursos/importacion/deteccion-archivo/detector-tipo-archivo.service.ts`
- `backend/src/cursos/importacion/lectura/lector-documento.service.ts`
- `backend/src/cursos/importacion/lectura/types/documento-extraido-canonico.type.ts`
- `backend/src/cursos/importacion/lectura/types/documento-multimodal-canonico-v2.type.ts`

Recommended in-process AulaP2P flow:

```text
uploaded file
  -> AulaP2PReaderAdapter.detect/read
  -> DocumentoExtraidoCanonico
  -> materialize referenced image/file bytes as bridge assets
  -> p2lrn.aulap2p-reader-envelope.v1
  -> P2LRN Creator adapter
  -> P2LRN Builder
  -> course.p2lrn
```

The envelope is a bridge contract, not a P2LRN Core object. The adapter may use `archivoId` transiently to correlate a materialized file, but it must not write that ID or its internal URL into portable P2LRN identity.

For a process boundary, serialize the canonical document/envelope as JSON and call:

```bash
p2lrn-create ingest-aulap2p envelope.json course.p2lrn --asset-root bridge-assets --source-file original.docx
```

For an in-process future AulaP2P integration, the same mapping logic should be ported behind a P2LRN Creator adapter rather than reimplementing the Reader.
