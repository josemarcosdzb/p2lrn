> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Native Composite Activity - experimental profile 0.1

Status: implemented experimental profile layered on P2LRN Core 0.4.0. It does not widen Core.

## 1. Purpose

A composite groups existing portable Activities into one pedagogical block without copying their content or bundling another runtime engine.

```text
Activity(type=composite)
  children -> Activity A
           -> Activity B
           -> Activity C
  resource -> tiny composite policy JSON
```

The ordered `Activity.children` array in the P2LRN graph is the sole authority for child identity and order. The composite JSON MUST NOT duplicate that list.

Profile: `https://p2lrn.org/profile/native-composite`

Media type: `application/vnd.p2lrn.composite+json`

Schema: `https://p2lrn.org/schema/native-composite/0.1`

Activity type: `https://p2lrn.org/type/composite`

## 2. Declarative payload

Example:

```json
{
  "schema": "https://p2lrn.org/schema/native-composite/0.1",
  "version": "0.1",
  "mode": "sequence",
  "completion": "all",
  "navigation": "linear",
  "title": "Lesson block"
}
```

`mode` is `sequence` or `free`. `sequence` requires `linear` navigation; `free` requires `open`. `completion` is `all` or `any`.

The representation contains policy, not learner state, renderer code or child copies.

## 3. Graph requirements

A native composite Activity MUST:

1. have at least one `children` entry;
2. point every child to an existing `activity` entity;
3. point `resource` to a Resource containing an embedded native-composite representation;
4. participate in an acyclic hierarchy;
5. not repeat the same child in its `children` array.

A validator MUST reject broken references, duplicate child references and hierarchy cycles before playback.

## 4. Runtime semantics

The renderer resolves children from the already validated graph and invokes the same host Renderer Registry used for ordinary activities. It MUST NOT carry a second private questionnaire/game/media runtime.

For `sequence` mode, child `n` is visitable only when every previous child is complete. Restored state is sanitized to the longest contiguous completed prefix. A completion/score event from a non-current direct child is ignored in sequence mode.

For `free` mode, every direct child may be visited. Completion still follows the declared `all` or `any` policy.

A child renderer failure MUST remain visible; a sequence MUST NOT silently skip the failed child.

## 5. External state

Composite learner state is outside the package and uses `p2lrn-composite-state/0.1` in the reference implementation. It may record current child, completed child IDs and child score summaries. The package itself remains immutable.

State does not override graph semantics. Unknown child IDs are discarded and sequence gaps cannot unlock later children.

## 6. Thin-package rule

The canonical `.p2lrn` contains only the small policy representation plus the child activities/assets that are already part of the package. Generic composite UI/runtime code is host-installed and lazy-loaded.

This permits nested lessons, modules and activity sequences without multiplying package size as more renderer types are installed in the ecosystem.
