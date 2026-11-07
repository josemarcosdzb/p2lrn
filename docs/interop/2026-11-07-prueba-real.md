# Interoperabilidad P2LRN: prueba real de curso único

**Fecha:** 7 de noviembre de 2026. **Rama:** `mejorastudio`. **Regla:** una única exportación de cada versión, ningún paquete adaptado para un LMS, ninguna nota oficial atribuida a pruebas sin autenticación real.

Este informe distingue **contenido cargado**, **interacción completada por un alumno** y **certificación de plataforma con registro del LMS**. Un test unitario o la mera apertura de un `iframe` no acreditan interoperabilidad integral.

## Paquetes originales fijados

| | Versión 1 | Versión 2 |
|---|---|---|
| Nombre | `seguridad-informatica.p2lrn` | `seguridad-informatica-v2.p2lrn` |
| SHA-256 | `cce43503ea425ec4f1e6203c8ef6556beb999e71c08e59d5511091a6b931a380` | `7a5ae25e161c78c08805e2e08973786919ac0283c315b9bf106a94a5acb04092` |
| Bytes | 1.080.127 | 1.080.148 |
| `contentRoot` | `sha256:e0fb13f5092e0d1d9cf6cf552632279b30bf89c6364662b1dbdf5cfe80804323` | `sha256:a2d9b2dc395443edd46de415d8f38543a877fcaec860d60ccb61193cc12b4823` |

Ambos se crearon y exportaron mediante el **Studio real en Chrome sobre Windows**, no mediante construcción directa del grafo. La versión 1 contiene siete actividades y recursos de texto, tabla, imagen, vídeo, arrastrar y soltar, emparejar, autoevaluación, H5P y SCORM, y evaluación final con corrección del Host. Se importaron los envoltorios P2LRN originales de pruebas de H5P y SCORM, conservando sus bytes; **esto no demuestra todavía la importación directa de cualquier archivo bruto .h5p/.zip**. El sistema guardó 12 etapas de autoría y capturas en Windows.

La versión 2 se obtuvo **abriendo la versión 1 en Studio**, cambiando una pregunta de la autoevaluación, exportando otra vez y abriéndola en el mismo Player web. Los **18 identificadores de entidades se mantuvieron**; cambió `contentRoot`. El archivo original no se modificó. **No se ha demostrado la conservación de los resultados antiguos en un LMS** porque ningún Host LMS autenticado estaba disponible.

