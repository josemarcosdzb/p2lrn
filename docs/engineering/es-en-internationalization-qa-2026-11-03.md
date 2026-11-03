# P2LRN: ES/EN internationalization QA

Validated on 3 November 2026 against GitHub `main` using Windows, Node.js, and real headless Chrome.

## Scope

- 65 matching Spanish and English HTML routes. The original Spanish site is preserved.
- Four English-specific website JavaScript files: `p2lrn.js`, `studio/studio.js`, `demo/viewer.js`, `analytics/demo.js`.
- Player runtime, quiz session, user-facing error messages, ARIA labels, course-rights labels, and localized title selection.
- Standard native questionnaire plus all nine standalone games: memory, matching, ordering, classification, word search, crossword, word wheel (rosco), fill in the blanks, and 3D. True/false runs separately.
- Language switch ES/EN, bilingual documentation links and search indexes, page counterpart parity, canonical and hreflang metadata at site build.

## Architecture and invariants

- `packages/toolkit/web/renderers/ui-i18n.js`: reviewed player labels and game diagnostics. `playerUiText()` chooses the page's language; `playerDiagnosticText()` translates only displayed diagnostics.
- `packages/toolkit/web/studio/studio-ui-i18n.js` and `packages/analytics/src/locale.js`: Studio and Analytics interface translations.
- `scripts/site-en-runtime-reviewed.json`: editorially reviewed UI translations consumed by `scripts/generate-site-english.mjs`.
- `scripts/site-i18n-ast.mjs`: recursively visits AST nodes including `Property.value`; technical object keys, import specifiers, anchors, MIME types, and locale identifiers remain unchanged.
- **Never translate** student answers, teacher-authored course titles or prompts, saved course data, package identifiers, grading rules, event/analytics schemas, or file integrity digests.
- The generated English `/en/` mirror keeps the same functions as Spanish. The EN selector is a real URL switch to the corresponding route, not a second static mockup.

## Validation commands

From repository root, after installing project dependencies:

```sh
node --test scripts/test-site-i18n-ast.mjs
node --test scripts/test-site-ui-locales.mjs
node --test packages/toolkit/test/player-ui-i18n.test.mjs packages/toolkit/test/questionnaire-all-types-audit.test.mjs packages/toolkit/test/questionnaire-classification.test.mjs packages/toolkit/test/quest-3d-player-physics.test.mjs
node scripts/generate-site-english.mjs
node scripts/verify-site-bilingual.mjs
node scripts/browser-smoke-p2lrn-i18n.mjs
```

The browser smoke requires Chrome or Edge and isolated pinned npm dependencies `playwright-core@1.64.1`, `three@0.186.1`, and `@dimforge/rapier3d-compat@0.21.0`, installed as specified by `.github/workflows/p2lrn-player-i18n.yml`.

## Observed results

- Node questionnaire, regression and 3D tests: **23/23 PASS**.
- AST walker regression tests, including nested object property values: **4/4 PASS**.
- Generator: **0 untranslated pending catalog entries**, 3,613 cached entries, 65 routes, 64 generated pages plus one retained manually reviewed English guide.
- Site verifier: **65 Spanish pages / 65 English pages / 4 English website JavaScript files — PASS**.
- Chrome browser on regenerated English output: matching 65-route HTML semantics; language switching in both directions; a native standard questionnaire in ES and EN; true/false in ES and EN; all nine further game renderer types in ES and EN — **PASS**.
- All **50** English mirror files that changed in the regeneration matched the GitHub bot's `main` commit `bf358bee74db9decb54dfad1ad9e6c28b2ba063c` by Git blob SHA. No separate feature branches created.

## Release verification boundary

The source and freshly generated mirror passed the above checks. **GitHub success is not, by itself, proof of an updated Netlify deployment.** At the time of the audit, `https://p2lrn.org/en/p2lrn.js` still served an older JavaScript version containing the Spanish label `Buscar en docs`, although the English routes returned HTTP 200. Public-site release should only be marked synchronized when the deployed script has `Search documentation`, matches the expected revision/hash, and live-browser checks pass.

This status must be rechecked following a successful Netlify build. Do not present the public website as fully updated solely because `main` is green.
