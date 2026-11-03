# Diseño de integración universal P2LRN con LMS — v0.2

Fecha de revisión: 3 de noviembre de 2026. Estado: **proveedor LTI 1.3 y NRPS 2.0 implementados y probados localmente; lectura NRPS real de LMS pendiente**.

## Decisión principal

Un archivo `.p2lrn`, un motor `@p2lrn/player` y un Host Adapter. No se
crea otro Player por LMS, no se exige transformar P2LRN en SCORM y no se
introducen ramas de ejecución especiales para Moodle, Canvas, Sakai, Chamilo,
Open edX.

El núcleo P2LRN sigue siendo portable: los usuarios, matrículas, permisos,
estados privados, notas oficiales, credenciales y políticas de evaluación
pertenecen al anfitrión, nunca al ZIP del curso.

### Componentes y frontera de responsabilidades

```text
LMS (Moodle, Canvas, Sakai, Chamilo, Open edX)
       │ configuración de plataforma / sesión / usuarios / calificaciones
       ▼
Gateway universal P2LRN LTI 1.3 + catálogo de contenidos
       │ login OIDC, JWKS, launch, Deep Linking, AGS, NRPS optativo
       │ contenido publicado y autorizado (packageId/contentRoot/entityId)
       ▼
Host Adapter v1 ────────── API autorizada del anfitrión
       │                    ├─ loadState / saveState
       │                    ├─ reportScore → validación del servidor → AGS
       │                    ├─ emitEvent → historial / xAPI opcional
       │                    └─ resolveResourceUrl → recursos temporales
       ▼
UNICO <p2lrn-player> → cursos .p2lrn, cuestionarios, juegos, SCORM, H5P
```

LTI constituye una forma de **lanzar** la misma actividad; no sustituye
el formato P2LRN. Un adaptador nativo de LMS es opcional para almacenar el ZIP
localmente, pero debe reutilizar el mismo Player y el mismo contrato de datos.

## Qué existe ya y qué NO

| Pieza | Estado contrastado en el código |
|---|---|
| Player web, paquetes portables, import/export, renderers | Existe |
| Host Adapter (load/save/score/event/resources) | Existe |
| Progresión y eventos en Player | Existe; no sustituye libro de notas del LMS |
| Perfil LTI `profiles/lti-0.4.0` | Describe representaciones/enlaces; la autenticación vive en el proveedor |
| Proveedor P2LRN LTI 1.3 multiinstitución | Implementado en `lti-provider.mjs`, `lti-server.mjs` y `lti-store.mjs` |
| OIDC/JWT, JWKS, catálogo y Deep Linking | Implementados y cubiertos por pruebas automatizadas |
| AGS OAuth2, lineitems, outbox y reintentos | Implementados; la nota requiere decisión autoritativa del servidor |
| Binding administrativo para LMS sin Deep Linking | Implementado |
| NRPS 2.0 | Implementado: lectura OAuth2, aislamiento por contexto y control de roles; interoperabilidad real pendiente |
| Actividad/plugin nativo .p2lrn específico de cada LMS | No necesario para LTI; opcional si un producto quiere integración propia |
| Matriz E2E en Moodle/Canvas/Sakai/Chamilo/Open edX reales | Pendiente por versión/instancia |

La implementación común no acredita por sí sola conformidad completa de LTI Advantage ni certificación de todas las versiones de todos los LMS.

## Flujo del profesor, del alumno y del administrador

1. **Administrador:** registra una herramienta LTI 1.3 con `issuer`,
   `client_id`, `deployment_id`, URL OIDC, JWKS y token; activa únicamente
   los servicios permitidos. Un registro nunca se crea automáticamente
   porque llegue un JWT con un issuer desconocido.
2. **Profesor:** añade una herramienta externa y abre **Deep Linking**.
   Elige curso/unidad/actividad y revisión publicada en catálogo P2LRN.
   El servidor produce un `ltiResourceLink` firmado usando el enlace
   estable `custom.p2lrn_binding_id`. Puede copiar el curso del LMS sin
   perder la selección de contenido.
3. **Alumno:** abre la actividad desde el LMS. OIDC autentica el
   lanzamiento. El gateway verifica plataforma, despliegue, rol, matrícula
   y contenido. Crea sesión temporal, abre Player y guarda estado por
   alumno/intento/actividad/revisión.
