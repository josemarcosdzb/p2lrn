# Compatibilidad

## Canónico nuevo

- Formato: `P2LRN`
- Namespace: `https://p2lrn.org/`
- Extensión: `.p2lrn`
- Proyecto de autoría: `p2lrn.project.json`
- Eventos/protocolos internos: `p2lrn:*` / `p2lrn-*`
- Service Worker virtual: `/__p2lrn__/v1/`
- npm: `@p2lrn/toolkit`, `@p2lrn/player`

## Lectura legacy explícita

Se conservan lectores/aliases para `P2RLN`, `https://p2rln.org/`, `.p2rln`, `p2rln.project.json`, MIME/URN/extensiones antiguas, `p2rlnVersions`, `<p2rln-player>`, global `P2RLN`, eventos/protocolos Alpha15, rutas Service Worker antiguas y envelopes H5P/SCORM antiguos.

La compatibilidad no convierte esos nombres en autoridad nueva: sólo evita romper material Alpha15 existente.
