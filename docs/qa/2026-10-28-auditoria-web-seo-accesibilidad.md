# Auditoría técnica SEO y accesibilidad: sitio público P2LRN

**Fecha:** 28/10/2026. **Repositorio:** `josemarcosfrodo/p2lrn`, rama `main`, fuente `deploy/netlify/site/`. **Ámbito:** 57 documentos HTML únicos, `sitemap.xml`, `robots.txt`, reglas de redirección Netlify, hoja `p2lrn.css`, navegación `p2lrn.js`, páginas Studio, visor, legales y script `deploy/netlify/build-site.mjs`.

**Estado de pruebas:** análisis del **código fuente** y revisión de las rutas declaradas. No se pudo realizar un rastreo HTTP de producción ni una ejecución visual con Lighthouse, Playwright/axe o lectores de pantalla: el entorno de comprobación no consiguió acceder a `https://p2lrn.netlify.app/`. Eso no prueba que el sitio esté caído. Los resultados de accesibilidad son hallazgos estáticos y riesgos técnicos, **no** un certificado WCAG 2.2 AA.

## Resultados medidos en el código fuente

| Control | Hallazgo | Interpretación |
|---|---:|---|
| Documentos HTML únicos | **57** | Portada, documentación, editor, visor, contacto, legales y redirecciones antiguas |
| URL incluidas en sitemap | **34** | Se omiten 23 rutas HTML |
| Páginas informativas ausentes de sitemap (sin contar redirecciones) | **20** | Deben revisarse para incluirlas o declararlas `noindex` |
| Redirecciones heredadas ausentes de sitemap | **3** | Correcto: deben redirigir y no indexarse |
| HTML sin `link rel=canonical` | **49** | Incluye home, docs, contacto, Studio y visor |
| HTML con canonical | **8** | Cinco legales y tres redirecciones antiguas |
| Sin `og:title` / `og:description` | **52** | Solo las cinco legales lo incluyen en origen |
| Sin `twitter:card` | **57** | El build sí añade `twitter:image`, pero no una tarjeta completa |
| Sin JSON-LD | **57** | Oportunidad de datos estructurados; no es requisito para indexación |
| Páginas sin enlace `Saltar al contenido` | **9** | Portada, contacto, visor, Studio y cinco legales |
| Un H1 presente por documento | **57/57** | Buena estructura inicial |
| Imágenes HTML sin atributo `alt` | **0 detectadas** | No incluye imágenes CSS ni DOM creado dinámicamente |
| IDs HTML duplicados, botones sin nombre o anclas sin nombre en el HTML fuente | **0 detectados** | No valida el DOM de ejecución |
| Enlaces internos HTML a rutas inexistentes dentro del corpus de páginas | **0 detectados** | Los enlaces a artefactos generados por build no se dan por validados aquí |

**Observaciones de build:** `build-site.mjs` agrega favicon, manifest, `og:image` y `twitter:image`, modifica versiones y consolida el footer. No hay un paso global equivalente para generar canonicals, `og:title`, `og:description`, `twitter:card` o un sitemap completo desde las rutas. El build normaliza los sidebars de docs reemplazando `<aside class="doc-sidebar" aria-label="...">` por `<aside class="doc-sidebar"></aside>`, lo que elimina su nombre accesible.

## Hallazgos y prioridades

### P1 — SEO: canonical en 49 páginas

El sitio carece de canonical en prácticamente todo el contenido principal. El sitemap emplea el origen `https://p2lrn.netlify.app`; usar el mismo origen en canonicals y OG es importante hasta que se decida un dominio canónico definitivo. Generar una canonical absoluta por ruta de HTML en el build, conservar las cinco legales y excluir las páginas heredadas redirigidas. Evitar canonicals a URLs de pruebas, rutas sin barra o dominios alternativos.

**Criterio:** cada página indexable entrega exactamente una canonical coherente; cada alias realiza la redirección 301 sin competir por el índice.

### P1 — Descubrimiento: 20 páginas informativas ausentes del sitemap

Faltan páginas de instalación, guías introductorias, documentación de juegos y ejemplos; concretamente:

