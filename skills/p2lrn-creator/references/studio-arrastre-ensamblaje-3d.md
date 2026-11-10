# Studio y Player: editor visual, arrastrar y soltar y ensamblaje 3D

Referencia de la Skill P2LRN para ChatGPT, Codex, Claude, Gemini y Grok. Fuente de implementación: `josemarcosdzb/p2lrn`, archivos indicados abajo. Revisada contra el código de `main` el 10-11-2026. **El código en GitHub, la Skill empaquetada, npm, CDN y la web publicada tienen estados distintos.** Verificar la versión ejecutada antes de atribuir capacidades a una distribución.

## Tres tipos de «arrastrar» que no deben confundirse

| Tarea | Componente y fuente oficial | Resultado |
| --- | --- | --- |
| Mover, ordenar y redimensionar objetos **de una lección** | `packages/toolkit/web/studio/studio-object-tools.js`, `visual-layout.js`, `studio-advanced-tools.js` | HTML semántico editable, geometría/capas y posición persistida en el curso |
| Crear una **actividad de arrastrar y soltar** sobre una imagen | `studio-drop-activity.js` y `renderers/lesson-drop-runtime.js` | Actividad con destinos y fichas, jugable por el alumno en Player |
| Crear una **evaluación de arrastre con puntos** | Catálogo `drag-scored` en `command-bar.js` y editor de cuestionarios | Pregunta evaluable, **distinta** del arrastre libre de bloques y de `fill-blanks` con `inputMode:drag` |

Si una Skill recibe «quiero arrastrar elementos», identificar por contexto qué mecánica solicita. No insertar un objeto decorativo cuando el usuario pide un juego, ni sustituir un ejercicio visual por texto o por una captura.

## Autoría WYSIWYG y colocación de objetos

- Utilizar Studio oficial de la web (`deploy/netlify/site/studio/`) o el componente `@p2lrn/studio`. Ambos comparten los módulos de `packages/toolkit/web/studio/`; **no recrear el editor en la Skill ni en el empaquetador Python**.
- En la interfaz vigente, usar **Archivo, Formato e Insertar**. El formato contextual incluye objetos, tablas y capas. Los controles flotantes de selección se reservan para **Mover** y redimensionar; no duplicar inspectores flotantes.
- Para insertar: elegir lección HTML editable, `Insertar` y el bloque correcto: sección, columnas, cuadro de texto, forma, tabla, desplegable, diagrama o actividad. Seleccionar el objeto y usar la barra **Mover** o el tirador de esquina; utilizar `Formato` para propiedades, rotación, orden, agrupación y capas cuando estén disponibles.
- `visual-layout.js` produce HTML inerte y un `diagram-canvas` proporcional con hijos en porcentajes. `studio-object-tools.js` gestiona el movimiento y el tamaño. Un objeto puede pertenecer a una celda, una sección u otro contenedor; **superposición** y **anidamiento** son operaciones distintas.
- El ancho se calcula respecto del espacio libre hasta el borde derecho, no respecto de todo el lienzo. Revisar el cálculo de `fitStudioObjectWidth`, `percentDiagramGeometry` y el límite horizontal de `setPosition`. No resolver fallos solo con `overflow-x:hidden`, que oculta controles y objetos sin arreglar sus coordenadas.
- Para móvil y paneles estrechos, comprobar que el texto sigue editable, las fichas y tiradores pueden alcanzarse, el scroll horizontal solo existe donde está previsto (p. ej., lienzo de diagrama) y no se pierden elementos después de redimensionar la ventana.
- Guardar/exportar el mismo curso, reabrirlo en Studio y reproducirlo en Player. Verificar cambios de posición, rotación, orden de capas y tamaño; una captura de la edición antes de guardar no basta.

## Actividad «Arrastrar y soltar» con imagen y zonas

1. Insertar el bloque de **Arrastrar y soltar** en una lección real (el generador es `createStudioDropActivity` en `studio-drop-activity.js`), no simularlo mediante imágenes compuestas.
2. Seleccionar el área de ejercicio y, en **Zonas de arrastre**, configurar fondo opcional, pares ficha/destino, texto e imagen de fichas. Se aceptan formatos raster controlados; confirmar tipo, tamaño y texto alternativo antes de incorporar imágenes. El editor limita la actividad a **20 destinos**.
3. Posicionar las zonas arrastrándolas sobre el fondo; cambiar su tamaño mediante el tirador. Para fichas con imagen, editar el texto alternativo. Una ficha de imagen sin rótulo no debe recibir una leyenda heredada ficticia.
4. El identificador de respuesta correcta es la relación `data-p2lrn-dnd-accept` ↔ `data-p2lrn-dnd-item`. No intercambiar identificadores al cambiar la posición visual; mover la ficha a la imagen en autoría coloca el destino sin sacar la ficha de su bandeja.
5. Ejecutar el paquete en Player: probar ratón/puntero, interacción de teclado accesible, destino correcto e incorrecto, reinicio y puntuación/completado cuando corresponda. `lesson-drop-runtime.js` se ejecuta en un iframe aislado con CSP; las pruebas DOM del editor no certifican el juego.
6. Distinguir el bloque visual del selector **Arrastrar con puntos** y del modo arrastrar de **Completar huecos**: son contratos y evaluaciones distintos. Para puntuaciones oficiales en LMS, exigir evidencia de integración de notas.

