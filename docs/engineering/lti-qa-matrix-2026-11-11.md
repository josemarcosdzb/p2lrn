# P2LRN LTI — plan de pruebas de concurrencia e integración
Revisión: 2026-11-11. Destino: `josemarcosdzb/p2lrn`, rama `main`.

**Estado: pruebas escritas y conectadas a CI; ejecución y certificación pendientes.**
La primera fase separa el acceso externo a SQL del hilo HTTP. No elimina
todavía los bloqueos globales ni convierte un store en una solución
multinstancia. Este documento no presenta como resultados las expectativas
de los tests.

## 1. Entorno y límites operativos

El modo normal usa SQLite de pruebas, en un directorio temporal. Los SQL
externos solo se usan mediante un consentimiento explícito del *harness*:
`P2LRN_TEST_LTI_ASYNC_ENABLE=YES` y
`P2LRN_TEST_LTI_ASYNC_ENGINE=postgres|mysql|mariadb|sqlserver`.
Se exige la variable `P2LRN_TEST_<ENGINE>_URL`, con host loopback y nombre
de base `p2lrn_test` o `p2lrn_qa` (o sufijo seguro); el guard
`integration/lms/lti-test-sql-guard.mjs` rechaza dominios remotos,
bases empresariales y motores incongruentes antes de abrir conexiones.

Los trabajos existentes de `.github/workflows/p2lrn-portable-verification.yml`
utilizan contenedores de SQL en **GitHub-hosted Ubuntu**. No usar el
runner Windows personal ni reutilizar instancias de LMS de AulaP2P
para las pruebas destructivas. Ninguna prueba de esta fase requiere
Kubernetes, muchas réplicas, k6 o datos de alumnos.

Límites concretos: un solo motor real por invocación, dos stores externos,
seis escrituras CAS concurrentes, ocho peticiones de cuota y una prueba
separada de 136 lecturas SQLite para comprobar el límite exacto de 128
operaciones simultáneas. Espera sobre un bloqueo SQLite de 180 ms.
Timeout de la prueba de motor real: 150 s; los servicios hospedados tienen
un timeout de job. No se simulan miles de usuarios ni se consume un
archivo grande para esta validación.

## 2. Casos codificados

| ID | Qué se comprueba | Oráculo de aceptación | Ejecutable |
| --- | --- | --- | --- |
| Q01 | OIDC: consumo de `state` simultáneo | 1 aceptado de 8, 7 denegados | `lti-async-store.test.mjs` |
| Q02 | Limitador de solicitudes | 3 admisiones de 12; 9 denegadas | `lti-async-store.test.mjs` |
| Q03 | Guardado concurrente CAS | 1 revisión confirmada de 8; 7 conflictos | `lti-async-store.test.mjs` |
| Q04 | Reintento tras respuesta perdida | Estado idéntico, revisión no incrementada | `lti-async-store.test.mjs` |
| Q05 | Eventos idempotentes | Solo un evento guardado con el mismo ID | `lti-async-store.test.mjs` |
| Q06 | Calificación en outbox | Una fila `PENDING`, mismo ID al repetir, sin entrega automática | `lti-async-store.test.mjs` |
| Q07 | Reiniciar proceso de almacenamiento | Sesión, revisión y nota pendiente persistentes | `lti-async-store.test.mjs` |
| Q08 | Aislamiento institucional | Binding ajeno devuelve null | `lti-async-store.test.mjs` |
| Q09 | Espera SQL real en otro hilo | El temporizador principal sigue avanzando durante bloqueo de escritura | `lti-async-store.test.mjs` |
| Q10 | Contrapresión | 128 trabajos admitidos, 8 `LTI_DB_BUSY`; lectura posterior válida | `lti-async-store.test.mjs` |
| Q11 | Configuración inválida | Error cerrado, sin convertir PostgreSQL en SQLite | `lti-async-store.test.mjs` |
| Q12 | Seguridad del destino de prueba | Bloquear host remoto, nombre de base de producción, motor incorrecto | `lti-test-sql-guard.test.mjs` |
| Q13 | LTI legado con nonce SQL asíncrono | Verificado al aceptar; replay y error de DB denegados | `lti-legacy.test.mjs` |
| Q14 | Motores SQL reales, dos conexiones | OIDC único, CAS, limitador global, AGS sin duplicados, reinicio | `lti-async-sql-live.test.mjs` |
| Q15 | E2E LTI 1.3 HTTP sobre SQL asíncrono | Firma JWT/Deep Linking, profesor, alumno, estado, AGS y revocación | `lti-server.test.mjs` |