- `/docs/cdn/studio/`
- `/docs/cli/`
- `/docs/ejemplos/`
- `/docs/empezar-facil/`
- `/docs/glosario/`
- `/docs/instalar/`
- `/docs/npm/studio/`
- `/docs/que-usar/`
- `/docs/questionnaires/`
- `/docs/questionnaires/3d/`
- `/docs/questionnaires/classification/`
- `/docs/questionnaires/crossword/`
- `/docs/questionnaires/matching/`
- `/docs/questionnaires/memory/`
- `/docs/questionnaires/ordering/`
- `/docs/questionnaires/rosco/`
- `/docs/questionnaires/standard/`
- `/docs/questionnaires/true-false/`
- `/docs/questionnaires/word-search/`
- `/docs/recetas/`

Las rutas `/docs/conectores/gemini/`, `/docs/conectores/local/` y `/docs/conectores/skills/` también están fuera del sitemap, **correctamente**, porque son alias heredados con redirección 301 y `noindex`.

**Criterio:** sitemap generado de las rutas indexables reales; sin URL 404/3xx/5xx, noindex ni canonical hacia otra página. Verificación HTTP obligatoria antes de darlo por cerrado.

### P1 — Accesibilidad: «Abrir archivo» de Studio no es operable directamente con teclado

En `deploy/netlify/site/studio/index.html` el acceso inicial es `<label class="button">Abrir archivo<input data-file type="file" ... hidden></label>`. El `label` no es un control enfocable por sí mismo y el input `hidden` está fuera de la navegación por teclado. Sustituirlo por un **botón real** enfocable que abra el selector con `.click()`, conservando la entrada de archivos y la lógica existente. Verificar Tab, Enter, Space y foco visible.

**Criterio:** poder abrir/importar un paquete `.p2lrn` desde Studio sin ratón.

### P2 — Accesibilidad: faltan enlaces de salto en nueve páginas

Rutas: `/`, `/aviso-legal/`, `/contacto/`, `/cookies/`, `/demo/`, `/licencia/`, `/privacidad/`, `/studio/`, `/terminos/`.

Las guías `/docs/*` sí incluyen el patrón de salto, pero las anteriores no. Incorporar al principio de `body` un enlace a `<main id="contenido">` o destino equivalente. CSS ya define `.skip-link:focus`, por lo que puede reutilizarse. Confirmar que el destino no queda tapado por la cabecera fija.

### P2 — Accesibilidad: navegación de documentación pierde nombre de región

En `deploy/netlify/build-site.mjs`, la normalización sustituye el `aside` por un elemento vacío y elimina `aria-label`. Conservar `aria-label="Navegación de documentación"`; revisar que la búsqueda y enlaces creados dinámicamente queden dentro de la región identificada.

### P2 — Accesibilidad: resultados de búsqueda de docs sin anuncio

`p2lrn.js` reconstruye `.docs-search-results` según la búsqueda y la oculta cuando no hay coincidencias, pero no expone un contador o estado `role=status` / `aria-live`. Debe anunciar número de coincidencias, vacío y error de red de forma concisa, sin robar el foco. Comprobar navegación mediante teclado por los resultados.

### P2 — SEO social / datos enriquecidos

El build agrega imágenes de marca, pero faltan `og:title` y `og:description` en 52 páginas y `twitter:card` en 57. Incorporar metadatos por ruta (no repetir el mismo texto en todas), `og:url`, imagen social adecuada y `twitter:summary_large_image` cuando sea pertinente. JSON-LD de tipo `SoftwareApplication`, `TechArticle` o `BreadcrumbList` solo si describe datos visibles y verificables: su ausencia no impide indexación.

### P1 — Exactitud: documentación LTI desactualizada

`/docs/conectores/lti/` afirma que aún no existen endpoints OIDC/JWKS, registro persistente, sesiones o proveedor operativo. El repositorio ya contiene `integration/lms/lti-server.mjs` y validaciones en LMS locales. Separar claramente **contratos descargables**, **módulo de servidor que está en el repositorio**, **pruebas QA** y **qué queda sin certificar en producción**. Evitar tanto la afirmación obsoleta de inexistencia como prometer interoperabilidad universal no validada.

### P2 — Auditoría dinámica pendiente

Inspección real con axe-core/Lighthouse, navegación con teclado, lector de pantalla (NVDA o VoiceOver), zoom de 200–400 %, anchos 320/375/768/1440 px, reflow sin desplazamiento horizontal, contraste de texto y componentes, mensajes de error, controles 3D, formularios, estado de Studio y `prefers-reduced-motion`.

