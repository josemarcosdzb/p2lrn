# P2LRN: decision de salida publica (17/10/2026)

## Regla de lanzamiento

No fusionar una PR en borrador, ejecutar `npm publish` ni presentar P2LRN como un runtime universal hasta disponer de todos los resultados de aceptacion de la version exacta. Es posible considerar una beta publica acotada sin anunciar compatibilidad SCORM/cmi5 general; una version estable necesita estas condiciones.

## Evidencia reproducible

- Pull request candidata: https://github.com/josemarcosfrodo/p2lrn/pull/14
- Ejecucion previa: https://github.com/josemarcosfrodo/p2lrn/actions/runs/39019096138
- Bloque de runtime aislado: SUCCESS. La bateria total anterior: FAILURE al ejecutar la interfaz npm de Studio; el recorrido estaba identificando como actividad el boton `+ Unidad` por comparar nodos DOM reemplazados durante el render.
- Se corrigio la deteccion usando exclusivamente las entradas del arbol de curso, la actividad seleccionada y los titulos del grafo exportado. Volver a reproducir para saber si se resolvio el recorrido completo.
- El runner Windows guardo 24 archivos como evidencia de la prueba anterior en `%USERPROFILE%\Downloads\p2lrn-validation\39019096138\`, con manifest.json y SHA-256. No significa que todo ese run haya pasado.
- En la verificacion definitiva deben conservarse capturas del navegador, `.p2lrn` creado por Studio, su hash, resultado de reapertura, registros de notas/estado en Player y la reproduccion del recurso seleccionado.
- Contrato funcional: crear un curso desde la interfaz de `@p2lrn/studio`, editar titulo y contenido, insertar evaluaciones y juegos, importar un paquete SCORM real y un documento con Reader, exportar, guardar, descargar, abrir el mismo archivo y navegar la leccion especifica desde `@p2lrn/player`. Comprobar el flujo tanto con npm empaquetado e instalado como con el CDN construido.
- Paquetes externos representativos: SCORM 1.2 interactivo, H5P Crossword real, cmi5 CATAPULT como previsualizacion, QTI y otros ejemplos; el resultado de cada uno debe constar por separado.
- Seguridad: verificar que el contenido aislado no accede al DOM/identidad del Host y que los endpoints Save/Reader/Import del LMS se autentican/autorizan por el **sitio integrador**, no por P2LRN.

## Matriz de navegadores y formatos

La matriz publica de capacidades y restricciones se mantiene en `/docs/compatibilidad/#soporte-produccion`. Hasta disponer de ejecuciones concretas aprobadas, solo se puede afirmar que Chromium ha reproducido los ejemplos senalados. Microsoft Edge cuenta con una ejecucion dedicada en el gate Windows (confirmar el resultado). Firefox y Safari carecen de comprobacion equivalente, por tanto no se garantizan en la primera entrega.

P2LRN no declara certificacion universal de SCORM 2004, H5P o cmi5. El puente cmi5 actual produce declaraciones no autoritativas y no es un LRS. Se debe aclarar al integrador que las notas y la identidad confiables pertenecen al Host.

## Distribucion

Se publican cuatro paquetes de version alineada en el orden H5P libraries, toolkit, player, Studio, segun `PUBLISHING.md`. `npm pack` no prueba una instalacion desde el registro; antes del lanzamiento la herramienta `scripts/check-public-npm-registry.mjs` debe demostrar si cada version existe realmente en el registro publico. Tras publicar, instalar las cuatro versiones exactas desde npm en un proyecto nuevo y repetir el uso desde navegador, sin enlaces al monorepo.

El CDN debe servirse desde la misma fuente canonica que npm, conservar rutas versionadas inmutables, permitir revertir el alias `current` y disponer de los archivos de codigo fuente exigidos por P2LRN-NCSL 1.0. Ante fallos en npm, no se debe reemplazar una version ya publicada: retirar su recomendacion y sacar una version corregida.

## Bloqueos que no deben inventarse

- Identidad juridica del prestador de P2LRN (persona o entidad, NIF, domicilio y canal de contacto legal); la politica de privacidad y el aviso legal aun no contienen estos datos confirmados.
- Confirmacion de periodos de conservacion de los datos enviados por el formulario y verificacion de los proveedores/subencargados y sus condiciones.
- Autorizacion operativa real para publicar los paquetes en el scope npm `@p2lrn`. No asumir que el runner tiene credenciales ni que la version final existe en el registro.
- Version de lanzamiento acordada, controles de compatibilidad y procedimiento de soporte y regresion para esa version.

## Criterio final

No marcar una casilla como completada por la existencia de un script ni por su inclusion en una PR. Registrar el run, artefacto real y resultado observado. Fusion y publicacion solo cuando la version candidata cumple todo lo necesario y no quedan datos legales o de acceso externo por confirmar.
