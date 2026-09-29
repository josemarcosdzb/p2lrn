# Netlify continuous CDN deployment

The Netlify production site is expected to be connected to this repository and to build from `main`.

## Production build

Netlify runs:

```text
node deploy/netlify/build-cdn.mjs
```

and publishes:

```text
.netlify-cdn/
```

No npm install is required for the CDN build. The script builds the browser distribution directly from the canonical sources:

```text
packages/toolkit/web/
packages/toolkit/web-sdk-src/
```

It does not trust a stale committed `packages/player/dist` tree.

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

The historical `0.5.0-alpha.1` URL is retained because existing integrations already use it. It is treated as a compatibility alias and is deliberately served with revalidation instead of immutable caching.

For development and continuous testing prefer:

```html
<script src="https://p2lrn.netlify.app/player/current/dist/p2lrn.js"></script>
```

For a production release pin the actual version:

```html
<script src="https://p2lrn.netlify.app/player/<version>/dist/p2lrn.js"></script>
```

## Build gates

The build fails when:

- `packages/player/package.json`, the loader and the runtime expose different Web SDK versions;
- a generated JavaScript module has an unresolved local import;
- a canonical runtime source required by the distribution is missing.

The generated `release.json` contains byte sizes, SHA-256 digests and SRI values for every emitted runtime file.

## Automatic deployment

With Netlify connected to this repository and `main` configured as the production branch, every push to `main` triggers this build automatically. No manual ZIP upload is needed.