## Juego «Ensamblaje 3D» con piezas, GLB y encajes

- Se crea desde la opción `assembly-3d` del catálogo de juegos de Studio (`command-bar.js`, `authoring-document.js`). Su implementación usa una pregunta nativa de **classification** que incluye `assembly3d`; no inventar un renderer independiente. La fuente de geometría es `packages/toolkit/web/assembly-3d-core.js`.
- El editor del profesor es `studio/assembly-3d-editor.js`: visor Three.js compartido con Player, o alternativa geométrica SVG si no hay WebGL. Tiene **Piezas y modelos**, ajustes, Deshacer/Rehacer, **+ Pieza y destino**, ajuste de pieza dentro de la caja, centrar encaje y ver montaje completo.
- Para activos reales, importar un **GLB válido** de hasta **24 MiB por activo**, comprobar que está incrustado en el curso y, si tiene varios nodos, seleccionar la submalla asignada a cada pieza. El modelo de referencia, las piezas y los destinos son elementos distintos.
- Cada pieza se vincula a su destino mediante `scene.links`; los destinos son jaulas volumétricas con **8 vértices**, transformación, posición, orientación, escala, tolerancias y posibles prerrequisitos. El profesor puede mover piezas, jaulas y vértices, ajustar el encaje y la cámara y comprobar que la geometría sea válida. No usar solamente cajas genéricas si se ha pedido un objeto concreto (burro, anatomía, máquina, etc.).
- El encaje automático `fitAssemblyBounds` se basa en las dimensiones de la malla cargada. **No afirmar que la pieza cabe** si no se ha podido leer el GLB, calcular sus bounds y evaluar `assemblyFitStatus`. Conservar la posición de las piezas y el diseño al guardar, exportar y reabrir.
- El alumno usa `renderers/assembly-3d.js` con movimientos y selección real. La comprobación de colocación usa `evaluateAssemblyPlacement`; validar destino, posición, rotación, prerrequisitos, resultado y snap, incluyendo intentos incorrectos. El modo de autoría del profesor **no** demuestra por sí solo que la partida del alumno funcione.

## Conectar desde una Skill sin fingir capacidades

- Con Node 22+, `@p2lrn/toolkit` oficial y permisos, `scripts/p2lrn_official.mjs` permite crear/editar/verificar con operaciones tipadas (incluido `addQuestionnaire`). Para crear un ensamblaje debe respetarse el esquema nativo completo, el GLB embebido y las comprobaciones del Toolkit. **El adaptador CLI de la Skill no tiene un comando específico que sustituya al editor visual de jaulas o de fichas.**
- Sin Studio en un navegador real no se puede afirmar «he pulsado y arrastrado», «he generado la malla» o «lo he grabado». Si solo hay el empaquetador Python del subconjunto Core 0.4.0, no atribuirle edición por capas, colocación de zonas, importación GLB ni pruebas de física 3D.
- Para un modelo 3D externo, usar una malla real con derechos apropiados; validar su geometría, materiales, pivotes y submallas. No equiparar un diagrama 2D, una imagen o un fichero JSON a un GLB jugable.
- Si está instalada la Skill `modelador-3d`, utilizarla para crear/auditar las piezas GLB antes de importarlas en Studio, conservando unidades, materiales, submallas y geometría real; no asumir que está disponible por mencionarla aquí.
- Si está instalada `visual-engineering-studio`, usarla para anotaciones SVG, explicaciones o capturas reales. Sus renders 2.5D/Canvas **no** sustituyen la escena WebGL ni las comprobaciones de encaje de P2LRN.

## Puerta de aceptación antes de afirmar «terminado»

1. Confirmar la rama y SHA reales; identificar si el código está en `main`, en una rama de desarrollo o en un paquete publicado. Mantener el checkout canónico sin clones ni deploy.
2. Revisar los módulos compartidos, el paquete `@p2lrn/studio`, el Player y la Skill generada para cada plataforma. Comprobar ZIP completo, `SKILL.md`, scripts y **esta referencia** en todos.
3. Ejecutar regresiones focalizadas: `node --test packages/toolkit/test/studio-visual-layout.test.mjs packages/toolkit/test/studio-shapes-drop.test.mjs packages/toolkit/test/studio-advanced-history.test.mjs packages/toolkit/test/assembly-3d.test.mjs`, además de compilación/revisión de distribución autorizada.
4. Probar en Chrome/Edge real las tres funciones diferentes: (a) mover/redimensionar y guardar/reabrir un objeto en Studio web y npm, (b) completar la actividad de zonas con fichas e imágenes en Player, (c) ensamblar piezas GLB en los destinos correctos, con capturas y vídeo de las acciones reales.
5. Probar escritorio y móvil/viewport estrecho, foco, teclado, encuadre, overflow lateral, notas y mensajes de error. La regresión de límite derecho **no se declara visualmente aprobada** solo por compilar o pasar el test.
6. No publicar nueva Skill, npm/CDN ni desplegar web hasta comprobar los archivos realmente distribuidos y contar con autorización del propietario. Informar por separado de código preparado, pruebas ejecutadas, grabaciones, distribución e instalación de cada Skill.