4. **Finalización:** los eventos y notas procedentes del navegador
   son inicialmente no autoritativos. El servidor valida la evidencia,
   aplica reglas de evaluación y sólo entonces envía AGS al line item
   autorizado, mediante trabajos idempotentes.

### Identidad de contenido y copia de cursos

La identidad portable es `packageId + contentRoot + entityId`; el
`contentRoot` fija la revisión. El gateway genera un ID opaco aleatorio
de binding en Deep Linking, vinculado a tenant, registro, despliegue y
recurso publicado. **Nunca** debe basarse únicamente en
`resource_link.id`: según 1EdTech, ese identificador puede cambiar al
copiar una actividad o curso. `resource_link.id` sirve para la
correspondencia y las notas del LMS, pero no como única clave del contenido.

La clave lógica de guardado incorpora `tenantId, registrationId,
deploymentId, bindingId, learnerKey, attemptId, packageId, contentRoot,
entityId` y el renderer/perfil. Así se impide recuperar estados cruzados
entre cursos, intentos o versiones. También debe verificarse la pertenencia
de `entityId` al grafo íntegro y autorizado en el servidor.

## Entidades de persistencia

- `lms_registrations`: (tenant, issuer, client, auth_url, jwks_url,
  token_url, launch_url, estado, referencia a claves rotatorias).
- `lms_deployments`: (registration, deployment_id, estado); único por
  pareja. Los despliegues requieren aprobación explícita.
- `lms_content_bindings`: ID opaco generado por P2LRN; (tenant, registro,
  despliegue, packageId, contentRoot, entityId, publicado, permisos).
- `lms_oidc_transactions`: state + nonce aleatorios, asociación al
  navegador, expiración corta y consumo atómico.
- `lms_runtime_sessions`: identidad pseudónima, roles, intento y vínculo
  autorizado; sesión temporal y revocable.
- `lms_activity_snapshots`: estado de reanudación por identidad
  y revisión, con actualización concurrente segura.
- `lms_events`: log idempotente de eventos, con políticas de retención.
- `lms_ags_outbox`: notas autorizadas, line item, OAuth scopes,
  intentos de envío, idempotencia y estado de confirmación.
- `lms_content_catalog`: visibilidad por centro, publicación,
  revisión seleccionable y enlaces autorizados.

No conservar por defecto el JWT completo, nombres, correos o tokens en
las tablas de estado. Los datos de alumnos y matrículas no deben entrar
en el paquete distribuible.

## Seguridad LTI obligatoria antes de activar producción

- Implementar OIDC y validación JWT con librería criptográfica auditada
  y claves públicas obtenidas **sólo** de registros confiables.
  Validar `iss, aud, azp, exp, iat, nonce, state`, tipo de mensaje,
  despliegue, target_link_uri **firmado**, audience y versión.
- Consumir state y nonce de forma atómica; bloquear replay y mezclar
  registros/plataformas/centros. Vincular la transacción al navegador
  sin desactivar comprobaciones por restricciones de cookies terceros.
  Considerar cookies Secure/SameSite/Partitioned y LTI postMessage.
- AGS/NRPS mediante OAuth2 client_credentials y JWT firmado del servidor;
  comprobar scope de plataforma y lineitem. No usar en el backend
  URLs de servicios arbitrarias enviadas por un cliente sin validación SSRF.
- Deep Linking devuelve JWT firmado con el catálogo autorizado y
  respeta sólo el destino validado del lanzamiento. No transferir tokens
  LMS o claves al navegador ni dentro de URL o .p2lrn.
- Sesión y permisos de cada petición de estado/nota/resource en servidor
  mediante cookie HttpOnly, CSRF y control de origen. La identificación
  opaca enviada por el cliente **no** es una credencial.
- Recursos protegidos con URLs temporales y comprobación de permisos,
  CSP / frame-ancestors de la institución, límites, auditoría y borrado.
- No considerar la puntuación `reportScore` procedente del navegador
  como nota oficial hasta su comprobación de integridad/política del servidor.
- Fail closed: si no existe autorización, curso, nodo, despliegue o servicio,
  se deniega sin una ruta alternativa insegura.

## Un solo contrato, adaptado a LMS existentes

| LMS | Modalidad inicial | Acceso a notas |
|---|---|---|
| Moodle | Herramienta externa LTI 1.3, Deep Linking si disponible | AGS |
| Canvas LMS | Developer Key, LTI 1.3 + Deep Linking | AGS |
| Sakai | External Tools LTI 1.3 | AGS cuando la instancia lo expone |
| Chamilo | Integración LTI conforme a versión/instancia | AGS si está habilitado |
| Open edX | LTI Consumer XBlock 1.3 | AGS |