La paleta base ofrece buenos contrastes **calculados**: texto principal `#111318` sobre `#f6f7f4` ≈ 17,28:1; texto secundario `#636975` sobre ese fondo ≈ 5,13:1; enlaces `#2854ff` sobre blanco ≈ 5,52:1. Esto no confirma el contraste de todos los controles o estados. El verde `#1f9d63` sobre blanco ≈ 3,46:1 **no sería suficiente para texto normal**, aunque el uso observado de ese token es principalmente decorativo.

## Inventario individual de páginas

Leyenda: «Sitemap» refleja **solo** `sitemap.xml` de origen; «Canonical» refleja **solo** HTML fuente; «Salto» refleja el enlace de salto en HTML fuente. La compilación puede aportar otros metadatos, pero el build actual no añade canonicals generales.

| Ruta | Sitemap | Canonical | Salto al contenido |
|---|---|---|---|
| `/` | Sí | Falta | Falta |
| `/aviso-legal/` | Sí | Sí | Falta |
| `/contacto/` | Sí | Falta | Falta |
| `/cookies/` | Sí | Sí | Falta |
| `/demo/` | Sí | Falta | Falta |
| `/docs/` | Sí | Falta | Sí |
| `/docs/cdn/` | Sí | Falta | Sí |
| `/docs/cdn/studio/` | No | Falta | Sí |
| `/docs/cli/` | No | Falta | Sí |
| `/docs/colaboracion/` | Sí | Falta | Sí |
| `/docs/compatibilidad/` | Sí | Falta | Sí |
| `/docs/conceptos/` | Sí | Falta | Sí |
| `/docs/conectores/` | Sí | Falta | Sí |
| `/docs/conectores/gemini/` | No | Destino final (redirect) | Sí |
| `/docs/conectores/ia/` | Sí | Falta | Sí |
| `/docs/conectores/lms/` | Sí | Falta | Sí |
| `/docs/conectores/local/` | No | Destino final (redirect) | Sí |
| `/docs/conectores/lti/` | Sí | Falta | Sí |
| `/docs/conectores/skills/` | No | Destino final (redirect) | Sí |
| `/docs/ejemplos/` | No | Falta | Sí |
| `/docs/empezar-facil/` | No | Falta | Sí |
| `/docs/empezar/` | Sí | Falta | Sí |
| `/docs/entrega-offline/` | Sí | Falta | Sí |
| `/docs/eventos/` | Sí | Falta | Sí |
| `/docs/formato/` | Sí | Falta | Sí |
| `/docs/glosario/` | No | Falta | Sí |
| `/docs/instalar/` | No | Falta | Sí |
| `/docs/integracion/` | Sí | Falta | Sí |
| `/docs/juegos-3d/` | Sí | Falta | Sí |
| `/docs/metricas/` | Sí | Falta | Sí |
| `/docs/npm/` | Sí | Falta | Sí |
| `/docs/npm/studio/` | No | Falta | Sí |
| `/docs/paquetes/` | Sí | Falta | Sí |
| `/docs/paquetes/multipart/` | Sí | Falta | Sí |
| `/docs/player/` | Sí | Falta | Sí |
| `/docs/progresion/` | Sí | Falta | Sí |
| `/docs/que-usar/` | No | Falta | Sí |
| `/docs/questionnaires/` | No | Falta | Sí |
| `/docs/questionnaires/3d/` | No | Falta | Sí |
| `/docs/questionnaires/classification/` | No | Falta | Sí |
| `/docs/questionnaires/crossword/` | No | Falta | Sí |
| `/docs/questionnaires/matching/` | No | Falta | Sí |
| `/docs/questionnaires/memory/` | No | Falta | Sí |
| `/docs/questionnaires/ordering/` | No | Falta | Sí |
| `/docs/questionnaires/rosco/` | No | Falta | Sí |
| `/docs/questionnaires/standard/` | No | Falta | Sí |
| `/docs/questionnaires/true-false/` | No | Falta | Sí |
| `/docs/questionnaires/word-search/` | No | Falta | Sí |
| `/docs/recetas/` | No | Falta | Sí |
| `/docs/referencia/` | Sí | Falta | Sí |
| `/docs/studio/` | Sí | Falta | Sí |
| `/docs/toolkit/` | Sí | Falta | Sí |
| `/docs/troubleshooting/` | Sí | Falta | Sí |
| `/licencia/` | Sí | Sí | Falta |
| `/privacidad/` | Sí | Sí | Falta |
| `/studio/` | Sí | Falta | Falta |
| `/terminos/` | Sí | Sí | Falta |

