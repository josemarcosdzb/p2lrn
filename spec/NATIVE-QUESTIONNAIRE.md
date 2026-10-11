> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Native Questionnaire Profile 0.4.0

Profile: `https://p2lrn.org/profile/native-questionnaire`

Media type: `application/vnd.p2lrn.questionnaire+json`

Status: experimental.

## 1. Scope

This profile defines the first P2LRN-native executable educational activity. It is deliberately smaller than QTI and is intended for common questionnaire/practice interactions that can be authored independently, packaged once and rendered by any conforming P2LRN native-questionnaire runtime.

The profile initially covers:

- `single-choice`;
- `multiple-choice`;
- `true-false`;
- `text`;
- `fill-blanks`;
- `ordering`;
- `matching`.

This vocabulary was derived from the existing AulaP2P questionnaire behavior, then normalized so the package does not depend on AulaP2P types, IDs, React components or persistence.

## 2. Portable design vs learner state

The representation contains questionnaire design:

```text
title / description
questions
choices/items
scoring rules
optional time/attempt policy
optional portable solution key
presentation hints
```

It MUST NOT contain persisted learner attempts, grades, submissions, feedback records, user IDs, session PINs or local database identifiers.

A host may store runtime state externally through the Native Activity Runtime adapter.

## 3. Grading modes

### `embedded-key`

Every question carries its portable solution. This enables deterministic offline correction. The answer key is client-visible and therefore MUST NOT be treated as secret. This mode is suitable for practice and other contexts where answer-key secrecy is not a requirement.

### `host`

Solutions may be omitted. The native runtime emits answers and completion state but MUST NOT fabricate an authoritative score. A host may grade server-side or forward the answers to another assessment system.

## 4. Scoring modes

Each question may use:

- `all-or-nothing`;
- `partial-per-item`;
- `partial-with-penalty`.

Default behavior mirrors the source questionnaire semantics used for the initial implementation: single-choice, true/false and text default to all-or-nothing; multi-answer and structured interactions default to partial per item.

Question scores normally stay within `[0, points]`. When `partial-with-penalty` is enabled, an incorrect response may contribute a negative value down to `-points`, so errors can subtract from points earned elsewhere. The final questionnaire score is clamped to `[0, max]` and rounded to two decimals. Questionnaire normalized score is `raw / max` only when the questionnaire is authoritatively graded.

## 5. Stable internal identifiers

Question, choice, blank, ordering and matching IDs are activity-internal portable identifiers. Importers MUST NOT copy installation-local database IDs into these fields.

The AulaP2P adapter uses source IDs only transiently to resolve source solutions, then emits fresh deterministic-in-document IDs such as `q-1`, `q1-choice-1` and `q1-blank-1`.

## 6. AulaP2P bridge rule

The existing `aulap2p.curso.v1` canonical questionnaire extension remains the round-trip authority for returning to AulaP2P. The native representation is an executable projection of that already-portable design.

Priority is:

```text
QTI sidecar present -> preserve/use QTI profile
otherwise           -> try native questionnaire projection
mapping impossible  -> keep canonical course data + record explicit loss
```

A quiz is still one Activity. The bridge MUST NOT create both a canonical quiz Activity and a second native quiz Activity.

Generated native JSON is not exported back as a fake AulaP2P asset during round-trip.

## 7. Authoring

A standalone questionnaire can be created by any editor and then added to a reference Creator workspace:

```bash
p2lrn-create add-questionnaire my-course quiz.json --key quiz --parent course
p2lrn-create build my-course course.p2lrn --strict-profiles
```

The reference Creator validates the questionnaire before modifying the project.

## 8. Rendering

The first-party runtime uses semantic HTML controls for accessibility and keyboard use. Ordering currently uses explicit up/down controls rather than making pointer drag-and-drop mandatory; future renderers can add richer interaction while retaining an accessible path.

The 0.4.0a7 reference runtime enforces `required`, deterministic `shuffleQuestions`, `showFeedback`, `maxAttempts`, total-attempt timing and per-question timing in the standard renderer. Timing lives in external runtime state rather than the package. Game renderers enforce total-attempt timing but do not reinterpret per-question clocks; optional game hints fall back to the standard renderer. See `QUESTIONNAIRE-STATE.md`.

The same content model now supports alternative renderers without copying questions into a game-specific source of truth. The reference modular alpha provides memory, matching, ordering, fast true/false, word-search, crossword, rosco and a lightweight WebGL2 order/match renderer. Every game first proves that it can represent the **complete** questionnaire; partial conversion is rejected. All presentations persist answers and scores through the same native-questionnaire runtime contract.

A renderer preference is optional presentation metadata, not content duplication. The Creator may store it with `add-questionnaire --renderer ...`; renderer JavaScript remains host-installed under the thin-package rule.

## 9. When to use QTI instead

Do not extend this profile until it duplicates advanced QTI semantics. Complex test structures, certified QTI interoperability, CAT, PCI or other QTI-specific behavior should use the QTI profile. Native questionnaire exists to make common P2LRN activities simple and directly executable, not to replace QTI.
