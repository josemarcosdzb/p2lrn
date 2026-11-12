# Multipart, investigación y continuidad entre conversaciones

## Transporte binario
`python scripts/multipart.py split curso.p2lrn partes --size 5242880` produce `multipart.json` y fragmentos `part-0001.bin` etc. `join` exige todas las partes, verifica tamaño y SHA-256 de cada una y del conjunto, y valida el paquete P2LRN reconstruido. Mantener juntos los fragmentos y el manifiesto. Esto no crea ejecutables.

## Autoría por unidades en distintas conversaciones
Cada conversación entrega un JSON `p2lrn-course-part/1` con `projectId`, `partId` y `units` (lista no vacía), más su SHA-256. Un manifiesto `p2lrn-course-project/1` contiene `projectId`, `title`, `language` y `parts` ordenadas, cada una con `file`, `partId` y `sha256`. Guardar y recuperar estos archivos explícitamente entre conversaciones. Ejecutar `python scripts/multipart.py assemble proyecto.json curso.p2lrn`; el ensamblador valida hashes, proyecto y unicidad antes de construir el curso.

## Investigación
Buscar en fuentes verificables y citar URLs, fecha, autor, licencia y atribución para imágenes. Evitar licencias incompatibles; comprobar la posibilidad real de incrustar cada recurso en el curso con Toolkit/Studio y su visualización en Player. No prometer navegación web o acceso a archivos entre conversaciones cuando la plataforma no lo permita.
