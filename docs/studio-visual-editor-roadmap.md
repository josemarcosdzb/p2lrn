# Studio visual: arquitectura y plan de integración

Rama de trabajo: `mejorastudio`. No fusionar ni publicar antes de completar pruebas.

## Estado verificado del código

Studio web: `deploy/netlify/site/studio/studio.js`, con editor WYSIWYG y barra existente.
Studio web component NPM: `packages/studio/src/p2lrn-studio.js`, Shadow DOM y editor propio.
Implementación compartida: `packages/toolkit/web/studio/`. El empaquetado NPM copia módulos con `packages/studio/scripts/build-dist.mjs`.
La Skill P2LRN dirige al Toolkit y Studio oficiales: no debe implementar un editor paralelo.
Las lecciones HTML se serializan en recursos del paquete P2LRN; los perfiles SCORM/H5P/cmi5 permanecen encapsulados.

## Entrega de interfaz unificada en la rama (sin publicar)

- `command-bar.js`: único árbol de controles y único CSS para Studio web y el Web Component NPM. No duplicar la barra ni la lógica de inserción. Menús Archivo / Inicio / Insertar / Diseño, estado visible, tipografía, alineación, listas, colores, guardado/exportación y vista alumno.
- Un mismo selector de actividades con búsqueda sirve para lecciones, cuestionarios, juegos 2D/3D, multimedia y recursos externos. Las acciones usan los métodos educativos existentes de cada host.
- `visual-layout.js`: secciones, dos columnas, destacados, tablas y separadores; editables y serializados en HTML semántico dentro de `.p2lrn`.
- Borradores locales: guardar, recuperar y eliminar tanto en la web como en NPM. En NPM se conserva el endpoint autorizado de guardado del host.
- Un mismo diseño minimalista de barra, esquema del curso y lienzo para navegador y Shadow DOM. Las diferencias por disponibilidad de servicios del host se deben mostrar como estados de capacidad, no como bifurcaciones de interfaz.
- `scripts/verify-studio-unified-ui.mjs` prueba el componente compartido en Chrome/Edge normal y Shadow DOM, su buscador, comandos y persistencia en un paquete abierto después de exportar. `studio-mejorastudio-qa.yml` ejecuta QA en Windows; **no constituye por sí solo prueba completa de todos los flujos del Studio publicado**.
- Sin cambio de formato P2LRN ni instalación de Fabric.js, PptxGenJS o exportadores PDF. No confundir este trabajo con la implementación del editor PowerPoint completo.

## Editor visual completo (pendiente, no declarar implementado)

1. Modelo de documento de diseño: páginas/diapositivas, elementos identificados, cuadros de texto, geometría, z-order, capas, estilos, temas, restricciones responsive; mantener HTML como fallback accesible.
2. Editor avanzado: la barra compartida Inicio/Insertar/Diseño, el esquema, el lienzo y el selector de actividades están implementados en la rama. Siguen pendientes páginas/diapositivas auténticas, reglas, guías, cuadrícula, selección múltiple, capas, alineación y distribución geométricas, animaciones y atajos completos.
3. Contenido educativo: insertar componentes P2LRN, cuestionarios, juegos, multimedia y actividades usando los contratos existentes, sin duplicar datos ni extraer SCORM/H5P.
4. PPTX: importación mediante parser OOXML seguro o conversión, conservación de texto/imágenes/orden y exportación editable con PptxGenJS; definir matriz explícita de fidelidad y avisos de degradación.
5. PDF: importación mediante Reader existente cuando proceda; exportación impresa a partir de páginas renderizadas y/o servicio autorizado con ReportLab. No afirmar edición vectorial completa de cualquier PDF.
6. DOCX: convertir mediante Reader y preservar estructura/estilos soportados; diseñar exportación posterior si aporta valor.
7. Skill: actualizar instrucciones y versión solo cuando los comandos oficiales existan, y acompañar ejemplos con archivos realmente verificados.
8. Seguridad: sanitización HTML, límites de tamaño, evitar ejecución de macros, scripts, SVG activo y enlaces peligrosos; revisar fuentes externas/licencias; no ejecutar documentos cargados.
9. Calidad: unitarias DOM, pruebas de persistencia y round-trip, regresiones de cuestionarios/juegos, comprobación visual en navegadores y móvil, accesibilidad, rendimiento y exportación real.

