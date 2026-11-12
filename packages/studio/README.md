# @p2lrn/studio

**Responsabilidad del autor / Course author rights.** El creador o distribuidor de cada curso debe comprobar las licencias y permisos de todo el material incorporado, incluidas actividades externas H5P/SCORM, recursos, fuentes, vídeos e imágenes, y conservar atribuciones y autorizaciones. Studio no verifica automáticamente derechos de terceros. Esta regla no sustituye las obligaciones de quienes redistribuyen bibliotecas de software. See `docs/DERECHOS-CONTENIDOS-CURSOS.md` in the source repository.

Embeddable visual authoring surface for P2LRN.

## Composición visual en las lecciones

En una lección editable, abre **Insertar** para añadir cuadros de texto, formas y composiciones de dos o tres columnas. Los objetos se pueden mover, redimensionar y recolorear desde el editor. Selecciona una forma o un cuadro de texto y usa **Girar** en el menú de edición para ajustar su orientación sin perder la posición.

Para crear diagramas:
- **Nube, gota y flechas** son formas editables; no requieren imágenes.
- **Forma libre** muestra puntos que puedes arrastrar. También puedes mover cada punto con las flechas del teclado (Mayús acelera el desplazamiento). Si has girado la forma, devuelve el giro a 0° antes de editar esos puntos.
- **Flecha curva ajustable** permite modificar por separado los dos tramos de la curva desde **Editar curva**.
- Para seleccionar varios bloques del mismo contenedor, mantén **Mayús** al pulsar sobre ellos. El menú **Objeto** permite alinearlos, distribuirlos, agrupar objetos contiguos y desagruparlos.
- **Lienzo de diagrama** crea una superficie independiente dentro de la lección. Sus objetos, imágenes y grupos guardan posición y tamaño en porcentajes; fuera de ese lienzo, los elementos tradicionales conservan su comportamiento de flujo y desplazamiento en píxeles.
- **Capas** permite seleccionar, subir, bajar, ocultar y bloquear figuras e imágenes del lienzo, incluso si están superpuestas. Se guarda el orden real de los objetos, sin CSS `z-index` ni código ejecutable.
- **Agrupar** convierte figuras consecutivas seleccionadas en un grupo proporcional; **Desagrupar** recupera sus posiciones. La composición no modifica otros bloques del documento.
- **Tres columnas** adapta los paneles al ancho disponible. Evita colocar textos importantes fuera del flujo de lectura cuando el curso se usará en pantallas pequeñas.

Las figuras y sus ajustes se guardan como HTML y CSS permitidos dentro de la lección; no introducen scripts ni SVG incrustado. El **Lienzo de diagrama** conserva las proporciones desde 640 px de ancho y ofrece desplazamiento horizontal dentro de su propia región en móviles para evitar textos microscópicos o deformaciones. Una lección tradicional fuera del lienzo sigue usando sus reglas de texto y objetos existentes. Para exportar, usa **Vista alumno** y comprueba el Player antes de entregar el curso.

## Browser integration: NPM

Install Studio and its Player peer dependency:

```bash
npm install @p2lrn/studio@0.5.0-alpha.14 @p2lrn/player@0.5.0-alpha.14
```

Import Studio from your application code:

```js
import '@p2lrn/studio';
```

Minimal editor with no server dependency:

```html
<p2lrn-studio></p2lrn-studio>
```

Without server endpoints Studio can create/open courses, edit them, preview them with the Player and download a new `.p2lrn`.

## Browser integration: CDN

For a plain browser page use the classic Studio loader:

```html
<script src="https://p2lrn.netlify.app/studio/current/dist/p2lrn-studio.js"></script>
<p2lrn-studio></p2lrn-studio>
```

The classic loader derives its channel from its own URL, loads the matching Player first and then imports `p2lrn-studio.esm.js`. A versioned loader such as `/studio/0.5.0-alpha.14/dist/p2lrn-studio.js` therefore loads the matching Player `0.5.0-alpha.14`.

Do not use the ESM file directly in plain HTML unless your environment resolves the bare `@p2lrn/player` specifier. The documented CDN entrypoint is `p2lrn-studio.js`.

## Entrega offline autorreproducible

Studio puede exportar el curso abierto como una entrega offline autocontenida. **Windows 64 bits · ejecutable EXE (un archivo)** es la opción principal: genera `.p2lrn-offline.exe`, con el curso y el Player incluidos. El alumno hace doble clic, sin instalar P2LRN ni usar CMD o PowerShell. El lanzador nativo verifica el SHA-256 del contenido incorporado, lo extrae a una carpeta temporal privada, sirve la interfaz sólo en `127.0.0.1` y abre el navegador predeterminado. No incluye un navegador propio.

