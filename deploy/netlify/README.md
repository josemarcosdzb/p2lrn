# Netlify continuous CDN deployment

The Netlify production site is connected to this repository and builds from `main`.

## Production build

Netlify runs:

```text
node deploy/netlify/build-cdn.mjs
```

and publishes:

```text
.netlify-cdn/
```

The CDN does **not** maintain a second Player implementation. The build calls the same distribution builders used by npm:

```text
packages/player/scripts/build-dist.mjs
packages/h5p-libraries/scripts/build.mjs
```

That means the Player/runtime emitted to Netlify and the files emitted by `npm pack` come from the same source and the same build logic.

`@p2lrn/player` contributes:

```text
Player / renderers
runtime-host/
h5p-standalone 3.8.2 assets
SCORM/H5P/generic package runtime
Service Worker
release.json
```

`@p2lrn/h5p-libraries` contributes the pinned shared H5P library corpus under:

```text
runtime-host/h5p-libraries/
```

The CDN stores reusable runtime libraries only. It does not become a store for user/course `.p2lrn`, H5P or SCORM packages.

## Published paths

For the current Player version:

```text
/player/<version>/dist/...
```

The exact version path is immutable.

Two mutable compatibility channels are also published:

```text
/player/current/dist/...
/player/0.5.0-alpha.1/dist/...
```

Both mutable channels are served with `no-store` so failed development lookups or previous runtime bytes are not retained by the browser.

For development:

```html
<script src="https://p2lrn.netlify.app/player/current/dist/p2lrn.js"></script>
```

For a production release pin the actual version:

```html
<script src="https://p2lrn.netlify.app/player/<version>/dist/p2lrn.js"></script>
```

## Build gates

CI and the Netlify build verify:

- `@p2lrn/player`, `@p2lrn/toolkit` and `@p2lrn/h5p-libraries` use one aligned release version;
- the Player loader/runtime expose that same version;
- `h5p-standalone` runtime assets are present;
- the pinned H5P library corpus builds with the expected library count and required smoke libraries;
- JavaScript local references resolve;
- real npm tarballs can be packed, installed into an empty project and copied as a complete runtime;
- the generated Netlify tree contains the same shared H5P libraries.

The generated Player `release.json` contains byte sizes, SHA-256 digests and SRI values for the Player/runtime artifact. The H5P library package has its own `index.json` catalog and source pin.

## Automatic deployment

Every push to `main` triggers the connected Netlify production build. No manual ZIP upload is required.
