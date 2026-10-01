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

Do not publish the first-party packages while their `license` field is `UNLICENSED`.

The repository deliberately runs:

```bash
node scripts/check-publish-ready.mjs
```

from `prepublishOnly`. It blocks `npm publish` until the owner selects the P2LRN first-party license and adds the corresponding root `LICENSE` file.

Do **not** copy the Lumi or h5p-standalone license onto first-party P2LRN source code. Third-party runtime/library licensing is documented separately in each package.

Once the first-party license is selected, update both:

```text
packages/player/package.json
packages/toolkit/package.json
```

to the same SPDX license identifier (or a valid `SEE LICENSE IN ...` declaration), add the root license text, run all gates, then publish the three packages with the same version.

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
