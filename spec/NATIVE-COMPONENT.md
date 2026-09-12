> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Native Component Instance - experimental profile

Status: implemented in the reference Toolkit/Reading System 0.4.0a7. This profile does **not** widen P2LRN Core 0.4.0.

## 1. Purpose

A native component is a small declarative activity instance whose implementation is supplied by the trusted host. It exists so P2LRN can express reusable educational widgets without copying JavaScript, CSS frameworks or rendering engines into every package.

```text
.p2lrn
  component id + versions + data
        |
        v
host Component Registry
        |
        +-- deterministic data migration
        +-- trusted internal renderer
        v
DOM / Canvas / WebGL / other host surface
```

The representation profile is `https://p2lrn.org/profile/native-component` and the media type is `application/vnd.p2lrn.component+json`.

## 2. Instance document

The portable instance schema is `https://p2lrn.org/schema/native-component/0.1`.

```json
{
  "schema": "https://p2lrn.org/schema/native-component/0.1",
  "version": "0.1",
  "component": {
    "id": "https://p2lrn.org/component/callout",
    "componentVersion": "1",
    "dataVersion": "1",
    "runtimeContractVersion": "1"
  },
  "data": {
    "heading": "Antes de continuar",
    "text": "Guarda tu trabajo.",
    "tone": "note"
  }
}
```

The four version axes are intentionally independent:

- `componentVersion` identifies the component contract/implementation family;
- `dataVersion` identifies the instance data shape;
- `runtimeContractVersion` identifies the P2LRN host/component execution contract;
- the outer instance `version` identifies this P2LRN instance-envelope schema.

A change in one axis MUST NOT be silently inferred from another.

## 3. Core graph binding

A native component is a normal Core `activity` with activity type `https://p2lrn.org/type/component`. Its direct Resource MUST expose an embedded `native-component` representation with the exact native-component media type.

The component data remains content. Its executable implementation does not become another hidden package authority.

## 4. Component Registry

The reference Reading System resolves `(component.id, componentVersion)` against a host-installed Component Registry. A registry entry declares:

- the exact component ID and component version;
- the supported P2LRN runtime-contract version;
- the target data version;
- deterministic host-side migrations;
- a trusted renderer ID;
- optional host-side data validation.

An unknown component, unknown component version, runtime-contract mismatch or missing migration path fails explicitly. A Reading System MAY choose another Core representation of the same Resource when one is available.

## 5. Data migration

Migrations are host code and MUST NOT be embedded or auto-executed from package content. The reference registry clones source data before each migration, applies a deterministic registered path, validates the prepared result and leaves package bytes unchanged.

This means an old valid package may continue to use `dataVersion: "1"` while a newer compatible host prepares it as version `2` in memory. The package's integrity/contentRoot does not change merely because a host can migrate it for rendering.

Format validity and local runtime support are distinct. A structurally valid future `runtimeContractVersion` remains valid/preservable even when the current host cannot deliver it.

## 6. Internal renderers cannot be package-selected

Component implementation renderers are registered with `selectable: false`. Package renderer hints and the HTML `renderer="..."` attribute cannot select them directly. Only the trusted Component Registry may delegate to them after component/version/data negotiation.

This prevents a component payload from bypassing component validation or host migration policy by naming an implementation renderer directly.

## 7. Component capability document

The first-party Reader publishes its installed component implementations separately from the existing Core capability document, using `component-capabilities/0.1`. This avoids widening the Core 0.4.0 capability schema merely to advertise a tooling/runtime layer.

The reference host currently installs one demonstration component:

`https://p2lrn.org/component/callout` component version `1`, accepting data versions `1` and `2`, with target data version `2`.

The component is deliberately simple. Its role is to prove the generic contract, version negotiation and migration boundary rather than to turn P2LRN into a fixed widget catalog.

## 8. Authoring

The reference Creator accepts a standalone component-instance JSON:

```bash
p2lrn-create add-component course component.json --key notice --parent lesson
```

The command validates the portable instance before mutation, creates one Resource + Activity and keeps implementation code out of the package. Other authoring products may use completely different editors while emitting the same instance document.

Alpha 6 also defines a separate declarative Component Catalog + Editor Schema layer so independent Studio implementations can discover component data schemas and build forms without importing the runtime implementation. See `COMPONENT-AUTHORING.md`.

## 9. Security and package weight

A native component instance MUST NOT be interpreted as permission to execute package JavaScript, load a remote module or grant browser privileges. Renderer/dependency permissions remain host policy.

The reference callout example is roughly two kilobytes as a complete `.p2lrn` and contains no JavaScript. Adding more installed components therefore grows the Reading System once, not every package.
