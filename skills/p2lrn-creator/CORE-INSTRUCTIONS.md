
# Creador directo de P2LRN para ChatGPT

## Contrato de ejecución

- El resultado pedido es un **archivo `.p2lrn` real adjunto a esta conversación**, no explicaciones, JSON sin empaquetar, ni promesas de conexión local.
- No necesitas ni debes solicitar túnel, URL pública, MCP, contraseñas, acceso al PC ni instalación de software en Windows. Esta habilidad utiliza únicamente los archivos y las herramientas de ejecución disponibles en el entorno de ChatGPT.
- Cuando no haya Toolkit oficial disponible y sólo se necesiten cursos nuevos sencillos, utiliza `scripts/p2lrn_package.py` **de este paquete** para crear y verificar el ZIP P2LRN Core 0.4.0, vigente como contrato de formato en Toolkit 0.5.0-alpha.12 según la matriz comprobada el 2026-11-03. No escribas de memoria un ZIP sin verificar y no inventes rutas de descarga.
- Si el entorno no tiene herramienta para ejecutar Python o entregar archivos, informa de esa limitación; no declares un curso generado sin ejecutar y verificar el script.
- No confundas esta habilidad con la integración MCP: **no** abre cursos del PC, edita cuentas LMS, publica en npm ni sincroniza AulaP2P; recibe solicitudes por chat y entrega paquetes.
- El script es un empaquetador autocontenido para nuevas creaciones en un subconjunto de Core 0.4.0; no afirmes equivalencia completa con `@p2lrn/toolkit`, ni pruebas visuales del Player. Para importación/edición sin pérdida de un `.p2lrn` arbitrario necesitas el Creator oficial; no sobrescribas un original.


## Prioridad: APIs oficiales cuando el entorno dispone de ellas (30-10-2026)

- Antes de crear, editar, abrir, importar, validar o leer documentos, consultar `references/official-runtime.md`, `references/official-packages.json` y detectar `Node >=22` y `@p2lrn/toolkit` con `node scripts/p2lrn_official.mjs capabilities --root <proyecto>`. No instalar nada ni iniciar conexiones automáticamente.
- Cuando Toolkit oficial esté **instalado, autorizado y en la versión exacta probada**, ejecutar `scripts/p2lrn_official.mjs` para `create`, `verify`, `inspect`, `open`, `edit`, `build` y `read-document`. Usa P2LRNAuthoringWorkspace, Reader y Document Reader oficiales: no duplica motores.
- Para importar/editar un curso previo, usar `open` en proyecto separado, `edit`, `build` a salida nueva y `verify`. Nunca modificar el archivo original. Si el Toolkit está ausente o no coincide la versión, no simular edición mediante Python.
- Para Studio (WYSIWYG, importaciones, exportación ejecutable Windows), Player (juegos y reproducción visual) y Analytics (Host autorizado), utilizar los **componentes oficiales**, no prometer que un ZIP de Skill incluye sus binarios. Antes de afirmar que funcionan, ejecutarlos realmente en el navegador o entorno autorizado.
- Para MCP y LMS/LTI: requerir herramientas, permisos y credenciales autorizadas; una Skill importada no habilita conexión ni publicación.
- **Alternativa limitada**: si Node o el Toolkit no están disponibles pero hay Python, `scripts/p2lrn_package.py` sigue admitido **solo para cursos nuevos simples** en el subconjunto Core 0.4.0, siempre con validación. No declarar cobertura total.
- La licencia base es NCSL; su Anexo A del 30-10-2026 permite ciertos usos comerciales del formato, Toolkit, Player y cursos, y define condiciones específicas de Studio/Analytics sin modificar. Leer NOTICE y LICENSE; no afirmar que todo el conjunto sea Open Source OSI.

## Flujo alternativo Python para nuevos cursos simples

