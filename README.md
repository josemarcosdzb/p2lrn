# P2LRN Node.js / TypeScript 0.5.0-alpha.1

Esta entrega convierte la implementación principal de P2LRN a **Node.js + TypeScript**. Python ya no es una dependencia del toolkit principal: se conserva únicamente en `reference-python-alpha15/` para comparación y conformidad con Alpha15.

## Autoridad actual

- `packages/toolkit/`: Core, validación, ZIP/ZIP64, `contentRoot`, Creator, Reader, servidor local, conversión/preservación de paquetes externos, puentes AulaP2P, cuestionarios/componentes/composites, delta y firmas Ed25519.
- `packages/player/`: Web SDK/browser runtime, renderers, Service Worker, hosts aislados SCORM/H5P y tipos TypeScript.
- `npm/`: tarballs instalables de `@p2lrn/toolkit` y `@p2lrn/player`.
- `schemas/`, `profiles/`, `spec/`, `integration/`: material canónico con namespace P2LRN.
- `examples/canonical/`: 17 paquetes `.p2lrn` validados.
- `examples/legacy-alpha15/`: los 17 paquetes `.p2rln` usados para comprobar retrocompatibilidad.

## Identidad P2LRN

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

## Instalación local

```bash
npm install ./npm/p2lrn-toolkit-0.5.0-alpha.1.tgz \
            ./npm/p2lrn-player-0.5.0-alpha.1.tgz
```

Comandos principales:

```text
p2lrn-validate
p2lrn-reader
p2lrn-create
p2lrn-convert
p2lrn-repack
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

El migrador recalcula manifests/digests/`contentRoot` y rutas content-addressed cuando cambia JSON P2LRN, pero preserva byte a byte los paquetes SCORM/H5P/cmi5/QTI anidados. También conserva `ZIP_STORED` cuando `range-integrity` depende de offsets físicos.

## Límites que no se falsean

La migración de lenguaje no convierte automáticamente los runtimes externos en conformidad total. SCORM y H5P conservan sus gates experimentales/especializados; cmi5, QTI y LTI siguen negociándose mediante sus capacidades/runtimes correspondientes. El Reader no declara `deliver` donde no existe una ejecución real soportada.

Véanse `MIGRATION-NODE.md`, `TEST-RESULTS.md` y `COMPATIBILITY.md`.
