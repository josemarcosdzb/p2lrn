# Netlify CDN deployment

This deployment publishes the canonical P2LRN browser runtime without creating a second runtime implementation.

## Preferred deployment: manual drag-and-drop

No GitHub connection is required.

1. Generate the deployment folder locally with:

   ```bash
   node deploy/netlify/build-cdn.mjs
   ```

2. The command creates:

   ```text
   .netlify-cdn/
   ```

3. In Netlify, choose **Add new project -> Deploy manually**.
4. Drag the complete `.netlify-cdn` folder into the deploy dropzone.
5. Netlify assigns a `*.netlify.app` production URL automatically.
6. For later updates, regenerate `.netlify-cdn` and drag the updated folder into the site's **Deploys** dropzone.

The dragged folder contains its own `_headers` file, so CORS and cache rules work without connecting the repository and without relying on a Netlify build command.

## Source of truth

- Runtime source: `packages/toolkit/web`
- Generated browser distribution: `packages/player/dist`
- Manual CDN builder: `deploy/netlify/build-cdn.mjs`
- Optional connected-build configuration: `netlify.toml`

The CDN builder copies the already-generated and versioned `packages/player/dist` tree. It does not rebuild or rewrite runtime files.

Before copying, it validates:

1. `packages/player/package.json` version matches `packages/player/dist/release.json`;
2. every file listed by `release.json` exists;
3. file sizes match;
4. SHA-256 digests match.

A mismatch aborts generation.

## Dragged folder layout

For player version `0.5.0-alpha.1`:

```text
.netlify-cdn/
├── index.html
├── index.json
├── health.json
├── _headers
├── player/
│   └── 0.5.0-alpha.1/
│       └── dist/
│           ├── p2lrn.js
│           ├── p2lrn.esm.js
│           ├── p2lrn-player.css
│           ├── p2lrn-sw.js
│           ├── release.json
│           ├── renderers/
│           └── runtime-host/
└── packages/                  # optional public .p2lrn objects
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

For very large `.p2lrn` files, especially packages containing video, manual browser upload should be tested before using Netlify Drop as the primary content store.

## Netlify URL

A custom domain is optional. A manual deploy can use the Netlify hostname directly, for example:

```text
https://p2lrn-cdn.netlify.app
```

Then the Player can be loaded as:

```html
<script src="https://p2lrn-cdn.netlify.app/player/0.5.0-alpha.1/dist/p2lrn.js"></script>
<p2lrn-player src="https://p2lrn-cdn.netlify.app/packages/demo/1.0.0/course.p2lrn"></p2lrn-player>
```

For npm/ESM consumers, continue using `@p2lrn/player`.

## CORS, cache and Range

The generated `_headers` file adds public cross-origin access and immutable caching to versioned runtime and package paths. This is the configuration used by manual drag-and-drop deploys.

Range response headers such as `Accept-Ranges` and `Content-Range` are controlled by Netlify's file-serving layer; the configuration exposes them to cross-origin browser code.

After deployment, validate a real `.p2lrn` object with both:

```bash
curl -I https://YOUR-SITE.netlify.app/packages/demo/1.0.0/course.p2lrn
curl -i -H "Range: bytes=0-1023" https://YOUR-SITE.netlify.app/packages/demo/1.0.0/course.p2lrn
```

The second request must return a partial response compatible with the P2LRN HTTP Range reader before large-package delivery is considered production-ready.

## Optional connected deployment

`netlify.toml` remains available if continuous deployment is wanted in the future, but it is not required for the manual drag-and-drop workflow.
