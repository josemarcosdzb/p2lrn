# Canonical source Reader provenance

This engine is a code port, not a runtime dependency.

Source repository: `josemarcosfrodo/aulap2p`
Source branch: `universal`
Pinned source commit: `d07f10f3874d62cc0b227d509a53221b4cdeb922`
Port started: 2026-09-27

Rules:

- copy mature Reader behavior from the pinned source rather than reimplementing formats independently;
- no NestJS, Prisma, users, enrolment, storage service, HTTP controller or AulaP2P runtime dependency is allowed here;
- source-specific schema identifiers are neutralized to `p2lrn.source-reader.*`;
- platform services such as image persistence, OCR/Docling workers and malware scanning are injected behind neutral interfaces;
- the public P2LRN contract remains `@p2lrn/document-reader`; this directory is an internal engine implementation;
- upstream behavior changes are ported deliberately with regression tests, never by importing AulaP2P at runtime.
