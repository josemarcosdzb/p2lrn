# P2RLN Alpha 15 + H5P — final technical report

## Scope

This repository tracks the P2RLN Alpha 15 + H5P integration line. SCORM/Core/Creator behavior was not redesigned. The H5P implementation preserves the original `.h5p` bytes inside P2RLN and uses the shared Reader/Web SDK runtime rather than embedding a second player in each package.

The delivered source incorporates the reconciled Alpha 15 SCORM 2004 sequencing behavior, including `exitParent`, `suspendAll`, and prior-attempt progress semantics, plus the H5P runtime implementation and host-library asset-closure hardening.

## Final H5P hardening

The runtime originally considered an external H5P library resolved once matching `library.json` metadata and recursive dependencies were available. That was insufficient because declared compiled `preloadedJs`/`preloadedCss` assets can still be absent. The final implementation validates those declared paths, enforces safe relative paths and realpath containment, verifies physical assets for bundled and host-shared libraries, and refuses session creation with `P2RLN_H5P_LIBRARY_ASSETS_MISSING` before browser execution when assets are absent.

## Final regression

The hardened source was exercised module-by-module with pytest plugin autoload disabled.

- 21/21 modules PASS
- 214 passed
- 12 skipped
- 0 failed
- H5P Web Runtime: 13/13
- SCORM Web Runtime: 29/29
- Web SDK distribution: 13/13
- Strict shipped-example validation: 17/17
- Web SDK shipped-example opening: 17/17
- JavaScript/MJS syntax: 103/103
- JSON parse: 116/116
- Source SHA256SUMS: 373/373

The 12 skips are explicit external-corpus/fixture skips, not failures.

## Real H5P corpus

Original SHA-256 values:

- Arts of Europe: `9d7f30cc039145df00444d5d145831304bb8628d6f63563a5eb95295b69a0a58`
- Boardgame: `5a84a2cad6deb822b557b4088786e6a36b3a5b65aa927df68913d65f12cca73f`
- Crossword: `efdb7c8ad209d99d3393104ae26d3faff133ea647edd1ff08a170f3dfd2fd0da`

The transformed P2RLN packages preserve those source bytes 3/3.

With the recovered host store:

- Boardgame: `201`, bundled/self-contained, 12 dependencies resolved.
- Arts of Europe: expected `409 P2RLN_H5P_LIBRARY_ASSETS_MISSING` because two BranchingScenario compiled assets are absent.
- Crossword: expected `409 P2RLN_H5P_LIBRARY_ASSETS_MISSING` because four Crossword/Components compiled assets are absent.

The gate is 3/3 expected outcomes with fail-closed behavior.

## Host H5P store

Recovered AulaP2P v16.4.9 archive SHA-256: `ec91f60c2eeb7f628c9a658dd5a2898e61ba948a08e1c28151016cf393af7699`.

The recovered store contains 36 library folders, 856 files and 105 declared preloaded JS/CSS assets. No invalid `library.json` metadata was detected, but 8 declared preloaded assets are missing. The P2RLN runtime therefore rejects affected sessions rather than claiming they are runnable.

## H5P Standalone 3.8.2

The runtime target remains H5P Standalone 3.8.2. Expected upstream release SHA-256:

`bd2ca8486466006799e4d64732b18188afbaa69852ab97534b6e99e5f3ca4f57`

General H5P `deliver` remains deliberately off until a complete host library store exists for the target content, verified H5P Standalone 3.8.2 bytes are installed, and the real Chromium playback/state/xAPI gate passes.

## Provenance

The historical exact Alpha 15 source archive was unavailable, so byte identity with that missing archive is not claimed. The handoff is the reconciled tree derived from the persisted Alpha 14 authority plus the verified Alpha 15 sequencing behavior and H5P integration/hardening.
