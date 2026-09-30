# @p2lrn/toolkit

Primary Node.js/TypeScript implementation of P2LRN.

It provides the Core validator/integrity layer, ZIP/ZIP64 reader/writer, Creator/Builder, stable Studio-facing authoring API, Reader/Reading System, external-package preservation/conversion, AulaP2P bridges, native questionnaire/component/composite validation, deltas, Ed25519 detached signatures and the P2LRN CLI tools.

New output uses the P2LRN name and identifiers (`P2LRN`, `https://p2lrn.org/`, `.p2lrn`). Pre-rename Alpha15 P2RLN packages and identifiers remain readable as a compatibility boundary.

```bash
npm run build
npm test
node dist/cli/main.js --help
```

Primary commands include `p2lrn-validate`, `p2lrn-reader`, `p2lrn-create`, `p2lrn-convert`, `p2lrn-delta`, `p2lrn-trust`, `p2lrn-inspect`, `p2lrn-repack`, `p2lrn-extract-source`, `p2lrn-rebuild-examples`, `p2lrn-build-web-sdk` and `p2lrn-build-advanced-example`.

## Stable authoring API

`@p2lrn/toolkit/authoring` is the supported integration boundary for P2LRN Studio and other editors. `AUTHORING_API_VERSION` is currently `1`; the editable project schema is `0.3.0`.

```ts
import {P2LRNAuthoringWorkspace} from '@p2lrn/toolkit/authoring';

const workspace = P2LRNAuthoringWorkspace.open('course.p2lrn', './workspace');
workspace.setCourseMetadata({
  title: 'Curso editado',
  incrementRevision: true,
});
workspace.addUnit({key: 'unidad-1', title: 'Unidad 1'});
workspace.build('course-v2.p2lrn', {strictProfiles: true});
```

Studio should use the typed authoring methods for normal edits. `project` is a detached inspection snapshot; `replace` and callback-based `update` remain deprecated low-level compatibility escape hatches.

CLI equivalent:

```bash
p2lrn-create open course.p2lrn workspace
p2lrn-create build workspace course-v2.p2lrn --strict-profiles
```

A no-op open/build of the 17 shipped canonical examples is regression-tested to retain the exact `contentRoot`. Imported portable IDs and opaque package members are retained instead of being regenerated or discarded.

Legacy workspace upgrade:

```bash
p2lrn-create upgrade workspace
```

Projects 0.1/0.2 are upgraded to 0.3 with validation before and after migration. The canonical project file is `p2lrn.project.json`; after it has been written and validated successfully, the historical `p2rln.project.json` alias is removed from that workspace so there is only one editable project authority. Legacy Alpha15 `.p2rln` packages can also be opened directly; the existing canonical repack authority is reused before authoring materialization.


## Multipart transport

Large embedded payloads can be split without uploading course content to the shared P2LRN CDN:

```bash
p2lrn-multipart course.p2lrn course-split.p2lrn --part-size 26214400
```

This writes `course-split.p2lrn` plus adjacent `course-split.part001`, `course-split.part002`, etc. The Player resolves the parts relative to the outer package URL and verifies per-part and final SHA-256 digests before handing the logical payload to its normal renderer.

## Standalone document Reader

Document and LMS-ingestion parsing is provided by the separate `@p2lrn/document-reader` package. It is the autonomous lightweight copy adapted from the AulaP2P Reader and is not duplicated inside `@p2lrn/toolkit`.

```bash
npm install @p2lrn/document-reader
p2lrn-document-reader document.docx --json
```

The standalone Reader supports DOCX, PPTX, XLSX, ODT/EPUB, structured text and learning-package exports. It contains no OCR, Docling, NestJS, AulaP2P services, Docker workers, LibreOffice or Pandoc. Native-text PDF support remains optional through `pdfjs-dist`.
