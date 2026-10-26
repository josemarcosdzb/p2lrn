# Auditoría de seguridad P2LRN — 26 de octubre de 2026

## Alcance

Repositorio privado `josemarcosfrodo/p2lrn`, web `https://p2lrn.netlify.app/`, los cuatro paquetes npm de P2LRN (Toolkit, Player, Studio, H5P Libraries), conectores MCP, empaquetado de cursos, ejecución aislada de contenidos externos, configuración CI y formulario de contacto de Supabase. Auditoría de código, dependencias, cabeceras HTTP y regresión funcional automatizada. No es una certificación de invulnerabilidad ni sustituye un pentest profesional.

## Resultados comprobados

- **Dependencias:** `npm audit` sobre los cinco manifiestos y sus `package-lock.json` generados muestra **cero vulnerabilidades conocidas** en Toolkit, Player, Studio, H5P Libraries y MCP después de las correcciones.
- **Toolkit:** 184 pruebas correctas en la validación posterior, ninguna fallida y 1 omitida por no disponer de permisos para crear enlaces simbólicos en Windows. Incluye firmas Ed25519, comprobación de integridad, límites de archivos, rutas y aislamiento de recursos.
- **MCP:** 30 correctas, ninguna fallida y 1 omitida por el mismo límite de Windows. Incluye autenticación Bearer, control de origen, DNS rebinding, permisos de escritura y validación de rutas.
- **Studio:** 8 pruebas del instalador y rutas aprobadas, más 5 pruebas específicas de seguridad de almacenamiento/subidas correctas (1 omitida).
- **Player:** distribución compilada con 127 archivos; 4 pruebas de seguridad del runtime correctas.
- **Web:** 54 documentos HTML inspeccionados mediante el nuevo verificador de CSP. En las plantillas inspeccionadas no se encontraron bloques `<script>` sin `src` ni handlers inline de los tipos comprobados. Se comprobó que el sitio público responde por HTTPS, con HSTS.
- **Supabase P2LRN:** RLS activado en `public.contact_messages`; la inserción directa de `anon` y `authenticated` se ha revocado. Los envíos pasan por `p2lrn-contact` y límites transaccionales en servidor; ver cierre posterior.

## Hallazgos y medidas aplicadas

| Riesgo | Evidencia | Medida aplicada |
| --- | --- | --- |
| Dependencia vulnerable | `integration/mcp` usaba `fflate 0.8.2`, afectada por CVE-2026-45820, bloqueo de ZIP64 malformado | Actualizada a `0.8.3`, versión corregida según GHSA-px8p-9vwx-vf98 |
| Agotamiento de memoria en importación | Las rutas de Studio acumulaban `request.arrayBuffer()` antes de verificar el tamaño real | Lectura de streaming limitada y cancelación temprana en guardar, importar y leer documentos |
| Salida del directorio de almacenamiento | Validación de ruta léxica insuficiente ante directorios enlazados | Validación de `realpath` del directorio y raíz y rechazo de enlaces simbólicos en el archivo de destino |
| Cabeceras web incompletas | En la web activa no aparecían CSP, `nosniff`, política de referencias ni otros controles | Archivo `deploy/netlify/site/_headers` con políticas por rutas; seguridad genérica para todos los recursos y CSP de documentos sin `unsafe-inline` ni `unsafe-eval` en scripts |
| Control de cadena de suministro insuficiente | El CI anterior no bloqueaba dependencias con avisos de nivel moderado o mayor | `security-windows` añadido **dentro del workflow existente**, con `npm ci`, `npm audit`, pruebas de Studio y verificación de CSP |
| Resoluciones no reproducibles | Faltaban archivos de bloqueo versionados de los cinco árboles npm | Cinco lockfiles incorporados y verificados |

La política CSP del sitio se limita a las páginas propias: **no se impone a los iframes/runtimes H5P y SCORM servidos desde `/player/`**, que requieren una política diferente y un origen aislado. Se han conservado los flujos funcionales y no se han creado ramas nuevas.

## Riesgos abiertos y restricciones

