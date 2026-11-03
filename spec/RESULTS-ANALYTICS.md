# Contrato común de resultados Player → Analytics

Estado: implementación en la rama `redesign/home-sections-2026-11`. No atribuir estas funciones a una versión pública de CDN/NPM hasta validar y publicar sus artefactos.

## 1. Formato único

La salida es `.p2lrn-result`, esquema `https://p2lrn.org/schema/offline-result/1`, `version: "1"`. El resultado contiene:
- `assignment.packageId`: identidad del curso procedente de su manifiesto.
- `attempt.id`: identificador único por intento.
- `identity`: atribución declarada del alumno (véase sección 2).
- `submission.scores`, `submission.states`, `analytics.events`: evidencias recogidas.
- `integrity.payloadDigest`: SHA-256 del contenido canónico excluyendo `integrity`.

El formato es el mismo para la entrega offline y la captura web de Player. No se requiere un JSON intermedio que el integrador tenga que construir.

## 2. Identidad: dos modos

**Autenticación por plataforma (LMS/web):**

```js
{mode: 'platform', issuer: sesionAutorizada.issuer, subjectId: sesionAutorizada.userId, label: sesionAutorizada.nombre}
```

El host debe aportar datos de una sesión autenticada, no valores escritos por el alumno. El resultado conserva la referencia de ese usuario, pero Analytics NO puede autenticar por sí solo la afirmación incluida en un archivo exportado; corresponde al host, mediante su control de acceso y comprobantes, hacerlo. La inclusión de `mode: "platform"` NO eleva automáticamente las notas a oficiales.

**Código de profesor sin plataforma:**

```js
{mode:'code',issuer:'centro-o-docente',code:'ALU-007',label:'Ana'}
```

El código debe ser individual, estable y distinto por estudiante dentro del emisor. La entrega offline lo solicita al alumno al comenzar. Permite agrupar sus intentos, no comprobar físicamente quién realizó el curso. Los resultados heredados sin `identity` siguen admitiéndose con su identificador legado, no verificado.

## 3. Origen de Analytics

```html
<p2lrn-analytics id="panel.analytics" src="/resultados/ana.p2lrn-result"></p2lrn-analytics>
```

`src` apunta al **resultado**. El fichero del curso `.p2lrn` se reproduce con Player y NO es la fuente de Analytics. La lectura comprueba el SHA-256 y transforma internamente el formato común en métricas.

Para varios alumnos se admite un índice estático `index.p2lrn-results.json`:

```json
{
  "schema":"https://p2lrn.org/schema/analytics-results-index/1",
  "results":["ana.p2lrn-result","luis.p2lrn-result"]
}
```

Se admiten también múltiples archivos locales o selección de carpeta en el panel. La agrupación descarta ficheros idénticos, separa los intentos y falla ante colisiones de identificadores contradictorios. Para URLs los archivos deben estar accesibles al navegador; no se puede enumerar automáticamente una carpeta remota sin índice.

## 4. NPM / Player y Analytics

`@p2lrn/player`: `mountP2LRN(target,{src,resultIdentity})` prepara la captura para un usuario identificado. `player.startResultCapture({identity})`, `createResultRecorder(player,{identity})`, `finish()` y `download()` ofrecen la misma operación en aplicaciones existentes. La captura se configura antes de que el alumno interactúe.

`@p2lrn/analytics`: el componente acepta `src` con archivo de resultado, índice o JSON autorizado de métricas. `panel.importOfflineResult(file)` y `panel.importOfflineResults(files)` importan ficheros comprobados en memoria. En `@p2lrn/analytics/results` están `loadAnalyticsResultSource`, `analyticsDatasetFromResultFiles` y `mergeAnalyticsResultDatasets`.

**No hay base de datos obligatoria.** La generación de un resultado no lo envía automáticamente a otro ordenador. El archivo debe ser descargado/entregado o estar disponible en una ruta accesible al profesor con el control de acceso correspondiente. En un navegador, `src` por URL requiere un servidor de archivos ordinario y CORS cuando corresponda.

