# Validación de ejemplos externos P2LRN — 6 de noviembre de 2026

**Estado: NO CERTIFICADO EN SU TOTALIDAD / NO DESPLEGADO PÚBLICAMENTE.**

Se conservaron los 19 contenedores auténticos de `examples/canonical/external/free`: siete SCORM, siete H5P, tres IMS Common Cartridge y dos QTI propios. Todos contienen su fuente original, licencia declarada y hashes en `provenance.json`. No modificar `browserVerified` a `true` sin pruebas suficientes.

## Evidencia comprobable

1. **Integridad y original preservado: 19/19**, flujo `42205875698` (success): https://github.com/josemarcosdzb/p2lrn/actions/runs/42205875698.
2. **Chrome/Edge real con CSP y contenido dentro de iframes: 20/30 comprobaciones PASS, 10 FAIL**, flujo `42206468554`: https://github.com/josemarcosdzb/p2lrn/actions/runs/42206468554. Incluye dos galerías con filtros/búsqueda, ejemplos previos y 21 ejecuciones de los 19 paquetes (las dos preguntas QTI también se comprueban por separado).
3. **SCORM de la colección: 7/7** tienen botón de avance comprobado con cambio de contenido. Esto no constituye certificación de conformidad SCORM 2004, persistencia ni seguimiento LMS.
4. **H5P: 4/7** tuvieron interacciones básicas exitosas (Column, Crossword, Drag and Drop, Question Set); **3/7 no aprobaron la prueba CSP** por rutas de audio URN y restricciones del vídeo (Arithmetic Quiz, Course Presentation, Interactive Video). Interacción no equivale a calificación xAPI autorizada.
5. **QTI: 2/2 paquetes** demostraron selección de respuesta en **sus cuatro preguntas**, evento `p2lrn:complete` y evaluación simple `simpleMatchCorrect`. El resultado es informativo: **no** certifica procesamiento QTI completo ni notas oficiales.
6. **IMSCC: 0/3** aprobaron como experiencia navegable en ese run. Se encontró que Canvas deja recursos `webcontent` válidos sin referenciar desde `<organizations>`; el Player ignoraba esos recursos.
7. **cmi5 existente (Catapult): 0/4 comprobaciones** debido a bloqueos de manejadores inline en CSP de la integración de paquetes. Son fixtures externos a los 19 paquetes del catálogo, pero siguen siendo un riesgo de interoperabilidad.
8. **Web pública**: auditoría `42205548318` con 0/19 nuevos ejemplos presentes y la nueva galería JS con 404 en `p2lrn.org` y en Netlify: https://github.com/josemarcosdzb/p2lrn/actions/runs/42205548318.
9. **Preflight producción**: `main` diverge de `mejorastudio`; probar solo los archivos visibles falla por dependencias faltantes del nuevo Player (`execution-negotiation.js`, y previamente `qti-compatibility.js`). Los tests `42206816773`, `42207332818` y `42208130507` **no** autorizan el despliegue de `main`.

## Correcciones incorporadas después del run visual, pendientes de una nueva prueba completa

- Player: recuperación de páginas HTML reales de IMSCC presentes en ZIP pero sin entrada de navegación en `<organizations>`; se exponen como recursos navegables, en sandbox, sin cambiar la fuente `.imscc` ni el SHA-256 del `.p2lrn`.
- Registrador de renderizadores: usar runtime de ZIP aislado para el perfil `web-content` cuando la representación es un HTML contenido dentro de un cartucho.
- H5P: resolución de medios de bibliotecas empaquetadas, incluidos nombres `urn:p2lrn:.../libraries/...`, mediante URL Blob de recursos realmente existentes; los enlaces remotos de vídeo deben tener restricciones de seguridad explícitas.
- Sitio: conservar `p2lrn-results-index.mjs` durante la copia de ejemplos para evitar enlaces rotos. El build de Skills dejó de requerir seis archivos de presentación que no existen ni se distribuyen.
- QA: ruta inglesa canónica `/en/docs/examples/`, verificación de carga real (no mensajes temporales), pruebas de avance SCORM, respuestas QTI y filtro de los 19 ejemplos. Capturas e informes locales en `%USERPROFILE%\Downloads\P2LRN-QA-LOCAL\community-browser\<run_id>` y `production-candidate\<run_id>`.

**Estas correcciones NO deben anotarse como verificadas solamente por existir en Git.** Cada una requiere comprobar en Chrome el paquete concreto con su reproducción, los posibles eventos, recursos multimedia y ausencia de errores de CSP.

## Requisitos para un despliegue aceptable

La publicación no debe mezclar a ciegas las ramas. Ejecutar la previsualización de `main` con los cambios estrictamente necesarios, pasar la compilación completa, seguridad y la matriz funcional de 19 ejemplos y validar navegación/medios del IMSCC/H5P. Después del despliegue se debe repetir el chequeo en `p2lrn.org` y Netlify, porque un paquete compilado localmente no demuestra disponibilidad pública.

Comandos desde la raíz de un checkout autorizado:

```sh
node scripts/verify-community-samples.mjs
node deploy/netlify/build-site.mjs
node scripts/browser-external-format-visual-qa.mjs --community-only
node scripts/check-community-public-web.mjs
```

La integridad SHA-256 no es firma de calificaciones. No se ha probado la conformidad completa SCORM 2004, la secuenciación cmi5/xAPI ni el motor universal QTI 3.