La configuración debe verificarse en cada instancia real; no se promete
que todas las versiones de un LMS expongan todos los servicios. NRPS sólo
se utiliza donde exista, se autorice y haga falta para una función concreta.

## Endpoints y contratos implementados (self-hosted)

El servidor implementa `/lti/login`, `/lti/launch`, `/lti/jwks`,
`/lti/deep-link`, catálogo/bindings administrativos y APIs autorizadas de
sesión, paquete, estado, eventos y notas. `lti-provider.mjs` valida JWT/OIDC
y firma Deep Linking; `lti-ags.mjs` realiza OAuth2 y entrega AGS con
restricciones de origen. No se introduce código específico de cada LMS en el
Core ni en Player.

`launch-contract.mjs` sigue siendo la proyección server-only desde claims
ya verificados a identidad portable/estado/score. El Host Adapter del navegador
sólo enlaza las cinco operaciones con la API del servidor; nunca concede por sí
solo autenticación o autoridad de calificación.

## Gates y secuencia de implementación

A. **Contrato y pruebas — implementado:** enlace estable, aislamiento
   multi-tenant, intento/revisión, parámetros AGS y Host Adapter.
B. **Proveedor LTI — implementado:** registro, OIDC/JWKS, launch, Deep Linking,
   catálogo/bindings y SQLite persistente.
C. **Seguimiento — implementado con NRPS opcional:** sesión, reanudación, eventos,
   decisión de nota, outbox AGS y reintentos. La validación NRPS en instalaciones reales de LMS sigue pendiente.
D. **Matriz E2E por plataforma — pendiente:** Moodle, Canvas, Sakai, Chamilo y Open edX,
   dos usuarios y varios intentos; publicación, launch, reanudación,
   calificación en LMS, duplicado de curso, acceso denegado, replay,
   sesiones expiradas, móvil, SCORM/H5P/juegos, regressions visuales.
E. **Plugin nativo opcional:** subida de .p2lrn directamente al LMS si
   se necesita, siempre reproduciendo con el mismo Player.

Ninguna fase se declarará terminada por un test sintético ni se publicará
un npm nuevo antes de la validación funcional correspondiente.

## Referencias

- 1EdTech LTI Core + Advantage: https://www.1edtech.org/standards/lti
- Guía de implementación (copia de cursos y URLs):
  https://standards.1edtech.org/lti/guides/implementation_guide/implementation-guide
- Open edX LTI Consumer:
  https://github.com/openedx/xblock-lti-consumer
- P2LRN: `integration/README.md`, `spec/HOST-CAPABILITIES.md`,
  `profiles/lti-0.4.0/profile.json`.


### NRPS 2.0: separación y límites

Un lanzamiento LTI verificado anuncia un contexto y una URL `context_memberships_url`. El proveedor valida ambas antes de conservar **solo** el enlace, registro, despliegue y contexto en `nrps_contexts`. `nrps_instructor_attempts` conserva si el rol LTI firmado autoriza la consulta; `nrps_registration_origins` registra los orígenes HTTPS adicionales permitidos por un administrador.

El cliente `lti-nrps.mjs` solicita OAuth2 `client_credentials` con el scope `contextmembership.readonly` y consulta alumnos y roles directamente al LMS. No almacena listados de personas, no crea matrículas y no interfiere con los archivos `.p2lrn-result` de Analytics.

El acceso está limitado por institución, registro, despliegue, contexto y rol. Comprueba origen HTTPS, DNS y URL permitidos, paginación y tamaño, y no sigue redirecciones. Un alumno recibe 403 y el docente solo puede consultar su contexto autorizado.

**Evidencia:** pruebas unitarias `lti-nrps.test.mjs` y HTTP `lti-nrps-server.test.mjs` con firmas OAuth2, varias páginas, denegación de alumnado, aislamiento y errores. Las instalaciones reales de AulaP2P aún no han superado lectura NRPS: los endpoints OAuth registrados de Moodle tiene su endpoint OAuth inaccesible; Sakai utiliza un puerto incorrecto en el registro y, al probar el puerto 8080, devuelve `invalid_scope` para NRPS. Chamilo devuelve `invalid_client`. Canvas y Open edX no están registrados en ese proveedor de pruebas. No declarar conformidad NRPS verificada con un LMS real hasta completar una consulta autorizada.
