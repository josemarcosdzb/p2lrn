# P2RLN Creator/Toolkit 0.4.0a15

The Creator is the reference place where a native `.p2rln` package is made.
It deliberately separates an **editable project workspace** from the immutable/distributable `.p2rln` artifact.

```text
editable workspace
  p2rln.project.json
  assets/
       |
       v
P2RLN Creator / Builder
       |
       +-- portable IDs
       +-- graph.json
       +-- content-addressed assets
       +-- manifest.json
       +-- SHA-256/contentRoot
       +-- final self-validation
       v
course.p2rln
```

## Native creation

```bash
p2rln-create init my-course --title "Física I" --language es
p2rln-create add-unit my-course --key mechanics --title "Mecánica"
p2rln-create add-file my-course lesson.html --key intro --title "Introducción" --parent mechanics --profile https://p2rln.org/profile/web-content
p2rln-create build my-course fisica.p2rln --strict-profiles
```

## Passive multi-file web content

A passive HTML lesson with relative CSS/images/fonts/media can be authored as a directory instead of flattening or rewriting its URLs:

```bash
p2rln-create add-web-content my-course ./lesson-web \
  --entrypoint index.html \
  --key lesson-web \
  --title "Lección web" \
  --parent mechanics
p2rln-create build my-course course.p2rln --strict-profiles
```

The editable directory layout is preserved as logical paths under `https://p2rln.org/extension/web-content-bundle`. Built payloads are still content-addressed/deduplicated. The directory copy is transactional and symbolic links are rejected so an authoring tree cannot silently pull files from outside its source directory. HTML remains passive; the package does not gain arbitrary JavaScript execution rights.

The Builder also uses a physical ZIP seekability policy: audio/video/raster/PDF/already-compressed payloads are stored without deflate so a capable host can byte-seek them directly. This physical choice does not alter Core `contentRoot`.

## Native questionnaire

A questionnaire is authored as standalone declarative JSON and then packaged like any other resource:

```bash
p2rln-create add-questionnaire my-course quiz.json --key quiz --parent mechanics \
  --renderer https://p2rln.org/renderer/questionnaire/memory \
  --renderer-version 1
p2rln-create build my-course course.p2rln --strict-profiles
```

`add-questionnaire` validates the native questionnaire before changing the project, creates exactly one Resource + Activity, and delegates copying, content addressing, deduplication and final integrity to the existing Builder. `--renderer` stores only the optional renderer URI under `https://p2rln.org/ext/renderer-preference/1`; it never copies the player or renderer JavaScript into the package. The source JSON may come from any authoring product; P2RLN Studio is not required.


## Native declarative component

A reusable component instance is packaged as data only:

```bash
p2rln-create add-component my-course component.json --key notice --parent mechanics
```

The instance declares `componentVersion`, `dataVersion` and `runtimeContractVersion`. `add-component` validates the instance on a candidate project before copying/mutation and never copies component implementation JavaScript into the package. The Reading System resolves trusted implementations and migrations from its host Component Registry.


## Native composite activity

Existing activities can be grouped without duplicating their bytes or portable IDs:

```bash
p2rln-create add-composite my-course --key lesson --title "Lección compuesta" \
  --mode sequence --completion all --children act-intro act-quiz
```

By default the selected children are reparented under the composite so the editable hierarchy does not contain duplicate placements. `--keep-existing-parents` is an explicit escape hatch. The composite JSON stores only traversal/completion policy; the ordered child list remains solely in graph `Activity.children`. The operation is validated on a copy before project mutation and writes its small config atomically.

## Existing educational package

```bash
p2rln-create convert course-scorm.zip course.p2rln
p2rln-create convert CATAPULT-main.zip course.p2rln --package-root CATAPULT-main/course_examples/single_au_basic_framed
```

The native workspace is not the P2RLN interchange format. `p2rln.project.json` is authoring state used by the reference Creator. Other authoring tools may have a completely different internal project representation and still emit the same P2RLN Core package.


## AulaP2P canonical document ingestion

```bash
p2rln-create ingest-aulap2p reader-output.json course.p2rln --source-file source.pdf --asset-root bridge-assets
```

This adapter reuses the canonical output of AulaP2P's existing Reader. It does not serialize `archivoId`, Prisma IDs or internal URLs into P2RLN identity.


## AulaP2P course bridge

```bash
p2rln-create ingest-aulap2p-course course.json course.p2rln --asset-root bridge-assets
p2rln-create extract-aulap2p-course course.p2rln import-envelope.json
```

This is an adapter around `aulap2p.curso.v1`, not a parallel course subsystem. It strips local persistence identity, keeps `positionKey` as its own pedagogical placement field, and maps a task-backed `MaterialEjercicio` to exactly one portable assignment.


## Component authoring catalog

The reference Creator exposes the external authoring contracts without putting them into every package:

```bash
p2rln-create component-catalog
p2rln-create component-catalog --component https://p2rln.org/component/callout --component-version 1 --authoring-documents
p2rln-create validate-component-authoring component.json
```

JSON Schema is authoritative for data validity. `component-editor/0.1` only supplies portable control/order/label hints for Studio implementations. `add-component` remains structurally generic so an unknown third-party component can still be preserved/packaged without pretending the reference catalog understands its data semantics.


## Static seek integrity (0.4.0a10)

Builds containing embedded audio/video now derive `org.p2rln.rangeIntegrity` automatically. The map uses 1 MiB SHA-256 chunks and is itself inventoried and protected by `contentRoot`. This enables the static-browser Service Worker to authenticate only the chunks covering a media seek. No renderer or Service Worker code is copied into `.p2rln`.
