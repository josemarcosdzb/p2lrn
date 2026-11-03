# @p2lrn/analytics

Panel analítico embebible de P2LRN para alumnos, cursos, progreso, actividad, intentos y notas autoritativas.

## NPM

\`\`\`bash
npm install @p2lrn/analytics@0.5.0-alpha.12
\`\`\`

\`\`\`js
import '@p2lrn/analytics';
const panel=document.querySelector('p2lrn-analytics');
// Datos del curso seleccionado: métricas de Player y resultados validados.
// No se obtienen del contenido .p2lrn ni requieren un endpoint HTTP.
panel.data = datasetCurso;
\`\`\`

## CDN — resultados por ruta, sin endpoint

```html
<script src="https://p2lrn.org/analytics/current/dist/p2lrn-analytics.js"></script>
<p2lrn-analytics id="panel.analytics" src="/resultados/ana.p2lrn-result"></p2lrn-analytics>
```

**`src` apunta a `.p2lrn-result`**, no al archivo del curso. Analytics comprueba el SHA-256 y obtiene el dataset del alumno automáticamente.

Para agregar varios alumnos, usa un índice estático `index.p2lrn-results.json`:

```json
{
  "schema": "https://p2lrn.org/schema/analytics-results-index/1",
  "results": ["ana.p2lrn-result", "luis.p2lrn-result"]
}
```

```html
<p2lrn-analytics id="panel.analytics" src="/resultados/index.p2lrn-results.json"></p2lrn-analytics>
```

No se requiere base de datos. Si sirves resultados identificables desde una web, **protege las rutas mediante autorizaciones del alojamiento**; no los publiques abiertamente.

## NPM — lectura y archivos locales

```bash
npm install @p2lrn/analytics@0.5.0-alpha.12 @p2lrn/player@0.5.0-alpha.12
```

```js
import '@p2lrn/analytics';
const panel = document.getElementById('panel.analytics');
panel.src = '/resultados/ana.p2lrn-result';
```

También se exportan `loadAnalyticsResultSource` y `analyticsDatasetFromResultFiles` desde `@p2lrn/analytics/results`. El método `panel.importOfflineResults(files)` admite varios archivos seleccionados o una carpeta local y los agrupa sin convertirlos manualmente. Los duplicados idénticos se descartan; los archivos alterados se rechazan.

## Identidad del alumno

- **Plataforma:** el host autenticado entrega `{mode:'platform',issuer,subjectId,label}` al generador de resultados de Player.
- **Sin plataforma:** el profesor asigna un código individual y se usa `{mode:'code',issuer,code,label}`. El alumno introduce su código en la entrega offline.

Ambas opciones producen el mismo esquema `.p2lrn-result`. `assignment.packageId` vincula el resultado con el curso, `attempt.id` distingue intentos y `identity` permite relacionarlos con un alumno. Un código declarado no demuestra identidad real; el hash SHA-256 confirma integridad del archivo, no autenticidad ni notas oficiales.

## Abrir resultados offline

Analytics puede abrir directamente un archivo `.p2lrn-result` generado por una entrega autorreproducible:

```js
const panel = document.querySelector('p2lrn-analytics');
await panel.importOfflineResult(archivo);
```

El resultado se convierte en un dataset de Analytics con alumno, curso, intento, actividad, aperturas, sesiones, tiempo activo e incidencias registradas. Las puntuaciones offline se mantienen como información de seguimiento y **no** se convierten automáticamente en calificaciones oficiales.

## Frontera de confianza

El paquete no guarda identidades ni historial del alumno dentro de \`.p2lrn\`. El Host entrega el dataset del panel. Una nota sólo se trata como oficial cuando \`grades[].authoritative === true\`. Los scores de navegador, progreso, actividad e intentos se muestran como evidencia separada.

Las señales de seguimiento son reglas transparentes de inactividad, progreso, nota e intentos; no son un modelo predictivo opaco.

## Métricas del curso frente a contenido del curso

El archivo `.p2lrn` define actividades y estructura, no almacena por sí solo el historial de todos los estudiantes. Para un curso concreto, reúne los eventos y estados que Player registre y los resultados `.p2lrn-result` validados, forma un dataset compatible (`learners`, `courses`, `enrollments`, `attempts`, `grades`, `events`) y asígnalo con `panel.data = datasetCurso`. El dataset debe corresponder al curso seleccionado. El origen HTTP es opcional cuando una plataforma necesita consultar varios alumnos y notas oficiales autorizadas. No se debe atribuir una nota oficial a una puntuación local sin `authoritative: true` desde una fuente de confianza.

## Fuente de métricas del curso sin API obligatoria

```js
import {createCourseAnalyticsDataSource} from '@p2lrn/analytics/course';

const panel = document.querySelector('p2lrn-analytics');
panel.dataSource = createCourseAnalyticsDataSource({
  courseId: curso.manifest.packageId,
  title: tituloCurso,
  events: eventosDePlayer,
  results: resultadosP2lrnPreviamenteVerificados,
});
await panel.refresh();
```

Este origen se limita al curso indicado. Los eventos deben proceder de Player y los archivos `.p2lrn-result` deben validarse previamente con las herramientas oficiales. La información de un archivo `.p2lrn` no contiene por sí sola notas históricas de estudiantes. Las puntuaciones locales se mantienen informativas y nunca se convierten en notas oficiales automáticamente. El origen HTTP sigue disponible para plataformas con datos institucionales autorizados.
