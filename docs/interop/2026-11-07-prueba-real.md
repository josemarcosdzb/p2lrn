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

## Actualizacion de interoperabilidad en los LMS (7-11-2026, posterior al informe original)

La tabla anterior documentaba un runner sin DNS funcional. Esta actualizacion conserva esas evidencias historicas y registra las pruebas posteriores ejecutadas en los LMS locales de AulaP2P.

**Causa identificada y correccion AGS:** El contenedor P2LRN tenia entradas ExtraHosts con IP privadas fijas. El nombre de Moodle resolvia a 172.28.0.5, direccion actualmente usada por el contenedor cron, mientras el ingress de Moodle operaba en 172.28.0.6. Por ello las solicitudes OAuth daban ECONNREFUSED. Reescribir solo la URL de fetch hacia el ingress tampoco servia: Host se convertia en el nombre del proxy y Caddy devolvia HTTP 200 sin contenido.

El modulo integration/lms/lti-local-qa-gateway.mjs corrige ese caso de desarrollo con DNS dinamico y node:http, preservando el dominio del LMS en la cabecera Host y los valores de OAuth/JWT. Solo se habilita al ejecutar la CLI con P2LRN_LTI_DEV_INSECURE=true, con nombre DNS interno verificable y direccion privada. La logica de los LMS publicos HTTPS, la validacion de origen, la autorizacion y los scopes no cambian. El gateway es configurable mediante P2LRN_LTI_DEV_LMS_GATEWAY.

**Evidencia:** 44/44 tests LTI aprobados; el proveedor se reinicio sin cambios de recuento (3 plataformas, 73 contenidos, 68 bindings, 33 intentos, 36 estados, 1410 eventos y 2 registros de outbox). Tras desplegar la correccion, el reintento de la nota historica del alumno QA de Moodle (curso 2, recurso LTI 1) fue aceptado por Moodle con HTTP 200, estado SENT y calificacion final de **85/100** confirmada por una consulta directa a la tabla grade_grades. El intento de un administrador del mismo curso, que no esta matriculado con un rol calificable, permanece PENDING: no se fuerza una nota que Moodle debe rechazar.

| Plataforma | Funcionamiento comprobado | Limitacion de certificacion |
|---|---|---|
| Moodle | Curso 6 con 20 enlaces, 19 ejemplos visibles, H5P/SCORM interactivos y AGS oficial confirmado en un curso previo | Falta entrada autenticada como alumno, reanudacion y nota del curso nuevo 6. El acceso del alumno de pruebas se redirige al login de AulaP2P |
| Chamilo | Curso 4 y 20 enlaces existentes | LtiBundle envia LTI-1p0 y el acceso a las actividades redirige a AulaP2P. Falta consumidor LTI 1.3 funcional |
| Sakai | Sitio historico registrado y herramienta global LTI | Crear sitio nuevo con EntityBroker devolvio HTTP 400 por icon URL y guardar el formulario nativo Tool Links fue rechazado por un control CSRF |
| Canvas | Instancia iniciada y accesible | Inventario real: 0 Developer Keys LTI y 0 herramientas externas; registro, despliegue, curso y nota no completados |
| Open edX | Servicio LMS activo y modulo lti_consumer disponible en el contenedor | Registro LTI 1.3, lanzamiento, curso y calificacion sin prueba integral |

**Certificacion de los cinco LMS: pendiente.** Haber corregido un gradebook real de Moodle no acredita cinco LMS, ni la nota de la evaluacion del curso nuevo. El offline y Analytics no quedan certificados integralmente por estas pruebas. No publicar una version denominada definitiva hasta completar las pruebas estudiantiles y sus resultados, preservando el mismo paquete P2LRN, sus identificadores y los historiales.

Evidencias locales verificadas: C:\Users\Usuario\Downloads\P2LRN-CERT-20261107\moodle-ags-gradebook-real.log, provider-status-verificado.json, certificacion-lms-20261107.json, lti-regresion-fix-gateway.log y ver-videos.html. Los archivos de diagnostico en otras plataformas no son certificaciones de lanzamiento.

### Prueba de regresión 3D en el runner Windows

El workflow de Studio correspondiente al commit 00af07d falló en su trabajo quest3d-browser: la prueba intentaba escuchar en 127.0.0.1:8765, que ya estaba ocupado por otro proceso. El error real fue EADDRINUSE, no un fallo demostrado del juego 3D.

