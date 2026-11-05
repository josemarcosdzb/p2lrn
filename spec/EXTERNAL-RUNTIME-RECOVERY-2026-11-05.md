# Recuperación de formatos importados (2026-11-05)

El identificador Core 0.4.0 corresponde al formato; el Player revisado pertenece a la serie 0.5.0-alpha.12. Validar un contenedor no demuestra la ejecución del contenido externo.

## Fallos y corrección compartida

- H5P: algunas bibliotecas, como EmbeddedJS, requieren evaluación de JavaScript. El iframe srcdoc heredaba la CSP estricta del host. Player genera un documento h5p-opaque.html aislado, sin permisos de origen ni de red, con una excepción CSP exclusiva para la actividad. La página principal sigue sin unsafe-eval.
- IMS Common Cartridge: los vínculos $IMS-CC-FILEBASE$ y los parámetros de descarga de Canvas se resuelven contra los archivos presentes en el paquete. Para contenido HTML pasivo, el iframe conserva scripts deshabilitados y recibe imágenes, CSS y fuentes como URLs data; las URLs blob del host no funcionaban en el origen opaco del navegador.
- SCORM: conserva la API de notas y estado dentro del sandbox. El runtime identifica rutas de scripts ausentes en el ZIP y devuelve un error específico. Los parámetros de consulta no se añaden a URLs blob temporales.
- Contenido de gran tamaño: descompresión paralela limitada a ocho entradas, manteniendo los topes de tamaño y número de archivos.

## Pruebas reales

- Suite de seguridad y ejecución automática: SCORM 1.2 con nota 100, SCORM 2004, H5P Crossword con xAPI, cmi5, HTML e IMSCC, sin filtración al origen anfitrión.
- H5P Boardgame: carga desde un archivo real de aproximadamente 40 MB y emite el evento de actividad preparada.
- IMSCC TOPkit de aproximadamente 69 MB: Introducción (2/2 imágenes decodificadas, 0 rotas) y Plan de estudio (13/13 imágenes decodificadas, 0 rotas). Ambos dentro de un iframe aislado.
- El código de regresión está en scripts/verify-automatic-runtimes.mjs y scripts/verify-imported-formats-browser.mjs; la CI Windows ejecuta esos casos.

## Límites del contenido original

- El ZIP SCORM Bilan referencia javascript/hand-1.3.8.js, que no incluye. El Player ahora lo comunica; se necesita el recurso original para reproducirlo fielmente.
- La página SCORM Golf contiene literalmente Not implemented yet. Es material incompleto, no una prueba de reproducción satisfactoria.
- TOPkit referencia web_resources/images/dbsk_bar.jpg sin incluirlo. Las referencias ausentes se sustituyen por una alternativa accesible y se registran; no se crea una imagen falsa ni se modifica el archivo original.
- Paquetes con dependencias remotas, software Flash u otros componentes ajenos al ZIP pueden necesitar requisitos específicos. Nunca declarar que todo contenido es funcional por abrirse su manifiesto.

## Distribución

Player y CDN comparten el código fuente de packages/toolkit/web. El build de Player incluye h5p-opaque.html y genera su bootstrap JavaScript; el build CDN añade el CSP exclusivo de ese host. Verificar en el dominio público tanto la ruta como su cabecera. Para npm se requiere una nueva publicación autenticada de los cinco paquetes en versiones alineadas; compilar o empaquetar localmente no equivale a publicar.
## Corrección adicional cmi5 CATAPULT

El contenido activo cmi5 ya no utiliza un iframe srcdoc que hereda la CSP de la web principal. Se sirve desde runtime-host/package-opaque.html, que mantiene sandbox allow-scripts sin allow-same-origin y una cabecera CSP exclusiva. El script clásico package-opaque.js sale de la misma implementación compartida por CDN y npm. La prueba real de Chrome abre la introducción, activa Next y verifica que aparece el cuestionario Pre-Test con preguntas, sin errores CSP. La CI ejecuta scripts/verify-cmi5-browser-runtime.mjs.
