# Historical AulaP2P Reader migration

This directory records implementation provenance for Reader code being migrated into P2LRN.

Reviewed source: `josemarcosfrodo/aulap2p`, branch `universal`.

The current P2LRN architecture does **not** depend on AulaP2P at runtime. The target is:

```text
source document
  -> @p2lrn/document-reader
  -> canonical P2LRN authoring document
  -> P2LRN Editor
  -> @p2lrn/toolkit/authoring
  -> course.p2lrn
```

The modern AulaP2P Reader remains useful as the migration source for proven behavior such as:

- format detection;
- DOCX/PPTX/PDF extractors;
- source-order preservation;
- image/table placement;
- OCR reconciliation;
- multimodal sequence reconstruction;
- question/solution observations;
- stable provenance and trace inventory;
- regression fixtures.

During migration all platform-specific concerns must be removed or replaced by neutral interfaces:

- NestJS decorators/providers;
- Prisma/database identities;
- `usuarioId`;
- `archivoId`;
- private AulaP2P URLs;
- authentication and enrolment;
- AulaP2P storage services;
- `aulap2p.*` schema/version identifiers.

Legacy `creator/aulap2p-*` adapters and `AULAP2P-*-BRIDGE.md` documents remain temporarily for compatibility and migration evidence. They are not the target architecture and should be removed only after the neutral Reader corpus proves equivalent behavior.