**Evidencia v1:** `C:\Users\Usuario\Downloads\P2LRN-INTEROP-0474eb9b\`

**Evidencia v2:** `C:\Users\Usuario\Downloads\P2LRN-INTEROP-V2-7fe9f0b7\`

## Web independiente: interacción real de alumno

En Chrome se sirvió la versión 1 sin alterar un byte: SHA-256 idéntico al original.

| Actividad | Estado verificado | No demostrado |
|---|---|---|
| Lección multimedia con tabla, imagen, vídeo y drag/drop | En el iframe real se seleccionaron y colocaron correctamente **2 fichas**: se mostró «Actividad completada» | Evento de puntuación/progreso acreditado por Host |
| Segunda lección | Contenido abre en iframe | Retorno y persistencia |
| Relacionar (3 parejas) | Alumno conectó las tres parejas y terminó, puntuación local normalizada 1 | AGS oficial |
| Cuestionario | Alumno respondió y finalizó, puntuación local normalizada 1 | Nota almacenada en Host |
| H5P | Se abrió el **H5P real** «Arithmetic quiz example - addition» y se pulsó «Start»; comenzó la cuenta atrás | Responder y completar todas las preguntas, conservar puntuación y resultado |
| SCORM 1.2 | **Seis etapas recorridas con la interfaz real; cuatro respuestas enviadas con «Submit answers»; API SCORM 1.2: `lesson_status=passed`, `cmi.core.score.raw=100`** | Transferencia y conservación de esa nota en un LMS real, reanudación SCORM |
| Evaluación final | Alumno respondió y envió | Nota aprobada; el Player correctamente no mostró calificación oficial |

**Resultado medido:** cinco de siete actividades admitieron finalización o envío de interacciones reales: drag/drop (2/2 destinos), relacionar (3/3), cuestionario de autoevaluación, evaluación final (sin mostrar nota oficial) y **SCORM completado con 100 puntos en su propia API**. H5P comenzó y aceptó respuestas, pero no se completó; la segunda lección cargó sin prueba de reanudación. El Host web de ejemplo no ofrece por defecto persistencia. La prueba independiente de Host local sí demostró recuperar una respuesta, pero no LTI/AGS. El Host web de ejemplo tiene `player.adapter = null`; por tanto, **la reanudación y los resultados oficiales no están certificados**.

**Evidencia:** `C:\Users\Usuario\Downloads\P2LRN-INTEROP-WEB-ad6cc4e3\independent-web-student-report.json` y `web-student-evidence\*.png`.

### Web independiente con adaptador de estado

Como comprobación adicional, se conectó el Player al **adaptador oficial de Host** y a un servidor de pruebas de sesión local: un alumno respondió una pregunta; el servidor guardó el borrador; al abandonar y volver a cargar la página Chrome restauró esa respuesta. Otra sesión no pudo leer ese borrador. El Host respondió HTTP **403** al intento de registrar desde el navegador una nota supuestamente oficial; el contador de notas verificadas se mantuvo en **0**. Se notificó la nota de autoevaluación únicamente como **dato sin verificar**.

**Importante:** el Host utilizado es **un servicio local de pruebas** (sesiones en memoria, no conectado a ningún LMS ni a una base de datos productiva). Esta prueba acredita reanudación de una respuesta tras recargar la web, aislamiento entre sesiones de prueba y rechazo de un intento de suplantación de nota **en dicho servidor**, pero **no** conservación ante reinicio del servidor, LTI/AGS, ni grado oficial. El contenido del curso no se alteró. [Ejecución real](https://github.com/josemarcosdzb/p2lrn/actions/runs/42365432381).

**Evidencia de sesiones y ataque:** `C:\Users\Usuario\Downloads\P2LRN-INTEROP-REENTRY-09aeaa7f\independent-web-reentry.json` y dos capturas en `web-resume-screenshots`.

El primer inspector de iframes no accedió a sus documentos. El segundo, ejecutado en Windows con **Chrome DevTools conectado a los procesos realmente aislados** (OOPIF), permitió completar la actividad de arrastre y avanzar parcialmente dentro de H5P y SCORM. **Acceder al contenido interno no significa que los estándares externos hayan completado el curso**. Evidencia nueva: `C:\Users\Usuario\Downloads\P2LRN-INTEROP-FRAMES-348e8245\real-subframe-interactions.json` y capturas `frame-captures\*.png`; [ejecución de Chrome](https://github.com/josemarcosdzb/p2lrn/actions/runs/42364924854).

## LMS y LTI 1.3

El inventario se ejecutó en el **runner Windows real**, no en un servidor simulado:

| Destino | Resultado | Estado de certificación |
|---|---|---|
| Moodle | `jose-moodle-qa-20261017.localhost`: DNS `ENOTFOUND`; comprobación de `127.0.0.1:80` con Host respondió 200 con cuerpo vacío | NO PROBADO |
| Chamilo | `chamilojose.localhost`: mismos bloqueos | NO PROBADO |
| Sakai | `josesakai.localhost`: mismos bloqueos | NO PROBADO |
| Canvas | URL de laboratorio no configurada en este runner | NO PROBADO |
| Open edX | URL de laboratorio no configurada en este runner | NO PROBADO |

El proveedor `p2lrn-lti.localhost` tampoco resolvió. El HTTP 200 de cuerpo vacío **no es evidencia de que un LMS funcione**. No se ha ejecutado un lanzamiento autenticado LTI, AGS, matriculación, reingreso, entrega de notas ni importación de resultados reales. Ningún LMS está aprobado.

**Evidencia:** `C:\Users\Usuario\Downloads\P2LRN-INTEROP-<SHA del run>\real-destination-preflight.json`.

## Windows sin conexión y seguridad de resultados

El curso original **sí es compatible con el modelo de entrega offline** (`inspectOfflineAssignmentCompatibility.ok = true`). Sin embargo, **no contiene autor ni titular de derechos**, y el exportador oficial exige ambas procedencias. No se generó una entrega offline falseando esos datos. Resultado de Windows offline: **BLOQUEADO POR METADATOS DE AUTORÍA**, no aprobado.

Comprobación real: la alteración de bytes de una copia de la versión 1 fue rechazada por el validador oficial. Esto demuestra integridad del paquete, **no autenticidad de notas del alumno**. Un hash recalculable en un archivo controlado por el alumno no basta para certificar una calificación offline; la firma de la entrega acredita al docente/Host que distribuyó el paquete, no que la puntuación sea auténtica. La recepción/verificación autoritativa de `.p2lrn-result` sigue sin probar.

## Criterios de aceptación

| Criterio | Resultado actual |
|---|---|
| Un mismo SHA-256 en todos los destinos para cada versión | Confirmado únicamente entre exportación Studio y web independiente |
| Adaptaciones por LMS | **0 realizadas**, porque ningún LMS pasó la fase de conexión |
| 100 % de las actividades completadas | **No**: 5/7 con finalización/envío de respuestas; SCORM finalizado con estado `passed` y puntuación 100 en su API. H5P y reanudación SCORM siguen pendientes; la evaluación final no recibió nota oficial. |
| 100 % de progresos, reanudaciones y notas oficiales | **No**: recuperación de una respuesta aprobada con Host local de pruebas; reinicio del Host, LMS y notas oficiales pendientes |
| 5 LMS reales + web + Windows sin conexión | **0/7 destinos certificados integralmente** |
| Manipulación no puede crear calificaciones oficiales | **No demostrado**; falta Host autoritativo y prueba de ataques contra su integración |
| V2 con una pregunta actualizada y v1 intacta | **Sí, en Studio y en Player web** |
| Resultados previos preservados tras migrar v2 | **Pendiente de LMS/Host con resultados reales** |

### Para cerrar la certificación

Hacen falta cinco instalaciones LMS accesibles desde el runner, sus registros LTI 1.3 y permisos AGS con alumnos de prueba; configurar un Host real de persistencia y aprobación de notas para la web independiente; completar autoría y titularidad desde Studio antes de firmar la entrega offline; completar las diez preguntas H5P y validar persistencia/reanudación de SCORM (su actividad y nota interna ya se completaron); y probar restauración de intentos tras sustituir v1 por v2 sin borrar el historial del Host.

**Ejecuciones verificables en GitHub:** [creación real y SHA](https://github.com/josemarcosdzb/p2lrn/actions/runs/42363679207), [alumno web](https://github.com/josemarcosdzb/p2lrn/actions/runs/42364114504), [v2 y offline](https://github.com/josemarcosdzb/p2lrn/actions/runs/42364493157), [interacción real de los iframes](https://github.com/josemarcosdzb/p2lrn/actions/runs/42364924854), [SCORM completado con su examen](https://github.com/josemarcosdzb/p2lrn/actions/runs/42365934787). El código de QA está en `scripts/interoperability/` y su workflow en `.github/workflows/p2lrn-interoperability-real.yml`.