## 5. Seguridad y notas

SHA-256 detecta modificaciones accidentales o discordancias del archivo respecto de su huella, pero un tercero puede reemplazar el contenido y recalcular el hash: **no es una firma digital, ni autenticación, ni validación de autoría**. Los archivos de resultados contienen información personal potencialmente sensible; no deben publicarse en rutas abiertas. Las puntuaciones locales siguen siendo informativas, no `authoritative`, salvo confirmación explícita de un host de confianza.

## 6. Publicación y compatibilidad

Antes de publicar paquetes y CDN: reconstruir los artefactos de Player y Analytics, pasar las pruebas de identidad, lectura de URL, múltiples alumnos, rechazo de manipulaciones, compatibilidad con datos heredados, rutas npm/exports y QA visual ES/EN. Mantener `main` sin modificar mientras el PR esté en borrador.

## 7. Índice estático: creación y actualización

Para consultar múltiples alumnos mediante `src`, reúne los `.p2lrn-result` en una carpeta de resultados de acceso autorizado. Crea `index.p2lrn-results.json` en esa carpeta:

```json
{
  "schema": "https://p2lrn.org/schema/analytics-results-index/1",
  "results": ["resultado-001.p2lrn-result", "resultado-002.p2lrn-result"]
}
```

Los nombres se resuelven **respecto a la URL del índice**, nunca respecto a la ruta del curso. La lectura de cada resultado exige SHA-256 válido; las entradas de un índice no pueden apuntar a otro origen. Límite: 500 resultados por importación.

Cuando llega un resultado nuevo:
1. Conservar el archivo con un nombre único sin sobrescribir intentos anteriores.
2. Añadir su nombre al array `results` o regenerar el índice completo.
3. Actualizar los archivos y el índice en el alojamiento autorizado.
4. Refrescar Analytics y comprobar la caché del índice.

Para automatizar el segundo paso, descargar `/examples/p2lrn-results-index.mjs` y ejecutar `node p2lrn-results-index.mjs ./resultados`. El script valida los resultados locales, reconstruye el índice sin conexiones de red y no reemplaza el índice existente si alguno falla. No convierte datos ni genera una base de datos.

## 8. Cómo llegan los archivos al profesor

**Sin plataforma:** el alumno completa la entrega y descarga su archivo `.p2lrn-result`. Debe entregarlo por un canal acordado (USB, correo, carpeta compartida autorizada). El profesor lo importa junto a los demás, sin índice ni red. El archivo no viaja automáticamente entre ordenadores.

**Con plataforma autenticada:** el host aporta su identidad de usuario al capturador, y una función autorizada de la propia plataforma puede recibir y guardar el archivo completo en almacenamiento privado de ficheros. La plataforma debe autenticar la sesión, autorizar el acceso a los datos, conservar los archivos y poner los resultados a disposición del profesor (por importación o por un índice protegido). No se requiere una base de datos, pero **sí un mecanismo real de entrega y control de acceso** cuando los alumnos trabajan en equipos distintos.

Una web estática pública no proporciona autenticación de resultados por sí sola. Si no existe una ruta privada de descarga, se debe utilizar la importación local.

## 9. Documentación de integración y pruebas

- Guía CDN español: `/docs/cdn/analytics/`; inglés: `/en/docs/cdn/analytics/`.
- Guía NPM español: `/docs/npm/analytics/`; inglés: `/en/docs/npm/analytics/`.
- Ambas guías documentan las dos identidades, `src`, creación y actualización del índice, entrega al profesor, privacidad, solución de errores y disponibilidad de versiones.
- Prueba `packages/analytics/test/results-index-script.test.mjs`: genera el índice, lo actualiza cuando llega otro alumno y evita sobrescribirlo con un resultado inválido.
