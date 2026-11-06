# Incidencia P2LRN: página en blanco por limpieza de marcas

**6 de noviembre de 2026** · Rama de reparación: `mejorastudio`.

## Reproducción verificada en la web publicada

En una instancia aislada de Chrome se abrió tanto `https://p2lrn.org/` como `https://p2lrn.org/en/`. Al añadir al documento un elemento con el texto `Powered by Netlify`, el código publicado de `p2lrn.js` recorrió sus elementos ascendentes y ejecutó `remove()` sobre el elemento raíz `<html>`. El resultado observado fue `document.documentElement === null`, `document.body === null` y una página completamente en blanco, **sin excepción JavaScript**.

La prueba demuestra un fallo capaz de producir exactamente el síntoma comunicado. No demuestra que ese elemento se insertase durante la sesión original del usuario, cuya traza no está disponible.

## Defecto adicional de rendimiento

En ambas versiones públicas, un observador `MutationObserver` recorría el documento completo para cada nueva inserción. Una serie de 110 inserciones independientes generó **220 búsquedas globales** por idioma (110 de marcadores de Netlify y 110 de texto), aunque los nodos añadidos eran simples elementos de prueba. Este coste crece con el tamaño y la actividad de la página. No se ha demostrado que causara por sí solo una fuga de memoria de 21 GB; la presión de RAM de Chrome era una circunstancia adicional, no un diagnóstico suficiente.

## Correcciones aplicadas

Archivos: `deploy/netlify/site/p2lrn.js` y `deploy/netlify/site/en/p2lrn.js`.

1. Prohibir explícitamente la eliminación de `document.body` y `document.documentElement`.
2. Conservar el comportamiento de retirar el aviso de marca, pero eliminar únicamente el nodo concreto o un pequeño contenedor fijo/adherido; no ascender indiscriminadamente hasta el documento.
3. Evitar cálculos de `textContent` sobre grandes contenedores y no inspeccionar todas las etiquetas ante cualquier cambio de interfaz.
4. Limitar el observador a los nodos añadidos y sus descendientes, no volver a inspeccionar todo el DOM.
5. Aplicar el mismo arreglo a español e inglés.

## Pruebas ejecutadas

En un servidor HTTP local con el código corregido y un Chrome aislado, ambas versiones superaron: carga de contenido (>5.500 caracteres visibles), inserción de texto de marca aislado, inserción de marca anidada, eliminación de un `netlify-toolbar`, eliminación de un pequeño aviso fijo, permanencia de contenido normal, supervivencia de `<html>` y `<body>` y ausencia de excepciones JS. En 110 inserciones adicionales, **0 búsquedas globales** en lugar de las 220 anteriores.

Verificaciones adicionales: `scripts/test-site-ui-locales.mjs` (4/4), `scripts/verify-doc-navigation.mjs` y `scripts/verify-doc-flow.mjs` superadas. `scripts/verify-site-security.mjs` continúa fallando por un desfase previo sobre el número de Skills (cuatro frente a cinco); no forma parte de esta reparación. `scripts/verify-website-conversions.mjs` no existe en el checkout local.

## Publicación y riesgo residual

**El arreglo se preparó en `mejorastudio`, sin fusionar `main` ni cambiar directamente el dominio público.** El sitio publicado sigue siendo vulnerable mientras no se despliegue un hotfix equivalente. No es seguro desplegar de golpe toda la rama experimental para corregir solo este fallo.

La vía de publicación debe llevar exclusivamente los archivos JS corregidos a la versión vigente, actualizar las revisiones de caché generadas por el build y comprobar de nuevo las dos rutas públicas. Registrar el despliegue y conservar un procedimiento de reversión. Desde esta sesión no hay credenciales Netlify de publicación disponibles; no afirmar publicación ni certificación de producción.

La carga en navegador limpio después de la corrección no sustituye una prueba prolongada de RAM con múltiples pestañas. Si reaparecen bloqueos, medir por pestaña `Performance.getMetrics` y perfiles de heap, sin atribuir automáticamente el consumo global de Chrome a P2LRN.