## Criterios de aceptación

- Insertar y editar bloques en ambas interfaces, guardar/exportar .p2lrn, reabrirlo y conservar su estructura y visualización en Player.
- No alterar el comportamiento de actividades externas ni las evaluaciones.
- Menús y botones funcionales, navegación con teclado, lectura de pantalla, responsive y rendimiento razonable.
- PPTX/PDF: pruebas de exportación e importación con ejemplos concretos, no solo opciones de menú.
- CI limpio y revisión explícita antes de fusionar a main.

## Investigación de dependencias (no instaladas todavía)

- Fabric.js, MIT: motor de lienzo con selección, escala, giro, agrupaciones y exportación SVG/JSON. Candidato para el lienzo visual, sin sustituir el modelo semántico P2LRN. Fuente: https://github.com/fabricjs/fabric.js
- PptxGenJS, MIT: generación de PPTX OOXML editable desde JavaScript. Es un *exportador*; no suponer un importador simétrico PPTX. Fuente: https://github.com/gitbrent/PptxGenJS
- pdf-lib, MIT: creación y modificación de PDF en JS. No garantiza convertir HTML completo con CSS a PDF; requiere flujo de renderizado paginado. Fuente: https://github.com/Hopding/pdf-lib
- pdfjs-dist ya figura como dependencia de @p2lrn/studio en este repositorio: reutilizarlo para lectura/preview PDF, no introducir un lector duplicado.
- Evitar incorporar dependencias nuevas sin pruebas de tamaño de bundle, licencias, CSP y compatibilidad con paquetes offline.

## Riesgos de implementación

- Los estilos HTML actuales se filtran en Studio y pueden recibir restricciones adicionales en Player. Confirmar en navegador que las columnas CSS/grid se conservan tanto online como offline.
- El editor visual no debe serializar eventos JS, clases dependientes del host ni coordenadas de pantalla imposibles de reproducir.
- Importación PPTX: tratar imágenes, tablas, fuentes, gráficos y animaciones con un informe de compatibilidad por elemento. No aceptar macros ni relaciones OOXML externas sin validación.
- La rama sí implementa una cinta de opciones ligera y única para los dos Studio. **No** implementa todavía un motor libre de páginas/diapositivas ni exportadores PPTX/PDF. No atribuir esas capacidades a la versión publicada.
- No realizar merge a `main`, tag, publicación NPM ni despliegue público sin la orden expresa del propietario del repositorio.

## Herramientas visuales implementadas en mejorastudio (5 de noviembre de 2026)

La web y el componente NPM comparten los mismos módulos y la misma interfaz. No hay dos editores visuales alternativos.

- studio-advanced-tools.js: pestaña contextual Tabla, herramientas de Diseño y atajos Ctrl+Z, Ctrl+Y y Ctrl+Mayús+Z, aplicados al historial de la lección HTML.
- studio-object-tools.js: marco de selección ajeno al HTML exportado; mover arrastrando el control, redimensionar con la esquina inferior derecha, duplicar, cambiar posición en el flujo, alinear y eliminar.
- Tablas: insertar fila antes/después y columna a izquierda/derecha, eliminar filas y columnas, cambiar fondo y alineación de celdas y altura de fila. Se limitan a 80 filas y 20 columnas; las operaciones estructurales no se aplican a celdas combinadas.
- visual-layout.js: nuevos Cuadro de texto y Forma, además de Sección, Columnas, Destacado, Tabla y Separador.
- studio-history.js: historial por recurso HTML con deshacer y rehacer de inserciones, modificaciones de estilos, tablas y geometría. Mantiene el historial al navegar entre lecciones; se reinicia al abrir otro curso. Deduplica cadenas multimedia incrustadas dentro de las instantáneas.

Pruebas realizadas: node --test del historial, bloques y dependencias, Chrome/Edge con DOM normal y Shadow DOM, cambios de filas y columnas, diseño de celdas, movimiento y redimensionado mediante puntero, historial reversible y exportación/reapertura P2LRN en el componente NPM. La corrección diferida de cuestionarios y las pruebas de exportación de paquetes han pasado. La prueba de medios reales grabados en Chrome headless ha fallado con un WebM de prueba no reproducible y, en otro intento, un bloqueo temporal de DevTools; no se considera validada esa parte.

