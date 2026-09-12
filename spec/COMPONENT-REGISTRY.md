> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Component Registry - host runtime contract alpha 5

Status: experimental host/Reading-System layer. It is not part of Core 0.4.0.

## Identity and lookup

Component implementations are selected by the exact pair `(component id, componentVersion)`. The registry never guesses a compatible component implementation from a similar name or a higher/lower version.

The instance also declares `runtimeContractVersion`. The reference registry is contract `1`; an implementation registered into it must use the same contract.

## Migration

Each implementation may expose a directed set of data migrations. The reference registry finds a deterministic shortest registered path from the package `dataVersion` to the implementation's target data version. Migrations receive cloned JSON data and frozen portable context. Their result is cloned again before the next step.

No migration modifies the `.p2lrn`, graph, manifest, contentRoot or source instance object.

## Renderer delegation

A component registry entry names a renderer already installed in the host Renderer Registry. Implementation renderers are normally non-selectable externally. The generic native-component router is the selectable renderer for `application/vnd.p2lrn.component+json` and performs this order:

1. parse and validate the component instance;
2. resolve exact component/version/runtime contract;
3. migrate and validate data in memory;
4. resolve the trusted internal renderer;
5. run its normal dependency/permission gates;
6. render the prepared instance.

Package content cannot supply `load()` functions or renderer module URLs.

## Host API

Trusted integrations may register implementations before playback:

```js
P2LRN.registerComponent({
  id: "urn:example:component",
  componentVersion: "1",
  runtimeContractVersion: "1",
  rendererId: "urn:example:internal-renderer",
  targetDataVersion: "2",
  supportedDataVersions: ["2"],
  migrations: [{from: "1", to: "2", migrate(data) { return {...data}; }}],
  validateData(data) { return true; }
});
```

This is trusted host code, not a package instruction.

## Failure model

Reference error codes distinguish unavailable component, unavailable component version, runtime-contract mismatch, migration absence/failure, invalid prepared data and missing component renderer. Optional generic renderer selection may then try another compatible Core representation. Explicit host/required selection fails instead of silently substituting semantics.
