# @p2lrn/document-reader

Lightweight standalone copy of the AulaP2P document reader adapted for P2LRN.

It is intentionally independent from AulaP2P at runtime. It does **not** import NestJS, AulaP2P services, database entities, asset storage, OCR, Docling, Docker workers, LibreOffice, Pandoc or external conversion services.

Supported lightweight paths:

- PDF text/layout through optional `pdfjs-dist`
- DOCX
- PPTX
- XLSX
- TXT
- Markdown
- CSV
- JSON
- HTML
- RTF
- TeX
- XML
- YAML
- ODT
- EPUB
- generic ZIP
- SCORM / IMS Common Cartridge
- cmi5
- Tin Can/xAPI package
- H5P
- Moodle backup
- Chamilo course ZIP
- Open edX OLX ZIP/TGZ

DOCX/PPTX/XLSX/ODT/EPUB and learning packages are read directly from ZIP/XML/JSON. Images are inventoried as internal references when useful but are not uploaded, OCR'd or persisted anywhere.

## Install

```bash
npm install @p2lrn/document-reader
```

PDF is optional:

```bash
npm install pdfjs-dist@5.4.296
```

## API

```js
import {P2LRNDocumentReader} from '@p2lrn/document-reader';

const reader = new P2LRNDocumentReader();
const result = await reader.read({
  name: 'curso.pptx',
  mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  buffer
});
```

The canonical output uses `p2lrn.document-reader.v1` and contains origin metadata, ordered blocks, tables and warnings.

## CLI

```bash
p2lrn-document-reader input.pptx --json
```

This package is a Reader/extractor. It does not create P2LRN packages by itself; the Toolkit/Creator can consume its canonical output when authoring workflows need document-to-course conversion.
