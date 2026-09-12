# P2LRN Node.js / TypeScript 0.5.0-alpha.1

Esta entrega convierte la implementación principal de P2LRN a **Node.js + TypeScript**. Python ya no es una dependencia del toolkit principal: se conserva únicamente en `reference-python-alpha15/` para comparación y conformidad con Alpha15. La auditoría final no encuentra archivos Python ejecutables ni comandos operativos Python fuera de esa carpeta.

## Autoridad actual

- `packages/toolkit/`: Core, validación, ZIP/ZIP64, `contentRoot`, Creator, API estable de autoría para Studio, Reader, servidor local, conversión/preservación de paquetes externos, puentes AulaP2P, cuestionarios/componentes/composites, delta y firmas Ed25519.
- `packages/player/`: Web SDK/browser runtime, renderers, Service Worker, hosts aislados SCORM/H5P y tipos TypeScript.
- `npm/`: artefactos de distribución publicados. El toolkit autoritativo se instala desde `packages/toolkit/`; su tarball se regenera con `npm pack` al publicar una entrega.
- `schemas/`, `profiles/`, `spec/`, `integration/`: material canónico con namespace P2LRN.
- `examples/canonical/`: 17 paquetes `.p2lrn` validados.
- `examples/legacy-alpha15/`: los 17 paquetes `.p2rln` usados para comprobar retrocompatibilidad.

## Identidad P2LRN

La salida nueva usa `P2LRN`, `https://p2lrn.org/`, `.p2lrn`, `application/vnd.p2lrn...`, `org.p2lrn...`, `urn:p2lrn:...` y `p2lrn:*`. Los paquetes Alpha15 anteriores (`P2RLN`, `p2rln.org`, `.p2rln`) se siguen leyendo.

## Instalación local

```bash
npm install ./packages/toolkit \
            ./npm/p2lrn-player-0.5.0-alpha.1.tgz
```

Comandos principales: `p2lrn-validate`, `p2lrn-reader`, `p2lrn-create`, `p2lrn-convert`, `p2lrn-repack`, `p2lrn-inspect`, `p2lrn-extract-source`, `p2lrn-delta`, `p2lrn-trust`, `p2lrn-build-web-sdk`, `p2lrn-rebuild-examples` y `p2lrn-build-advanced-example`.

## Autoría editable y Studio

```bash
p2lrn-create open curso.p2lrn ./workspace
p2lrn-create build ./workspace curso-reconstruido.p2lrn --strict-profiles
p2lrn-create upgrade ./workspace
```

El contrato de proyecto actual es `0.3.0`. Conserva IDs portables importados, orden del grafo, entrypoints, perfiles y payloads opacos. Los **17/17 paquetes canónicos** hacen `open -> build` conservando exactamente `contentRoot`, y los **17/17 P2RLN Alpha15** se abren y reconstruyen como P2LRN canónico.

La frontera pública para Studio es `@p2lrn/toolkit/authoring`:

```ts
import {P2LRNAuthoringWorkspace} from '@p2lrn/toolkit/authoring';
const workspace = P2LRNAuthoringWorkspace.open('curso.p2lrn', './workspace');
workspace.update((draft) => { draft.course.title.es = 'Curso editado'; draft.course.revision += 1; });
workspace.build('curso-editado.p2lrn', {strictProfiles: true});
```

La matriz `packages/toolkit/config/authoring-capabilities.json` separa autoría, round-trip, lectura, preservación y `deliver`; preservar un estándar externo no se declara como ejecución completa.

Python queda exclusivamente en `reference-python-alpha15/` como referencia de conformidad. Véanse `MIGRATION-NODE.md`, `TEST-RESULTS.md`, `COMPATIBILITY.md` y `spec/AUTHORING-API.md`.