Q01–Q13 se ejecutan sin SQL externo; Q14 requiere cada una de las
cuatro bases auténticas. Q15 reutiliza la prueba HTTP **real existente**
con un modo de persistencia externa optativo. Actualmente está preparado
en CI para PostgreSQL, después de compilar Toolkit y Player. Para
certificar paridad funcional de los otros SQL, Q15 deberá repetirse
en MySQL, MariaDB y SQL Server con el runtime construido.

## 3. Recorrido funcional del profesor y alumno (Q15)

1. El administrador registra una plataforma aprobada, con despliegue
   único, JWKS y URL HTTPS. Sin token administrativo: 403.
2. El profesor obtiene una petición OIDC firmada, entra en Deep
   Linking, elige el recurso y recibe un JWT firmado por P2LRN.
3. Se publica un `.p2lrn` real desde el picker. Se comprueban bytes
   idénticos a la fuente en la descarga al Player y vinculación al
   `contentRoot`, sin conversión silenciosa.
4. El alumno entra con identidad LTI, cookie y CSRF válidos y guarda
   progreso. Al volver a entrar por LTI recupera el mismo intento y
   revisión; repetir un guardado reconocido no lo duplica.
5. La nota comunicada por el navegador no es oficial. Una
   autorización del servidor genera outbox; el flujo de prueba AGS
   comprueba OAuth y envío con respuesta LMS controlada.
6. Reproducir `state` o ticket de docente, cruzar tenant/despliegue,
   retirar CSRF, pedir otro recurso y revocar la plataforma provoca
   denegación. Los errores no filtran JWT ni secretos.

El endpoint LMS AGS de Q15 usa un servidor simulado por la prueba:
**verifica la petición emitida, no una anotación real en el libro oficial
de un Moodle/Canvas/Sakai/Chamilo/Open edX**. Esa verificación permanece
como gate adicional separado.

## 4. Escenarios que no deben omitirse

| Fallo | Comportamiento seguro esperado | Estado |
| --- | --- | --- |
| SQL inaccesible antes de arrancar | No escuchar ni anunciar disponibilidad | Parcial Q11; conexión real pendiente |
| SQL se bloquea momentáneamente | HTTP responde a otras solicitudes, sin perder consistencia | Q09 demuestra aislamiento de worker SQLite |
| SQL cae con un guardado en vuelo | Cliente recibe fallo; retry verifica si ya se confirmó | Pendiente fault injection SQL |
| Node/worker muere entre commit y respuesta | Dato confirmado recuperable tras reinicio; sin doble avance | Parcial Q04/Q07, caída forzada pendiente |
| LMS AGS responde tarde o pierde respuesta | Reintento controlado, estado reconciliado, sin nota doble | Pendiente cola duradera |
| Una institución cambia roles o despliegue | Sesiones anteriores revocadas; ningún acceso cruzado | Cubierto por Q15 SQLite; repetir SQL externo |
| Publicación de ZIP grande o ZIP malicioso | Límite de tamaño, integridad y rechazo sin alterar catálogos | Tests de seguridad existentes; carga aislada pendiente |
| Dos servidores con almacenamiento local | Configuración denegada, no divergencia de cursos | Pendiente desarrollo de almacenamiento compartido |
| Migración SQL durante arranque simultáneo | Una migración coordina, demás esperan sin perder datos | Pendiente migrador coordinado |

