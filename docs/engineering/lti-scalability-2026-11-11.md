# Aislamiento SQL del Provider LTI — fase 1 (2026-11-11)

El mismo Provider LTI de `integration/lms` utiliza ahora una capa RPC
asíncrona en el servidor HTTP cuando está configurado con PostgreSQL,
MySQL, MariaDB o SQL Server. SQLite y el instalador conservan el contrato
síncrono previo. No se crea un segundo Provider ni se modifican esquemas.

Los accesos bloqueantes `Atomics.wait()` heredados se ejecutan dentro de
un trabajador de Node separado: **no bloquean el hilo HTTP**. El hilo de
almacenamiento procesa operaciones secuenciales y aún conserva los bloqueos
SQL globales; **no hay todavía paralelismo SQL real ni certificación de miles
de alumnos**. No desplegar múltiples réplicas con este cambio aislado.

El adaptador limita la cola a 128 solicitudes, aplica un límite por operación
de 40 segundos, acota el heap del trabajador y falla de forma cerrada ante
errores de SQL, agotamiento de cola o desconexión. El arranque espera la
inicialización real y `/lti/health` devuelve 503 ante pérdida del trabajador.
El lanzamiento legado espera igualmente la reserva única de nonce, mientras
las llamadas síncronas anteriores mantienen su contrato.

## Pruebas dirigidas

`node --test integration/lms/lti-async-store.test.mjs` ejecuta SQLite
real mediante el nuevo trabajador y comprueba consumo único OIDC,
persistencia del limitador bajo peticiones concurrentes y cierre. Antes de
publicar hay que ejecutar también tests HTTP/OIDC/legacy y matrices con
PostgreSQL, MySQL, MariaDB y SQL Server auténticos.

## Fases todavía pendientes

- Sustituir la persistencia interna síncrona por adaptadores SQL asíncronos
  con pools acotados y transacciones por fila, sin bloqueo global.
- Sacar importaciones del hilo HTTP con streaming, límites de recursos y
  validación en procesos de trabajo.
- Incorporar un almacén compartido opcional para múltiples instancias,
  con verificación de integridad por hash y autorización por petición.
- Separar definitivamente AGS del HTTP con cola duradera, reserva atómica,
  reintentos acotados, recuperación y conciliación con el LMS.
- Realizar migraciones coordinadas y pruebas de fallos, cargas progresivas
  y observabilidad antes de permitir despliegue distribuido.

No lanzar cargas k6 altas, múltiples contenedores SQL ni tests masivos en
el ordenador personal. Las pruebas reales de concurrencia deben ejecutarse
en entornos de ensayo dedicados y con límites de recursos. Esto no
publica npm, CDN ni despliega servidores.