Se corrigió el verificador canónico scripts/verify-local-viewer.mjs para reservar dinámicamente tres puertos libres mediante el sistema operativo. La aplicación, el entorno de ejecución aislado y el servicio de colaboración siguen utilizando orígenes HTTP separados. La prueba no cierra otros procesos ni depende de que estén libres 8765, 8766 o 8767.

Tras reconstruir el Player local del commit actual, la prueba real en Chrome para Quest 3D completó ordenación, emparejamiento y clasificación; comprobó persistencia y restauración, los controles móviles a 390 px, el joystick y la entrada a la escena de escritorio. Resultado local: ok=true, con capturas verificadas y el informe quest3d-report.json en la carpeta existente P2LRN-CERT-20261107/quest3d-e2e. La ejecución de CI 42417073924, sobre el commit 151cb98, terminó en success: studio-ui y quest3d-browser completaron sus trabajos sin fallos. La comprobación de CI es adicional a esta prueba local y no certifica por sí sola los cinco LMS.

### Acceso real como alumno y límites del ensayo en Moodle

El alumno QA de la instalación Moodle está matriculado en los cursos 2 y 6. El acceso web ordinario al curso nuevo redirige a la pantalla SSO de AulaP2P, por lo que la prueba con credenciales de alumno no ha completado el inicio de sesión. La función administrativa de Moodle «Log in as» existe, pero el propio Moodle advierte que deshabilita scripts de contenido durante esa sesión por seguridad; no se puede utilizar esa suplantación para certificar H5P o SCORM. No se modificó esta protección, ni se simuló la sesión del alumno.

La única nota AGS oficial verificada corresponde a la actividad del curso histórico 2. Para certificar el curso 6 siguen pendientes el inicio de sesión real del alumno, las actividades completas, la restauración de intentos y su calificación en el libro de Moodle. Para las otras cuatro plataformas siguen siendo aplicables los bloqueos anteriores.

## Auditoría posterior: cinco LMS reales y comprobación de los bloqueos (7 de noviembre de 2026)

Esta sección complementa el resultado histórico anterior, sin atribuir nuevas notas ni sesiones a ningún alumno. Se ejecutó el descubrimiento contra las cinco instalaciones locales existentes, a través del ingress real de AulaP2P, sin modificar cursos ni bases de datos.

### Resultado del descubrimiento sin falsos positivos

| LMS | HTTP del sitio | Salud P2LRN y JWKS públicos desde su dominio | Registro de alumno y nota oficial del curso nuevo |
|---|---|---|---|
| Moodle | Redirección 303 a acceso institucional | Ambos válidos | No probado |
| Chamilo | Página HTML real, 11.310 bytes | Ambos válidos | No probado |
| Sakai | Página HTTP real, 124 bytes | Ambos válidos | No probado |
| Canvas | Redirección HTTP 302 | Ambos válidos | No probado |
| Open edX | Página HTML real, 13.337 bytes | Ambos válidos | No probado |

La disponibilidad de salud/JWKS corresponde al **proveedor P2LRN compartido por el proxy**; no significa que el LMS haya registrado la herramienta, verificado un JWT de alumno ni aceptado una nota. Resultado de certificación E2E: **0/5**. Evidencia sin credenciales: C:\Users\Usuario\Downloads\P2LRN-CERT-20261107\real-destination-preflight.json y lms-network-probe-20261107.log.

Antes de la corrección el comprobador podía clasificar un HTTP 200 con cuerpo vacío como destino alcanzado. scripts/interoperability/lms-http-inspection.mjs distingue contenido real, respuesta vacía, redirección, fallo HTTP, salud auténtica del proveedor y JWKS con claves públicas válidas. Para evitar falsos resultados, no marca ninguna sesión ni nota como aprobada. Sus pruebas verifican también que se eliminen parámetros sensibles de las URL de redirección. Se puede cambiar cada origen de laboratorio sin alterar el curso mediante P2LRN_QA_MOODLE_URL, P2LRN_QA_CHAMILO_URL, P2LRN_QA_SAKAI_URL, P2LRN_QA_CANVAS_URL y P2LRN_QA_OPENEDX_URL.

### Diagnóstico de los bloqueos funcionales que continúan

**Moodle.** El alumno QA (usuario 5) está activo, usa autenticación manual y se encuentra matriculado con rol calificable en los cursos 2 y 6. Una prueba de inicio de sesión ordinaria finalizó en la redirección loginredirect y posteriormente en el SSO de AulaP2P. Esa sesión de alumno no quedó autenticada. La función administrativa «Log in as» no sirve como prueba de H5P/SCORM porque Moodle deshabilita scripts durante la suplantación. La nota 85/100 entregada oficialmente corresponde exclusivamente al curso histórico 2. No se ha entregado la evaluación del curso nuevo 6.

