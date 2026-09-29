# @p2lrn/h5p-libraries

Pinned shared H5P libraries for the P2LRN browser/runtime distribution.

This package contains reusable H5P **libraries**, not course/user content. It is kept separate from `@p2lrn/player` so applications that do not need externally-resolved H5P libraries do not have to install the additional corpus.

The corpus is built reproducibly from the pinned Lumi source commit documented in `dist/index.json`.

## Install

```bash
npm install @p2lrn/player @p2lrn/h5p-libraries
```

## Copy to a static isolated runtime host

```bash
p2lrn-copy-h5p-libraries ./public/p2lrn-runtime/h5p-libraries
```

The target should sit beside the Player runtime host:

```text
p2lrn-runtime/
├── h5p.html
├── h5p-host.js
├── assets/
└── h5p-libraries/
    ├── H5P.BranchingScenario-1.8/
    ├── H5P.Crossword-0.5/
    └── ...
```

P2LRN packages remain owned and hosted by the publisher. This package contains only shared runtime libraries.

## Third-party licensing

The files under `dist/` are third-party H5P libraries. They retain their upstream licenses. See `THIRD_PARTY_NOTICES.md` and each library's metadata/source for applicable terms.
