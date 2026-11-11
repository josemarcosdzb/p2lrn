# P2LRN Node.js / TypeScript 0.5.0-alpha.13

**Derechos de los cursos:** quien crea, importa o distribuye un curso debe verificar y respetar los permisos y licencias de los materiales que incorpora (incluidas actividades H5P/SCORM, imágenes y vídeo), conservar las atribuciones exigidas y obtener las autorizaciones necesarias. P2LRN no concede derechos sobre obras ajenas. Esta responsabilidad sobre *contenido del curso* es distinta de la que corresponde al distribuidor de bibliotecas de software incluidas en sus paquetes. Véase [Derechos y licencias de los cursos](docs/DERECHOS-CONTENIDOS-CURSOS.md).

Esta entrega convierte la implementación principal de P2LRN a **Node.js + TypeScript**. Python ya no es una dependencia del toolkit principal: se conserva únicamente en `reference-python-alpha15/` para comparación y conformidad con Alpha15. La auditoría final no encuentra archivos Python ejecutables ni comandos operativos Python fuera de esa carpeta.

## Autoridad actual

- `packages/toolkit/`: Core, validación, ZIP/ZIP64, `contentRoot`, Creator, API estable de autoría para Studio, Reader de paquetes, **Reader documental ligero autónomo** (`@p2lrn/toolkit/document-reader`), servidor local, conversión/preservación de paquetes externos, cuestionarios/componentes/composites, delta y firmas Ed25519.
- `packages/player/`: Web SDK/browser runtime, renderers, Service Worker, hosts aislados SCORM/H5P/paquetes externos y tipos TypeScript. Su `npm pack` reconstruye `dist/` desde el runtime canónico e incluye `h5p-standalone` fijado.
- `packages/h5p-libraries/`: corpus compartido de librerías H5P, separado del Player y fijado a un snapshot reproducible. Contiene runtime compartido, nunca cursos de usuarios.
- Colaboración conectada ligera: el componente nativo de votación/pizarra/peer review usa `collaboration.room` con `join`, `send`, `listen`, `snapshot` y `leave`; identidad, transporte y persistencia permanecen en el host. El Player incluye un provider en memoria para pruebas/local, no como servidor de producción.
- Analítica pedagógica: `p2lrn:attempt` separa el ciclo de intento y `p2lrn:interaction` cubre cambios de respuesta, apertura de recursos, reproducción/pausa/seek y acciones colaborativas sin convertir la telemetría genérica en captura de texto, teclas o coordenadas.
- `schemas/`, `profiles/`, `spec/`, `integration/`: material canónico con namespace P2LRN.
- `examples/canonical/external/`: únicamente 4 paquetes `.p2lrn` importados de SCORM, H5P, QTI y cmi5. Los cursos nativos anteriores fueron eliminados del repositorio.
- `examples/legacy-alpha15/external/`: únicamente 4 paquetes externos `.p2rln` preservados para verificar retrocompatibilidad.

## Identidad P2LRN

La distribución `0.5.0-alpha.13` alinea `@p2lrn/player`, `@p2lrn/toolkit` y `@p2lrn/h5p-libraries` y `@p2lrn/studio`. El Reader documental forma parte del Toolkit como subpath `@p2lrn/toolkit/document-reader`.

La salida nueva usa:

```text
P2LRN
https://p2lrn.org/
.p2lrn
application/vnd.p2lrn...
org.p2lrn...
urn:p2lrn:...
p2lrn:*
```

Los paquetes Alpha15 anteriores (`P2RLN`, `p2rln.org`, `.p2rln`) se siguen leyendo. Sus bytes y hashes se verifican antes de normalizar identificadores en memoria.

## Runtime/Player independiente

`@p2lrn/player` es el runtime web instalable y la etiqueta canónica es `<p2lrn-player>`. El Player depende del formato P2LRN, no de AulaP2P ni de un editor concreto. La distribución incluye el runtime estático H5P/SCORM/IMS/cmi5/QTI/Common Cartridge/Tin Can y los assets de `h5p-standalone`. Las librerías H5P reutilizables se distribuyen en `@p2lrn/h5p-libraries`. Las integraciones de producto se conectan mediante Host Adapter v1; `runtimeBaseUrl` se usa para sustituir el runtime estático inferido y es obligatorio cuando ese runtime quedaría en el mismo origen que la aplicación host; otra ruta del mismo dominio no constituye aislamiento. Identidad de usuario, permisos, matrícula, credenciales, resolución de URLs protegidas y persistencia durable permanecen fuera del paquete y fuera del Core.

La integración específica de AulaP2P y el futuro Studio de escritorio son consumidores separados de esta base; no forman parte del runtime genérico ni se implementan en este bloque.

## Instalación local

```bash
npm install @p2lrn/toolkit @p2lrn/player

# El Reader documental ligero ya viene dentro del Toolkit:
# import ... from '@p2lrn/toolkit/document-reader'
# o CLI: p2lrn-document-reader

# Sólo si se necesitan H5P cuyas librerías no viajan dentro del propio .h5p:
npm install @p2lrn/h5p-libraries
```

Para desplegar un runtime estático aislado desde npm:

```bash
p2lrn-copy-runtime ./public/p2lrn
```

Si `@p2lrn/h5p-libraries` está instalado, el mismo comando copia el corpus a
`runtime-host/h5p-libraries/`. El CDN oficial se genera con exactamente los mismos builders que usan estos tarballs.

