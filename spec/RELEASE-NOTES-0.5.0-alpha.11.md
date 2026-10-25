# P2LRN 0.5.0-alpha.11 — release candidate notes

Status: candidate preparation. npm publication is not performed by this document or by normal CI.

## Scope

This prerelease keeps P2LRN Core at 0.4.0 and extends the existing Player/Studio/Host boundaries. It does not introduce a second package format, a second course graph, a package-side identity model or a direct package-to-MCP/transport dependency.

## Collaboration

- Native collaborative component with poll, shared board and peer-review modes.
- Portable `collaboration.room` contract remains exactly: `join`, `send`, `listen`, `snapshot`, `leave`.
- `createMemoryCollaborationHub()` remains available for tests/local/reference use.
- New `createHttpCollaborationProvider()` binds the same contract to a Host-owned HTTP endpoint.
- New `createP2LRNCollaborationHandler()` in `@p2lrn/player/server` requires:
  - explicit allowed origins;
  - Host authentication;
  - trusted context resolution;
  - authorization;
  - a five-operation persistence/service implementation.
- Package input cannot choose `participantId`, `actorId`, `userId`, `identity` or `principal`.
- Browser E2E uses two real Players through the HTTP provider/server boundary rather than only the in-memory reference.

Durable multi-node room persistence is intentionally deployment-specific; this release does not claim to ship Redis/PostgreSQL or another mandatory collaboration database.

## Learning analytics

- Explicit native questionnaire attempt lifecycle: `started`, `resumed`, `submitted`.
- Privacy-bounded `answer-change` evidence without duplicating raw learner answers.
- Media play/pause/seek/end interactions.
- Explicit resource-open evidence.
- Native collaboration interaction events.

## Shared resources

- Digest-pinned remote authoring in Studio.
- `createMemorySharedResourceStore()` proves SHA-256 one-copy/many-reference deduplication.
- Host Adapter resolution remains the trusted boundary for production bytes.
- Browser E2E verifies Studio package -> digest reference -> Host resolution -> Player render.

## Studio and accessibility

- Studio palette exposes live poll, shared board, peer review and digest-pinned shared resource flows.
- Collaboration UI uses semantic form controls and live status.
- Media image fallback uses portable resource title for alt text when no representation-specific title is present.
- Existing responsive/native-game visual gates remain mandatory.

## Release integrity

The four packages remain version-aligned at `0.5.0-alpha.11`:

- `@p2lrn/h5p-libraries`
- `@p2lrn/toolkit`
- `@p2lrn/player`
- `@p2lrn/studio`

A release bug discovered during this preparation was corrected: the Node Player runtime host still reported `0.5.0-alpha.10`. The version bump tool and release-alignment gate now include that server runtime marker.

The npm pack gate additionally requires the production collaboration browser/server files and verifies the installed `@p2lrn/player/server` API. Installed-browser smoke requires `createHttpCollaborationProvider()`.

## E2E release matrix

`scripts/verify-connected-e2e-matrix.mjs` is a release gate and writes `.connected-e2e-matrix.json`. It requires evidence for:

1. Studio collaboration authoring and package round-trip.
2. Authenticated production HTTP collaboration and security rejection cases.
3. Two-Player HTTP synchronization in a real browser.
4. Shared-resource SHA-256 deduplication/resolution.
5. Rich analytics without raw answer duplication.
6. Covered accessibility contracts.
7. Offline/cache playback.
8. cmi5/H5P/SCORM/QTI regression fixtures.
9. Installed npm tarball browser execution.
10. All twelve native games visual gate.
11. Independent Express Host integration.
12. npm/CDN distribution identity.

See `spec/E2E-MATRIX-0.5.0-alpha.11.md`.

## Publication status

`0.5.0-alpha.11` was not present in the public npm registry when this release work began. A previously staged candidate from an older commit is stale after these changes and must not be published.

After the exact current `main` SHA passes all Windows gates, CI may stage fresh immutable tarballs tagged for `next`. Public `npm publish --tag next` remains a separate explicit release-owner action and is not performed automatically.
