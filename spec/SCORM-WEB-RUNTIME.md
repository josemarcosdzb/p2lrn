> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN SCORM Web Runtime - alpha 15

Status: experimental Reading-System/Web-SDK runtime. P2LRN Core remains 0.4.0 and the `.p2lrn` package format is unchanged.

## Current automatic browser path (2026-10-17)

Player now defaults to an opaque sandbox and a private transferred MessageChannel. `runtime-base-url` is optional; a dedicated HTTP runtime origin is an explicit compatibility option. The server topology below describes that optional mode, not a prerequisite for portable playback. See [automatic runtime validation](AUTOMATIC-RUNTIME-VALIDATION.md) for tested packages, rehydration behavior and browser restrictions. No universal SCORM/H5P delivery conformance is declared.

## Scope

Alpha 12 introduced the first first-party browser execution path for preserved SCORM representations. Alpha 13 added the isolated different-origin parent-frame topology required by packages that discover `parent.API`, `parent.API_1484_11` or an opener-compatible API. Alpha 14 kept those boundaries and recovered the SCORM 2004 manifest/sequencing/navigation base that already existed in AulaP2P `todo-funciona`. Alpha 15 keeps that recovered base and adds the bounded hierarchical attempt/rule/rollup execution required by the regression corpus.

The preserved SCORM ZIP remains authoritative. P2LRN does not rewrite a SCORM course into another proprietary sequencing format, and P2LRN Core sequencing is not substituted for SCORM sequencing.

## Recovered AulaP2P authority

The read-only source authority for this integration is:

- repository: `josemarcosfrodo/aulap2p`;
- branch: `todo-funciona`;
- commit: `9f90e1f54d2add5e19c95bbbc510193fe627abff`;
- XML parser: `backend/src/learning-standards/xml/xml-lite-parser.ts` (`26d9c91787ee761f5de2b7fea76d8d62ff5a694c`);
- manifest parser: `backend/src/scorm-runtime/scorm-manifest-parser.service.ts` (`c51aa5c4c0ad068c1c42651f0fad1e26eeacb561`);
- navigation resolver: `backend/src/scorm-runtime/scorm-sequencing.service.ts` (`f61e1eb72f5e582e7f3635e459742d81f2930645`).

Alpha 13 had already adapted the AulaP2P CMI model. Alpha 14 additionally adapted the three files above into framework-neutral browser modules. Alpha 15 extends that portable module with SCORM-defined hierarchical attempt, rule and rollup behavior; NestJS exceptions/providers, Prisma queries, database session mutation and AulaP2P authentication remain deliberately outside the runtime.

The portable modules are:

- `packages/toolkit/web/xml-lite.js`;
- `packages/toolkit/web/scorm2004-sequencing.js`;
- the corresponding generated `web_sdk/dist/` copies.

## What Alpha 15 now executes

The Alpha 14 compatibility base remains intact and Alpha 15 adds a bounded hierarchical sequencing layer:

- namespace-tolerant `imsmanifest.xml` parsing, SCORM 1.2/2004 detection and preserved organization/resource hierarchy;
- parsed `controlMode`, `deliveryControls`, limit conditions, pre/post/exit rules, rollup controls and full rollup-rule condition/action metadata;
- current activity resolution plus hierarchical parent/descendant relationships without inventing a P2LRN sequencing graph;
- flow/choice filtering for `skip`, `disabled`, `hiddenFromChoice` and `isvisible=false`;
- post-condition `continue`, `previous`, `retry`, `retryAll`, `exitParent` and `exitAll`, plus ancestor exit-condition `exit`;
- per-activity attempt count, active/suspended state, completion/progress, satisfaction/normalized-measure state and a bounded previous-attempt snapshot;
- `suspendAll` serialization and resume of the same active path without incrementing the activity attempt count;
- `exitParent` termination of the intended aggregation subtree without closing the virtual organization/course root;
- direct-child rollup sets `all`, `any`, `none`, `atLeastCount` and `atLeastPercent` with completed/incomplete and satisfied/not-satisfied actions;
- `useCurrentAttemptProgressInfo` and `useCurrentAttemptObjectiveInfo` handling, including previous-attempt fallback when the corresponding flag is false;
- persisted sequencing state alongside CMI state through Host Adapter v1; learner tracking remains outside the `.p2lrn` package;
- `adl.nav.request_valid.continue`, `.previous`, targeted `.choice` and `.jump` values, plus fixed/targeted request validation;
- post-`Terminate()` sequencing for explicit requests and `_none`, allowing manifest post-condition rules to drive the next activity;
- target SCO relaunch through both runtime topologies and `p2lrn:navigation` events at the host boundary.

The implementation deliberately remains a bounded subset rather than claiming the entire SCORM 2004 Sequencing and Navigation pseudocode.