No confundir pruebas de continuidad de datos con publicación real en un
LMS ni con resistencia de un clúster. Los tests de SQL reales no
emplean `DROP DATABASE`, `TRUNCATE`, ni borran información ajena: los
IDs de alumnos, centros, cursos y puntuaciones son aleatorios y de prueba.
Las bases efímeras se destruyen al terminar el job alojado.

## 5. Evidencia y criterios de aceptación

Los gates para esta fase son:

- **G0 sintaxis/SQLite:** todos los tests dirigidos y controles de
  seguridad anteriores verdes, sin omisiones no justificadas.
- **G1 SQL real:** Q14 verde individualmente en PostgreSQL, MySQL,
  MariaDB y SQL Server; ninguna sustitución por SQLite.
- **G2 recorrido HTTP:** Q15 verde en SQLite y PostgreSQL. Para
  considerar cada uno de los cinco motores conforme con el nuevo camino
  asíncrono, repetir Q15 contra los cuatro externos.
- **G3 instalación npm:** tarball limpio desde npm, configuración
  por consola, PostgreSQL/MySQL/MariaDB/SQL Server/SQLite, reinicio, JWKS
  y permisos de secretos. Sin publicación por esta prueba.
- **G4 E2E LMS:** publicación de un curso nuevo, apertura en
  profesor y alumno, progreso real y entrega de nota al libro del LMS
  en Moodle, Canvas, Chamilo, Sakai y Open edX, según sus capacidades
  LTI habilitadas, con sesiones autorizadas.
- **G5 resistencia:** caídas/reintentos inducidos, recuperación
  duradera, observabilidad, migración multinstancia y almacenamiento
  compartido. Pendiente cambios de arquitectura.
- **G6 escala:** baseline, pruebas progresivas de 100, 500, 1.000,
  5.000 y opcionalmente 10.000 usuarios virtuales en infraestructura
  de ensayo independiente; **no ejecutar sobre el equipo personal**.

En cualquier nivel: cero progresos confirmados perdidos, cero replays
OIDC admitidos, cero autorizaciones ajenas y cero notas indebidas.
Las métricas de p95/p99, latencia de guardado, saturación y errores
deben medirse antes de fijar umbrales razonables, con un objetivo inicial
de 99,9 % de solicitudes válidas exitosas en la carga sostenida.
Parar las pruebas si la cola crece persistentemente, los tiempos
se deterioran, SQL se satura o se pierde integridad; no forzar hasta
un fallo del equipo.

Guardar por ejecución: SHA exacto, workflow/run URL, versión Node/SQL,
número de tests aprobados/rechazados/omitidos, CPU/RAM y tiempos,
logs depurados de secretos, errores y riesgo de rollback.
Un commit o un test escrito **no cuenta como test aprobado**.

## 6. Ejecución segura

```bash
# Solo SQLite temporal, CPU/memoria limitados:
node --test --test-concurrency=1 integration/lms/lti-async-store.test.mjs integration/lms/lti-test-sql-guard.test.mjs integration/lms/lti-legacy.test.mjs

# Solo en el job PostgreSQL hospedado, sobre su base desechable:
P2LRN_TEST_LTI_ASYNC_ENABLE=YES P2LRN_TEST_LTI_ASYNC_ENGINE=postgres \
  node --test integration/lms/lti-async-sql-live.test.mjs

# Cuando Toolkit y Player estén compilados en el job de PostgreSQL:
P2LRN_TEST_LTI_ASYNC_ENABLE=YES P2LRN_TEST_LTI_ASYNC_ENGINE=postgres \
  node --test integration/lms/lti-server.test.mjs
```

El CI global, cualquier `npm publish`, las migraciones de producción
y el despliegue siguen siendo actuaciones distintas que requieren sus
propios gates. No ejecutar k6 masivo antes de completar G0–G5.

## 7. Validación real de profesores y alumnos en los cinco LMS (gate G4)

