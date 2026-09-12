# Migración Python -> Node.js/TypeScript

## Resultado

Node.js/TypeScript es la implementación principal. El port no se hizo reimplementando el formato de memoria: se mantuvo la implementación Python Alpha15 como oráculo de comparación mientras se trasladaban los bloques uno a uno.

## Cobertura trasladada

- Core: I-JSON estricto, JCS/RFC 8785, SHA-256, `contentRoot`, JSON Schema, ZIP/ZIP64, CRC, límites de expansión, rutas seguras y `range-integrity`.
- Reader: validación previa, navegación de grafo, negociación de capabilities, selección determinista de representaciones, planes de lectura/importación, recursos embebidos y ZIP anidados.
- Reading System: servidor local autenticado, HTTP Range/206/416, ETag/If-Range/Last-Modified y recursos virtuales.
- Creator/Builder: IDs portables UUID5, assets content-addressed, deduplicación, manifests/grafo, build determinista, auto-validación y proyecto `p2lrn.project.json`.
- Autoría nativa: cuestionarios, componentes, catálogo/editor, composites y scoring/validación semántica.
- AulaP2P: `DocumentoExtraidoCanonico`, contrato reconciliado de cuestionarios y `aulap2p.curso.v1`, incluida extracción inversa.
- Externos: SCORM, H5P, cmi5, QTI, Common Cartridge y Tin Can con preservación-first.
- Integridad adicional: deltas y firmas Ed25519 detached.
- Herramientas: validate/read/create/convert/repack/inspect/extract-source/rebuild-examples/build-advanced/build-web-sdk/delta/trust.
- Web SDK: Player, renderer/component/dependency registries, runtime events, HTTP Range/ZIP64, Service Worker, SCORM/H5P aislados y aliases Alpha15.

## Compatibilidad P2RLN Alpha15

La compatibilidad antigua está confinada como capa legacy. Los emisores nuevos crean P2LRN. Se aceptan los identificadores antiguos sólo al leer/verificar o negociar con hosts Alpha15. Las firmas antiguas se verifican con su statement histórico; no se reescribe material firmado antes de verificarlo.

## Regla de integridad durante el renombrado

Cambiar `p2rln` por `p2lrn` puede cambiar bytes JSON. Por eso el migrador:

1. normaliza identificadores P2LRN;
2. recalcula SHA-256 y `contentDigest`;
3. cambia rutas `assets/sha256/...` cuando corresponde;
4. reescribe referencias del grafo;
5. repite hasta estabilizar;
6. recalcula `contentRoot`;
7. reabre y valida el paquete generado.

Los ZIP de estándares externos se tratan como payload preservado y no se reescriben.

## Python

`reference-python-alpha15/` es exclusivamente evidencia de linaje, regresión y conformidad. No es necesario para instalar ni ejecutar los tarballs npm de la implementación principal.
