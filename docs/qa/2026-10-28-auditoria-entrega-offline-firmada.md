# Auditoría de entrega offline P2LRN — 28 de octubre de 2026

## Alcance

Código de `packages/toolkit/web/studio/offline-assignment.js`, revisión de resultados en Studio, exportación ZIP/CMD, distribución CDN, navegación y guía pública `/docs/entrega-offline/`. Se mantiene el curso P2LRN Core 0.4.0 y el Player existente.

## Correcciones comprobadas

1. **Orden de evidencias.** El archivo de devolución separa registros de tipo `state`, `event` y `score`, pero antes no conservaba su orden temporal. Se añadió `audit.recordOrder` para reconstruir el orden que se usó en `audit.evidenceRoot`; se rechazan índices repetidos, ausentes o inválidos. En entregas antiguas con operaciones de varios tipos y sin dicho orden, se devuelve estado **no verificable** en vez de una acusación de manipulación.
2. **Coherencia de datos.** El revisor compara el resumen y las respuestas declaradas con estados, puntuaciones y eventos. Si un estudiante cambia solo la puntuación o las respuestas y recalcula el SHA-256 del archivo, el cambio puede seguir detectándose por esa incoherencia. **No es una garantía criptográfica de autoría**; un atacante puede rehacer todos los registros coherentemente.
3. **Modo de firma.** Una entrega generada con Ed25519 incorpora el requisito de firma en su app local. Quitar solamente la firma bloquea el arranque. El comprobante original conservado por el profesor se coteja por separado y es imprescindible para autenticar el encargo. No es una firma de las respuestas ni del ejecutable.
4. **Studio.** La revisión enseña de forma separada SHA-256, correspondencia del curso, firma, comprobante, cadena de evidencias, coherencia de resumen y **puntuación declarada (no oficial)**. Una discrepancia muestra advertencia visible y no se presenta como nota acreditada.
5. **Runtime CDN.** El portal estaba añadiendo metadatos visuales a los documentos HTML del Player después de generar `release.json`. Además, el alojamiento añade comentarios a las respuestas `text/html`. Se excluyeron las distribuciones inmutables de la reescritura del sitio y se publicaron copias `.html.raw` de los tres documentos de runtime. El exportador obtiene esos bytes originales, conserva el nombre `.html` dentro del ZIP y **sigue validando tamaño y SHA-256** contra el manifiesto. Se mantiene un fallback para instalaciones propias antiguas que sirven HTML original sin transformar; también debe pasar el hash.
6. **Documentación web.** La guía ahora explica en orden los formatos, la generación normal o firmada, el comprobante del profesor, el proceso de devolución, las comprobaciones reales y las limitaciones; se añadieron problemas frecuentes. La guía de Studio y la página de cursos offline enlazan a la sección de revisión. Se corrigió además el encabezado de Analytics que impedía pasar la auditoría general de documentación.

## Pruebas

- `node --test packages/toolkit/test/offline-assignment.test.mjs`: **10/10** en Windows. Incluye firma válida, firma falsificada, comprobante incorrecto, cambios con SHA-256 recalculado, intercalado de eventos/estados/notas, resumen inconsistente, compatibilidad antigua y HTML reescrito por CDN.
- `node scripts/verify-doc-professional.mjs` y `node scripts/verify-doc-flow.mjs`: **aprobados**; 49 páginas de documentación auditadas en estructura y flujo.
- `node deploy/netlify/build-site.mjs` y `node scripts/verify-site-seo-a11y.mjs`: **aprobados**; 62 páginas origen, 59 indexables y 3 alias. Verificada integridad de cada HTML y su copia `.raw` para `current` y versión fija.
- Web publicada: las tres copias `h5p.html.raw`, `package.html.raw` y `scorm.html.raw` respondieron HTTP 200 con tamaño y SHA-256 idénticos a `release.json`.
- Chrome real, desde `/studio/`: creación de curso y descarga de ZIP firmado de ~8,8 MB (139 miembros) y comprobante de 1.454 bytes. El comprobante coincide con el encargo y **no** aparece en el ZIP del alumno. La revisión con comprobante en Studio mostró firma válida y cotejada, curso coincidente, cadena coherente y resúmenes consistentes.
- La prueba automatizada completa de modificar una devolución y verificar su aviso visual en Chrome **no queda certificada** en este informe; el rechazo de cambios por el verificador sí está cubierto por pruebas unitarias.

## Límites y pendientes explícitos

- El lanzador de Windows sigue siendo **`.cmd` sin firma de código**: no es un `.exe` firmado ni una aplicación de examen bloqueada.
- No se ocultan universalmente las soluciones de los juegos con autocorrección. No se han añadido TPM, vigilancia, identidad de alumno, reloj externo ni bloqueo del equipo.
- Los hashes del resultado y de los eventos son **recalculables** por el alumno; no atribuyen autoría. La firma autentica solamente el **encargo**, al compararlo con el comprobante conservado por el profesor.
- Fecha, duración e intentos están sujetos al reloj y almacenamiento del navegador del alumno; no tienen autoridad externa.
- La CI global de GitHub permanece **sin certificar**: los trabajos Windows de la ejecución más reciente fallaron en `actions/checkout` por `could not lock config file .git/config: File exists` en el runner autoalojado. Es un problema de aislamiento/concurrencia del espacio Git, distinto de las pruebas de código y web superadas. Debe resolverse aislando los directorios `_work` de cada runner o la ejecución concurrente, sin borrar a ciegas archivos `.lock` de procesos activos.

## Comprobación operativa recomendada

En Studio, genera una entrega normal y otra con **Firmar el encargo**. Conserva el `.p2lrn-assignment.json` del profesor. Abre el ZIP del alumno en Windows, realiza una actividad y devuelve el `.p2lrn-result`; en Studio revisa por separado firma, comprobante y resultados. Nunca interpretes una firma del encargo como prueba de ausencia de fraude.
