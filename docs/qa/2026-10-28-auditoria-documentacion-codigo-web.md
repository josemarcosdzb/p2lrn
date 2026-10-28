# Auditoría completa de documentación web frente a código — 28/10/2026

## Alcance

Auditoría página por página del sitio P2LRN y contraste de la documentación con el código y contratos públicos de la prerelease `0.5.0-alpha.11`.

- HTML público inventariado: **57 páginas**.
- Páginas bajo `/docs/`: **48**.
- Texto público recorrido en la auditoría inicial: **aprox. 35.000 palabras**.
- Paquetes NPM contrastados: `@p2lrn/player`, `@p2lrn/studio`, `@p2lrn/toolkit`, `@p2lrn/h5p-libraries`.
- Versión pública contrastada: **0.5.0-alpha.11**, dist-tag **next**.
- Fuentes de verdad adicionales: tipos publicados, Web SDK ESM, Toolkit/Host, Studio, `integration/lms`, notas de release y matriz E2E conectada de alpha.11.

Esta auditoría no convierte una prueba de una muestra en certificación universal. Las afirmaciones de la web se han limitado a lo que existe en código o está cubierto por gates del repositorio.

## Cambios de documentación realizados

### Versionado

Se eliminan de las fuentes HTML públicas las referencias residuales a `0.5.0-alpha.10` y se alinean con `0.5.0-alpha.11`. El build ya sustituía parte de esas cadenas, pero mantener la fuente antigua hacía que repositorio y web no fueran una única referencia coherente.

`deployment-verification.json` y `verify-public-cdn.mjs` **no se actualizan mecánicamente**: continúan representando una evidencia pública de despliegue y sólo deben cambiar cuando exista una nueva validación browser/HTTP contra el SHA realmente publicado.

### Player y Web SDK

Documentadas las superficies públicas conectadas de alpha.11:

- Capability Broker deny-by-default.
- `createToolCapabilityProvider()` y `createMcpCapabilityProvider()`.
- colaboración en memoria/HTTP.
- Offline Host Adapter, stores y `createOfflineSyncController()`.
- actividad/tiempo activo.
- modelo de learning events.
- Resource Library en memoria/Cache Storage, verificación SHA-256, resolver y capability provider.
- Package Cache verificado y reapertura offline.
- configuración de Runtime Host y Service Worker.

También se alinea `packages/player/types/index.d.ts` con exports que ya existen en el runtime ESM/global para evitar que JavaScript y TypeScript describan APIs distintas.

### Toolkit y Host

La guía refleja los subpaths públicos `core`, `reader`, `creator`, `authoring`, `host` y `document-reader`.

Se documentan:

- derechos de curso `author`, `createdAt`, `license`, `copyrightHolder`;
- `createReferenceAuthoritativeHost()`;
- stores de referencia en memoria/JSON;
- decisión de nota autoritativa producida por servidor;
- deduplicación mediante `offlineDeliveryId`.

### Studio

Alineadas la guía general, NPM y CDN con el componente alpha.11:

- `resourceLibrary`;
- `materializeSharedResource()`;
- derechos de autor/licencia;
- exportación de entrega offline;
- revisión de `.p2lrn-result`;
- eventos `p2lrn-studio-offline-export` y `p2lrn-studio-offline-review`.

### LTI y LMS

Corregida la contradicción más importante de la documentación.

El repositorio ya contiene un **proveedor LTI 1.3 universal self-hosted**, con:

- OIDC/JWT RS256;
- state/nonce/replay;
- JWKS;
- catálogo;
- Deep Linking firmado;
- bindings administrativos;
- SQLite persistente;
- sesiones/runtime Player;
- estado y eventos;
- AGS OAuth2, lineitems, outbox y reintentos.

Sigue pendiente y así se documenta:

- NRPS;
- certificación E2E por versión/instancia real de Moodle, Canvas, Sakai, Chamilo y Open edX;
- convertir el ZIP de fuente LTI en un instalador autónomo, si se decide ofrecerlo.

También se actualiza `integration/lms/ARCHITECTURE.md` y el README generado dentro de la descarga LTI para que no contradigan al código que contienen.

### Instalación y descubrimiento

