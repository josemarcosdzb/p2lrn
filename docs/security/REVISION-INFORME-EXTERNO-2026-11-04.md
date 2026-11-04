# Revisión del informe externo sobre P2LRN
Fecha de verificación: 4 de noviembre de 2026

**Alcance:** contraste contra `josemarcosdzb/p2lrn`, rama `main`, y consulta directa de las etiquetas públicas del registro npm. El informe recibido corresponde en parte a `0.5.0-alpha.11`, a un nombre anterior del repositorio y a implementaciones anteriores de Studio. Este documento no constituye un pentest ni certifica ausencia de vulnerabilidades.

## Estado por hallazgo

| Hallazgo | Estado comprobado en el código actual | Medida y límite |
| --- | --- | --- |
| Respuestas embebidas en cuestionarios (`embedded-key`) | Limitación estructural real | No usar paquetes distribuidos al alumno para exámenes de alto riesgo. Para notas oficiales usar corrección **autoritativa del Host**, no claves visibles en el archivo |
| SHA-256 y `contentRoot` sin identidad del autor | Cierto para integridad ordinaria; el informe omite la firma separada **experimental Ed25519** que ya ofrece Toolkit | `p2lrn-trust sign/verify --require-trusted` permite verificar una firma y una clave conocida por el Host. No es PKI, reputación, revocación ni una garantía automática de procedencia |
| Caducidad y resultados de entrega offline | Limitación de confianza real | Reloj local, archivo copiable y resultados emitidos por cliente **no prueban** identidad, caducidad externa ni nota oficial. Requiere servicio externo/Host para control autoritativo |
| Plantilla PHP capaz de escribir `.php` mediante cabecera | Hallazgo **obsoleto para el código actual** | `php-save.php` requiere autorización explícita, sufijo `.p2lrn`, bloquea extensiones ejecutables, limita a 512 MiB y usa temporal/rename |
| Plantillas Laravel, Symfony, Rails, Go, ASP.NET, Spring, Nest y Rust | **Riesgo confirmado en la revisión de hoy**: muchas generaban rutas de escritura sin auth obligatoria | Actualizadas en `main` para fallar cerradas hasta que el Host verifique sesión, permiso por curso/operación y CSRF. También se limitan tamaños y nombres. Estos cambios **no actualizan** automáticamente instalaciones existentes ni paquetes npm ya publicados |
| Inyección de `coursePath` en generador | Hallazgo **obsoleto** | `safePath` admite solo segmentos ASCII portables, bloquea metacaracteres, rutas relativas y nombres reservados; reforzada además la comparación de directorios con límite de separador |
| Ejecución SCORM/H5P y `allow-scripts allow-same-origin` | Riesgo condicionado por la **topología** | El iframe exterior usa sandbox opaco por defecto. La compatibilidad con mismo origen queda dentro de un runtime de **origen distinto** del LMS/aplicación; la configuración rechaza el mismo origen. Mantener pruebas de escape de sandbox, CSP, postMessage y host capabilities para todos los casos. No declarar XSS confirmado del host solamente por esas dos flags |
| ZIP, carga y denegación de servicio | Existen límites, pero no sustituyen control de infraestructura | La auditoría propia anterior registra límite real DEFLATE (512 MiB); SCORM/H5P usan límites de miembros/peso más bajos en sus runtimes. Faltan fuzzing, cuotas distribuidas y pruebas de estrés de producción |
| `@p2lrn/*` NPM `latest` apunta a stub | **Confirmado el 4 de noviembre** mediante consulta al registro | `latest=0.0.0-stage` en los cinco paquetes. `next=0.5.0-alpha.11` para Player, Studio, Toolkit y Analytics; H5P Libraries `next=0.5.0-alpha.12`. El código fuente declara `0.5.0-alpha.12`, no publicado en conjunto. Documentación pública corregida para no presentar instrucciones de instalación como disponibles. **No se retoca `latest` ni se publican paquetes sin gates** |
| LTI 1.3 identidad OIDC, Deep Linking, AGS | Buenas defensas presentes en código, no prueba de despliegue | JWT RS256, JWKS registrada, state/nonce, CSRF, credenciales fuera del paquete; nota de navegador no autoritativa hasta aprobación administrativa. Verificar con LMS real y proxy HTTPS |
| LTI AGS/NRPS verificación DNS antes del `fetch` | **Riesgo residual real de DNS TOCTOU** | El código comprueba origen y direcciones privadas y no sigue redirecciones, pero el transporte puede resolver otra vez. Falta pinning de IP validada o control de salida de red equivalente. Mitigación de despliegue: registro de emisores controlado, DNS estable y egress restringido |
| Cookie LTI dividida por `=` | Robustez mejorable, baja para los tokens base64url actuales | No se ha demostrado robo de sesión por este detalle |
| Bearer administrativo global LTI | Riesgo operativo, no explotación demostrada | Almacenar secreto de 32+ caracteres fuera del repositorio, limitar acceso y auditar acciones. Roles por administrador/tenant y rotación son trabajo adicional |
| Resultados/Analytics de demostración | No son datos reales de alumnos | La demo pública carga un dataset sintético. Un `src` conectado requiere ACL del Host por institución, curso y alumno |
| Colaboración suplantable sin Host | Riesgo real cuando se integra sin verificar identidad | Contrato Host requiere autenticación/autorización y contexto de sala confiable. La guía `/docs/colaboracion/` existe; el paquete no autentica al usuario |
| Nombres de dominio duplicados | Corregido en web pública en comprobaciones anteriores | `p2lrn.netlify.app/*` responde 301 al dominio principal. Revalidar al cambiar configuración de Netlify |
| Skills para ChatGPT, Claude, Gemini y Grok | Riesgo habitual de cadena de suministro | Descargar únicamente de `https://p2lrn.org/skills/`, comparar manifiesto e integridad y no aceptar ZIP reenviados como oficiales por nombre |
| Traducción y documentación | Hay trabajo editorial independiente | Las rutas `/en/` y documentación bilingüe mejoraron; validar contenido y enlaces con los verificadores. No son automáticamente fallos de seguridad |
| Secretos en el historial y H5P vendorizado | No descartados por una búsqueda de nombres | Pendiente análisis completo de historial (Gitleaks) y de los 144 componentes H5P, CVE por versiones y 32 licencias de terceros sin evidencia suficiente. Un aviso no elimina las obligaciones de redistribución |

