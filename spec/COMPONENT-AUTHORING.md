> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Declarative Component Authoring - through alpha 7

Status: experimental Creator/Studio interoperability layer. It does not widen P2LRN Core 0.4.0 and it is not embedded executable code.

## 1. Separation of authorities

P2LRN separates three concerns that H5P-style authoring systems often need to solve together:

1. **data schema** - JSON Schema 2020-12 is authoritative for the component data shape;
2. **editor schema** - a small declarative document suggests controls, ordering, labels/help and select options;
3. **runtime implementation** - trusted host code registered in the Component/Renderer registries.

The editor schema MUST NOT replace data validation and MUST NOT contain JavaScript, module URLs, credentials or permission grants.

## 2. Component Catalog

A Studio may consume a `component-catalog/0.1` document. Each entry identifies an exact component/componentVersion and declares:

- runtime-contract version;
- current authoring data version;
- data-schema URI for each known data version;
- editor-schema URI for authorable data versions;
- localized title/description.

The catalog is external tooling metadata. A normal `.p2lrn` does not need to contain the whole catalog.

The reference catalog is available through the toolkit and can be inspected with:

```bash
p2lrn-create component-catalog
p2lrn-create component-catalog \
  --component https://p2lrn.org/component/callout \
  --component-version 1 \
  --authoring-documents
```

## 3. Data schemas

The component instance may declare the data schema it was authored against under `schemas.data`. The URI is informational/verification metadata and is part of the content instance; it does not cause network fetching during package validation or playback.

The reference catalog resolves its installed schema documents locally by `$id`. Unknown schema URIs are never auto-fetched.

## 4. Editor schema 0.1

`https://p2lrn.org/schema/component-editor/0.1` describes fields by JSON Pointer and a small cross-platform control vocabulary:

- `text`
- `textarea`
- `number`
- `checkbox`
- `select`
- `asset`
- `rich-text`
- `collection` (repeatable groups with nested declarative fields; added in alpha 7)

Labels, help and placeholders are language maps. `select` values are declarative options. A Studio is free to render a different UI as long as the resulting data validates against the authoritative data schema.

## 5. Versioning and migration

A catalog can retain data schemas for older versions even when only a newer data version is authorable. This is intentional:

```text
old package data v1 --host migration--> runtime data v2
new Studio authoring -----------------> data v2
```

The reference `callout` component keeps data schema v1 for old packages, authors new content as v2, and supplies an editor schema only for v2. Runtime migration remains host code and does not rewrite old package bytes.

## 6. Validation workflow

The Creator can validate a component authoring payload against the installed reference catalog:

```bash
p2lrn-create validate-component-authoring component.json
```

Unknown third-party components fail by default because the reference catalog cannot claim their data semantics. `--allow-unknown` performs only the portable native-component structural validation and reports the component as unknown.

This command is an authoring/conformance aid. `add-component` itself remains able to package structurally valid third-party/future component instances so preservation is not coupled to the current reference catalog.

## 7. Reference components

The reference catalog includes `https://p2lrn.org/component/callout` version 1:

- legacy/migration data schema 1: `.../schema/data/1` (`text`);
- authoring/runtime target data schema 2: `.../schema/data/2` (`body`);
- editor document: `https://p2lrn.org/component/callout/editor/2`.

The purpose is to prove that independent authoring, versioned data and host migration can use the same component identity without bundling implementation code into `.p2lrn`.

Alpha 7 also includes `https://p2lrn.org/component/timeline` version 1. Its authoring data uses a repeatable `items` collection, exercising nested declarative editor fields while remaining a data-only component. The installed host renderer is not copied into the package.
