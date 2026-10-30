# @p2lrn/analytics

Panel analítico embebible de P2LRN para alumnos, cursos, progreso, actividad, intentos y notas autoritativas.

## NPM

\`\`\`bash
npm install @p2lrn/analytics@0.5.0-alpha.11
\`\`\`

\`\`\`js
import '@p2lrn/analytics';
const panel=document.querySelector('p2lrn-analytics');
// Datos del curso seleccionado: métricas de Player y resultados validados.
// No se obtienen del contenido .p2lrn ni requieren un endpoint HTTP.
panel.data = datasetCurso;
\`\`\`

## CDN

\`\`\`html
<script src="https://p2lrn.netlify.app/analytics/current/dist/p2lrn-analytics.js"></script>
<p2lrn-analytics id="analytics-curso"></p2lrn-analytics>
\`\`\`

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
