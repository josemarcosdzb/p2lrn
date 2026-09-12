# Resultados de validación

Fecha de cierre: 2026-09-12.

## Implementación Node.js/TypeScript

- Suite `@p2lrn/toolkit`: **20/20 pasados, 0 fallos**.
- Paquetes Alpha15 legacy leídos/validados con perfiles: **17/17**.
- Paquetes migrados al namespace P2LRN y validados: **17/17**.
- Fuentes anidadas preservadas byte a byte tras migrar el contenedor: **4/4** (SCORM, H5P, cmi5 y QTI).
- JSON de `schemas/` + `profiles/`: **39/39** parseados.
- Residuos `P2RLN/p2rln` en `spec/`, `schemas/`, `profiles/`, `integration/` y `docs/` canónicos: **0**.
- Web SDK generado: **62 archivos**; JavaScript/MJS verificado con `node --check`.
- Tarballs npm instalados desde cero: imports de toolkit/core/reader/creator/player/server correctos.
- Binarios npm comprobados: **14/14** muestran ayuda y los flujos principales se ejecutan desde instalación limpia.
- Smoke funcional desde tarball final: lectura legacy, `repack --canonicalize-identifiers`, Creator, extracción/conversión, generadores, Web SDK, firmas Ed25519 y TypeScript público: **OK**.
- Los tipos públicos compilan sin instalar `@types/node` de forma implícita: **OK**.

## Referencia Python Alpha15

La referencia Python se mantuvo sin convertir en `reference-python-alpha15/` y se utilizó como oráculo de comparación durante el port. La regresión se ejecutó por bloques porque una ejecución monolítica superaba el límite de ejecución del entorno:

- bloque 1: **49 pasados, 5 saltados**;
- bloque 2: **99 pasados, 0 saltados**;
- bloque 3: **68 pasados, 7 saltados**.

Total: **216 pasados, 12 saltados, 0 fallos**.

Los 12 saltos corresponden al corpus externo que no estaba presente en ese árbol de prueba; no se contabilizaron como éxitos ni como fallos.

## Paridad observada durante el port

Además de la regresión final, se compararon directamente resultados Python/Node durante la migración. Entre los gates superados estuvieron:

- mismo `packageId`, `contentRoot`, grafo e inventario para el proyecto Creator de referencia antes del renombrado;
- igualdad de `summary`, árbol, `courseReadPlan` e `importPlan` del Reader en SCORM;
- conversión de SCORM, H5P, cmi5 y QTI con las mismas proyecciones y con el paquete fuente preservado;
- puente `aulap2p.curso.v1` y adaptación documental con preservación de semántica e identidades portables;
- delta, firmas Ed25519, catálogo/componentes, cuestionarios y composites.

## Límites que permanecen abiertos por diseño

El cambio de Python a Node no modifica las declaraciones de conformidad de estándares externos. SCORM/H5P mantienen sus límites de runtime/conformance existentes y cmi5/QTI/LTI siguen dependiendo de sus runtimes/capabilities especializados cuando corresponde.
