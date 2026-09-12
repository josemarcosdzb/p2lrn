# @p2lrn/toolkit

Primary Node.js/TypeScript implementation of P2LRN.

It provides the Core validator/integrity layer, ZIP/ZIP64 reader/writer, Creator/Builder, Reader/Reading System, external-package preservation/conversion, AulaP2P bridges, native questionnaire/component/composite validation, deltas, Ed25519 detached signatures and the P2LRN CLI tools.

New output uses the P2LRN name and identifiers (`P2LRN`, `https://p2lrn.org/`, `.p2lrn`). Pre-rename Alpha15 P2RLN packages and identifiers remain readable as a compatibility boundary.

```bash
npm run build
npm test
node dist/cli/main.js --help
```

Primary commands include `p2lrn-validate`, `p2lrn-reader`, `p2lrn-create`, `p2lrn-convert`, `p2lrn-delta`, `p2lrn-trust`, `p2lrn-inspect`, `p2lrn-repack`, `p2lrn-extract-source`, `p2lrn-rebuild-examples`, `p2lrn-build-web-sdk` and `p2lrn-build-advanced-example`.
