# Netlify continuous CDN deployment

The Netlify production site is connected to this repository and builds from `main`.

## CI vs production: two separate release gates

**Regla permanente: el CI del candidato no debe fallar por el estado de una web que todavía no se ha desplegado.** Netlify tiene los despliegues automáticos congelados con `[build].ignore = "exit 0"` en `netlify.toml`.

1. **Antes de publicar (`main`, PR o validación manual):** comprobar el SHA candidato, su compilación `.netlify-cdn/`, las páginas y rutas ES/EN, el `sitemap.xml` generado, las entradas de imágenes y vídeos, enlaces, WCAG automático y navegación real en Chromium. Usar `node scripts/verify-site-media-seo.mjs` y las demás pruebas del candidato. **No ejecutar `scripts/audit_public_site.mjs` en este gate.**
2. **Después del despliegue autorizado a Netlify:** comprobar que la revisión publicada corresponde al SHA aprobado y ejecutar `node scripts/audit_public_site.mjs --origin https://p2lrn.org`, además de las pruebas reales de Studio/Player y rollback si procede. Este es el único momento en que la diferencia entre producción y la entrega aprobada puede constituir un error de publicación.
3. **Mientras Netlify no se haya desplegado:** si el sitemap público contiene una versión anterior (ejemplo observado el 12-11-2026: 120 URL y ninguna entrada multimedia, frente a 130 URL y entradas de imagen/vídeo del candidato), etiquetar el estado como **PENDIENTE DE DESPLIEGUE**. No interpretarlo como fallo de traducción, SEO o compilación, no bajar los requisitos del sitemap candidato y no repetir la misma incidencia como bloqueo de CI.

El workflow `.github/workflows/p2lrn-site-i18n.yml` valida el candidato **sin consultar el sitemap público**. La auditoría externa permanece disponible para aceptación **posterior** al despliegue. La aprobación del CI **no equivale** a publicación ni a indexación en Google.

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
does not publish the site. Until the owner approves and verifies a deployment,
a previously published sitemap is expected and cannot fail pre-deployment CI.

The bilingual push workflow is read-only: it validates the committed ES/EN
candidate in Chromium without regenerating or publishing it. English regeneration
is an explicit manual operation, with its diff checked against the candidate SHA;
any translated changes require review, commit and a new validation before release.
Neither job treats the frozen production site as the candidate.

Before publication, record the final source SHA, successful source/build job
URLs, artifact SHA-256 inventory, accessibility review results, and the
currently published Netlify deploy ID. Keep the freeze in place until the owner
explicitly approves the release. Publish the validated build output, retain the
previous deploy for rollback, and then run
`node scripts/audit_public_site.mjs --origin https://p2lrn.org` and real public
Studio/Player checks. Restore the recorded previous deploy if a critical
production check fails. Public reachability and a valid sitemap do not establish
Google indexation or WCAG conformance.
