# Certificación funcional de los ejemplos P2LRN — 6 de noviembre de 2026

**Estado funcional de la matriz de ejemplos: APROBADA (30/30 en Chrome real, rama `mejorastudio`).**
**Estado del despliegue público: PUBLICADO Y VERIFICADO.** Commit de `main` [0880c98e](https://github.com/josemarcosdzb/p2lrn/commit/0880c98e319e738cac01e4e1e9d4d4cce979ea7d); comprobaciones funcionales de 19 ejemplos sobre la candidata de `main`: [42238231145](https://github.com/josemarcosdzb/p2lrn/actions/runs/42238231145), 23/23; publicación condicionada a los mismos tests en [42239207540](https://github.com/josemarcosdzb/p2lrn/actions/runs/42239207540).

## Evidencias reproducibles

- **30/30 comprobaciones PASS, sin incidencias CSP reportadas en los casos:** workflow alojado en Windows [42237187875](https://github.com/josemarcosdzb/p2lrn/actions/runs/42237187875); commit ensayado `8f0ec2094985bb3ef0d8dee34a3abaac8a096791`. La ejecución usa el sitio compilado, Chrome/Edge real y las rutas de los 19 paquetes de procedencia registrada en `provenance.json`.
- **19/19 paquetes preservan el origen y superan integridad y estructura**, mediante `scripts/verify-community-samples.mjs`. Los 19 son 7 SCORM, 7 H5P, 3 IMSCC y 2 QTI. Además, se verifican la galería en español e inglés y cuatro rutas cmi5 del fixture Catapult.
- **H5P Interactive Video, comprobación verificable:** MP4 integrado bajo CC BY 4.0, 1280×720, duración 66,016485 s; reproducción real durante 1,571911 s con reloj en avance, `readyState >= 2`, vídeo decodificado y `currentSrc` de tipo `blob:`. El original `.h5p` está embebido sin modificaciones en la fuente derivada, con SHA-256 original y derivado en procedencia. No se abre permiso de red para el reproductor.
- **SCORM 7/7:** navegador muestra el contenido y permite avance en los casos probados; no sustituye certificación de secuenciación SCORM 2004 o persistencia LMS.
- **H5P 7/7:** contenido e interacción básica según actividad, más vídeo con reproducción real comprobada. No se han demostrado todas las interacciones y ramificaciones posibles de los siete cursos.
- **IMSCC 3/3:** página HTML dentro del runtime aislado y navegación entre recursos comprobada donde hay varias páginas. El fixture público `single-page.imscc` tenía el cuerpo HTML vacío. Se **creó expresamente una lección didáctica nueva**, con licencia MIT, y se conservó el archivo de Instructure original dentro del cartucho derivado. No se atribuye el contenido nuevo a Instructure.
- **QTI 2/2:** envío de las dos preguntas de cada paquete, evento `p2lrn:complete` y resultado de coincidencia simple `simpleMatchCorrect`. Las notas son **informativas, no oficiales**; no se afirma cobertura íntegra de QTI 2.2/3.0.
- **cmi5 Catapult 4/4:** las cuatro rutas de pretest/contenido/postest se muestran en Chrome sin violaciones CSP en la ejecución referenciada. No se afirma certificación completa de comunicación xAPI con un LRS en producción.
- **Galería local ES/EN:** presenta los 19 ejemplos, con filtros, búsqueda y enlaces al Player; ambos idiomas pasan.

## Seguridad y origen del último fallo corregido

El error persistente de H5P provenía de documentos HTML **temporales** creados por las bibliotecas, que intentaban insertar `<base href="about:srcdoc">` y generaban violaciones de `base-uri 'none'`. La protección ahora alcanza esos documentos temporales, sin alterar la CSP del iframe principal. La política continúa bloqueando `base-uri`, acceso remoto no autorizado, navegación superior y ejecución arbitraria en el origen de la aplicación. Los archivos de vídeo y sonido se resuelven mediante Blobs verificados dentro del sandbox.

La ejecución `42237187875` también incluye pruebas de seguridad y compilación previas a los tests de navegador. Los fixtures y las fuentes continúan tratados como datos no confiables.

## Publicación verificada e integridad remota

La rama `main` ha recibido exclusivamente los archivos de los 19 ejemplos y las dependencias necesarias del Player, sin fusionar indiscriminadamente los commits divergentes de `mejorastudio`. La previsualización desde `main` aprobó **23/23** pruebas de comunidad [42238231145](https://github.com/josemarcosdzb/p2lrn/actions/runs/42238231145). El workflow de promoción repitió integridad, construcción, seguridad y Chrome antes de enviar el commit `0880c98e`: [42239207540](https://github.com/josemarcosdzb/p2lrn/actions/runs/42239207540).

- Primera comprobación pública [42239906867](https://github.com/josemarcosdzb/p2lrn/actions/runs/42239906867): **19/19 entradas de catálogo** en `https://p2lrn.org` y `https://p2lrn.netlify.app`, más galerías ES/EN y archivos de muestra con HTTP 200.
- Verificación posterior de integridad [42240191054](https://github.com/josemarcosdzb/p2lrn/actions/runs/42240191054): **19/19 paquetes accesibles por HTTP** en ambos nombres de dominio y **SHA-256 de los 19 archivos descargados desde `p2lrn.org` coincidentes exactamente con `provenance.json`**. La dirección Netlify redirige al dominio canónico; se comprueban sus 19 URLs, pero no se descargan los mismos paquetes por duplicado. Ningún archivo ausente ni hash distinto.
- El JavaScript de la galería y las páginas españolas e inglesas respondieron **HTTP 200**.
- La **certificación aquí es de la matriz de ejemplos probada**, no de la conformidad total con los estándares SCORM 2004/QTI 3/cmi5-xAPI, ni de notas oficiales de LMS. Los controles de la galería pueden seguir indicando que no existe certificación de *reproducción completa del estándar*, lo cual no contradice la aprobación de las pruebas funcionales específicas.

## Ejecución reproducible

```sh
node scripts/verify-community-samples.mjs
node deploy/netlify/build-site.mjs
node scripts/verify-site-security.mjs
node scripts/browser-external-format-visual-qa.mjs
node scripts/check-community-public-web.mjs
```

Los tests de navegador requieren Chrome/Edge y el controlador de Playwright instalado por el workflow. Capturas e informes de los jobs de runner local están en `%USERPROFILE%\Downloads\P2LRN-QA-LOCAL\community-browser\<run_id>` cuando se ejecutan allí. El workflow alojado en GitHub guarda el resultado en los logs (sin consumir artefactos de Actions).

**Alcance final:** 30/30 en la matriz de ejemplos; no conformidad universal SCORM 2004, QTI 3 completa, cmi5/xAPI-LRS de producción, firmas de notas ni publicación pública aún certificada.