Límites: no existe aún un historial global que abarque todos los metadatos, cuestionarios y juegos; tampoco un motor completo de páginas, capas y animaciones de PowerPoint, combinaciones de celdas, ni importación o exportación editable PPTX/PDF. No afirmar dichas capacidades. Prohibido fusionar, publicar NPM o desplegar la rama sin autorización expresa del usuario.

## Juego nativo de ensamblaje 3D por piezas — especificación de diseño (9 de noviembre de 2026)

**Estado:** DISEÑADO; NO IMPLEMENTADO ni validado en Studio/Player/LMS/offline. Esta sección define el contrato funcional y criterios de aceptación, no resultados de pruebas. Extender los componentes existentes; prohibido crear un segundo editor/motor/formato/checkout.

### Experiencia del profesor y alumno

El profesor importa un modelo humano, mecánico, geológico o de cualquier estructura, crea piezas independientes y establece las zonas 3D donde el alumno debe encajarlas. Cada destino se muestra en edición como una **jaula wireframe** con vértices y aristas, nunca como caja opaca obligatoria. La zona inicial tiene ocho vértices, editables individualmente, y se puede mover, escalar y rotar en X/Y/Z en cualquier punto del espacio. No debe limitarse a plataformas X/Z ni a una cámara prefijada.

La zona se construye con un hexaedro convexo editable. Para órganos y piezas cóncavas se permiten varios volúmenes convexos unidos en un solo destino lógico. Se editan los puntos/volúmenes, no la malla visual de alta resolución: así el coste de picking y validación sigue siendo bajo. La edición debe impedir volúmenes invertidos, caras degeneradas, autointersecciones y transformaciones no finitas. Ante una geometría inválida se revierte únicamente el gesto, sin perder el trabajo ya válido.

Modos de alumno: arrastrar directamente, seleccionar/transportar la pieza por el escenario, girarla hasta la orientación válida y montar en secuencia cuando existan dependencias. El docente configura si los objetivos se ven como contorno sutil, silueta de referencia, pista de proximidad u objetivo invisible. No desvelar respuestas correctas antes de la interacción. Ejemplos: esqueleto con huesos; torso con órganos; motor con engranajes, ejes y carcasa; planeta con capas.

### Editor visual único para Studio web y NPM

Extender el editor de cuestionarios y la interfaz compartida; no montar otro Studio. Nueva actividad «Ensamblaje 3D» en el catálogo basado en addGame. Escena editable en directo con acciones: Añadir modelo; separar nodos/submallas importadas en piezas; Añadir destino; Asignar pieza al destino; Mover; Rotar; Escalar; Editar vértices; bloquear ejes; ajustar dimensiones XYZ con campos numéricos; ajustar pivote y origen; deshacer/rehacer; Vista alumno. Todas las operaciones ocurren dentro del mismo visor de edición, sin obligar a cambiar de vista para mover piezas o jaulas.

Panel único «Escena / Modelos / Piezas / Zonas / Relaciones» con árbol de selección y jerarquía, coordenadas locales y globales, tolerancia de colocación, giro aceptado, puntuación, intentos, orden de ensamblaje y ayudas. Los vértices se muestran como asas de arrastre y sus coordenadas pueden teclearse con precisión. Gizmos y paneles deben permanecer visibles encima del lienzo sin bloquear menú ni controles previos. La edición con ratón, táctil y teclado debe ser equivalente en funciones esenciales.

### Contrato de datos y geometría

Extensión versionada y aditiva del cuestionario nativo: scene3d contiene units, referenceAssets, pieces, targets, links, placementRules y interactionMode. Cada pieza contiene id, assetId, nodeId (submalla opcional), initialTransform (posición + cuaternión + escala), pivot y collider simplificado. Cada destino contiene id, position XYZ, rotationQuaternion, scale XYZ, localVertices (vértices en coordenadas locales), convexParts opcionales, visibility. Cada relación contiene pieceId, targetId, positionTolerance, rotationToleranceDeg, scaleTolerance, snapMode y prerequisites.

El motor transforma los vértices locales a coordenadas globales de forma determinista. Validar primero AABB/esfera delimitadora y después volumen convexo orientado y tolerancia de orientación; solo al superar las condiciones se activa el snap. Tolerancias y unidades ajustables por docente, valores por defecto conservadores. El resultado no puede depender del zoom o la cámara. Validar IDs únicos, existencia de referencias, forma convexa no degenerada, escala positiva, cuaternión válido, ausencia de ciclos de dependencias y límites de complejidad. Si la zona requiere superficie irregular, combinar convexParts en lugar de calcular contacto costoso contra cada triángulo visual.

