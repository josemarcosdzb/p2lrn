> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Native Questionnaire State 0.2

Status: experimental external-runtime contract. This state is **not stored inside the `.p2lrn` package** and does not widen Core 0.4.0.

The native questionnaire and all of its alternative game renderers use one state envelope: `p2lrn-questionnaire-state/0.2`. The host may persist that envelope through `loadState` / `saveState`; switching renderer must not create a second answer or score store.

State contains portable question IDs, answer values, question order, attempt count, completion reason, renderer-specific ephemeral `gameState`, and timing deadlines. It contains no user ID, enrolment, payment, database key, runtime token or host secret.

## Timing semantics

`attemptPolicy.timeLimitSeconds` starts when a non-completed attempt is first mounted. The persisted absolute deadline continues across reloads and renderer changes; a reload does not reset the clock. Expiration completes the attempt with the answers already present and records `completionReason = "time-limit"`.

Per-question `timeLimitSeconds` is supported by the standard renderer. In `one-at-a-time` mode the clock for a timed question starts when that question is first shown, persists across navigation/reload, and an expired question becomes read-only. The runtime advances to the next question; expiry of the final question completes the attempt. In `all` mode all per-question clocks start when the attempt is mounted and each expired question becomes read-only.

Alternative game renderers deliberately do not reinterpret per-question clocks because their presentation can combine or reorder questions. A game renderer therefore reports `P2LRN_TIMING_UNSUPPORTED`; an optional renderer hint falls back to the standard renderer, while an explicit/required game renderer fails instead of changing timing semantics.

The reference runtime emits `p2lrn:timeupdate` and `p2lrn:timeout` in addition to the existing answer/progress/state/score/completion events.

## Migration

The reference runtime accepts the previous `p2lrn-questionnaire-state/0.1` shape and migrates its answers, order, score and attempt count into 0.2. Since 0.1 had no timing namespace, timing starts only when that legacy state is first resumed under a timed activity.