1. **Web activa (cerrado):** CSP y demás cabeceras se verificaron en Netlify. Las rutas `/studio/*` y `/demo/*` permiten `blob:` únicamente en `connect-src` para cargar paquetes locales; `/contacto/*` y `/docs/*` mantienen el bloqueo.
2. **Paquetes npm públicos:** siguen en `next=0.5.0-alpha.11` y `latest=0.0.0-stage`; no se han republicado paquetes.
3. **Formulario de contacto (cerrado en lo relativo al límite de servidor):** se retiró la inserción pública directa y se desplegó la función Supabase de recepción con cuotas transaccionales. Dos envíos de prueba se aceptaron y el tercero fue rechazado con HTTP 429. El control en `localStorage` es solo auxiliar; siguen siendo convenientes mecanismos adicionales contra bots.
4. **Autorización de Studio:** las rutas auxiliares publicables necesitan que la aplicación anfitriona imponga identidad, permisos, CSRF, cuotas y políticas de guardado. No deben exponerse como endpoints públicos sin controles.
5. **Contenido activo externo:** SCORM, H5P y paquetes externos deben conservar aislamiento de origen. H5P usa excepciones CSP de compatibilidad en su runtime; cualquier reducción debe validarse con bibliotecas reales.
6. **Protección GitHub:** al comienzo de la auditoría `main` no tenía reglas activas para impedir reescrituras forzadas, borrado o imponer CI. No se activaron PR obligatorias ni se bloquearon los cambios directos en `main`.
7. **Cobertura:** no se efectuaron ataques en producción, fuzzing exhaustivo de ZIP, pruebas de carga, análisis de cada biblioteca H5P de terceros ni pentest autenticado en todos los LMS. Dos pruebas de symlinks quedaron omitidas debido a los permisos del Windows utilizado.

## Continuidad

Antes de publicar una versión npm o desplegar cambios web, exigir CI de seguridad exitoso, comprobar navegación real en navegador y reproducir los flujos de Studio, Player, SCORM y H5P con aplicaciones anfitrionas. No clasificar como seguridad certificada ningún elemento pendiente.

Fuentes: https://github.com/advisories/GHSA-px8p-9vwx-vf98 ; https://docs.netlify.com/manage/routing/headers/

## Resultado posterior de GitHub Actions

La ejecución [40330106866](https://github.com/josemarcosfrodo/p2lrn/actions/runs/40330106866), asociada al commit de seguridad `d32b1d5`, terminó con estado general **failure**, aunque los jobs independientes **security-windows**, **mcp-connectors-windows** y **lms-contracts-windows** finalizaron **success**. El job `toolkit-and-cdn` falló al verificar el visor en navegador: `studio-component-cdn` informó `Offline assignment dialog is not open` y `studio-website-ui` informó `Visual Studio website did not initialize`. No se atribuye ese fallo a los cambios de seguridad sin un análisis causal. El límite de cuota de artefactos de GitHub impidió subir algunas evidencias, aunque se conservaron archivos de evidencia en Windows. **La validación integral del sitio sigue pendiente.**

## Cierre de la regresión visual de Studio — 26 de octubre de 2026

La incidencia que bloqueaba el CI en la prueba de Studio se investigó y corrigió en dos niveles:

- **Montaje de Studio:** el generador de la web y su JavaScript global eliminaban `header-meta` y el elemento funcional `data-studio-status`. Se conserva ese control y se mantiene la limpieza de indicadores decorativos. Compilación, prueba CDN y prueba visual de Studio local correctas. Corrección [2f8d65e](https://github.com/josemarcosfrodo/p2lrn/commit/2f8d65e98936ce73a1128d075a07f7824b863cf8).
- **Dependencias y regresión:** el manifiesto único de módulos compartidos entre compilación y prueba visual incluye `course-rights.js`. El test de autoría valida el manifiesto sin duplicar listas. Corrección [fa0f403](https://github.com/josemarcosfrodo/p2lrn/commit/fa0f40330f11fd26a3c58a7923440973475cd16c). Toolkit: **184 aprobadas, 0 fallidas, 1 omitida** en Windows.
- **CSP de producción:** Chrome confirmó `TypeError: Failed to fetch` en una URL `blob:` creada por Studio porque `connect-src` no incluía ese esquema. La política ahora permite `blob:` en `/studio/*` y `/demo/*`, sin abrir conexiones Blob en documentación o contacto; el verificador de CSP comprueba este contrato. Corrección [8be28c7](https://github.com/josemarcosfrodo/p2lrn/commit/8be28c73b5862ba7d90a06260c79fbe7302a8d04).
- **Producción real comprobada:** después del despliegue, una prueba automatizada con Chrome abrió `https://p2lrn.netlify.app/studio/`, creó un curso y una unidad con lección, seleccionó la unidad y llegó al estado **«Vista alumno»**. El Player renderizó contenido (`stageChildCount=1`), mantuvo `navigation=external`, sin navegación duplicada ni desbordamiento horizontal; **0 excepciones JavaScript**. La lectura `fetch(blob:)` devolvió el contenido de prueba correctamente bajo CSP. Captura local: `C:\Users\Usuario\Downloads\p2lrn-validation\p2lrn-public-studio-fixed-20261026.png`.
- **Resultado:** la regresión funcional concreta de la vista alumno de Studio queda **cerrada y verificada en producción**. El CI general de GitHub puede experimentar cancelaciones cuando otros cambios llegan a `main`; no se confunden esos resultados con el ensayo de Chrome aquí documentado.

Los riesgos abiertos de alojamiento/anfitrión, contenido de terceros, permisos de enlaces simbólicos en Windows y protección de rama siguen indicados en este informe. Ninguno de estos resultados significa invulnerabilidad absoluta.
