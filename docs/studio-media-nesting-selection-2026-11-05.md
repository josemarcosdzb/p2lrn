# Studio — selección persistente, movimiento y multimedia anidada

**Fecha:** 5 de noviembre de 2026. **Rama:** `mejorastudio`. Se aplica al Studio de la web y al componente `@p2lrn/studio` compilado en su demostración HTML local. No se ha fusionado con `main`, desplegado en producción ni publicado NPM.

## Incidencias reproducidas

- La barra de imágenes desaparecía después de algunas interacciones al soltar el ratón.
- Los vídeos dependían de Alt + arrastrar, sin un control de movimiento claramente accesible.
- Imágenes, vídeos y bloques se insertaban al nivel principal aunque se hubiera seleccionado una sección, columna, cuadro de texto o celda.
- El arrastre de multimedia cambiaba márgenes durante el movimiento, desplazando los contenedores de destino.
- En celdas muy estrechas, el inspector multimedia podía quedar comprimido o fuera de pantalla.

## Cambios realizados

- **Selección persistente:** imágenes y vídeos se seleccionan con el puntero, conservando el inspector hasta seleccionar otra cosa. Los botones de aumentar/disminuir tamaño, eliminar, portada de vídeo y **Mover** permanecen accesibles.
- **Vídeo manipulable:** el control Mover permite arrastrarlo sin activar los controles de reproducción; también admite ajustes por teclado. Se mantienen los controles de vídeo nativos y la opción Alt + arrastrar.
- **Arrastre sin alterar el contenido:** el desplazamiento provisional usa `transform`. Solo al soltar se aplica la nueva posición o se mueve el nodo a otro contenedor válido, evitando que el destino se desplace durante el gesto.
- **Anidamiento real:** Insertar toma como destino la sección, columna, cuadro de texto o celda seleccionada. También es posible arrastrar imágenes, vídeos o formas dentro de otro contenedor. El resultado es un **cambio de jerarquía del HTML**, no una superposición simulada.
- **Tablas:** imágenes y vídeos se anidan en `td`/`th`, nunca directamente como hijos inválidos de `table`.
- **Inspector adaptable:** se posiciona respecto a la pantalla y no hereda el ancho de una celda pequeña. En viewport de 390 px se ha medido **X=8 px y ancho=374 px**, igual para Studio web y NPM.
- **Estructura preservada:** el HTML anidado se mantiene al entrar en Vista alumno y regresar a edición; se conserva la edición y exportación ya existente.

## Uso del editor

Selecciona una sección, columna, cuadro de texto o celda. Desde **Insertar**, añade otro bloque, imagen o vídeo. Para mover un recurso existente, selecciónalo y utiliza **Mover**; al soltar sobre otro contenedor válido se anida allí. El destino de soltado se resalta. Para un vídeo, el botón Mover evita interferir con play/pausa.

## Pruebas

- **15 pruebas unitarias aprobadas:** dependencias de la distribución NPM, formatos seguros, imágenes, vídeos, geometría, historial e importación/exportación.
- Browser E2E en **Studio web y Studio NPM** con `scripts/verify-studio-media-nesting.mjs`: selección tras clic/arrastre, mover y redimensionar, anidamiento sección → columnas → cuadro de texto → tabla → celda, traslado de forma/vídeo entre celdas y vuelta desde Vista alumno.
- Verificación en navegador de **reproducción real WebM** mediante el recurso original `scripts/studio-media-test.webm` (2.528 bytes): se comprueba decodificación y avance temporal. El recurso evita depender de MediaRecorder en cada ejecución y no procede de fuentes externas.
- Pasaron los recorridos previos de paridad de interfaz, edición avanzada, Vista alumno y revisión SaaS en las dos entradas.
- Capturas y JSON locales de QA: `C:\Users\Usuario\Downloads\p2lrn-mejorastudio-preview-1d4cd08d\qa-media-nesting`.

Comandos reproducibles, con la vista local levantada:

```bash
node packages/studio/scripts/build-dist.mjs
node --test packages/toolkit/test/studio-advanced-history.test.mjs packages/toolkit/test/studio-visual-layout.test.mjs packages/toolkit/test/studio-lesson-images.test.mjs packages/studio/test/dist-dependencies.test.mjs
node scripts/verify-studio-unified-ui.mjs
node scripts/verify-studio-media-nesting.mjs --port 5531 --output DIRECTORIO_EXISTENTE
node scripts/verify-studio-student-preview.mjs --port 5531
node scripts/verify-studio-advanced-local-preview.mjs --port 5531
node scripts/verify-studio-saas-ui.mjs --port 5531
```

## Limitaciones verificadas

Una composición con muchas capas anidadas puede dejar una celda de ancho insuficiente para reproducir un vídeo cómodamente. El inspector sigue siendo utilizable, pero el curso debe dar espacio al vídeo ajustando el diseño del contenedor. Se mantienen los máximos de **8 MB por imagen** y **32 MB por vídeo**.

La reproducción WebM se comprobó en Chrome/Edge de pruebas, no se han certificado todos los códecs MP4, Safari ni dispositivos móviles físicos. Los contenidos externos SCORM/H5P no se modificaron en esta intervención. La compilación NPM probada es **local**; no supone publicación en el registro NPM.
