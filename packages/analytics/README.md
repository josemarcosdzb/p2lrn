# @p2lrn/analytics

Panel analítico embebible de P2LRN para alumnos, cursos, progreso, actividad, intentos y notas autoritativas.

## NPM: leer archivos de resultados por src

```bash
npm install @p2lrn/player @p2lrn/analytics
```

```html
<p2lrn-analytics id="panel.analytics"></p2lrn-analytics>
```

```js
import '@p2lrn/analytics';
const panel = document.getElementById('panel.analytics');
panel.src = '/resultados/resultado-001.p2lrn-result';
```

La ruta `src` corresponde al **archivo de resultados** o a un índice `.p2lrn-results.json`; no al curso `.p2lrn`. No es necesario que la aplicación convierta manualmente los resultados a otro formato. Para seleccionar varios archivos locales se utiliza `panel.importOfflineResults(files)`.

**Estado de publicación:** estas funciones están implementadas en la rama de desarrollo, pero aún requieren publicar y validar las compilaciones correspondientes en NPM/CDN. No des por hecho que la versión pública anterior ya las incluye.

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

## Varios resultados con NPM

```js
import '@p2lrn/analytics';
import {loadAnalyticsResultSource} from '@p2lrn/analytics/results';

const panel = document.getElementById('panel.analytics');
panel.src = '/resultados/index.p2lrn-results.json';
// Alternativa: panel.data = await loadAnalyticsResultSource(
//   '/resultados/index.p2lrn-results.json'
// );
```

La importación múltiple se realiza con `panel.importOfflineResults(files)` (incluye selector de archivos o carpeta en el componente). Verifica los hashes, elimina duplicados idénticos y agrupa los intentos. Para crear o actualizar el índice estático manualmente o mediante Node.js consulta las guías completas [CDN](https://p2lrn.org/docs/cdn/analytics/) y [NPM](https://p2lrn.org/docs/npm/analytics/). Las rutas de la web se actualizarán cuando se despliegue esta rama.

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

El paquete no guarda identidades ni historial del alumno dentro de \`.p2lrn\`. Analytics recibe archivos de resultados verificados. Un Host también puede entregar un dataset de métricas en una integración avanzada. Una nota sólo se trata como oficial cuando \`grades[].authoritative === true\`. Los scores de navegador, progreso, actividad e intentos se muestran como evidencia separada.

Las señales de seguimiento son reglas transparentes de inactividad, progreso, nota e intentos; no son un modelo predictivo opaco.

## Métricas del curso frente a contenido del curso

El archivo `.p2lrn` define actividades y estructura, pero no guarda en sí mismo el historial posterior de todos los alumnos. Para el flujo común no necesitas construir un dataset con variables propias: **Player genera el archivo `.p2lrn-result` y Analytics lo lee directamente por `src` o mediante importación local**.

Cuando un Host ya dispone de un dataset de métricas institucionales autorizado, puede utilizar `panel.data` o `panel.dataSource`. Esto es una opción avanzada, no un paso obligatorio para los resultados basados en archivos. Las puntuaciones locales no se convierten automáticamente en notas oficiales.

## Integración avanzada opcional: fuente de métricas en memoria

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


## Sincronizaci?n autom?tica con Player en plataformas propias

Con createPlayerAnalyticsSession de @p2lrn/player, los resultados
.p2lrn-result se guardan en el backend de la plataforma. El alumno
no descarga ni env?a archivos. Analytics lee el ?ndice privado que
proporciona el mismo Host con permisos del profesor:

~~~js
import '@p2lrn/analytics';
import {createHttpResultHost} from '@p2lrn/player';
const host=createHttpResultHost({baseUrl:'/api/p2lrn/results'});
const panel=document.getElementById('panel.analytics');
panel.src=host.indexUrl(curso.packageId);
await panel.refresh();
~~~

in_progress es progreso pendiente, no una calificaci?n; submitted
significa intento terminado, todav?a informativo hasta confirmaci?n
de un Host acad?mico. El ?ndice vac?o presenta un panel sin datos.
El servidor de referencia es @p2lrn/player/server/results. La ruta de
los resultados debe ser privada, no accesible por alumnado ajeno.
Consultar spec/RESULTS-ANALYTICS.md.
