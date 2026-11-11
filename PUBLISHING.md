# P2LRN npm publishing

The npm distribution consists of five version-aligned packages:

- `@p2lrn/player` — browser Player, renderers, isolated runtime hosts, Service Worker and pinned `h5p-standalone` core assets.
- `@p2lrn/toolkit` — validator, package Reader, lightweight document Reader (`@p2lrn/toolkit/document-reader`), Creator/authoring APIs, conversion tools and CLI.
- `@p2lrn/h5p-libraries` — pinned reusable third-party H5P library corpus. It contains no user/course packages.
- `@p2lrn/studio` — browser authoring component and optional Host-backed Save, Reader and Import endpoints.
- `@p2lrn/analytics` — embeddable learner/course analytics dashboard and aggregation helpers.

All five packages currently use the same release version: `0.5.0-alpha.13`.

### Paquete npm adicional para el Provider LTI (solo servidor)

El Provider LTI universal se entrega por separado como **@p2lrn/lti-provider**,
con el comando **p2lrn-lti** y versión alineada 0.5.0-alpha.13.
No se ha creado otro servidor: el paquete contiene el Provider actual de
integration/lms, con dependencias del Toolkit y Player oficiales.
No añade ejecutables a la web estática ni al CDN y no utiliza Supabase.

Su proceso de comprobación es independiente del empaquetado de los cinco
módulos de navegador: scripts/verify-lti-npm-install.mjs realiza npm pack,
instala el paquete real junto a los tarballs Toolkit/Player/H5P del mismo
commit en un proyecto vacío, crea configuración/credenciales, prueba el
arranque HTTP/JWKS y sirve el Player instalado. En paralelo, CI ejecuta
operaciones reales con PostgreSQL, MySQL, MariaDB y SQL Server.

**Estado: candidato npm, no publicado.** El script prepublishOnly exige
aprobación explícita del operador mediante P2LRN_LTI_RELEASE_APPROVED=YES
y que las versiones exactas de Toolkit y Player ya estén publicadas
en el registro npm. Nunca ejecutar npm publish sin superar los gates
de distribución y pruebas. Una versión alfa se publica bajo el tag next,
no se promociona automáticamente a latest.

Una vez estén publicados los paquetes compatibles, el administrador
podrá ejecutar desde una consola:

    npm install -g @p2lrn/lti-provider@0.5.0-alpha.13
    p2lrn-lti init
    p2lrn-lti doctor --public

El instalador permite elegir los cinco motores SQL y preparar un proxy
HTTPS existente o plantilla Caddy. Guarda la identidad y secretos en el host,
permite exportar opcionalmente solo esos secretos cifrados y **nunca**
programa backups de datos, bases de datos ni paquetes de cursos.
Los backups de datos educativos corresponden a la plataforma o técnico.
Más detalles en integration/lms/README.md.



Candidate release notes: `spec/RELEASE-NOTES-0.5.0-alpha.11.md`. The executable acceptance matrix is `spec/E2E-MATRIX-0.5.0-alpha.11.md` plus `scripts/verify-connected-e2e-matrix.mjs`.

## Required gates

Before publication:

```bash
node scripts/check-publish-ready.mjs
node scripts/verify-license-integration.mjs

cd packages/toolkit
npm install --no-audit --no-fund
npm test
cd ../..

node scripts/verify-npm-pack.mjs
node scripts/verify-browser-from-npm.mjs
node scripts/verify-automatic-runtimes.mjs
node deploy/netlify/build-site.mjs
node scripts/verify-distribution-identity.mjs
node scripts/verify-connected-e2e-matrix.mjs
```

The connected E2E matrix is also a release gate. It verifies that the current workflow still covers collaboration authoring/round-trip, authenticated production HTTP collaboration, two-Player browser synchronization, resource deduplication, rich analytics, accessibility checks, offline/cache playback, external-format regression, installed npm browser use, all twelve native games, an independent Express Host and npm/CDN identity. CI writes `.connected-e2e-matrix.json` and preserves it with the Windows evidence.

For `0.5.0-alpha.11`, any previously staged candidate from an older commit is stale once source changes land. The staging step must recreate all five tarballs from the exact green `main` SHA. Public-registry publication remains a separate explicit action.

These readiness commands do not publish packages and do not deploy the Netlify site. Actual publication begins only with the explicit `npm publish` commands in the Publishing order section.

