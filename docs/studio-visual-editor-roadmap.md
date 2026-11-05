# Studio visual: arquitectura y plan de integración

Rama de trabajo: `mejorastudio`. No fusionar ni publicar antes de completar pruebas.

## Estado verificado del código

Studio web: `deploy/netlify/site/studio/studio.js`, con editor WYSIWYG y barra existente.
Studio web component NPM: `packages/studio/src/p2lrn-studio.js`, Shadow DOM y editor propio.
Implementación compartida: `packages/toolkit/web/studio/`. El empaquetado NPM copia módulos con `packages/studio/scripts/build-dist.mjs`.
La Skill P2LRN dirige al Toolkit y Studio oficiales: no debe implementar un editor paralelo.
Las lecciones HTML se serializan en recursos del paquete P2LRN; los perfiles SCORM/H5P/cmi5 permanecen encapsulados.

## Entrega inicial de la rama

`visual-layout.js`: insertar secciones, dos columnas, destacados, tablas y separadores, editar dentro del WYSIWYG y serializar como HTML existente. Disponible en ambas interfaces de Studio. No equivale a importar o exportar presentaciones PPTX.

## Editor visual completo (pendiente, no declarar implementado)

1. Modelo de documento de diseño: páginas/diapositivas, elementos identificados, cuadros de texto, geometría, z-order, capas, estilos, temas, restricciones responsive; mantener HTML como fallback accesible.
2. Interfaz SaaS: cinta o barra de pestañas Inicio/Insertar/Diseño/Animaciones/Revisar/Exportar, panel lateral de diapositivas, lienzo, reglas, cuadrícula, guías, ajuste, selección múltiple, arrastrar, redimensionar, alinear, distribuir, deshacer/rehacer y atajos.
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
