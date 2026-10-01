# P2LRN npm publishing

The npm distribution is intentionally split into three aligned packages:

- `@p2lrn/player` — browser Player, renderers, isolated runtime hosts, Service Worker and pinned `h5p-standalone` core assets.
- `@p2lrn/toolkit` — validator, package Reader, lightweight document Reader (`@p2lrn/toolkit/document-reader`), Creator/authoring APIs, conversion tools and CLI.
- `@p2lrn/h5p-libraries` — pinned reusable third-party H5P library corpus. It contains no user/course packages.

All three packages currently use the same release version: `0.5.0-alpha.10`.

## Required gates

Before publication:

```bash
cd packages/toolkit
npm install --no-audit --no-fund
npm test
cd ../..

node scripts/verify-npm-pack.mjs
node scripts/verify-browser-from-npm.mjs
node deploy/netlify/build-site.mjs
node scripts/verify-distribution-identity.mjs
```

The Toolkit test suite includes the lightweight document Reader and verifies DOCX/PPTX structure, ODT/EPUB, Markdown and the explicit absence of OCR fallback.

The npm pack gate:

1. builds real `.tgz` files;
2. installs them into an empty project;
3. verifies Player/runtime/H5P library files and the Toolkit document Reader from `node_modules`;
4. executes Toolkit CLI/API entrypoints including `p2lrn-document-reader` and `@p2lrn/toolkit/document-reader`;
5. runs `p2lrn-copy-runtime` and verifies the copied runtime includes the installed shared H5P library package.

The browser gate uses installed tarballs, serves application and runtime from separate HTTP origins and exercises H5P, SCORM, cmi5, QTI, Common Cartridge, IMS Content Package, Tin Can, multipart, questionnaire progress/state/score/completion/resume and the H5P fullscreen iframe contract.

Netlify uses the same Player and H5P-library builders. It does not have a second runtime implementation.

## Lightweight document Reader

There is no standalone `@p2lrn/document-reader` package. The single canonical implementation is:

```text
@p2lrn/toolkit/document-reader
```

with CLI:

```text
p2lrn-document-reader
```

It intentionally contains no OCR, Docling, NestJS, AulaP2P runtime dependency, Docker worker, LibreOffice or Pandoc. PDF extraction is limited to embedded text through optional `pdfjs-dist`.

## License gate

The P2LRN first-party implementation is licensed under **P2LRN Non-Commercial Source License 1.0 (P2LRN-NCSL 1.0)**.

This is a custom source-available, non-commercial license, so the first-party npm packages declare:

```json
"license": "SEE LICENSE IN LICENSE"
```

The root `LICENSE` and `NOTICE.md` are the authorities. Byte-identical copies must be shipped at the top level of both `@p2lrn/player` and `@p2lrn/toolkit`.

`node scripts/check-publish-ready.mjs` verifies the declaration, the package-local license/notice copies, their byte identity and their presence in the npm `files` lists.

P2LRN-NCSL 1.0 permits non-commercial use, study, modification and redistribution subject to its conditions. Any non-source distribution must provide its Corresponding Source; modified distributions must provide the complete Corresponding Source of the modified version. Modified versions exposed to third parties through remote network interaction must also offer that source. Commercial use, including internal use by a for-profit entity, requires a separate commercial license.

Do not apply P2LRN-NCSL 1.0 to third-party code. `@p2lrn/h5p-libraries` remains governed by its third-party notices, and bundled Player dependencies retain their upstream licenses.

External contributions must follow `CONTRIBUTING.md` so that accepting a contribution does not unintentionally prevent separate commercial licensing.

## Publishing order

After every gate is green and the license gate passes:

```bash
cd packages/h5p-libraries && npm publish
cd ../toolkit && npm publish
cd ../player && npm publish
```

The Player declares `@p2lrn/h5p-libraries` as an optional peer dependency. Install it when H5P content relies on shared/external libraries:

```bash
npm install @p2lrn/player @p2lrn/h5p-libraries
```

The document Reader is already included with the Toolkit:

```bash
npm install @p2lrn/toolkit
p2lrn-document-reader documento.docx --pretty
```