The Toolkit test suite includes the lightweight document Reader and verifies DOCX/PPTX structure, ODT/EPUB, Markdown and the explicit absence of OCR fallback.

The npm pack gate:

1. builds real `.tgz` files;
2. installs them into an empty project;
3. verifies installed Studio, Player/runtime, H5P library files and the Toolkit document Reader from `node_modules`;
4. executes Toolkit CLI/API entrypoints including `p2lrn-document-reader` and `@p2lrn/toolkit/document-reader`;
5. runs `p2lrn-copy-runtime` and verifies the copied runtime includes the installed shared H5P library package.

The browser gate uses installed tarballs (not source aliases), exercises Studio's real interface, creates and persists a `.p2lrn`, imports a real SCORM ZIP and document with Reader, reopens the package and plays its authored lesson with Player. Additional fixtures exercise H5P, SCORM, cmi5, QTI, Common Cartridge, IMS Content Package, Tin Can, multipart, questionnaire progress/state/score/completion/resume and the H5P fullscreen iframe contract. The isolated-runtime browser suite checks the sandbox separately; supported formats are limited to verified capabilities.

Netlify uses the same Player and H5P-library builders. It does not have a second runtime implementation.

## Exhaustive CDN/npm browser distribution parity

The canonical browser assets from the five version-aligned source packages are published by **one build pipeline**. The CDN publishes `/distribution-parity.json` with the exact immutable-version paths, lengths and SHA-256 digests of **every** Player, H5P library, Studio and Analytics distribution file. The Toolkit is version-locked and tracked as source/Node interfaces; a static CDN is not a Node.js executable distribution.

Before release, `node scripts/verify-distribution-identity.mjs` compares all staged npm `dist/` files against their corresponding locally generated CDN files, and checks the public inventory. On the installed public npm release, `node scripts/verify-public-npm-cdn-all.mjs` checks both directions of the complete installed/npm versus CDN filename inventory, then downloads **all** immutable-version and mutable `/current/` CDN resources and verifies their exact SHA-256 digest and byte size. The existing `verify-public-npm-cdn.mjs` checks remain as focused smoke diagnostics.

The full public check requires the new CDN manifest to have been deployed and all five immutable npm versions to have been published from the same release. It intentionally **fails** when either side is stale or incomplete. Run the full check only for publication/release verification, not every documentation-only change: it downloads the complete third-party H5P corpus as well as all first-party browser assets. Evidence is saved in `.npm-pack-gate/public-npm-cdn-all-report.json`.

CDN-only `.html.raw` mirrors exist solely to retrieve Netlify's unmodified runtime HTML bytes; they are verified separately against their HTML originals. Standalone H5P library files belong to `@p2lrn/h5p-libraries` rather than being duplicated inside the Player npm package.

The Studio npm build also includes the complete canonical `packages/toolkit/web/studio/` runtime tree plus the shared browser modules used by the actual `/studio/` website. The public parity check verifies those website runtime bytes against the installed `@p2lrn/studio/dist/` copies, not only the versioned component CDN.

**Not the same thing as functional UI parity:** the public `/studio/` application and the `<p2lrn-studio>` npm component have different application shells. The shared editor/runtime modules and command-bar behavior are covered by browser regression tests, but full interactive parity still requires comparing every authoring, save, import, offline, analytics, responsive and accessibility flow in both surfaces. No file inventory, npm pack result or green static checksum can certify that by itself.

**Publication is separate:** a successful build and Git commit do not update the public npm registry or Netlify CDN automatically. Publish only after passing release gates, using the release owner's authorized process, and verify the actual live resources afterward.


## Lightweight document Reader

There is no standalone `@p2lrn/document-reader` package. The single canonical implementation is:

```text
@p2lrn/toolkit/document-reader
```

with CLI:

```text
p2lrn-document-reader
```

It intentionally contains no OCR, Docling, NestJS, AulaP2P runtime dependency, Docker worker, LibreOffice or Pandoc. PDF extraction is limited to embedded text through optional `pdfjs-dist`.

## License gate

The P2LRN first-party implementation is licensed under **P2LRN Non-Commercial Source License 1.0 (P2LRN-NCSL 1.0)**.

This is a custom source-available, non-commercial license, so the first-party npm packages declare:

```json
"license": "SEE LICENSE IN LICENSE"
```

The root `LICENSE` and `NOTICE.md` are the authorities. Byte-identical copies must be shipped at the top level of the first-party Player, Toolkit, Studio and Analytics packages.

