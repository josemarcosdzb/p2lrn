# @p2lrn/studio

Embeddable visual authoring surface for P2LRN.

Browser:

```html
<p2lrn-studio
  src="/course/course.p2lrn"
  save-endpoint="/api/p2lrn/studio/save"
  course-path="course">
</p2lrn-studio>
```

`course-path` defaults to `course`.

A browser cannot create or write an arbitrary server folder by itself. `save-endpoint` is therefore the host-owned write boundary. The npm server helper creates the requested directory when it does not exist and defaults to `course/`.

Next.js / Web Request compatible route:

```js
import {handleP2LRNStudioSave} from '@p2lrn/studio/server';
export const POST = (request) => handleP2LRNStudioSave(request);
```

Use `Download .p2lrn` when no server save endpoint is desired.


## Setup automático

Después de instalar:

```bash
npm install @p2lrn/studio @p2lrn/player
npx p2lrn-studio setup
```

Sin argumentos, `setup` intenta detectar el stack. También se puede forzar:

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

La carpeta de cursos por defecto es `course/` y se crea si no existe. Para otra ruta:

```bash
npx p2lrn-studio setup next --course-path data/courses
```

El instalador no sobrescribe archivos existentes salvo que se use `--force`.

### Compatibilidad

Los frameworks con enrutado por archivos reciben directamente el archivo de ruta en la ubicación esperada: Next.js App Router, SvelteKit, Nuxt/Nitro, Astro y Remix.

Los frameworks con registro centralizado reciben el handler, controlador o plugin ya generado y una instrucción mínima de registro: Express, Fastify, Hono, NestJS, Laravel, Django, FastAPI, Flask, Rails, ASP.NET Core, Spring Boot, Go y Rust/Axum.

`setup generic` cubre cualquier backend no reconocido. El contrato es siempre el mismo: un POST que recibe el paquete P2LRN binario, sanea nombre/ruta, crea la carpeta configurada y guarda el archivo. De esta forma el componente del navegador no depende del framework del servidor.


### Seguridad de la ruta de guardado

El instalador genera la integración técnica, pero la autorización pertenece a la aplicación anfitriona. La ruta de guardado debe quedar detrás de la autenticación y permisos de profesor/administrador de esa aplicación. P2LRN Studio no debe convertir por sí solo una ruta de escritura en un endpoint público anónimo.

El helper npm fija la carpeta configurada del servidor por defecto. El header `X-P2LRN-Path` enviado por el navegador se ignora salvo que el integrador active expresamente `allowClientPath: true`.
