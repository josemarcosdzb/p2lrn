# @p2lrn/toolkit

Primary Node.js/TypeScript implementation of P2LRN.

It provides the Core validator/integrity layer, ZIP/ZIP64 reader/writer, Creator/Builder, stable Studio-facing authoring API, Reader/Reading System, external-package preservation/conversion, AulaP2P bridges, native questionnaire/component/composite validation, deltas, Ed25519 detached signatures and the P2LRN CLI tools.

New output uses the P2LRN name and identifiers (`P2LRN`, `https://p2lrn.org/`, `.p2lrn`). Pre-rename Alpha15 P2RLN packages and identifiers remain readable as a compatibility boundary.

```bash
npm run build
npm test
node dist/cli/main.js --help
```

Primary commands include `p2lrn-validate`, `p2lrn-reader`, `p2lrn-document-reader`, `p2lrn-create`, `p2lrn-convert`, `p2lrn-delta`, `p2lrn-trust`, `p2lrn-inspect`, `p2lrn-repack`, `p2lrn-multipart`, `p2lrn-extract-source`, `p2lrn-rebuild-examples`, `p2lrn-build-web-sdk` and `p2lrn-build-advanced-example`.

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

Large embedded payloads can be split so the outer P2LRN package stays small instead of carrying one very large embedded file:

```bash
p2lrn-multipart course.p2lrn course-split.p2lrn --part-size 26214400
```

The default part size is 25 MiB and the minimum accepted size is 1 MiB. The command selects an oversized embedded representation automatically, or you can choose one explicitly:

```bash
p2lrn-multipart course.p2lrn course-split.p2lrn \
  --representation urn:example:representation \
  --part-size 26214400
```

Output is an outer package plus adjacent parts:

```text
course-split.p2lrn
course-split.part001
course-split.part002
course-split.part003
...
```

The outer package contains a small multipart descriptor with the logical media type, full byte size, full SHA-256 digest and the relative `href`, size and SHA-256 digest of every part. The Player resolves the parts relative to the outer package URL, verifies every part, reconstructs the logical payload and verifies the final SHA-256 before passing it to the normal renderer.

Multipart also preserves package-member views used by SCORM/cmi5/IMS-style nested packages. The current command transforms one embedded representation per execution; use `--representation` when you need to target a particular large payload. Keep the outer package and all generated `.partNNN` files together when publishing.

## Lightweight document Reader

The lightweight document Reader is part of this package and is exported as
`@p2lrn/toolkit/document-reader`. It is an autonomous adaptation of the useful
deterministic parts of the AulaP2P Reader; P2LRN does not import or call AulaP2P
at runtime.

```bash
npm install @p2lrn/toolkit

p2lrn-document-reader document.docx --pretty
```

Programmatic API:

```ts
import {
  LightweightDocumentReader,
  readDocument,
  detectDocumentType,
} from '@p2lrn/toolkit/document-reader';
```

The lightweight paths support DOCX, PPTX, TXT, Markdown, HTML, RTF, TeX, XML,
YAML, ODT and EPUB. DOCX and PPTX preserve structural order, tables and internal
image references instead of moving all images to the start of the document.

PDF is deliberately limited to embedded text through the optional
`pdfjs-dist` peer dependency. There is **no OCR fallback**.

The Reader intentionally contains no Docling, Tesseract/OCR, NestJS, AulaP2P
services, database/storage adapters, Docker workers, LibreOffice, Pandoc or
external conversion service. It is an extraction/normalization API; Creator can
consume its canonical output in document-to-course workflows.

## Authoring workspace document reader

The authoring workspace can read a source document directly from a path while keeping reading separate from course mutation:

```js
import {P2LRNAuthoringWorkspace} from '@p2lrn/toolkit/authoring';

const workspace=P2LRNAuthoringWorkspace.open('course.p2lrn','./workspace');

const document=await workspace.reader('./material/tema-1.docx');

console.log(document.metadata);
console.log(document.blocks);
console.log(document.tables);

workspace.setCourseMetadata({title:'Curso actualizado',incrementRevision:true});
workspace.addUnit({key:'unidad-1',title:'Unidad 1'});
workspace.build('course-updated.p2lrn',{strictProfiles:true});
```

Relative paths passed to `workspace.reader()` are resolved from the workspace root. Absolute paths are also accepted. The method delegates to the existing lightweight document reader and therefore supports the same detected formats and safety limits. Reading a document never mutates the authoring project.


## License

This first-party package is distributed under **P2LRN Non-Commercial Source License 1.0 (P2LRN-NCSL 1.0)**.

Commercial use is not granted. See [LICENSE](./LICENSE) for the complete terms and [NOTICE.md](./NOTICE.md) for scope and third-party exceptions.
