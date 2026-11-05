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