**Esta es la prueba determinante, actualmente NO_TESTADA en su recorrido
integral.** No la sustituye `lti-server.test.mjs`, el trabajo de
conectividad, el test de un Host web independiente ni la prueba de
publicación por `/lti/admin/catalog`. Se exige interacción real con la
interfaz del **LMS**, sesiones de profesor y alumnos distintas y el Player
dentro de una actividad LTI auténtica del LMS.

### Precondiciones comunes

- Utilizar el **mismo instalador npm del Provider**, registrarlo una vez
  en el LMS y conservar esa configuración durante los siguientes cursos.
  Registrar las versiones del Provider npm, Player, Toolkit y LMS. La
  prueba se bloquea si el Provider del registro npm aún no es instalable
  desde la versión aprobada; se puede ensayar un tarball exacto como
  candidato, pero se etiqueta `CANDIDATO_NO_PUBLICADO`.
- Dos cursos `.p2lrn` auténticos, **A** y **B**, exportados de Studio
  mediante su interfaz, con `packageId`, `contentRoot` y SHA-256
  registrados y distintos. No editar ni convertir el archivo por LMS.
  Cada curso incluirá lección, cuestionario evaluable y, cuando el
  contenido de ese curso lo permita, actividad 2D/3D/H5P/SCORM.
- Un profesor y **dos alumnos de pruebas separados por LMS**. Son
  identidades LMS realmente autenticadas y autorizadas; ningún JWT
  fabricado, cookie prestada o login administrativo sustituye al alumno.
  No guardar credenciales, JWT, nombres personales ni PII en evidencias.
- Instancia aislada y estable, sin alumnos reales, con acceso a la página
  del LMS, libro de calificaciones, Provider y registro LTI.
  No instalar otro Provider por cada curso. Si un LMS solo ofrece
  vinculación manual o LTI legado, registrar el límite exacto de esa
  versión: no etiquetar como Deep Linking/AGS 1.3 algo que no lo es.

### Casos concretos que debe superar cada plataforma

| ID | Rol y acción en interfaz | Resultado verificable |
| --- | --- | --- |
| R01 | Administrador instala Provider y configura LTI **una vez** | Registro persistente, misma identidad/clave y despliegue durante R02–R12 |
| R02 | Profesor entra al LMS, abre su curso y pulsa añadir herramienta externa P2LRN | Selector real de Deep Linking y rol docente validado |
| R03 | Profesor **sube A desde ese selector** (no por la API administrativa), elige contenido y guarda | Actividad visible en el curso LMS, enlace firmado, catálogo y hash correctos |
| R04 | Profesor **sube B desde el mismo LMS** sin entrar a configuración administrativa | Segunda actividad independiente, mismo Provider, hash B distinto de A |
| R05 | Alumno 1 inicia sesión en LMS y abre A | Player real visible dentro del LMS, imágenes y recursos cargados, sin credenciales técnicas |
| R06 | Alumno 1 lee la lección, contesta las preguntas y pulsa **Finalizar/Enviar** | Respuestas persistidas y resultado visible; interacción de cuestionario observada, no simple HTTP 200 |
| R07 | Alumno 1 realiza la actividad 2D/3D/H5P/SCORM de A si la incluye | Interacción y resultado real; guardar captura/vídeo del estado final, no imagen de entrada |
| R08 | Alumno 1 sale y vuelve a abrir A desde LMS | Se recuperan respuestas, avance, revisión e intento apropiado, sin repetir instalación |
| R09 | Alumno 2 abre A, falla una respuesta y completa la actividad | Intento y nota propios, sin mostrar progreso ni respuestas del alumno 1 |
| R10 | Ambos alumnos abren B y realizan el cuestionario | Identidad, permisos, progreso y contenido independientes de A |
| R11 | Docente consulta el **libro oficial de notas del LMS** | Calificación de cada alumno y actividad identificada correctamente, con valor comprobado frente a resultado aprobado en Provider y AGS/Basic Outcomes realmente soportado |
| R12 | Profesor actualiza B o copia la actividad dentro de LMS | Se conserva identidad del contenido publicado y no se mezclan intentos; la nota no se duplica ni se dirige a otro recurso |

