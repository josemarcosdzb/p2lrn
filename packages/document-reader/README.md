# @p2lrn/document-reader

Neutral source-document ingestion layer used by P2LRN Editor.

This package is being extracted from the mature document-reading work historically developed in AulaP2P. The implementation is owned by P2LRN after extraction; AulaP2P is provenance, not a runtime dependency.

Boundary rules:

- No NestJS decorators/providers.
- No Prisma/database IDs.
- No user IDs, enrolment, authentication or AulaP2P URLs.
- Assets use neutral references plus materialized bytes.
- Source order, page/slide coordinates, tables, questions, OCR evidence and provenance survive the boundary.
- A final canonical document has mandatory multimodal sequence, extraction provenance and stable trace inventory.
- Existing `.p2lrn` packages never enter this reader; they open through `@p2lrn/toolkit/authoring`.

The current package establishes the neutral contract and extractor registry. Format-specific extractors are ported incrementally with regression fixtures from the modern `aulap2p/universal` Reader.
