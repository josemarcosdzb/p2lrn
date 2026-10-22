# @p2lrn/studio

Embeddable visual authoring surface for P2LRN.

## Browser integration: NPM

Install Studio and its Player peer dependency:

```bash
npm install @p2lrn/studio@0.5.0-alpha.11 @p2lrn/player@0.5.0-alpha.11
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

The classic loader derives its channel from its own URL, loads the matching Player first and then imports `p2lrn-studio.esm.js`. A versioned loader such as `/studio/0.5.0-alpha.11/dist/p2lrn-studio.js` therefore loads the matching Player `0.5.0-alpha.11`.

Do not use the ESM file directly in plain HTML unless your environment resolves the bare `@p2lrn/player` specifier. The documented CDN entrypoint is `p2lrn-studio.js`.

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
