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