**Sakai.** Se comprobó la administración con una sesión QA existente. La API EntityBroker rechazó la creación del sitio nuevo con HTTP 400 («Invalid address provided for icon URL»), incluso tras revisar sus parámetros. El formulario oficial de Worksite Setup y el de External Tools rechazaron el guardado al faltar estado de token CSRF en esa sesión: el servidor registró «Missing CSRF Token session attribute: doSite_type_option» y «doContentPut». El servicio SOAP existe, pero respondió «Web Services Login Disabled». No se habilitaron accesos alternativos, no se desactivó CSRF y no se creó un sitio duplicado. La administración también advierte que falta lti.encryption.key en la configuración de Sakai; debe resolverse de forma segura antes del uso de secretos en un entorno de producción.

**Chamilo.** El curso y sus 20 enlaces nativos existen. El consumidor LtiBundle observado utiliza un lanzamiento LTI-1p0; esto no constituye una integración LTI 1.3 / Advantage con AGS. Requiere la compatibilidad/configuración real del LMS, no cambiar el encabezado de una petición para simular 1.3.

**Canvas.** La instalación y el proxy responden, pero la auditoría de Rails mostró 0 Developer Keys y 0 herramientas externas. Debe registrarse una clave de herramienta LTI Advantage con su despliegue y permisos oficiales antes del ensayo de notas.

**Open edX.** El LMS funciona y dispone del consumidor lti_consumer, pero no hay registro P2LRN bidireccional, contexto de curso, alumno ni entrega AGS real probados.

### Metodología y conservación de evidencias

El workflow histórico de un curso específico permanece disponible solo cuando se inicia manualmente. Los pushes ordinarios ejecutan exclusivamente el inventario no destructivo y 11 pruebas de regresión, almacenando la salida temporal en RUNNER_TEMP y no creando nuevos directorios P2LRN-INTEROP por commit. No se modifican los paquetes .p2lrn originales, sus hashes, las 68 vinculaciones existentes ni los resultados de alumnos.

**Criterio de publicación definitiva:** cinco lanzamientos LTI 1.3 firmados y autenticados desde los propios LMS, interacción y reanudación de alumno en el paquete idéntico, nota oficial AGS leída del libro de cada plataforma y pruebas de web/Windows sin conexión, sin modificar el mismo curso para cada destino. Este criterio sigue pendiente. No se debe crear una etiqueta final ni describir P2LRN como certificado integralmente mientras no exista esa evidencia.

### Evidencia adicional: identidad del paquete maestro entre tres LMS

Se comprobó directamente con el validador oficial Toolkit el archivo maestro ya existente en studio-master/seguridad-informatica-con-autoria.p2lrn, de 1.080.413 bytes. SHA-256: 957c716b9282fc9289f0256c5daf90ae5eea0210699478f76406e01340018631. contentRoot: sha256:e64e587b8584d836e3b73edc9c753971f6a9032bea6d89205db6b0a6b076870a. El grafo contiene 11 entidades publicables.

Una consulta de solo lectura al catálogo SQLite persistente del proveedor comprobó tres publicaciones PUBLISHED con el mismo SHA, la misma raíz y el mismo tamaño: tenants moodle-qa, chamilo-qa y sakai-qa; cada registro maestro cuenta con una vinculación publicada. Los tres manifiestos de enlaces existentes coinciden también en la entidad principal. Este paquete maestro **no tiene los mismos bytes** que el primer archivo histórico sin autoría y no debe confundirse con él.

El resultado prueba publicación/identidad del paquete en P2LRN para los tres LMS, **no** importación o reproducción completa dentro de ellos. En particular, Sakai todavía no ha confirmado un enlace de sitio nuevo por la protección CSRF. La evidencia offline existente descargó un fichero p2lrn-result, pero no demuestra calificación oficial y presenta una incidencia de página; tampoco constituye una prueba completa aprobada. No se modificó ni reexportó el maestro para esta verificación.

### CI después de la corrección

GitHub Actions ejecutó el run 42421026536 sobre el commit b1d54dafa026755e72bd5bb1fac9d2f132f5c219 con resultado success en discover-real-lms. Los otros seis trabajos de creación o interacción con el curso histórico quedaron correctamente omitidos porque el evento fue push y requieren workflow_dispatch. Este verde certifica únicamente la auditoría de conectividad y sus regresiones, no los cinco recorridos E2E.
