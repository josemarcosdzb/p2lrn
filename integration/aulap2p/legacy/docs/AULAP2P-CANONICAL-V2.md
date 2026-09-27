# AulaP2P canonical V2 bridge

This source snapshot consumes only `aulap2p.documento.extraido.v2` at the Reader bridge boundary.

- `secuenciaMultimodal` is mandatory and must be `aulap2p.documento.multimodal.v2`.
- `procedenciaExtraccion` is mandatory.
- Reader-level `PREGUNTA` / `SOLUCION` nodes are documentary evidence and are exported as passive resources, never as authoritative P2LRN assessments.
- Native P2LRN questionnaires are generated only from reconciled `aulap2p.curso.v1` quizzes through `packages/toolkit/src/creator/aulap2p-course.ts` / `packages/toolkit/src/creator/aulap2p-questionnaire.ts`.
- Legacy Reader V1 documents must be normalized inside AulaP2P before reaching this bridge.