`/docs/npm/` y `/docs/instalar/` muestran los **cuatro** paquetes publicados de alpha.11, incluido `@p2lrn/h5p-libraries`.

`/docs/que-usar/`, recetas y glosario incorporan offline, cache, Resource Library, Host autoritativo y proveedor LTI para que estas funciones no queden escondidas sólo en Referencia.

### Compatibilidad

La página de compatibilidad se actualiza con la matriz E2E conectada de alpha.11:

- round-trip de Studio;
- 12 juegos nativos;
- colaboración HTTP y dos Players;
- recursos compartidos/deduplicación;
- analítica enriquecida;
- offline/cache;
- fixtures externos actuales;
- instalación NPM real;
- Host Express independiente;
- identidad de distribución.

Se mantienen explícitos los límites: no se declara certificación Safari/Firefox, WCAG completa, conformidad universal de estándares externos ni stores de referencia como persistencia de producción.

## Resultado página por página

| # | Ruta | Resultado |
|---:|---|---|
| 1 | `/aviso-legal/` | Revisada y actualizada |
| 2 | `/contacto/` | Revisada y actualizada |
| 3 | `/cookies/` | Revisada y actualizada |
| 4 | `/demo/` | Revisada; visor alineado |
| 5 | `/docs/cdn/` | Revisada; sin cambio de contenido |
| 6 | `/docs/cdn/studio/` | Revisada y actualizada |
| 7 | `/docs/cli/` | Revisada y actualizada |
| 8 | `/docs/colaboracion/` | Revisada; ya alineada con alpha.11 |
| 9 | `/docs/compatibilidad/` | Revisada y actualizada |
| 10 | `/docs/conceptos/` | Revisada y actualizada |
| 11 | `/docs/conectores/gemini/` | Revisada; ruta puente correcta |
| 12 | `/docs/conectores/ia/` | Revisada; sin cambio de contenido |
| 13 | `/docs/conectores/` | Revisada y actualizada |
| 14 | `/docs/conectores/lms/` | Revisada y actualizada |
| 15 | `/docs/conectores/local/` | Revisada; ruta puente correcta |
| 16 | `/docs/conectores/lti/` | Revisada y actualizada |
| 17 | `/docs/conectores/skills/` | Revisada; ruta puente correcta |
| 18 | `/docs/ejemplos/` | Revisada y actualizada |
| 19 | `/docs/empezar-facil/` | Revisada y actualizada |
| 20 | `/docs/empezar/` | Revisada y actualizada |
| 21 | `/docs/entrega-offline/` | Revisada y actualizada |
| 22 | `/docs/eventos/` | Revisada y actualizada |
| 23 | `/docs/formato/` | Revisada y actualizada |
| 24 | `/docs/glosario/` | Revisada y actualizada |
| 25 | `/docs/` | Revisada y actualizada |
| 26 | `/docs/instalar/` | Revisada y actualizada |
| 27 | `/docs/integracion/` | Revisada y actualizada |
| 28 | `/docs/juegos-3d/` | Revisada y actualizada |
| 29 | `/docs/metricas/` | Revisada y actualizada |
| 30 | `/docs/npm/` | Revisada y actualizada |
| 31 | `/docs/npm/studio/` | Revisada y actualizada |
| 32 | `/docs/paquetes/` | Revisada y actualizada |
| 33 | `/docs/paquetes/multipart/` | Revisada y actualizada |
| 34 | `/docs/player/` | Revisada y actualizada |
| 35 | `/docs/progresion/` | Revisada y actualizada |
| 36 | `/docs/que-usar/` | Revisada y actualizada |
| 37 | `/docs/questionnaires/3d/` | Revisada y actualizada |
| 38 | `/docs/questionnaires/classification/` | Revisada y actualizada |
| 39 | `/docs/questionnaires/crossword/` | Revisada y actualizada |
| 40 | `/docs/questionnaires/` | Revisada y actualizada |
| 41 | `/docs/questionnaires/matching/` | Revisada y actualizada |
| 42 | `/docs/questionnaires/memory/` | Revisada y actualizada |
| 43 | `/docs/questionnaires/ordering/` | Revisada y actualizada |
| 44 | `/docs/questionnaires/rosco/` | Revisada y actualizada |
| 45 | `/docs/questionnaires/standard/` | Revisada y actualizada |
| 46 | `/docs/questionnaires/true-false/` | Revisada y actualizada |
| 47 | `/docs/questionnaires/word-search/` | Revisada y actualizada |
| 48 | `/docs/recetas/` | Revisada y actualizada |
| 49 | `/docs/referencia/` | Revisada y actualizada |
| 50 | `/docs/studio/` | Revisada y actualizada |
| 51 | `/docs/toolkit/` | Revisada y actualizada |
| 52 | `/docs/troubleshooting/` | Revisada y actualizada |
| 53 | `/` | Revisada y actualizada |
| 54 | `/licencia/` | Revisada y actualizada |
| 55 | `/privacidad/` | Revisada y actualizada |
| 56 | `/studio/` | Revisada; Studio alojado alineado |
| 57 | `/terminos/` | Revisada y actualizada |

