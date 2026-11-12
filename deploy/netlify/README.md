# Netlify continuous CDN deployment

The Netlify production site is connected to this repository and builds from `main`.

## Production build

Netlify runs:

```text
node deploy/netlify/build-site.mjs
```

and publishes:

```text
.netlify-cdn/
```

`build-site.mjs` invokes `build-cdn.mjs` first, then adds the documentation portal, canonical/generated examples and deployment regression gates. The CDN does **not** maintain a second Player implementation. The build calls the same distribution builders used by npm:

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

## Multimedia search sitemap

**Only the build output is authoritative.** `deploy/netlify/site/sitemap.xml` is
not maintained because it would immediately become stale as translated pages,
screenshots and videos change. `build-site.mjs` generates
`.netlify-cdn/sitemap.xml` from the real indexable HTML pages and checks
image URLs, meaningful responsive image variants, video thumbnails, video files
and caption tracks. Use `node scripts/verify-site-media-seo.mjs` for
the isolated pre-deploy audit; publishing the unbuilt source directory is not
supported. Google Search Console is required to determine real indexing.

Google video-rich-result eligibility additionally requires the **actual first
publication date** (`VideoObject.uploadDate`); do not manufacture that date
from the filename or build time. Until provenance is verified, the media report
must explicitly declare this limitation.

## Published paths

The canonical integration URL is stable and does not change on every alpha/minor
release:

```html
<script src="https://p2lrn.org/player/current/dist/p2lrn.js"></script>
```

Applications should normally keep that exact URL. The Player, runtime hosts and
shared H5P libraries move together behind the `current` channel.

The executable H5P/SCORM/cmi5/package runtime must still be hosted on an origin different from the embedding application. The public viewer runs on `https://p2lrn.org` and defaults to the Player's opaque sandbox. Optional `runtime=isolated` requires a distinct HTTPS `runtimeOrigin` (or `P2LRN_RUNTIME_ORIGIN` configured by the host), with `/health.json` and Player-version verification before playback.

Exact numbered paths are still emitted internally:

```text
/player/<version>/dist/...
```

Those numbered paths are immutable release snapshots for reproducibility,
debugging and rollback. They are not the normal integration contract and users
should not be required to edit their HTML for every `alpha.x` or minor release.

A numbered integration path should only become part of the public contract when
P2LRN introduces a deliberately incompatible major runtime line. Until then,
`/player/current/dist/p2lrn.js` remains the stable public loader.

The historical `/player/0.5.0-alpha.1/dist/...` alias is retained only for
backward compatibility with early integrations and must not be used in new
documentation.

The mutable aliases are served with `no-store` so failed development lookups
or previous runtime bytes are not retained by the browser.

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

Git-triggered Netlify builds are deliberately frozen by `[build].ignore = "exit 0"`
in `netlify.toml`. This does not disable manual build hooks. A green source CI
does not publish the site, and a stale public-site audit must remain visible
until an explicitly authorized publication is verified.

The bilingual workflow is read-only: it regenerates English to check the
committed mirror, fails if generation changes candidate bytes, and only then
runs Chromium against that same `github.sha`. Generated translations must be
reviewed and committed before validating a release; CI must never push a later,
untested translation commit.

Before publication, record the final source SHA, successful source/build job
URLs, artifact SHA-256 inventory, accessibility review results, and the
currently published Netlify deploy ID. Keep the freeze in place until the owner
explicitly approves the release. Publish the validated build output, retain the
previous deploy for rollback, and then run
`node scripts/audit_public_site.mjs --origin https://p2lrn.org` and real public
Studio/Player checks. Restore the recorded previous deploy if a critical
production check fails. Public reachability and a valid sitemap do not establish
Google indexation or WCAG conformance.