Los formatos anteriores siguen disponibles para compatibilidad:

- **ZIP portable**: `.p2lrn-offline.zip` con `Abrir P2LRN.cmd`; requiere extraer el ZIP y utiliza PowerShell.
- **Windows CMD legado**: `.p2lrn-offline.cmd` de un solo archivo; utiliza PowerShell y no es la opción principal.

La firma opcional Ed25519 autentica el **encargo del profesor**, no el ejecutable ni las respuestas. Para distribución pública de confianza, el EXE de cada curso debe firmarse con Authenticode **después** de incorporar el curso. Por ahora el EXE generado en Studio no tiene firma Authenticode y Windows puede mostrar advertencias. La firma válida tampoco garantiza reputación SmartScreen inmediata.
El profesor puede configurar disponibilidad, fecha límite, duración máxima por intento, número de intentos, reanudación e identificación del alumno mediante un código individual que se solicita al comenzar la entrega. La colaboración y los servicios externos quedan desactivados en este modo. El Player utiliza persistencia offline local y conserva estados, respuestas, puntuaciones, eventos y tiempo activo.

Al finalizar, el alumno descarga un único `.p2lrn-result` y lo devuelve al profesor. Studio incluye **Revisar entrega** para comprobar integridad, coincidencia con el curso, puntuación, respuestas, duración, tiempo activo, eventos y anomalías registradas.

La hora absoluta de una entrega completamente offline depende del reloj del equipo del alumno. El formato registra retrocesos/saltos de reloj, pero no presenta la fecha offline como una autoridad externa confiable.

## Server-backed features

The browser component exposes these attributes:

```html
<p2lrn-studio
  src="/course/curso.p2lrn"
  save-endpoint="/api/p2lrn/studio/save"
  reader-endpoint="/api/p2lrn/studio/read"
  import-endpoint="/api/p2lrn/studio/import"
  course-path="course">
</p2lrn-studio>
```

- `src`: optional initial package URL.
- `save-endpoint`: required only to save the exported package to the Host.
- `reader-endpoint`: required only for Reader document import.
- `import-endpoint`: required only for external educational-package import.
- `course-path`: logical save path, default `course`.

A browser cannot write an arbitrary server folder by itself. `save-endpoint` is the Host-owned write boundary. The npm helper creates the configured directory and defaults to `course/`.

The Web Request compatible helpers are:

```js
import {
  handleP2LRNStudioSave,
  handleP2LRNStudioReader,
  handleP2LRNStudioExternalImport,
} from '@p2lrn/studio/server';
```

A production server route must first authenticate the requester and check the Host application's **course-specific** edit permission; only then may it call `handleP2LRNStudioSave`. Apply the same checks to Reader and Import. An unguarded route such as `POST(request) { return handleP2LRNStudioSave(request); }` is **not** a production-safe example. The package deliberately cannot know your application's session store, tenant membership or role model.