Una plataforma solo aprueba G4 si R01–R12 y los controles de seguridad
aplicables tienen evidencia, o si una capacidad optativa se marca
explícitamente `NO_APLICA` con su razón técnica demostrada. Si una
actividad evaluable no puede devolver la nota oficial cuando esa era una
condición de aceptación, la plataforma queda `FAIL` o `BLOQUEADA`,
**nunca PASS**.

### Comprobaciones negativas obligatorias

1. Alumno no matriculado, despliegue no registrado o recurso de otra
   institución: acceso denegado. No usar un enlace directo a P2LRN para
   sortear el LMS.
2. Replay de OIDC, ticket de profesor gastado, token expirado y CSRF
   incorrecto: denegación sin crear otra actividad/intento.
3. Desconexión breve mientras se guarda: reentrada que conserva lo ya
   confirmado; revisión conflictiva no sobrescribe otra respuesta.
4. Alumno manipula una puntuación o reenvía evento: el libro oficial no
   acepta una nota sin verificación del servidor.
5. Repetir una entrega AGS aprobada, incluida respuesta LMS perdida:
   comprobar el **libro del LMS**, no solo que la cola local diga
   `SENT`. Sin duplicados ni sobrescrituras entre alumnos.
6. Publicación A/B durante reinicio controlado del Provider: archivos,
   vínculos, sesiones recuperables y registros coherentes. Solo
   ejecutarlo en entorno descartable y con recuperación preparada.

### Matriz de certificación obligatoria

| Plataforma | Profesor publica A y B | Alumno 1 y 2 completan A/B | Reentrada y aislamiento | Nota en libro oficial | Certificación |
| --- | --- | --- | --- | --- | --- |
| Moodle | NO_TESTADO | NO_TESTADO | NO_TESTADO | NO_TESTADO | NO_TESTADO |
| Canvas | NO_TESTADO | NO_TESTADO | NO_TESTADO | NO_TESTADO | NO_TESTADO |
| Chamilo | NO_TESTADO | NO_TESTADO | NO_TESTADO | NO_TESTADO | NO_TESTADO |
| Sakai | NO_TESTADO | NO_TESTADO | NO_TESTADO | NO_TESTADO | NO_TESTADO |
| Open edX | NO_TESTADO | NO_TESTADO | NO_TESTADO | NO_TESTADO | NO_TESTADO |

Los estados anteriores describen la **ausencia de evidencia integral
R01–R12 verificada**, no afirman que cada capacidad esté rota ni niegan
los tests unitarios o parciales existentes. Comprobar por separado qué
versión de Chamilo expone LTI 1.3, Deep Linking y AGS: Basic Outcomes de
LTI legado no se presenta como AGS 1.3.

### Evidencia aceptable (no inventar ni extrapolar)

Por cada LMS registrar: SHA commit del Provider, versión npm del
instalador realmente usado, versión LMS, registro/despliegue con IDs
redactados, SHA de A/B antes y después, profesor creando ambas actividades
**dentro del LMS**, captura del alumno contestando y del resultado tras
`Finalizar`, salida y reentrada, respuesta confirmada de guardado y
captura/consulta de libro oficial con ambas notas; además, observación
de reintentos, errores y fecha de captura. Una captura del lanzamiento
o un código HTTP 200 no acredita que se haya completado una actividad.

Los informes JSON deben identificar por caso `PASS`, `FAIL`,
`BLOQUEADA` o `NO_TESTADA`, junto con la ruta a una evidencia real
accesible. Jamás fabricar un `PASS` mediante una clase simulada,
un LMS ficticio o un screenshot estático. Si no hay credenciales de
alumno o el LMS no es accesible desde el runner, el caso es
`BLOQUEADA` o `NO_TESTADA`.