1. Interpreta la petición y elige un título, idioma y estructura didáctica apropiados. Si faltan detalles no esenciales, avanza con valores razonables y explícitos.
2. Incluye únicamente los metadatos de autoría solicitados por el usuario: `author`, `createdAt`, `license` y `copyrightHolder`.
   Si crea un curso nuevo sin fecha suministrada, el empaquetador fecha la creación; no inventes el autor, la licencia ni el titular de derechos.
   Los campos quedan dentro del curso y deben mostrarse cuando la interfaz compatible lo abra.
3. Lee `references/blueprint.md` y `references/toolkit-parity.md` para generar el **blueprint JSON** válido y no prometer capacidades de Studio/MCP que este empaquetador no incluye. Para respuestas nativas de juegos y preguntas, usa el esquema documentado y soluciones correctas. No dejes preguntas de relleno.
4. Guarda el blueprint como un `.json` temporal en un directorio de trabajo; nunca como salida final sustitutiva.
5. Ejecuta desde una herramienta de código disponible (Python 3.10+):
   ```bash
   python <SKILL_ROOT>/scripts/p2lrn_package.py build --input /mnt/data/mi-curso.json --output /mnt/data/mi-curso.p2lrn
   python <SKILL_ROOT>/scripts/p2lrn_package.py verify /mnt/data/mi-curso.p2lrn
   ```
   Sustituye `<SKILL_ROOT>` por la ruta real donde esté instalado este skill. Si `/mnt/data` no existe, utiliza un directorio accesible de salida.
6. **Exige `valid: true`, un `contentRoot` y un archivo `.p2lrn` presente**. Si el proceso falla, corrige el blueprint y repite la validación; nunca ocultes las restricciones o advertencias de compatibilidad.
7. Entrega un enlace de descarga verificable al `.p2lrn`, con un resumen breve: número de unidades, lecciones, cuestionarios y juegos. En ChatGPT con archivos locales, comparte la ruta de sandbox validada.

## Juegos y evaluaciones

- Para cuestionarios usa `type: quiz` y preguntas nativas con soluciones reales. Para presentaciones alternativas usa `type: game`, `kind` admitido y las **mismas preguntas**; los juegos no sustituyen por datos inventados las preguntas que no pueden representar.
- Tipos admitidos: `single-choice`, `multiple-choice`, `true-false` (modo clásico y `trueFalseMode: multiple` con varias afirmaciones), `text`, `fill-blanks` (`inputMode: text|drag`), `ordering`, `matching` y `classification`. Para el modo múltiple se exige un booleano por afirmación y se conserva la puntuación del cuestionario.
- Renderizadores disponibles: `memory`, `matching`, `ordering`, `classification`, `true-false`, `fill-blanks`, `word-search`, `crossword`, `rosco`, `3d`, `3d-matching`, `3d-ordering`, `3d-classification`.
- Antes de anunciar que un juego **funciona visualmente**, es necesaria una prueba real con el Player del repositorio. Las comprobaciones incluidas aquí aseguran estructura, soluciones, relaciones, compatibilidad elemental, ZIP e integridad, pero no la ejecución gráfica 3D.
- El motor rechaza preguntas sin soluciones compatibles, relaciones ambiguas e identificadores inexistentes. No elimines preguntas para forzar que un juego pase.

## Inspección y edición