El Reader documental no forma parte del Player ni del CDN del navegador. Vive dentro de `@p2lrn/toolkit/document-reader` como herramienta Node de ingestión autónoma. Conserva sólo la lectura ligera necesaria (DOCX/PPTX/ODT/EPUB y texto estructurado), sin OCR, Docling, Docker ni servicios de AulaP2P. `pdfjs-dist` es un peer opcional y sólo se necesita para extraer texto ya embebido en PDF.

Comandos principales:

```text
p2lrn-validate
p2lrn-reader
p2lrn-document-reader
p2lrn-create
p2lrn-convert
p2lrn-repack
p2lrn-multipart
p2lrn-inspect
p2lrn-extract-source
p2lrn-delta
p2lrn-trust
p2lrn-build-web-sdk
p2lrn-rebuild-examples
p2lrn-build-advanced-example
```

Migrar un paquete antiguo sin reconstruirlo manualmente:

```bash
p2lrn-repack curso.p2rln curso.p2lrn --canonicalize-identifiers
```

El migrador recalcula manifests/digests/`contentRoot` y rutas content-addressed cuando cambia JSON, pero preserva byte a byte los paquetes SCORM/H5P/cmi5/QTI anidados. También conserva `ZIP_STORED` cuando `range-integrity` depende de offsets físicos.

## Autoría editable y Studio

La implementación Node puede abrir un paquete P2LRN canónico como workspace editable y volver a construirlo sin pérdida lógica:

```bash
p2lrn-create open curso.p2lrn ./workspace
p2lrn-create build ./workspace curso-reconstruido.p2lrn --strict-profiles
```

El contrato de proyecto actual es `0.3.0`. Conserva IDs portables importados, orden del grafo, entrypoints, declaraciones de perfiles y payloads opacos. El gate de regresión abre los **4/4 paquetes canónicos importados** y exige que un rebuild sin cambios conserve exactamente el mismo `contentRoot`. Los casos de autoría nativa se generan en carpetas temporales durante las pruebas.

Studio y otros hosts no deben enlazarse a los módulos internos de Creator. La frontera pública es `@p2lrn/toolkit/authoring`:

```ts
import {P2LRNAuthoringWorkspace} from '@p2lrn/toolkit/authoring';

const workspace = P2LRNAuthoringWorkspace.open('curso.p2lrn', './workspace');
workspace.setCourseMetadata({
  title: 'Curso editado',
  incrementRevision: true,
});
workspace.addUnit({key: 'unidad-1', title: 'Unidad 1'});
workspace.build('curso-editado.p2lrn', {strictProfiles: true});
```

Studio debe usar estas operaciones tipadas para la edición normal. `project` es un snapshot desacoplado para inspección; `replace` y `update` quedan como escapes de bajo nivel deprecados para compatibilidad.

La matriz `packages/toolkit/config/authoring-capabilities.json` separa explícitamente autoría, round-trip, lectura, preservación y `deliver`; no equipara la preservación de un estándar externo con su ejecución completa.

Los proyectos de Creator `0.1.0`/`0.2.0` se migran explícitamente con:

```bash
p2lrn-create upgrade ./workspace
```

La migración escribe `p2lrn.project.json` 0.3.0 y, sólo después de escribirlo y validarlo correctamente, elimina el alias histórico `p2rln.project.json` del workspace para evitar dos autoridades editables. Mantiene el resultado lógico del build. Los **4/4 paquetes externos P2RLN Alpha15 conservados** también pueden abrirse directamente; primero pasan por la canonización P2RLN existente y después se materializan como workspace editable P2LRN.

## Límites que no se falsean

La migración de lenguaje no convierte automáticamente los runtimes externos en conformidad total. SCORM y H5P conservan sus gates experimentales/especializados; cmi5, QTI y LTI siguen negociándose mediante sus capacidades/runtimes correspondientes. El Reader no declara `deliver` donde no existe una ejecución real soportada.

Véanse `MIGRATION-NODE.md`, `TEST-RESULTS.md` y `COMPATIBILITY.md`.



## Licencia

Los componentes first-party de P2LRN se distribuyen bajo **P2LRN Non-Commercial Source License 1.0 (P2LRN-NCSL 1.0)**. Es una licencia **source-available no comercial**, no una licencia Open Source aprobada por OSI.

Permite estudiar, usar, modificar y redistribuir P2LRN para Finalidades No Comerciales bajo sus condiciones. El uso por una entidad con ánimo de lucro o por cuenta de ella se considera comercial, incluso cuando P2LRN se utilice únicamente de forma interna.

Toda distribución en Forma No Fuente debe proporcionar el Código Fuente Correspondiente. Las Versiones Modificadas distribuidas deben identificarse como modificadas, mantener la licencia sobre la parte derivada cubierta y proporcionar su fuente completa. Las Versiones Modificadas ofrecidas a terceros mediante Interacción Remota por Red también deben ofrecer el Código Fuente Correspondiente.

El texto jurídico completo y prevalente está en [LICENSE](./LICENSE). [NOTICE.md](./NOTICE.md) delimita el alcance first-party y las exclusiones de terceros. Las contribuciones externas se rigen además por [CONTRIBUTING.md](./CONTRIBUTING.md).

## P2LRN Analytics

`@p2lrn/analytics` añade un panel embebible para alumnos, cursos, progreso, actividad, intentos y notas autoritativas. Puede cargarse por NPM o desde `/analytics/current/dist/` en el CDN; los datos permanecen bajo control del Host y no se escriben dentro del paquete `.p2lrn`.

