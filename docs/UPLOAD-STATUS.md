# Upload status — 2026-09-12

Target repository: `josemarcosfrodo/p2lrn`, branch `main`.

The repository has been initialized and prepared for the P2RLN Alpha 15 + H5P handoff. Git LFS rules are installed for `.h5p`, `.p2rln`, `.zip`, `.whl` and `.tgz`, and the final technical report plus a reproducible full-import script are committed.

## Handoff package

Complete local handoff ZIP:

`P2RLN-0.6.1-Alpha15-H5P-COMPLETE-2026-09-12.zip`

Size: `109390525` bytes.

SHA-256: `d4445744a9c2274b2578dbcc8a39e0bf7997f0f574e0f16a460d1329e0801641`.

The ZIP contains 1612 entries and includes the expanded hardened source tree, artifacts, real H5P corpus, recovered host library store, evidence, scripts and provenance.

## Connector limitation

The connected GitHub repository API used in this chat can create/update Git blobs and repository files, but it does not expose Git LFS object upload or GitHub release-asset upload. The 109 MB aggregate handoff also exceeds GitHub's ordinary single-file 100 MB limit and must not be pushed as a normal Git blob.

Therefore the repository must not claim the large binaries are present until a Git/LFS-capable client has uploaded them. `scripts/import-complete-handoff.sh` performs the final canonical import from the delivered ZIP and routes learning-package/release binaries through Git LFS.

This limitation affects transport only; it does not change the verified source or its final gates documented in `docs/P2RLN-ALPHA15-H5P-FINAL-REPORT.md`.