### Recurso y orden de ejecución

Probar **un LMS cada vez** y un Chrome/Edge con dos sesiones separadas
secuencialmente. No arrancar los cinco LMS, SQL de pruebas y k6 al mismo
tiempo ni reiniciar infraestructuras del usuario como parte del test.
Antes de abrir navegador, comprobar memoria disponible y estado de
los servicios: si hay presión de memoria, detener la prueba sin alterar
contenedores. Empezar por Moodle como flujo de referencia, luego Canvas,
Chamilo, Sakai y Open edX; usar exactamente los mismos cursos A y B,
sin configurarlos de nuevo por plataforma.

El workflow anterior `p2lrn-interoperability-real.yml` es
**preflight de conectividad**, no esta prueba R01–R12. En la ejecución
[42889280679](https://github.com/josemarcosdzb/p2lrn/actions/runs/42889280679)
del 10 de noviembre de 2026, terminó `discover-real-lms`,
mientras `create-one-real-studio-course` y
`verify-independent-web-reentry` quedaron `skipped`. La
aprobación de ese run no equivale a publicar/completar cursos en un LMS.

**Salida de G4:** cinco informes separados que prueben R01–R12
en los LMS reales. Antes, no declarar al Provider certificado para
publicación educativa de extremo a extremo; tampoco confundirlo con
la certificación de escalabilidad G5/G6.

## 8. Ejecutador real de aula: código y condiciones de uso

Se ha incorporado `scripts/interoperability/verify-real-lms-classroom.mjs`,
apoyado en `chrome-visual.mjs` y el contrato
`real-lms-classroom-contract.mjs`. Opera DOM real de Chrome/Edge
contra el LMS local usando el proxy existente; no fabrica JWT, no
reenvía una puntuación falsa ni considera una API HTTP suficiente para
demostrar un curso completado. **No es un resultado E2E por sí mismo**.

El plan JSON de cada LMS debe contener exactamente:
- `schema: "p2lrn-lms-real-classroom/1"`, nombre del LMS, origen HTTP
  `*.localhost` y `qaOnly: true`.
- Cursos `A` y `B` con rutas a los **dos archivos reales de Studio**
  y sus respectivos SHA-256 diferentes. El runner valida bytes antes
  de abrir navegador. Tope de 8 MiB por curso para esta comprobación
  ligera; los cursos grandes requieren un ensayo separado.
- Ocho fases ordenadas, con navegación y selectores obtenidos
  de la **interfaz real del LMS**, no inventados ni copiados de otra
  versión: `teacher-publish-a`, `teacher-publish-b`,
  `learner1-complete-a`, `learner1-resume-a`,
  `learner1-complete-b`, `learner2-complete-a`,
  `learner2-complete-b`, `teacher-gradebook`.
- Acciones DOM permitidas: `goto` (ruta del propio LMS), `click`,
  `fillEnv`, `select`, `uploadCourse`, `waitVisible`,
  `waitText`, `assertCompletion`, `assertResume`,
  `assertGrade`. Las claves se introducen solo desde variables
  `P2LRN_QA_*` del entorno; nunca se guardan en el plan ni se
  publican en capturas. Para un iframe del mismo origen se acepta
  `frame` con su selector CSS. Un iframe entre orígenes
  incompatible se bloquea y no se marca PASS.
- En la fase del profesor se requieren **cuatro comprobaciones
  numéricas del libro de calificaciones**: curso A y B para
  alumno 1 y alumno 2. Cada `assertGrade` selecciona fila del
  alumno (`selector` y `studentText`), celda de nota
  (`gradeSelector`), encabezado del curso
  (`courseHeaderSelector` y `courseHeaderText`), curso
  `A/B`, alumno `learner1/learner2`, puntuación numérica
  `expected` y tolerancia opcional `tolerance`. Un texto del
  Player no satisface una prueba de libro de calificaciones.

La semántica de la nota sigue intacta: el navegador no es autoridad.
El Provider debe recibir la aprobación del servidor por un mecanismo
autorizado y el **LMS** debe incorporar la nota efectivamente. Si
no existe ese flujo, la prueba de grado falla y se debe corregir
el producto; está prohibido modificar el test para aparentar que se
entregó.

El verificador obtiene captura al finalizar cada fase satisfactoria,
guarda un JSON por ejecución y declara `PASS_REAL_CLASSROOM`
**únicamente** después de superar las ocho fases y cuatro notas
oficiales. Usa un solo navegador a la vez (perfiles separados por
docente/alumnos), un LMS por ejecución, presupuesto de 12 minutos
y requiere al menos **4 GiB de RAM libre** antes del arranque y
de abrir otro perfil. Si no hay suficiente memoria devuelve
`BLOQUEADA_RECURSOS`; sin credenciales de QA devuelve bloqueo.
El proxy debe responder desde el origen real; un HTTP 200 vacío
no es disponibilidad. No inicia Docker ni restaura servicios.

```powershell
# Comprobación de contrato y SHA, NO abre Chrome ni publica cursos:
node scripts/interoperability/verify-real-lms-classroom.mjs --plan RUTA_PLAN_MOODLE.json

# Solo con dos cursos auténticos, selectores verificados, cuentas QA,
# suficiente RAM y autorización expresa, UN LMS por vez:
$env:P2LRN_LMS_REAL_E2E='YES'
node scripts/interoperability/verify-real-lms-classroom.mjs --plan RUTA_PLAN_MOODLE.json --execute-real --output .interop-evidence/real-lms-classroom
```

**Última evidencia disponible antes de este ejecutador:** en el
workflow `p2lrn-interoperability-real.yml`, run
[42889280679](https://github.com/josemarcosdzb/p2lrn/actions/runs/42889280679)
del 10/11/2026, el host informó de **1.44 GiB** de RAM libre;
Canvas devolvió HTTP 200 con cuerpo vacío en el proxy;
Moodle solo mostró redirección de login; Chamilo, Sakai y
Open edX respondieron con contenido sin autenticación.
No se observó ninguna sesión docente ni alumno, y las fases
de Studio/realización del alumno estaban `skipped`. Por tanto,
en ese estado **no se autoriza disparar el test con navegador
ni se certifica ningún LMS**.

Si se necesita comprobar un sitio con Provider npm nuevo, el
entorno debe demostrar también que la versión instalada coincide
con el tarball o versión examinada. El runner del aula verifica
comportamiento visual y notas, **no certifica por sí solo**
instalación del paquete npm, escalabilidad ni equivalencia con el
CDN. Esos son gates independientes.

## 9. Evidencia real del equipo (11 de noviembre de 2026)

Inspección efectuada de forma **no destructiva** en la estación Windows
existente, sin instalar, borrar ni arrancar contenedores de LMS ni Provider.
Estas son mediciones y resultados, no resultados inventados para completar
la matriz.

| Comprobación | Resultado observado |
| --- | --- |
| Memoria física libre (primera inspección actual) | 5,45 GiB |
| Memoria física libre (antes de validar los cursos) | 5,08 GiB |
| Docker: contenedor `p2lrn-lti-provider` en `ps -a` | No existe (ni arrancado ni detenido) |
| Proxy /lti/health con Host de Moodle, Chamilo, Sakai, Canvas y Open edX | HTTP 404 en los cinco casos |
| Registro npm `@p2lrn/lti-provider` | HTTP 404 en consulta al registro público |
| Ejecución real del profesor y alumnado en un LMS | NO_TESTADA |
| Notas recibidas en el libro oficial de LMS | NO_TESTADAS |

El contenedor ausente **no se ha restaurado**, respetando la decisión de
probar el paquete correcto y no una implementación anterior. Un LMS
saludable no basta si su Provider LTI no está instalado y registrado.
El **Provider candidato** de este checkout se declara en
`integration/lms/package.json` como `@p2lrn/lti-provider@0.5.0-alpha.12`.
No decir que esa versión se puede instalar del npm público: el registro
consultado no devolvió el paquete. El tarball local necesita su propio
gate de instalación en limpio antes de un E2E candidato.

### Dos paquetes auténticos verificados por Toolkit

Se usó el validador **oficial** `packages/toolkit/dist/core/validator.js`
del checkout existente, mediante Node con `--max-old-space-size=256`,
`strictProfiles: true`, `validateProfilePayloads: true` y límites
explícitos de expansión de ZIP y archivos anidados. No se inició Chrome,
no se modificó ninguno de los dos binarios y no se enviaron cursos al LMS.

**A — Studio original**, archivo existente:
`P2LRN-INTEROP-0474eb9b/seguridad-informatica.p2lrn`

- SHA-256: `cce43503ea425ec4f1e6203c8ef6556beb999e71c08e59d5511091a6b931a380`
- Bytes: `1.080.127`; entidades del grafo: `18`.
- `packageId`: `urn:uuid:4bf07628-ade6-4605-9444-1f645b4da5be`
- `contentRoot`: `sha256:e0fb13f5092e0d1d9cf6cf552632279b30bf89c6364662b1dbdf5cfe80804323`

**B — modificación real de Studio**, archivo existente:
`P2LRN-INTEROP-V2-0d052efe/seguridad-informatica-v2.p2lrn`

- SHA-256: `cf1cf719cd2b78975b3034fbdbb0bb29f2730eca4a0772647595ac3ebb30dce7`
- Bytes: `1.080.148`; entidades del grafo: `18`.
- `packageId`: `urn:uuid:da3e2b71-1315-4b26-8bab-bd7ecb2dcde4`
- `contentRoot`: `sha256:a2d9b2dc395443edd46de415d8f38543a877fcaec860d60ccb61193cc12b4823`

**Resultado:** ambos `validatePackageBytes` fueron correctos,
con `contentRoot` diferentes. B es una **versión modificada**,
por tanto estas dos muestras no sustituyen la prueba final de
**dos cursos independientes creados y publicados por un profesor**
desde Studio/LMS. La validación del ZIP tampoco acredita interacción
visual, calificación oficial ni carga del LMS.

El contrato de aula
`scripts/interoperability/real-lms-classroom-contract.test.mjs`
se ejecutó en un entorno Node 22 aislado: **3/3 pruebas aprobadas**.
Se compararon sus Git blobs con los archivos de `main` antes
de atribuir los resultados al código publicado. El ejecutor
`verify-real-lms-classroom.mjs` superó `node --check` con la misma
identidad de blob que GitHub. **No se ejecutó la suite de navegación**
porque faltan los prerrequisitos del Provider y sus registros.

### Decisión de los gates actuales

- **Cursos A y B:** PASS en validación estructural oficial.
- **Contrato del ejecutor de aula:** PASS en las tres pruebas unitarias.
- **Instalación nueva del Provider vía npm público:** BLOQUEADA
  por paquete ausente del registro; no se reutiliza el contenedor viejo.
- **Lanzamiento LTI desde los cinco LMS:** BLOQUEADO por
  endpoint 404 y Provider no presente.
- **Profesor publica, alumnos resuelven, notas en libro del LMS:**
  NO_TESTADO; **0/5 plataformas certificadas**.
- **Escalabilidad de miles de alumnos:** NO_TESTADA.

Para ejecutar R01–R12 sin alterar lo anterior hay que disponer de
una instalación **de prueba** del Provider construido a partir del
tarball npm candidato aprobado, con Toolkit y Player del mismo
SHA, configuración LTI registrada una sola vez en el LMS de prueba,
cuentas docentes y de dos alumnos ficticios, y rutas operativas.
El runner debe verificar libre >=4 GiB antes del Chrome y abrir un
solo LMS por vez. Hasta que estos prerrequisitos existan, lanzar
el workflow, simular llamadas o fabricar tokens no sería una
prueba válida.