Server implementation order: authenticate (401 if missing) → authorize the requested operation and course (403 if denied) → apply CSRF/origin checks for cookie sessions and bound request-size/rate limits → invoke the P2LRN helper with a server-controlled storage path. The Host also controls which users may download previously stored packages. See [public Studio security documentation](https://p2lrn.netlify.app/docs/integracion/).

Use `download()` or the Download action when no server save endpoint is desired.

## Setup automático

After installing:

```bash
npx p2lrn-studio setup
```

Without a target, setup searches upward from the current directory for the nearest project root and then detects the stack. The normal command can therefore be run from a nested directory inside the project. It can also be forced:

```bash
npx p2lrn-studio setup next
npx p2lrn-studio setup express
npx p2lrn-studio setup nest
npx p2lrn-studio setup fastify
npx p2lrn-studio setup hono
npx p2lrn-studio setup sveltekit
npx p2lrn-studio setup nuxt
npx p2lrn-studio setup astro
npx p2lrn-studio setup remix
npx p2lrn-studio setup react-router
npx p2lrn-studio setup php
npx p2lrn-studio setup laravel
npx p2lrn-studio setup symfony
npx p2lrn-studio setup django
npx p2lrn-studio setup fastapi
npx p2lrn-studio setup flask
npx p2lrn-studio setup rails
npx p2lrn-studio setup aspnet
npx p2lrn-studio setup spring
npx p2lrn-studio setup go
npx p2lrn-studio setup rust
npx p2lrn-studio setup generic
```

The default course directory is `course/`. To use another path:

```bash
npx p2lrn-studio setup next --course-path data/courses
```

The installer does not overwrite an existing generated file unless `--force` is used.

### What setup generates

Every supported setup target now materializes the three Studio operations together:

- `/api/p2lrn/studio/save`
- `/api/p2lrn/studio/read`
- `/api/p2lrn/studio/import`

JavaScript/TypeScript targets call `@p2lrn/studio/server` directly. Backends implemented in PHP, Python, Ruby, .NET, Java, Go or Rust receive their normal framework route/controller plus a generated local `p2lrn-studio-bridge.mjs`. The bridge invokes the installed Studio/Toolkit code for Reader and external-package conversion; it is not a second HTTP server.

The generated `p2lrn-setup/README.md` always contains the three endpoint attributes. Override them only when the application deliberately exposes different URLs.

### Security

The installer generates technical integration, **not application authorization**. Each Host must protect the generated Save, Reader and external-import routes using its own authenticated identities and per-course/per-tenant teacher/editor/admin permissions, plus CSRF/origin checks where appropriate, request and archive limits, quotas, and rate limiting. Access checks must be on the server, before invoking P2LRN helpers; hidden UI controls or a generated route do not enforce permissions.

The npm save helper fixes the configured server directory by default. The browser's `X-P2LRN-Path` header is ignored unless the integrator explicitly enables `allowClientPath: true`.


## Reanudar un curso offline en otro dispositivo

El progreso **no debe depender de copiar el almacenamiento del navegador**. Al trabajar en una entrega offline con reanudación habilitada, el alumno puede pulsar **Guardar progreso para otro dispositivo**. Se descarga un `.p2lrn-result` con `attempt.status='in_progress'`, código del alumno, identificador de intento y estado de las actividades.

Para continuar en otro ordenador, el alumno transporta **la misma entrega `.p2lrn-offline.exe` o `.p2lrn-offline.zip` y su fichero de progreso `.p2lrn-result`**. El curso y su firma no se alteran. En el nuevo equipo abre la entrega, utiliza **Importar progreso y continuar** para elegir el resultado y después **Continuar intento**. Se recuperan el mismo código e intento, junto con los estados, respuestas y eventos pendientes.

La importación rechaza resultados corruptos, de otra entrega o versión del curso, de otro alumno o ya finalizados, y no sobrescribe intentos locales. Si el profesor desactiva `allowResume`, no se permite esta transferencia de un intento pendiente. El archivo debe copiarse antes de abandonar el dispositivo y conservarse con privacidad; ni una descarga ni un código declarado constituyen prueba de autoría.

Al finalizar, la entrega genera un `.p2lrn-result` definitivo con estado `submitted`. Analytics puede identificar el archivo intermedio como `in_progress`, pero **no lo convierte en una nota o entrega final**. No hay fusión automática de dos copias editadas simultáneamente. La transferencia por archivos funciona sin conexión ni base de datos.

## Identificación del alumno y resultados compatibles con Analytics

Las entregas offline creadas desde Studio generan un fichero `.p2lrn-result` al finalizar el intento. Para no confundir alumnos que comparten el mismo paquete de entrega, el alumno debe introducir el **código individual asignado por el profesor** antes de comenzar. La entrega incluye el código, el alumno, el curso y el intento en el resultado; Analytics puede agruparlos sin una base de datos.

El código se conserva en `result.identity` como `{mode:'code', issuer, code, label}`. **No es una prueba de identidad**: un alumno podría introducir el código de otro. Cuando el curso se reproduce en una plataforma con usuario autenticado, `@p2lrn/player` ofrece el modo `{mode:'platform',issuer,subjectId,label}`, proporcionado por el host autorizado.

La ruta `src` de `@p2lrn/analytics` debe apuntar al archivo **`.p2lrn-result`**, no al curso `.p2lrn`. Para varios estudiantes puede utilizarse un índice estático `index.p2lrn-results.json` o seleccionar varios archivos locales desde el panel. Studio no necesita instalar una base de datos para estas entregas ni convierte resultados a un formato propietario.

## Imágenes y vídeos en lecciones

El editor visual permite insertar imágenes y vídeos MP4/WebM desde el equipo. Los vídeos tienen controles de reproducción, tamaño ajustable, posición editable (Alt + arrastrar o flechas con el vídeo seleccionado) y portada opcional mediante «Portada del vídeo». Se guardan dentro del HTML de la lección en el `.p2lrn` y Player puede reproducirlos sin conexión. Límite de 32 MB por vídeo (8 MB por imagen); se valida la cabecera real, no solo la extensión. La disponibilidad de los códecs depende del navegador.
## Corrección automática y posterior de cuestionarios

Al crear o editar una actividad de tipo **Cuestionario** en Studio aparece **«Modo de corrección»**:

- **Automática: corregir al finalizar.** Se marcan las respuestas correctas, el Player calcula la nota y el profesor decide si mostrarla al alumno al finalizar. Como las soluciones están en el paquete, esta modalidad es apropiada cuando no es necesario mantenerlas secretas frente a quien controla el equipo.
- **Corregir después: no incluir soluciones.** Se crean preguntas sin tener que indicar una respuesta correcta. Al guardar o exportar, Studio elimina `solution` y `explanation` del contenido entregado; el alumno envía las respuestas y Player no inventa una nota. El profesor las revisa posteriormente desde su LMS o la entrega importada. En Studio, al importar un `.p2lrn-result` de un examen offline con respuestas, puede asignar puntos y comentarios por pregunta y pulsar **«Guardar corrección del profesor»** para descargar un `.p2lrn-review.json`. Este informe conserva el desglose y marca explícitamente `authoritative:false`; es una revisión local, no una nota certificada por un servidor. No se exige conexión para completar las preguntas, aunque enviar resultados a un LMS sí requiere su integración.

Ambas opciones funcionan al generar un `.p2lrn` normal, insertarlo en un LMS o exportarlo para trabajar offline: **no es una función exclusiva de las entregas offline**. El selector se aplica al **cuestionario completo**; las preguntas individuales pueden ser de elección única, múltiple, verdadero/falso, texto, huecos, ordenar, relacionar o clasificar. Para evaluar unas preguntas automáticamente y otras manualmente, use actividades separadas.

En corrección posterior no se puede condicionar el avance a «Superar» con una nota aún inexistente; el editor cambia esa condición por «Completar». Los juegos especializados que calculan su tablero a partir de respuestas (crucigrama, rosco, sopa de letras, memoria, 3D, etc.) necesitan soluciones locales y mantienen su modo compatible. Si requiere preguntas sin soluciones, use **Cuestionario**.

La verificación de las respuestas por un profesor o Host confiable sigue siendo necesaria para emitir una calificación oficial; el cifrado o un hash generado en el equipo del alumno no demuestran autoría de las respuestas.

Consulte el contrato de [cuestionarios nativos](../../spec/NATIVE-QUESTIONNAIRE.md) y la [integración de un Host de confianza](../../docs/integration/INTEGRACION-SEGURA-HOST.md).

## Herramientas avanzadas (rama de desarrollo mejorastudio)

Studio NPM y Studio web comparten los mismos menús y componentes de edición. La pestaña contextual Tabla permite insertar o eliminar filas y columnas, modificar colores y alineaciones de celdas y alturas de fila. Las herramientas de objetos permiten seleccionar bloques, redimensionarlos por la esquina, moverlos, duplicarlos, cambiar su orden y alinearlos. Se incorporan cuadros de texto y formas, y un historial por lección que cubre acciones de Insertar, Tabla y Diseño.

Se guarda HTML y CSS semántico dentro del paquete P2LRN; los controles de selección no se exportan. No se modifican estructuralmente tablas con celdas combinadas ni se exportan/importan PowerPoint o PDF editables. Funciones disponibles en la rama mejorastudio solamente; el paquete del registro NPM no cambia hasta publicación autorizada.

## Experiencia de edición contextual actual (`mejorastudio`)

Studio web y `@p2lrn/studio` local muestran la misma interfaz, con solo **Formato** e **Insertar**. Se ha sustituido la antigua navegación Inicio / Diseño / Tabla: las herramientas de texto y las del objeto seleccionado están juntas en Formato, con menús Filas, Columnas, Celda, Fondo, Objeto y Tamaño. En móvil, Más formato concentra las opciones secundarias sin abandonar el apartado. El marco flotante mantiene arrastre y redimensionado, pero no duplica comandos de la cinta; Archivo contiene operaciones del curso y Guardar aparece una vez. El componente NPM del registro público no cambia hasta publicación autorizada. Véase `docs/studio-saas-oneplace-ux-2026-11-05.md`.

## Multimedia y composición anidada (`mejorastudio`)

Selecciona una imagen o vídeo para mostrar un inspector persistente con Mover, redimensionado, eliminación y portada de vídeo. Las opciones de reproducción nativas se mantienen. Puedes insertar secciones, columnas, cuadros de texto, imágenes y vídeos dentro de otro bloque o celda seleccionada, o soltarlos sobre un contenedor válido para cambiar su jerarquía HTML. El arrastre usa una vista provisional que no desplaza otros contenedores. En móvil, el inspector no hereda el ancho de una celda pequeña. El mismo código se usa en Studio web y NPM local.

Documentación y pruebas: `docs/studio-media-nesting-selection-2026-11-05.md` y `scripts/verify-studio-media-nesting.mjs`. El test de vídeo utiliza `scripts/studio-media-test.webm`, un recurso original reproducible. Sin publicación NPM ni fusión a `main`.