- Para **validar** un `.p2lrn` proporcionado: `python <SKILL_ROOT>/scripts/p2lrn_package.py verify archivo.p2lrn`. No ejecuta JavaScript ni recursos remotos.
- Si el usuario aporta un paquete y pide **editarlo**, inspecciónalo antes de cambiar nada. Esta edición offline no tiene implementado el round-trip universal de todos los perfiles P2LRN. Si no puedes garantizar la preservación completa, ofrece crear un **archivo nuevo** con el contenido explícitamente aportado, preservando intacto el original; no lo presentes como edición sin pérdidas.
- Para funcionalidades adicionales no implementadas (SCORM/cmi5, LMS/LTI, colaboración, firma digital de evaluaciones, proyectos 3D que requieran ejecución propia) informa de la capacidad pendiente sin inventar compatibilidad.
- **Paquetes autorreproducibles**: este empaquetador solo entrega `.p2lrn`. Para crear `.p2lrn-offline.exe`, `.p2lrn-offline.cmd`, `.p2lrn-offline.zip` y revisar `.p2lrn-result`, dirigir a Studio/Player oficiales. No intentes crear un lanzador con un script ad hoc ni lo presentes como firmado criptográficamente.
- **Conexión MCP**: si el usuario necesita leer sus cursos locales, crear borradores persistentes o conectar un cliente de IA, usar el servidor P2LRN MCP del repositorio solo si realmente está instalado/autorizado. Esta Skill no instala ni inicia ese MCP, no puede afirmar herramientas conectadas y no representa sus permisos. La matriz y las 23 herramientas actuales están en `references/toolkit-parity.md`.

## Resultado mínimo verificable

El empaquetador Python tiene regresiones en `scripts/test_p2lrn_package.py` y el adaptador oficial se prueba con `scripts/test_p2lrn_official_real.mjs` contra Toolkit compilado; antes de publicar cambios en esta Skill, ejecutar `python -m unittest discover -s scripts -p "test_*.py"`. Los límites de ZIP (miembro, total y cantidad) son deliberados para esta versión offline y no límites normativos de P2LRN.

La carpeta `assets/ejemplo-curso.json` contiene un blueprint de muestra con lección, examen, juego de relacionar y ordenar 3D. Cuando un usuario pida «prueba el plugin», úsalo para crear un paquete demostrativo distinto y devuelve el `.p2lrn` generado.

## Multipart, continuidad y fuentes web

- Dividir cursos `.p2lrn` en fragmentos transportables con `python scripts/multipart.py split curso.p2lrn carpeta --size 5242880`. Entregar `multipart.json` y **todos** los `part-XXXX.bin`. Para reconstruir: `python scripts/multipart.py join carpeta/multipart.json curso.p2lrn`. Verificar SHA-256 individual y global; nunca afirmar reconstrucción si falta una parte.
- Para crear unidades en conversaciones distintas, conservar un proyecto `p2lrn-course-project/1` con referencias a archivos `p2lrn-course-part/1`, `projectId`, `partId` y SHA-256; ensamblar con `python scripts/multipart.py assemble proyecto.json curso.p2lrn`. Consultar `references/multipart-research.md`.
- Cada conversación debe entregar el archivo de unidad y el manifiesto actualizado como archivos reales. En otra conversación recuperar los archivos mediante las herramientas autorizadas o solicitar que se adjunten; nunca presumir que los binarios persisten en el historial.
- Buscar información e imágenes en Internet cuando existan herramientas de búsqueda. Contrastar fuentes, registrar URL, autor, licencia y atribución; no incorporar imágenes con licencia incompatible ni afirmar que están embebidas sin verificar el paquete y el Player.
- No generar ejecutables Windows mediante multipart. El empaquetado multipart es independiente de la exportación offline de Studio.

## Diseño visual de lecciones y presentaciones (rama de desarrollo `mejorastudio`)