Integrar el estado con la evaluación/reanudación P2LRN existente. Cada colocación guarda pieza, destino, transformación final cuantizada, intento y resultado. Usar los eventos de actividad y puntuación del Player, sin generar un sistema paralelo ni registrar movimientos de cursor o datos personales innecesarios. Una caída de WebGL/física nunca concede automáticamente nota. Fallback HTML accesible: seleccionar pieza/destino, orientar mediante controles y confirmar encaje, con las mismas reglas de evaluación.

### Activos 3D seguros y optimizados

Importar GLB/glTF 2.0 desde ficheros y recursos P2LRN, con verificación de buffers, URI, extensiones, tamaños, texturas, licencia y geometría. Rechazar scripts, referencias externas no autorizadas, rutas absolutas y archivos malformados. En un modelo GLB compuesto, permitir seleccionar submallas/nodos existentes como piezas preservando sus pivotes; NO inventar segmentación automática si el GLB no está separado. El paquete offline debe contener todos los modelos y decodificadores requeridos, no solicitar recursos remotos para funcionar.

Optimización medible: normalizar escala/ejes/pivotes; eliminar atributos y nodos no usados sin destruir rig o animación requerida; compartir buffers/materiales/texturas por digest; mallas de colisión simplificadas; instancing de piezas repetidas; LOD; frustum culling; cargas diferidas; adaptación de sombras y pixel ratio; pausar render si el visor no está visible. Meshopt y KTX2/Basis solo si sus decodificadores están incluidos y pasan pruebas en web, NPM y offline. Medir memoria GPU, bytes, FPS y tiempo de carga antes/después; no prometer ratios inventados. Mantener un recurso canónico por activo más representaciones técnicas necesarias, no duplicaciones indefinidas. Rapier para física de piezas cuando se necesite, zonas de destino estáticas/cinemáticas.

### Integrar en módulos existentes

- packages/toolkit/web/studio/questionnaire-editor.js: un solo editor visual, gizmos y propiedades.
- packages/toolkit/web/studio/authoring-document.js: nuevo tipo de juego a través de addGame, no nuevo formato de curso.
- packages/toolkit/web/questionnaire-games-core.js: validar scene3d y normalizar actividades reproducibles.
- packages/toolkit/web/game-3d/three-runtime.js: visor Three.js existente con jaulas wireframe editables, picking, transformaciones XYZ, snap y modelos GLB; preservar anteriores juegos, cámara y joystick.
- packages/toolkit/web/renderers/questionnaire-3d.js: ejecución del nuevo modo, evaluación, reanudación y accesibilidad.
- packages/studio/scripts/build-dist.mjs y builds Player/web/offline: verificar que empaquetan exactamente los mismos módulos, sin copiar implementación entre interfaces.

### Criterios de aceptación

1. Crear visualmente 1 modelo de referencia, al menos 5 piezas y 5 destinos a diferentes alturas y orientaciones; asignar relaciones reales.
2. Mover, rotar, escalar y desplazar vértices sin abandonar edición; deshacer/rehacer; impedir geometría inválida sin destruir cambios anteriores.
3. Guardar un único archivo .p2lrn, reabrirlo en Studio web y NPM, comprobar IDs, hashes, geometría, pivotes y soluciones; Player debe usar exactamente el mismo paquete.
4. Comprobar acierto, fallo, distancia, giro insuficiente, dependencias, pistas, reanudación y nota. Las pistas no deben revelar la clave incorrectamente.
5. Probar ratón, táctil y teclado/lector de pantalla; el fallback HTML ha de producir la misma nota sin WebGL.
6. Ejecutar offline sin red y registrar progreso/resultados; probar también LMS reales con el mismo paquete, sin certificar hasta obtener evidencia.
7. Medir cargas y rendimiento de GLB grandes, validar manejo de fallos y ejecutar regresiones de ordenar/relacionar/clasificar 3D.

**No declarar hecho el juego por escribir esta especificación.** No crear prototipo desechable que no persista, exporte ni funcione en el Player; no fusionar ni publicar la rama sin pruebas y autorización.
