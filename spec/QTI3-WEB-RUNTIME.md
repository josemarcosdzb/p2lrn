# QTI 3 Web Runtime

Status: bounded QTI 3 delivery implementation.

The P2LRN Player contains a QTI 3 renderer for preserved/projected QTI item resources. The source QTI XML remains authoritative.

## Supported delivery contract

The runtime currently accepts:

- QTI 3 `qti-assessment-item`;
- exactly one interaction per item;
- `qti-choice-interaction`;
- `qti-text-entry-interaction`;
- `qti-extended-text-interaction`;
- `qti-correct-response`;
- the standard `match_correct` fixed response-processing template;
- single and multiple identifier responses for choice interactions;
- scalar string/integer/float responses for text interactions;
- Host Adapter state persistence and score reporting.

The renderer returns a deterministic local 1/0 score only for the standardized `match_correct` path. It does not reinterpret arbitrary response processing.

## Explicitly unsupported

The runtime fails with a specific P2LRN error instead of approximating semantics for:

- QTI 2.x;
- adaptive items;
- multiple interactions in one item;
- `map_response`;
- `map_response_point`;
- general/custom response processing;
- interactions other than the three listed above;
- assessment-test orchestration.

These remain preserved in the source package and may still be transformed or delivered by another compliant QTI engine.

## Renderer

Renderer id:

`https://p2lrn.org/renderer/qti3/runtime`

Profile:

`https://p2lrn.org/profile/qti`

The renderer accepts embedded or package-member XML representations. A package converted from QTI keeps the original QTI package as the authoritative payload.

## Gate

`packages/toolkit/test/qti3-runtime.test.mjs` verifies parsing, match-correct scoring, unsupported processing rejection, QTI 2 rejection, state sanitization, and renderer selection.
