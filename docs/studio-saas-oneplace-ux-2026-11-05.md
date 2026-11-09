# Studio SaaS: edición contextual sin controles duplicados

**Actualizado: 5 de noviembre de 2026.** Rama de desarrollo `mejorastudio`. Aplica a la web y a la compilación local HTML de `@p2lrn/studio`, que comparten una única implementación de la barra. Sin fusión a `main` ni publicación en NPM.

## Problema observado

En la versión anterior, editar el mismo elemento obligaba a pasar de Inicio a Diseño, a Tabla y después a una barra flotante. Había operaciones repetidas: creación/apertura/exportación, filas/columnas, duplicación, orden de bloques y botones de multimedia. La barra móvil escondía funciones de texto fuera de la pantalla sin una indicación clara.

## Diseño implementado

- **Archivo:** nuevo curso, abrir, borradores, exportación, entrega offline y revisión. **Guardar** es un único botón visible. **Editar** y **Vista alumno** son opciones permanentes.
- **Formato:** párrafo, negrita, cursiva y subrayado de acceso inmediato. En móvil, **Más formato** despliega fuente, tamaño, listas, alineación, tachado, color y deshacer/rehacer **en el mismo lugar**.
- **Formato contextual:** cuando se selecciona una tabla, aparecen **Filas**, **Columnas**, **Celda**, **Fondo**, **Objeto** y **Tamaño**, organizados en menús desplegables. En otros bloques muestra solo las propiedades pertinentes. No hay pestañas Diseño y Tabla separadas.
- **Insertar:** unidades, lecciones, actividades, tablas, cuadros de texto, formas, imágenes y vídeos.
- El marco flotante sobre el objeto ofrece únicamente **Mover** y un tirador de redimensionado. La estructura/estilo se edita desde el único inspector contextual.
- Los controles de multimedia aparecen al seleccionar el recurso y no repiten los botones de inserción. Título y descripción de la lección permanecen editables desde sus propiedades. El aviso de cambios sin guardar se conserva, pero más compacto.

La interfaz emplea controles compartidos de `command-bar.js`, `studio-advanced-tools.js`, `studio-object-tools.js` y `lesson-images.js`, con el historial de lecciones sin sustituciones.

## Verificación real

Chrome/Edge con ambas versiones a **1440, 860 y 390 píxeles**. A 390 px, la barra Formato sin objeto seleccionado mide aproximadamente **245 px**; el inspector contextual amplía la barra cuando hay un objeto. Se comprobaron capturas de cada vista y estado, incluidas las opciones desplegadas. Sin desbordamiento horizontal de página en los tamaños probados.

Prueba funcional de extremo a extremo: seleccionar texto dentro de una tabla, aplicar **negrita**, insertar una fila y cambiar el fondo **sin salir de Formato**. Se verificaron los menús Filas, Columnas y Fondo, escape/clic fuera, objetivos clicables, ausencia de controles duplicados, arrastre/redimensionado, deshacer/rehacer, exportación y reapertura `.p2lrn` en NPM y Vista alumno con regreso a edición sin perder cambios.

Comandos de prueba:

```sh
node scripts/verify-studio-unified-ui.mjs
node scripts/verify-studio-saas-ui.mjs --port 5531 --output CARPETA_EXISTENTE
node scripts/verify-studio-advanced-local-preview.mjs --port 5531
node scripts/verify-studio-student-preview.mjs --port 5531
```

Las capturas y los resultados JSON se encuentran **solo en la máquina de pruebas**, en `C:\Users\Usuario\Downloads\p2lrn-mejorastudio-preview-1d4cd08d\qa-oneplace`.

## Criterios y límites

Principios de agrupación, jerarquía y overflow explícito: [Fluent 2 Toolbar](https://fluent2.microsoft.design/components/web/react/core/toolbar/usage), [CKEditor Balloon Block](https://ckeditor.com/docs/ckeditor5/latest/examples/builds/balloon-block-editor.html) y [WAI-ARIA Toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/).

No constituye certificación WCAG ni cobertura de Safari o dispositivos físicos. La modificación se limita a Studio; no demuestra por sí sola reproducción de paquetes externos SCORM/H5P ni equivale a un motor PPTX completo. No desplegar, fusionar ni publicar NPM sin autorización expresa.