## Runtime API and CMI boundary

The runtime continues to provide:

- SCORM 1.2 `API`: `LMSInitialize`, `LMSFinish`, `LMSGetValue`, `LMSSetValue`, `LMSCommit`, `LMSGetLastError`, `LMSGetErrorString`, `LMSGetDiagnostic`;
- SCORM 2004 `API_1484_11`: `Initialize`, `Terminate`, `GetValue`, `SetValue`, `Commit`, `GetLastError`, `GetErrorString`, `GetDiagnostic`;
- AulaP2P-derived CMI field limits, allowed values, numeric/range checks, time/duration validation, objective/interaction rules, dynamic counts and suspend/resume entry behavior;
- Host Adapter v1 `loadState` / `saveState` persistence and `reportScore` forwarding;
- exact nested-package `package-member` execution only after the outer P2LRN package has passed its integrity checks.

Server-side files inside a preserved SCORM ZIP are bytes only. The browser runtime never executes PHP, ASP, CGI or other server-side source as server code.

## NPM/runtime-host deployment

`@p2lrn/player` ships the browser player and the Node runtime-host export:

```bash
npm install @p2lrn/player
```

The isolated host can be mounted below a route prefix such as `/runtime`:

```js
import {createP2LRNRuntimeHandler} from '@p2lrn/player/server';

app.use(createP2LRNRuntimeHandler({
  basePath: '/runtime',
  allowedParentOrigins: ['https://app.example.com'],
}));
```

For canonical parent-frame discovery, the runtime host must be exposed through a browser origin different from the embedding application:

```text
Application:   https://app.example.com/
Runtime host:  https://runtime.example.com/runtime/
```

Configure the browser side with:

```js
import {configureRuntimeHost} from '@p2lrn/player';

configureRuntimeHost({
  baseUrl: 'https://runtime.example.com/runtime/',
});
```

or per player:

```js
await mountP2LRN('#course', {
  src: '/courses/course.p2lrn',
  runtimeBaseUrl: 'https://runtime.example.com/runtime/',
});
```

A same-origin value is rejected with `P2LRN_SCORM_RUNTIME_ORIGIN_NOT_ISOLATED`. A URL path alone is not a browser security boundary.

## Isolation and transport

The application verifies the `.p2lrn` package and reads the preserved nested SCORM ZIP. The runtime host receives only the already verified runtime file buffers needed for launch; it does not receive LMS credentials or become the persistence authority.

The outer SCORM runtime frame is loaded from the dedicated runtime origin. Its SCO child shares that isolated runtime origin, allowing `parent.API` / `parent.API_1484_11` discovery while browser same-origin policy prevents access to the application document.

The application-to-runtime control channel uses a transferred `MessageChannel`. No runtime capability token is placed in the runtime URL, query string, fragment or `.p2lrn` package. SCORM state and score cross back only through the P2LRN host boundary.

## What Alpha 15 still does not claim

Alpha 15 is not a SCORM certification and the default capability document still avoids blanket `scorm.deliver` conformance. The implemented subset closes the hierarchical/attempt/rollup failures covered by the Alpha 15 gate, but it does not pretend to be the complete SCORM 2004 Sequencing and Navigation reference algorithm.

Still open before a general SCORM delivery/conformance claim:

- complete enforcement of every sequencing `controlMode`, constrained-choice, delivery-control, selection and randomization behavior;
- local/global objective maps and all objective-selection/measure-rollup edge cases;
- full rollup-consideration controls (`requiredFor*`, progress/measure weighting and all edition-specific derivations);
- every termination/navigation subprocess and activity-tree edge case defined by the SCORM pseudocode;
- complete per-SCO CMI state partitioning and all multi-SCO lifecycle combinations;
- exhaustive SCORM 1.2/2004 CMI data-model/error-code conformance;
- arbitrary JavaScript-created package-relative URL virtualization beyond the current static mapping;
- a broader real-browser SCORM 1.2/2004 corpus and an external conformance test suite.

This boundary is deliberate: Alpha 15 executes the subset it tests and keeps unsupported conformance areas explicit instead of advertising a false complete runtime.

## Verification boundary

The Alpha 13 isolated-origin Chromium gate remains valid for the unchanged topology files it covered: parent/opener API discovery, score/state persistence and browser-origin isolation were demonstrated before a later managed-browser policy blocked local-HTTP reruns.

Alpha 14's historical gate remains recorded in `reconciliation/alpha14-gate.json`. Alpha 15 adds 18 focused regressions over that inherited SCORM module: the SCORM file gate is 29/29 and the combined SCORM + Web SDK distribution gate is 42/42. The full integrated project gate is recorded separately with the Alpha 15/H5P reconciliation artifact.