## Verificaciones de aceptación necesarias antes de declarar SEO/WCAG completado

1. Construir con `node deploy/netlify/build-site.mjs` y auditar **`.netlify-cdn`**, no solo `deploy/netlify/site`. Comprobar títulos, descriptions, canonical, robots, Open Graph, Twitter, H1, enlaces internos, assets y JSON-LD de cada ruta.
2. Rastrear el despliegue HTTPS público, registrar HTTP status, `Content-Type`, canonicals efectivas, redirecciones y errores de JS, comparar cada URL de sitemap con la página final.
3. Ejecutar pruebas automatizadas axe-core sobre las **57 rutas** (las tres redirigidas se ensayan como 301), con Playwright en escritorio y móvil, más pruebas manuales de teclado y lector de pantalla en Studio, visor, búsqueda, navegación y juegos.
4. Registrar evidencia de capturas, problemas reproducibles, correcciones, auditoría posterior y versión desplegada. No afirmar `WCAG 2.2 AA` completo sin esa fase visual y asistiva.

**Resultado de esta auditoría:** la estructura y rotulación HTML base están relativamente cuidadas, pero existen lagunas SEO generalizadas y problemas de accesibilidad concretos. **No está certificado el despliegue público ni conformidad WCAG**.


## Seguimiento del release — 12 de noviembre de 2026

El inventario anterior es histórico. La incidencia #19 contiene los snapshots
posteriores; no trasladar sus aprobaciones a un SHA nuevo.

Correcciones preparadas para revisión, sin despliegue:

- Las guías de desarrolladores de actividades y juegos 3D recuperan el
  theme-color y la navegación/contacto de respaldo en español e inglés.
- Los dos runtimes SCORM usan la misma comprobación previa de scripts
  ausentes. Un archivo incompleto se rechaza antes de montar el documento;
  esto no reconstruye recursos ausentes ni certifica su reproducción.
  No se amplían CSP, permisos del iframe ni acceso a la red.
- La generación inglesa deja de publicar un commit posterior al QA. El
  workflow usa permisos de lectura, fija el checkout a github.sha, verifica
  que regenerar no modifica los bytes comprometidos y ordena Chromium después
  de esa comprobación. La comprobación de producción permanece activa.

Evidencia existente revisada:
[artefacto 13930840577](https://github.com/josemarcosdzb/p2lrn/actions/runs/43189853760/artifacts/13930840577),
SHA de origen 5efd105d712b2d60783caccde7c486f91da609ac,
digest ZIP SHA-256 08fb25b2ce1b0191cb080525d04fc5bca2b5b19592441deb4691ec5281447c76.
Su JSON full-site-a11y conserva 98 resultados incompletos, todos de
color-contrast. Hay símbolos decorativos, pero también textarea, textos de
portada y controles de Studio: no descartarlos colectivamente.

Pendiente antes de aprobar la publicación:

- CI completo y build sobre el commit final incorporado; la aprobación de las
  pruebas dirigidas de estas correcciones no sustituye esa ejecución.
- Revisar los nodos de contraste en su estado visible y con su fondo real,
  indicando criterio, medición y resultado por caso. Los textos y campos
  parcialmente tapados requieren además descartar solapamientos reales.
- Navegación completa con teclado y lectores de pantalla, diálogos, formularios,
  edición, arrastre alternativo, cuestionarios y 3D; zoom 200/400 % y móvil.
- Mantener Netlify congelado hasta autorización explícita. Registrar artefacto,
  deploy anterior y reversión; verificar URLs, recursos y subtítulos públicos
  tras la publicación autorizada.
- Documentar la fecha real de publicación del vídeo antes de afirmar
  elegibilidad de resultados enriquecidos. Search Console seleccionada no
  demuestra indexación de los recursos nuevos.

No declarar conformidad WCAG 2.2 AA por el resultado de axe-core.
