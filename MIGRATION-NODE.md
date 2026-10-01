# Migración Python -> Node.js/TypeScript

Node.js/TypeScript es la implementación principal. Python Alpha15 queda sólo como oráculo de comparación en `reference-python-alpha15/`.

## Cobertura trasladada

- Core: I-JSON, JCS/RFC 8785, SHA-256, `contentRoot`, JSON Schema, ZIP/ZIP64, CRC, límites, rutas seguras y `range-integrity`.
- Reader/Reading System: validación, grafo, capabilities, planes, recursos embebidos/anidados, HTTP Range, ETag/If-Range/Last-Modified y recursos virtuales.
- Creator/Builder: IDs portables, deduplicación, manifests/grafo, build determinista y proyecto `p2lrn.project.json` 0.3.0.
- Autoría nativa: cuestionarios, componentes, composites y scoring/semántica.
- AulaP2P: `DocumentoExtraidoCanonico`, cuestionarios reconciliados y `aulap2p.curso.v1`.
- Externos: SCORM, H5P, cmi5, QTI, Common Cartridge y Tin Can con preservación-first.
- Integridad: deltas y firmas Ed25519 detached.
- Web SDK y herramientas Node `p2lrn-*`.

## Autoría editable

`p2lrn-create open` y `@p2lrn/toolkit/authoring` abren los 18 paquetes canónicos actuales como proyectos editables; un rebuild sin cambios conserva `contentRoot` 18/18. El contrato 0.3 conserva IDs portables, orden/entrypoints, perfiles, extensiones y miembros opacos. Los workspaces 0.1/0.2 migran explícitamente a 0.3 y los 17 paquetes P2RLN Alpha15 entran por la canonización P2LRN existente antes de materializarse como workspace.

La matriz Creator/Reader está en `packages/toolkit/config/authoring-capabilities.json`. El ZIP SCORM anidado se conserva byte a byte durante el flujo legacy -> autoría -> P2LRN.

## Compatibilidad legacy

Los emisores nuevos crean P2LRN. `P2RLN/.p2rln` se acepta sólo como capa de lectura/migración y compatibilidad. Los payloads externos preservados no se reescriben.
