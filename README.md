# P2RLN 0.6.1

P2RLN is an experimental portable learning graph and package format. The current handoff is based on **P2RLN 0.6.1 / Core 0.4.0**, with **Creator/Toolkit 0.4.0a15** and **Reading System/Web SDK 0.4.0a15 / 0.4.0-alpha.15**.

This repository is being used as the canonical Git target for the reconciled Alpha 15 + H5P hardened work delivered on 2026-09-12.

Current verified handoff gates:

- 21/21 test modules PASS
- 214 passed, 12 skipped, 0 failed
- H5P runtime 13/13
- SCORM runtime 29/29
- strict examples 17/17
- Web SDK example opening 17/17
- JS/MJS syntax 103/103
- JSON parse 116/116
- source SHA256SUMS 373/373

General H5P `deliver` remains deliberately disabled until the pinned H5P Standalone 3.8.2 real-browser gate and the external-library asset closure are complete. See `docs/P2RLN-ALPHA15-H5P-FINAL-REPORT.md`.

## Binary policy

Large learning-package fixtures and release archives use Git LFS patterns (`.h5p`, `.p2rln`, `.zip`, `.whl`, `.tgz`). They must not be committed as ordinary Git blobs. The connected GitHub API used for this handoff can write repository files but does not expose Git LFS object upload or release-asset upload, so binary corpus/release payloads require a Git/LFS-capable client for the final transfer.

The source/package handoff remains available from the originating ChatGPT delivery with its checksums; this repository must not claim a binary has been uploaded until the corresponding Git/LFS object exists.
