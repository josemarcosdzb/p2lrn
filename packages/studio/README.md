# @p2lrn/studio

**Responsabilidad del autor / Course author rights.** El creador o distribuidor de cada curso debe comprobar las licencias y permisos de todo el material incorporado, incluidas actividades externas H5P/SCORM, recursos, fuentes, vídeos e imágenes, y conservar atribuciones y autorizaciones. Studio no verifica automáticamente derechos de terceros. Esta regla no sustituye las obligaciones de quienes redistribuyen bibliotecas de software. See `docs/DERECHOS-CONTENIDOS-CURSOS.md` in the source repository.

Embeddable visual authoring surface for P2LRN.

## Browser integration: NPM

Install Studio and its Player peer dependency:

```bash
npm install @p2lrn/studio@0.5.0-alpha.12 @p2lrn/player@0.5.0-alpha.12
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

The classic loader derives its channel from its own URL, loads the matching Player first and then imports `p2lrn-studio.esm.js`. A versioned loader such as `/studio/0.5.0-alpha.12/dist/p2lrn-studio.js` therefore loads the matching Player `0.5.0-alpha.12`.

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