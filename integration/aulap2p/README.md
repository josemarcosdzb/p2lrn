# Historical AulaP2P Reader migration

This directory records provenance for Reader and bridge work that historically originated in AulaP2P.

Reviewed source: `josemarcosfrodo/aulap2p`, branch `universal`.

The active P2LRN architecture has no AulaP2P runtime, API or CLI dependency:

```text
source document
  -> @p2lrn/document-reader
  -> P2LRN Editor editable model
  -> @p2lrn/toolkit/authoring
  -> course.p2lrn
```

AulaP2P is now just another possible producer/consumer of the portable format. It has no privileged bridge in `@p2lrn/toolkit/creator` and no AulaP2P-specific command in `p2lrn-create`.

The old adapters, bridge specifications and their focused regression test were moved under `integration/aulap2p/legacy/` on 2026-09-27. They are frozen migration evidence only:

- they are outside `packages/toolkit/src`;
- they are not TypeScript build inputs;
- they are not package exports;
- they are not CLI commands;
- they are not runtime dependencies.

Historical package fixtures have been moved to `integration/aulap2p/legacy/examples/`. They may still be opened manually by the generic Reader for migration checks, but they are no longer listed as canonical/reference P2LRN examples.

The modern AulaP2P Reader remains useful only as provenance for behaviors migrated into the neutral Reader, including format detection, source ordering, image/table placement, OCR reconciliation, multimodal reconstruction, question observations and regression fixtures.

Platform-specific concerns must not re-enter the neutral Reader or P2LRN Core: Prisma/database identities, users, authentication, enrolment, private AulaP2P URLs, storage services and AulaP2P schema identifiers are host-specific state.
