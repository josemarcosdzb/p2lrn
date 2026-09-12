# Resultados de validación

Fecha de cierre: 2026-09-12.

## Node.js/TypeScript

- Suite `@p2lrn/toolkit`: **31/31 pasados, 0 fallos**.
- Legacy Alpha15 validados: **17/17**.
- P2LRN canónicos validados: **17/17**.
- Fuentes anidadas preservadas byte a byte: **4/4** (SCORM, H5P, cmi5, QTI).
- Autoría canónica `open -> build`: **17/17** con `contentRoot` idéntico.
- API `@p2lrn/toolkit/authoring`: create/load/update/open/build: **OK**.
- Upgrade Creator 0.1/0.2 -> 0.3 sin cambiar el resultado lógico del build: **OK**.
- P2RLN Alpha15 -> workspace Node -> P2LRN: **17/17**.
- SCORM legacy: fuente ZIP interna preservada byte a byte: **OK**.
- Matriz Creator/Reader: **15/15 perfiles**, sin sobredeclarar `deliver`.
- Dependencia operativa Python fuera de `reference-python-alpha15/`: **0**.
- Asociación Windows `.p2lrn`: `p2lrn-reader` Node/npm: **OK**.

## Referencia Python Alpha15

Referencia de conformidad, no runtime: **216 pasados, 12 saltados, 0 fallos** ejecutados por bloques. Los saltos corresponden a corpus externos no presentes en el árbol de prueba.