`node scripts/check-publish-ready.mjs` verifies the declaration, the package-local license/notice copies, their byte identity and their presence in the npm `files` lists.

P2LRN-NCSL 1.0 permits non-commercial use, study, modification and redistribution subject to its conditions. Any non-source distribution must provide its Corresponding Source; modified distributions must provide the complete Corresponding Source of the modified version. Modified versions exposed to third parties through remote network interaction must also offer that source. The additional binding permissions in LICENSE Annex A permit commercial courses, paid institutional instruction, and use of first-party Player/Toolkit in commercial software or services subject to retained attribution and corresponding-source obligations. Unmodified Studio/Analytics can be used free inside institutions (including for paid courses), but modifying them or embedding them in third-party paid SaaS or managed services requires separate permission. An existing npm release does not acquire these changed license files retroactively: publish a new version after passing all release gates.

Do not apply P2LRN-NCSL 1.0 to third-party code. `@p2lrn/h5p-libraries` remains governed by its third-party notices, and bundled Player dependencies retain their upstream licenses.

External contributions must follow `CONTRIBUTING.md` so that accepting a contribution does not unintentionally prevent separate commercial licensing.

## Native composite authoring regression gate

Before publishing a new version that changes Studio's composite groups, run the
`studio-composite-authoring.test.mjs` Toolkit regression suite and the real
`verify-local-viewer.mjs` browser suite. Both Studio surfaces must create
activities under the selected composite, move existing activities without
duplicating them, export a valid hierarchy, and reproduce the exported
group in Player. The composite payload accepts `sequence` with `linear`
navigation or `free` with `open` navigation.

A previously published npm version is immutable. Code fixes made after
`0.5.0-alpha.10` require a new release version and the complete publication
gate; do not claim the existing registry tarball contains unshipped fixes.

## Publishing order

After every gate is green, the license gate passes and the release owner approves publication, publish the **five aligned packages** in dependency order: shared H5P libraries, Toolkit, Player, Studio, then Analytics. For the current prerelease version use the npm `next` dist-tag, **not** the stable `latest` tag:

```bash
cd packages/h5p-libraries && npm publish --tag next
cd ../toolkit && npm publish --tag next
cd ../player && npm publish --tag next
cd ../studio && npm publish --tag next
cd ../analytics && npm publish --tag next
```

When a genuinely stable version has passed its release gate, publish with the deliberately selected stable dist-tag; do not promote an alpha by accident. The commands above have **not** been executed as part of this documentation update.

After registry publication, verify `npm view @p2lrn/studio@<version> version` and the equivalent command for all five packages. In a **new empty project**, install their exact versions from the public registry (not local `.tgz` files or the monorepo), then open Studio in a real browser, create, save, reimport and replay a course with Player, verifying optional H5P dependencies. A successful `npm pack` or CI run does not establish that the public registry has the release.

Host-integrated Studio server routes are **not authenticated automatically**. Every production application must protect Save, Reader and Import using its own server-side identity, authorization and request controls, as documented at `/docs/integracion/`.

The Player declares `@p2lrn/h5p-libraries` as an optional peer dependency. Install it when H5P content relies on shared/external libraries:

```bash
npm install @p2lrn/player @p2lrn/h5p-libraries
```

The document Reader is already included with the Toolkit:

```bash
npm install @p2lrn/toolkit
p2lrn-document-reader documento.docx --pretty
```


## Corresponding Source distribution

Public distribution must not depend on the GitHub repository being public.

- `@p2lrn/toolkit` ships its TypeScript `src/` tree and `tsconfig.json` inside the npm package.
- `@p2lrn/player` generates and ships a `source/` snapshot containing the first-party Player build sources and the canonical Toolkit browser/runtime sources used to generate `dist/`.
- The CDN build publishes the same source snapshot at `/player/<version>/source/` and `/player/current/source/`.
- `SOURCE-MANIFEST.json` records package versions, the source revision when available, the P2LRN-NCSL license identifier, the reconstruction command and a SHA-256 inventory of the source files.
- Each published source snapshot contains an `index.html` that makes the Corresponding Source browsable over ordinary static HTTP hosting.
- `/LICENSE` and `/NOTICE.md` are published directly by the static build, so the public license page does not rely on access to a private repository.

A private development repository is therefore compatible with public binary/CDN distribution only when these source artifacts are published with the corresponding release.
