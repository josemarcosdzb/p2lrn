> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Creator System 0.3.0

## 1. Purpose

The Creator System is the reference authoring/packaging component that produces a `.p2lrn` artifact.
It is separate from the P2LRN Reading System.

```text
P2LRN Creator -> course.p2lrn -> P2LRN Reader
```

A conforming P2LRN implementation does not have to use this Creator internally. It only has to emit a package that conforms to the Core and declared profiles.

## 2. Two creation paths

### Native creation

```text
editable authoring project
    -> portable graph compiler
    -> content-addressed payload builder
    -> manifest builder
    -> integrity builder
    -> self-validator
    -> .p2lrn
```

### Transformation of an existing learning package

```text
SCORM/H5P/QTI/cmi5/IMSCC/etc.
    -> detector
    -> preservation-first transformer
    -> portable projection
    -> provenance
    -> self-validator
    -> .p2lrn
```

Both paths must end in the same Core package contract.

## 3. Editable workspace is not part of the standard

The reference Creator uses `p2lrn.project.json` project contract `0.3.0`, but this file is an authoring implementation detail.
Other editors may use SQL, YAML, a visual graph, Git, a CMS or any other internal representation.
They must not be required to adopt the reference Creator project schema.

The interchange authority remains:

```text
META-INF/manifest.json
content/graph.json
```

## 4. Stable portable identities

For newly authored entities the Creator generates identifiers deterministically from the project identity and human-readable project keys. For a package opened into an editable workspace, project `0.3.0` stores the imported `portableId` explicitly and the Builder MUST reuse it. Rebuilding an unchanged imported project therefore preserves Course/Unit/Activity/Resource/Object/Representation IDs.

Local editor/database IDs are never serialized as P2LRN identity.

## 5. Asset compilation

A local source file is read only at build time and emitted under:

```text
assets/sha256/aa/bb/<full-sha256>
```

Multiple references to identical bytes use the same physical payload.
The original filename remains representation metadata only.

Remote resources are recorded as remote locations and are not fetched by the Creator merely to build the package.

## 6. Build transaction

A native build is successful only when all of the following complete:

1. validate authoring project;
2. resolve project references;
3. generate stable portable IDs;
4. generate Core graph;
5. read and hash embedded payloads;
6. build manifest;
7. calculate logical `contentRoot`;
8. create ZIP/ZIP64 with safe deterministic paths;
9. run the P2LRN reference validator against the completed artifact.

If final validation fails, the Creator must report failure instead of describing the output as a valid P2LRN package.

## 7. Reference CLI

```bash
p2lrn-create init my-course --title "Física I" --language es
p2lrn-create add-unit my-course --key mechanics --title "Mecánica"
p2lrn-create add-file my-course lesson.html --key intro --title "Introducción" --parent mechanics
p2lrn-create add-url my-course https://example.org/lab --key lab --title "Laboratorio" --parent mechanics
p2lrn-create build my-course fisica.p2lrn
```

Existing packages use:

```bash
p2lrn-create convert source.zip output.p2lrn
```

## 8. Reader/Creator separation

The Creator may know how to author or transform content that the baseline Reader cannot execute.
Conversely, a Reader may support runtimes that a Creator never authored.

Capabilities must therefore remain explicit; creation support does not automatically imply `deliver` support.


## 9. Canonical document reader integration

The reference Creator may consume a mature external document reader through an adapter. The first reference adapter consumes AulaP2P `aulap2p.documento.extraido.v1` and its optional `aulap2p.documento.multimodal.v2` sequence.

```text
AulaP2P Reader -> canonical document -> P2LRN source adapter -> Builder
```

This is an implementation integration, not a Core dependency. Local database/storage identity is stripped at the adapter boundary. See `AULAP2P-CREATOR-BRIDGE.md`.

## Native renderer preference (modular runtime alpha 2)

For a native questionnaire the reference Creator accepts an optional installed-renderer preference:

```bash
p2lrn-create add-questionnaire project quiz.json --key quiz \
  --renderer https://p2lrn.org/renderer/questionnaire/crossword \
  --renderer-version 1
```

The Creator writes only `https://p2lrn.org/ext/renderer-preference/1` on the Activity. It MUST NOT copy the renderer implementation, player, unrelated game CSS or generic 3D libraries into the `.p2lrn`. The identifier does not grant permissions and does not make an unavailable renderer part of package conformance. A non-required hint may fall back at playback.


## Native composite creation (modular runtime alpha 4)

The reference Creator can group already-authored Activities without copying their content:

```bash
p2lrn-create add-composite project --key lesson --title "Lesson" \
  --mode sequence --completion all --children act-a act-b
```

The generated composite representation contains traversal/completion configuration only. Child identity and order MUST remain in the enclosing Activity `children` array. The reference operation validates a deep-copy candidate before mutating the in-memory workspace and atomically writes the small configuration file. By default selected children are detached from their previous hierarchy parents to avoid accidental duplicate placements.

## Native component creation (modular runtime alpha 5)

A component instance can be authored by any external editor and added as declarative JSON:

```bash
p2lrn-create add-component course component.json --key notice --parent module
```

The Creator validates `native-component/0.1` before mutation, creates exactly one Resource + Activity and uses the normal content-addressed Builder path. It does not copy component implementation code, migration code or permission grants into the package. Runtime compatibility is not confused with format validity: a structurally valid future runtime-contract value can still be packaged/preserved even when the current Reader cannot deliver it.


## 10. Open existing P2LRN as an editable workspace

The Node/TypeScript Creator supports a preservation-first authoring round-trip:

```text
course.p2lrn
 -> validate and open
 -> p2lrn.project.json 0.3.0 + materialized package files
 -> edit understood fields
 -> build
 -> course-v2.p2lrn
```

Project `0.3.0` adds the state required to avoid destructive reconstruction: imported `portableId` values, explicit entity order and entrypoints, profile/graph preserve policies, and `preservedFiles`/`package-file` sources for package members that Studio does not need to reinterpret. Multiple representations may share one physical package payload only when their source declarations are consistent. A preserved file may not silently collide with an editable representation payload.

For an unchanged canonical P2LRN course package, the required regression is the neutral logical round-trip gate: `contentRoot` MUST remain identical. ZIP byte identity and `packageId` are not required. Imported external packages embedded as opaque payloads retain their bytes.

The current reference authoring workspace is course-oriented and requires one primary course entrypoint. Core packages with a different top-level authoring shape remain valid P2LRN and can be validated/read/repacked, but are not falsely claimed as editable course workspaces.

## 11. Stable Studio integration boundary

Studio MUST consume `@p2lrn/toolkit/authoring`, not Creator implementation files. The public API version is independent from the workspace schema version. Version 1 exposes workspace creation, package opening, load/reload, validated replacement/update and build.

Capability claims are machine-readable in `config/authoring-capabilities.json`. Native authoring parity requires each native profile to be authorable by Creator and readable/preservable by Reader. External profiles distinguish transform/preserve support from runtime `deliver` support.


## 12. Legacy authoring migration

Creator project 0.1/0.2 files remain loadable, but Studio should migrate them before editing:

```text
p2lrn-create upgrade workspace
```

The migration validates both the source and target contracts, writes canonical `p2lrn.project.json` 0.3.0, and leaves the historical project file in place. `creatorMetadataVersion` is retained as a compatibility baseline for the emitted Creator extension so a no-op workspace-schema upgrade does not itself modify `contentRoot`.

Opening an Alpha15 P2RLN package follows a different path: the already-authoritative canonical repack algorithm first normalizes P2RLN-owned JSON/paths/digests to P2LRN, then the normal P2LRN authoring importer materializes the workspace. External package payloads remain opaque and byte-preserved.
