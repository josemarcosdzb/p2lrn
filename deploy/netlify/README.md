# Netlify CDN deployment

This deployment publishes the canonical P2LRN browser runtime without creating a second runtime implementation.

## Source of truth

- Runtime source: `packages/toolkit/web`
- Generated browser distribution: `packages/player/dist`
- CDN build: `deploy/netlify/build-cdn.mjs`
- Netlify configuration: `netlify.toml`

The CDN build copies the already-generated and already-versioned `packages/player/dist` tree. It does not rebuild or rewrite runtime files.

Before copying, the build validates:

1. `packages/player/package.json` version matches `packages/player/dist/release.json`;
2. every file listed by `release.json` exists;
3. file sizes match;
4. SHA-256 digests match.

A mismatch fails the Netlify build.

## Published layout

For player version `0.5.0-alpha.1`:

```text
/player/0.5.0-alpha.1/dist/p2lrn.js
/player/0.5.0-alpha.1/dist/p2lrn.esm.js
/player/0.5.0-alpha.1/dist/p2lrn-player.css
/player/0.5.0-alpha.1/dist/p2lrn-sw.js
/player/0.5.0-alpha.1/dist/release.json
/player/0.5.0-alpha.1/dist/renderers/...
/player/0.5.0-alpha.1/dist/runtime-host/...
/index.json
/health.json
/packages/...              # optional public .p2lrn objects
```

Runtime URLs are immutable and must always contain an exact version. Do not introduce a mutable `/latest/` alias for production integrations.

## Optional public packages

Files under `deploy/netlify/packages/` are copied to `/packages/`.

Use immutable names or paths, for example:

```text
deploy/netlify/packages/demo/1.0.0/course.p2lrn
deploy/netlify/packages/sha256/<content-id>.p2lrn
```

Do not place private courses, learner-specific files, credentials or signed/private delivery URLs in this directory.

## Netlify site settings

Connect this repository to Netlify and use the repository root as the base directory.

Netlify reads `netlify.toml` automatically:

- Build command: `node deploy/netlify/build-cdn.mjs`
- Publish directory: `.netlify-cdn`
- Node: `22`

No additional npm install step is required for the CDN build.

## Domain

Recommended production hostname:

```text
cdn.p2lrn.org
```

After the site is created in Netlify, add the custom domain and configure its DNS using the values Netlify provides for that site.

## Browser use

```html
<script src="https://cdn.p2lrn.org/player/0.5.0-alpha.1/dist/p2lrn.js"></script>
<p2lrn-player src="https://cdn.p2lrn.org/packages/demo/1.0.0/course.p2lrn"></p2lrn-player>
```

For npm/ESM consumers, continue using `@p2lrn/player`. The Netlify CDN is the plain-browser/static distribution path.

## CORS, cache and Range

`netlify.toml` adds public cross-origin access and immutable caching to versioned runtime and package paths.

Range response headers such as `Accept-Ranges` and `Content-Range` are controlled by Netlify's file-serving layer; the configuration only exposes them to cross-origin browser code.

After deployment, validate a real `.p2lrn` object with both:

```bash
curl -I https://cdn.p2lrn.org/packages/demo/1.0.0/course.p2lrn
curl -i -H "Range: bytes=0-1023" https://cdn.p2lrn.org/packages/demo/1.0.0/course.p2lrn
```

The second request must return a partial response compatible with the P2LRN HTTP Range reader before large-package delivery is considered production-ready.