## Gates añadidos

`scripts/verify-doc-flow.mjs` amplía la auditoría para:

- recorrer todos los HTML públicos y bloquear referencias `alpha.10`;
- exigir las APIs conectadas de alpha.11 en Player/Integración/Toolkit/Studio/Referencia;
- bloquear afirmaciones LTI/LMS obsoletas;
- comprobar que TypeScript declare los exports conectados del runtime;
- impedir que `integration/lms/ARCHITECTURE.md` vuelva a marcar el proveedor como pendiente;
- impedir que el README de la descarga LTI vuelva a describir OIDC/JWKS/launch como no implementados.

## Puntos que siguen abiertos y no deben ocultarse

1. **LTI NRPS** no está implementado.
2. **Matriz E2E real por LMS**: falta certificar instancias/versiones concretas de los cinco LMS.
3. **Navegadores**: los gates actuales no equivalen a certificación universal Firefox/Safari.
4. **Accesibilidad**: las alternativas y gates actuales no equivalen por sí solos a una certificación WCAG completa.
5. **Persistencia de referencia**: memoria, JSON y SQLite single-server no sustituyen una arquitectura de producción multi-nodo.
6. **Legal**: aviso legal y privacidad indican expresamente los datos jurídicos del responsable/prestador que todavía deben confirmarse.
7. **Certificación pública de despliegue**: `deployment-verification.json` debe actualizarse únicamente después de validar el nuevo SHA desplegado mediante navegador/HTTP.

## Validación final de la auditoría

Cierre técnico ejecutado sobre `f2554069e8d1d334b3602653501315d2f0011cc2`:

- `scripts/verify-site-security.mjs`: **OK**, 57 HTML revisados y CSP sin scripts inline inseguros.
- `scripts/verify-doc-navigation.mjs`: **OK**, 48 páginas de documentación, 32 enlaces globales y sin duplicados.
- `scripts/verify-doc-installation-paths.mjs`: **OK**, rutas CDN/NPM/Studio coherentes con `0.5.0-alpha.11`.
- `scripts/verify-doc-professional.mjs`: **OK**, jerarquía, fallback, skip links y sidebars accesibles.
- `scripts/verify-doc-flow.mjs`: **OK**, auditoría completa de HTML público y documentación alineada con alpha.11.
- `scripts/verify-doc-questionnaire-examples.mjs`: **OK**, 10 guías y ejemplos compatibles con runtime.
- `scripts/verify-public-doc-content.mjs`: **OK**, sin lenguaje interno de desarrollo ni referencias ajenas.
- `deploy/netlify/build-site.mjs`: **OK**. Resultado: 63 páginas generadas, 54 indexables, 45 documentos en búsqueda, enlaces locales validados, 18 ejemplos canónicos, 13 generados, 16 comandos CLI y 4 partes multipart.
- Seguridad y build también validan las tres rutas heredadas de IA sin JavaScript inline; permanecen como redirecciones `noindex` hacia la guía canónica.

La auditoría de **documentación frente a código** queda cerrada a nivel de repositorio y build local reproducible.

### Evidencia de despliegue público

La actualización de `deployment-verification.json` continúa separada deliberadamente. No debe cambiarse hasta demostrar por HTTP/browser que Netlify está sirviendo exactamente el SHA anterior. Esto evita convertir una validación local en una afirmación falsa sobre producción.
