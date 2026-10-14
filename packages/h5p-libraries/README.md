# @p2lrn/h5p-libraries

Pinned shared H5P libraries for the P2LRN browser/runtime distribution.

This package contains reusable H5P **libraries**, not course/user content. It is kept separate from `@p2lrn/player` so applications that do not need externally-resolved H5P libraries do not have to install the additional corpus.

The corpus is built reproducibly from the pinned Lumi source commit documented in `dist/index.json`.

## Install

```bash
npm install @p2lrn/player @p2lrn/h5p-libraries
```

## Copy beside the Player runtime assets

```bash
p2lrn-copy-h5p-libraries ./public/p2lrn-runtime/h5p-libraries
```

The target should sit beside the Player runtime assets. It does not need a different origin for automatic SCORM/H5P playback:

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

`dist/index.json` includes the file manifest for every library. When an H5P package omits reusable dependencies, the Player can fetch only the required library files from this corpus in the application context and transfer them into its opaque sandbox.

P2LRN packages remain owned and hosted by the publisher. This package contains only shared runtime libraries; it never contains user/course state.

## Third-party licensing

The files under `dist/` are third-party H5P libraries. They retain their upstream licenses. See `THIRD_PARTY_NOTICES.md` and each library's metadata/source for applicable terms.