- En Studio, `packages/toolkit/web/studio/command-bar.js` es la **única interfaz de edición** para la web y `@p2lrn/studio`. Ambos deben importar la misma barra, el selector de actividades y los mismos estilos; no mantener interfaces duplicadas ni eliminar capacidades al unificarlas.
- Los bloques HTML se generan con `packages/toolkit/web/studio/visual-layout.js`: secciones, dos columnas, destacados, tablas y separadores. El editor guarda HTML semántico dentro del paquete `.p2lrn`, sin scripts incrustados.
- En ambos entornos, el menú Archivo debe conservar Guardar, Guardar borrador local, Recuperar borrador, Eliminar borrador, exportación y revisión de entregas. El guardado remoto NPM sigue siendo dependiente de un Host autorizado. Usar el diálogo común con búsqueda para añadir juegos, cuestionarios, actividades y recursos.
- Tratar estos bloques como una base de autoría visual, **no** como un editor PowerPoint completo. La Skill no debe prometer importación/exportación `.pptx`, exportación PDF, animaciones, capas o fidelidad de diapositivas mientras no existan comandos oficiales y pruebas reales.
- Para lecciones con imágenes, combinar las herramientas visuales con el editor oficial de recursos. Para cuestionarios, juegos y formatos externos, conservar sus editores y perfiles existentes.
- Seguir `docs/studio-visual-editor-roadmap.md` para el contrato pendiente de páginas/diapositivas, barra de menús SaaS, importadores y exportadores. No implementar la interfaz de Studio dentro de la Skill, ni copiar librerías de autoría de Office en el empaquetador Python limitado.
- Para comprobar la interfaz compartida ejecutar `node --test packages/toolkit/test/studio-visual-layout.test.mjs`, `node packages/studio/scripts/build-dist.mjs` y `node scripts/verify-studio-unified-ui.mjs` con Chrome/Edge. Antes de fusionar, comprobar además las interfaces completas, el Player y los flujos de Studio web, NPM y host.
- Prohibido realizar merge a `main`, publicar NPM o desplegar cambios de esta rama sin petición expresa del usuario.

## Herramientas compartidas de Studio en la rama mejorastudio

Ambos Studio deben usar exactamente la misma interfaz basada en command-bar.js y los módulos studio-advanced-tools.js, studio-object-tools.js, studio-history.js y visual-layout.js. Se pueden insertar bloques, cuadros de texto, formas y tablas, añadir o quitar filas y columnas no combinadas, dar formato a celdas, arrastrar y redimensionar objetos, y deshacer o rehacer cambios en el contenido HTML de la lección desde Inicio, Insertar, Tabla y Diseño.

La Skill no debe prometer un historial global de todos los metadatos/actividades, combinaciones de celdas, diapositivas con capas libres, ni importación/exportación completa y editable de PPTX o PDF. Estas funciones no están verificadas. La nueva barra y el NPM son desarrollo de la rama, no una publicación pública; no fusionar, publicar ni desplegar sin orden expresa.

Pruebas recomendadas desde el repositorio: node --test packages/toolkit/test/studio-advanced-history.test.mjs packages/toolkit/test/studio-visual-layout.test.mjs packages/studio/test/dist-dependencies.test.mjs; node scripts/verify-studio-unified-ui.mjs; y, si está activo el servidor local de dos vistas, node scripts/verify-studio-advanced-local-preview.mjs --port 5531 --output CARPETA_EXISTENTE.

## Estado vigente de la UX de Studio en `mejorastudio` (5 de noviembre de 2026)

**Esta sección sustituye las referencias antiguas a pestañas Inicio, Diseño y Tabla.** Los dos editores Studio web y componente NPM utilizan **Formato** e **Insertar**. Archivo concentra nuevo/abrir/borradores/exportar; Guardar y Vista alumno permanecen accesibles. Al seleccionar un objeto o tabla, sus acciones de tamaño, color, filas, columnas, celda y organización aparecen **en Formato**, junto al texto; nunca duplicar esos comandos en controles flotantes o nuevas pestañas. En móvil, Más formato despliega controles secundarios en el mismo apartado. Los controles flotantes solo arrastran y redimensionan; la multimedia usa los selectores de Insertar y muestra sus ajustes al seleccionar el recurso. No publicar NPM ni fusionar sin autorización del propietario.

Fuente de verdad: `docs/studio-saas-oneplace-ux-2026-11-05.md`; reproducir QA con `scripts/verify-studio-unified-ui.mjs`, `scripts/verify-studio-saas-ui.mjs`, `scripts/verify-studio-advanced-local-preview.mjs` y `scripts/verify-studio-student-preview.mjs`.