## Endpoints Studio generados: contrato obligatorio del Host

Los ejemplos no proporcionan cuentas de usuario ni asumen que un token recibido por HTTP represente una sesión válida. **El sistema que incrusta Studio** debe establecer datos de autorización solo en el contexto interno del servidor, después de validar identidad, permiso de profesor/editor en ese curso y CSRF/origen.

| Host | Contrato de integración (datos fijados por middleware del servidor) |
| --- | --- |
| PHP plano | `studio-auth.php`: implementar `p2lrn_studio_host_authenticate`, `p2lrn_studio_host_authorize` y `p2lrn_studio_host_check_csrf` |
| Laravel | `$request->user()` y `$request->attributes`: `p2lrn_studio_operation`, `p2lrn_studio_course`, `p2lrn_studio_csrf_ok=true` |
| Symfony | `$request->attributes`: `p2lrn_studio_principal`, `p2lrn_studio_operation`, `p2lrn_studio_course`, `p2lrn_studio_csrf_ok=true` |
| Rails | `request.env['p2lrn.studio.principal']`, `operation`, `course`, `csrf_ok=true` |
| Go | `Register(mux, HostAccess{Authenticate, Authorize, VerifyCSRF})`; sin las tres funciones no registra rutas |
| ASP.NET | Usuario autenticado en `HttpContext.User`; `HttpContext.Items` con `p2lrn.studio.operation/course/csrf_ok` |
| Spring | `HttpServletRequest.getUserPrincipal()` y atributos `p2lrn.studio.operation/course/csrf_ok` |
| Nest | `req.user` y `req.p2lrnStudioAuthorizedOperation`, `req.p2lrnStudioAuthorizedCourse`, `req.p2lrnStudioCsrfVerified=true`; `@UseGuards(P2LRNStudioHostGuard)` |
| Rust Axum | Extensión `StudioHostAccess` añadida por middleware autenticado: principal, operation, coursePath, csrfVerified |
| Express, Hono, Fastify, Django, Fetch/Astro/SvelteKit | Guards ya presentes en las plantillas recientes; verificar contra la aplicación real |

No mapear estos valores a cabeceras enviadas por el navegador. Configurar además límites de tamaño **antes** de almacenar el cuerpo en el framework/reverse proxy, cuotas, ruta privada o controlada, registro de auditoría y tasa máxima de peticiones. Las reglas concretas dependen de la aplicación anfitriona; el código generado por sí solo no puede crear un sistema de autenticación.

Las **instalaciones generadas previamente** conservan su código antiguo: deben revisar las rutas activas, integrar la nueva plantilla y probar autenticación, permisos cruzados y CSRF. Un commit en GitHub no actualiza un servidor existente.

## Pruebas y gates de publicación

- La batería ya existente de Studio (20 casos: autentificación Host, PHP, guardado atómico, setup y adaptadores Node) había pasado en la revisión inicial.
- Añadida `packages/studio/test/multiframework-security.test.mjs` para revisar las ocho plantillas, nombres/tamaños y sintaxis de PHP, Ruby y Go cuando haya intérpretes. Integrada en el job `security-windows` del workflow existente; **su ejecución no debe darse por aprobada hasta consultar el CI del commit final**.
- Para ASP.NET, Spring, Nest y Rust deben ejecutarse compilación y pruebas de integración con el framework y las versiones instaladas. Las comprobaciones de texto no bastan.
- Para LTI: ensayos por tenant con emisor malicioso, DNS rebinding, AGS/NRPS y proxy real. Para Player: pruebas Chrome reales sobre los dos modos de ejecución y paquetes de terceros.
- La publicación coordinada de cinco paquetes npm requiere compilar, ejecutar todas las suites, verificar seguridad y licencias aplicables, empaquetar, instalar tarballs, comparar la distribución con `main`, autorizar npm y comprobar las etiquetas de distribución. El gate de licencias H5P no se desactiva simulando que la responsabilidad de terceros desaparece.

## Decisión de seguridad

**Mitigaciones en código aplicadas para las plantillas antes abiertas. No hay declaración de «vulnerabilidades cero», CI global aprobado, emisión oficial de notas offline ni publicación npm completa.** Los riesgos de confianza e infraestructura indicados permanecen abiertos hasta que exista una prueba verificable que los cierre.
