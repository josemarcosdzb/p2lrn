# P2LRN LTI 1.3: servidor universal independiente de AulaP2P

Este módulo implementa un proveedor LTI 1.3 cuyo propietario es P2LRN. Moodle, Chamilo y Sakai sirven como entornos de pruebas; Canvas, Open edX y otras plataformas LTI compatibles deben utilizar los mismos endpoints, sin código especializado para cada LMS.

Componentes:
- lti-provider.mjs: validación JWT RS256, OIDC state/nonce y Deep Linking firmado.
- lti-store.mjs: SQLite persistente (Node.js 22.13+) para registros, despliegues, cursos, alumnos pseudónimos, intentos, estado, eventos y cola AGS.
- lti-server.mjs: servidor HTTP independiente, registro administrativo, catálogo, selector del profesor, Player, cookies seguras y APIs de seguimiento.
- lti-ags.mjs: token OAuth2 firmado y envío de notas oficiales aprobadas por el servidor.
- Los paquetes .p2lrn siguen siendo portables: ni tokens, ni matrículas, ni nombres privados se escriben en el archivo del curso.

## Preparación

Requiere Node.js 22.13 o posterior y las distribuciones compiladas de Toolkit y Player.

    cd packages/toolkit
    npm ci
    npm run build
    cd ../..
    node packages/player/scripts/build-dist.mjs

Generar una clave privada RSA de 3072 bits, guardarla en un archivo PEM persistente fuera del repositorio y hacer copia segura. Por ejemplo, con OpenSSL:

    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out ruta-privada/p2lrn-lti.pem

Configurar en el proceso las variables de entorno:
- P2LRN_LTI_BASE_URL = https://lti.tu-dominio.es
- P2LRN_LTI_DATA_DIR = ruta privada de datos SQLite y cursos
- P2LRN_LTI_KEY_FILE = ruta persistente al PEM privado
- P2LRN_LTI_ADMIN_TOKEN = token aleatorio secreto de 32 caracteres como mínimo
- P2LRN_LTI_PORT = 37891 (opcional)
- P2LRN_LTI_HOST = 127.0.0.1 (por defecto)
- P2LRN_LTI_KID = identificador de clave (opcional: se deriva de la clave pública)

Arrancar desde la raíz del repositorio:

    node integration/lms/lti-server.mjs

El servidor escucha por defecto en loopback y necesita un proxy HTTPS de confianza para exposición pública. Comprobar GET /lti/health y GET /lti/jwks. Jamás publicar el token administrativo, el PEM privado, la base SQLite o el directorio de paquetes. No regenerar la clave cada vez que arranque.

### HTTP local sin instalar certificados

Para ejecutar el laboratorio en Chrome/Chromium, sin dominio público ni
certificados raíz en Windows, se puede utilizar el proxy HTTP **limitado a
loopback** (`127.0.0.1:80`):

- `P2LRN_LTI_DEV_INSECURE=true`.
- `P2LRN_LTI_BASE_URL=http://p2lrn-lti.localhost`.
- `P2LRN_LTI_HOST=0.0.0.0` solo en la red privada de Docker; no publicar el
  puerto directo del proveedor.
- Proxy local `http://p2lrn-lti.localhost` a
  `p2lrn-lti-provider:37891`.
- Registrar la misma URL HTTP de `login`, `launch`, `deep-link` y `jwks`
  tanto en P2LRN como en cada LMS; mantener los `issuer`, `clientId` y
  `deploymentId` reales de esos LMS.

El modo HTTP solo se habilita para `localhost`, `127.0.0.1` y subdominios
`*.localhost`, y solo con la bandera de desarrollo. Para el retorno
OIDC `form_post` entre sitios, el servidor emite cookies de laboratorio
`SameSite=None; Secure`, más una variante `Partitioned`. Chrome reconoce la
excepción de origen confiable de `*.localhost` incluso sin HTTPS. **No es una
garantía para cualquier navegador o política empresarial**. Si un navegador
bloquea estas cookies, registrar Moodle y la herramienta bajo subdominios de
un mismo origen `*.p2lrn.localhost` es una alternativa de pruebas. No
deshabilitar las verificaciones de `state`, `nonce`, firma JWT ni CSRF.

**Producción: HTTPS obligatorio**. No publicar HTTP local en Internet,
no reutilizar estas cookies en servidores públicos y no mezclar URLs HTTP
y HTTPS dentro de una transacción LTI. Conservar la clave RSA y la base
existente al cambiar de modo. La instalación de una CA local en Windows no
es necesaria.



### Modo recomendado si un LMS incrusta P2LRN: mismo origen HTTP local

Chrome 142+ aplica **Local Network Access** a algunos iframes entre
orígenes `localhost`. Aunque el proveedor HTTP y las cookies funcionen
por separado, la navegación al iframe puede bloquearse. Para evitar
advertencias, banderas inseguras y permisos adicionales del navegador, el
proxy local debe servir los endpoints de P2LRN bajo el **mismo origen que
el LMS**, sin cambiar el código ni la base de datos de P2LRN.

Por ejemplo, sobre las instancias QA existentes:

- Moodle: `http://jose-moodle-qa-20261017.localhost/lti/launch`
- Chamilo: `http://chamilojose.localhost/lti/launch`
- Sakai: `http://josesakai.localhost/lti/launch`

En cada bloque de sitio de Caddy (escuchando solo en `127.0.0.1:80`),
enrutar `/lti/login`, `/lti/launch`, `/lti/deep-link`,
`/lti/deep-link/confirm`, `/lti/assets/*`, `/lti/runtime/*`,
`/lti/jwks` y `/lti/health` al contenedor
`p2lrn-lti-provider:37891`. El resto de las rutas siguen apuntando
al LMS. **No exponer `/lti/admin/*` en los nombres del LMS.**

Registrar en P2LRN una `launchUrl` y una `deepLinkLaunchUrl` diferentes
para cada LMS, siempre dentro del mismo origen que el emisor (`issuer`)
registrado. Se mantiene un único proceso y una sola base de datos P2LRN.
La excepción de múltiples orígenes está restringida a
`P2LRN_LTI_DEV_INSECURE=true`, HTTP y `localhost`. P2LRN comprueba el
`Host` del lanzamiento contra el registro LMS y ata las sesiones y el
CSRF al origen autorizado.

En este modo las cookies de inicio y sesión son host-only, `SameSite=Lax`
y no necesitan `Secure`, porque el LMS y el contenido están en el mismo
origen HTTP. Para instalaciones reales, los LMS pueden seguir separados
y el proveedor utiliza su HTTPS oficial.


## Configuración de herramienta en cualquier LMS

En la interfaz del LMS, crear una herramienta externa LTI 1.3 con estas URLs:
- Tool / Launch URL: https://lti.tu-dominio.es/lti/launch
- Initiate OIDC Login: https://lti.tu-dominio.es/lti/login
- Public Keyset / JWKS: https://lti.tu-dominio.es/lti/jwks
- Redirect URI de recursos: https://lti.tu-dominio.es/lti/launch
- Deep Linking / Content Selection: https://lti.tu-dominio.es/lti/deep-link
- Redirect URI adicional de Deep Linking: https://lti.tu-dominio.es/lti/deep-link

Habilitar Deep Linking y, cuando estén disponibles y se necesiten notas, los permisos Assignment and Grade Services (AGS) del LMS. Obtener de la **instancia real**, no de ejemplos, los campos issuer, client ID, deployment ID, URL de autorización OIDC, URL de token OAuth2 y conjunto de claves públicas JWKS.

Registrar la institución mediante POST /lti/admin/platforms con Authorization: Bearer [token administrativo] y Content-Type: application/json. Ejemplo de estructura (valores de demostración que hay que sustituir):

    {
      "id":"centro-moodle",
      "tenantId":"centro-001",
      "issuer":"https://moodle.ejemplo.edu",
      "clientId":"ID_REAL",
      "authUrl":"https://moodle.ejemplo.edu/oidc-auth-real",
      "tokenUrl":"https://moodle.ejemplo.edu/oauth-token-real",
      "launchUrl":"https://lti.tu-dominio.es/lti/launch",
      "deepLinkLaunchUrl":"https://lti.tu-dominio.es/lti/deep-link",
      "jwks":{"keys":[{"kty":"RSA","kid":"KID_REAL","n":"MODULO_REAL","e":"AQAB"}]},
      "deployments":["DEPLOYMENT_REAL"],
      "deepLinkReturnOrigins":["https://moodle.ejemplo.edu"],
      "status":"ACTIVE"
    }

P2LRN rechaza emisores desconocidos, despliegues no aprobados y certificados/firmas incompatibles. Si hay un único registro activo para un issuer, admite iniciación OIDC sin client_id; con varios registros es obligatorio indicarlo. El registro puede actualizarse para renovar las claves públicas de la plataforma.

## Publicar paquetes desde P2LRN

Enviar un curso real como cuerpo binario a POST /lti/admin/catalog, autenticado con Bearer administrativo y las cabeceras:
- x-p2lrn-tenant: centro-001
- x-p2lrn-title: título visible del curso
- Content-Type: application/vnd.p2lrn+zip

Límite: 64 MiB. Toolkit valida integridad y perfiles antes de publicarlo. Consultar GET /lti/admin/catalog/centro-001. El profesor abre la herramienta desde su LMS, selecciona curso/unidad/actividad y recibe un Deep Linking firmado. El alumno accede al mismo Player y los intentos se guardan por LMS, institución, usuario y contexto.

La API del Player utiliza sesión HttpOnly, protección CSRF y permisos del grafo de contenido. Los eventos y notas del navegador son **observaciones, no calificaciones oficiales**.

## Herramientas sin Deep Linking: vinculación manual autorizada

Deep Linking firmado es el flujo recomendado. Si una plataforma LMS solo permite
añadir una herramienta externa manualmente, **no** se debe abrir un contenido
P2LRN a partir de una URL editable por el alumno. Antes, un administrador del
proveedor P2LRN registra un vínculo validado, reutilizando la misma política
de aislamiento que Deep Linking:

    POST /lti/admin/bindings
    Authorization: Bearer <token-administrativo>
    Content-Type: application/json

    {
      "registrationId": "centro-moodle",
      "deploymentId": "DESPLIEGUE-APROBADO-DEL-LMS",
      "catalogId": "ID-CATALOGO-PUBLICADO",
      "entityId": "ID-CURSO-UNIDAD-O-ACTIVIDAD"
    }

La respuesta incluye `bindingId` y
`customParameters.p2lrn_binding_id`. Guardar ese valor opaco como
parámetro personalizado **p2lrn_binding_id** de la actividad externa LTI 1.3
en el LMS. El servidor comprueba institución, registro activo, despliegue y
contenido publicado antes de crear el vínculo y vuelve a verificarlos en cada
lanzamiento. No incluir claves, JWT, cookies ni tokens administrativos en
parámetros personalizados ni en paquetes.

Las instalaciones que no transmitan parámetros personalizados dentro de la
claim LTI 1.3 `https://purl.imsglobal.org/spec/lti/claim/custom` deben
configurarse mediante Deep Linking; no debilitar la comprobación de vínculos.

## Calificaciones reales con AGS

El servidor guarda cualquier nota observada sin enviarla automáticamente. Después de comprobar la evaluación, el administrador puede consultar los identificadores de intentos autorizados:

    GET /lti/admin/attempts?tenantId=centro-001

Para validar y enviar una nota oficial, POST /lti/admin/grades con JSON:

    {"attemptId":"ID_REAL_DEL_INTENTO","normalized":0.85,"completed":true}

La nota se registra antes del envío, genera una entrada idempotente en una cola persistente y solicita un token AGS mediante una aserción JWT firmada. Si la plataforma devuelve error o está desconectada, la calificación permanece pendiente: GET /lti/admin/ags/pending y POST /lti/admin/ags/retry con JSON que contenga outboxId.

Se requiere el scope AGS `score`. El LMS puede entregar un `lineitem` directo o una colección `lineitems`. Cuando concede `lineitem.readonly`, P2LRN busca y reutiliza una columna existente del mismo `resourceLinkId` sin crear otra ni solicitar permisos adicionales. Crear columnas nuevas exige expresamente el scope de escritura `lineitem`; si solo hay permiso de lectura y no existe columna compatible, el envío permanece pendiente. La entrega se limita a URLs autorizadas y rechaza redirecciones. La corrección automática de todos los juegos y cuestionarios no se deduce simplemente de un score enviado por el navegador.

## Validación y limitaciones

Ejecutar los tests en Windows con el job lms-contracts-windows de P2LRN CI, o desde una terminal con Node.js 22.13+:

    node --test integration/lms/lms-contracts.test.mjs
    node --test integration/lms/lti-provider.test.mjs
    node --test integration/lms/lti-store.test.mjs
    node --test integration/lms/lti-ags.test.mjs
    node --test integration/lms/lti-server.test.mjs
    node --test integration/lms/package-validation.test.mjs

Los tests HTTP automatizados usan una plataforma de ensayo que firma JWT reales, un paquete auténtico y una respuesta OAuth/AGS simulada. **No certifican** que Moodle, Chamilo o Sakai ya tengan la herramienta P2LRN registrada. Para verificar cada instancia real, completar registro bidireccional, HTTPS, selección profesor, lanzamiento alumno, reanudación y recepción de nota AGS en esa plataforma.

SQLite WAL está orientado a un único servidor; escalar a varios procesos/servidores requiere una base de datos compartida. NRPS 2.0 está implementado como lectura opcional de matrículas, pero las instalaciones LMS reales aún requieren pruebas. Los navegadores que bloqueen por completo las cookies de terceros pueden requerir un flujo de almacenamiento o postMessage específico de LTI que se debe comprobar en E2E.


### NRPS 2.0: matrícula y roles por curso

El proveedor de P2LRN incorpora `integration/lms/lti-nrps.mjs`, que consulta el listado de alumnos y docentes sin modificar matriculaciones. Obtiene la URL del servicio únicamente del claim `namesroleservice` de un lanzamiento LTI 1.3 validado, y solicita el scope `https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly` mediante OAuth2 `client_credentials` y JWT RS256.

- `GET /lti/runtime/nrps/memberships`: la sesión del profesor consulta exclusivamente el contexto autorizado del lanzamiento. Un alumno recibe HTTP 403.
- `GET /lti/admin/nrps/contexts?tenantId=...`: el administrador ve los contextos previamente identificados, sin listado de personas.
- `GET /lti/admin/nrps/memberships?tenantId=...&registrationId=...&deploymentId=...&contextId=...`: el administrador, con Bearer privado, consulta una lista concreta, ligada a institución, registro, despliegue y contexto.
- Los miembros se consultan directamente desde el LMS. Se devuelven `userId`, `roles`, `status` y campos opcionales permitidos. No se conserva una copia permanente del listado; las tablas SQLite adicionales contienen solamente la URL de servicio validada, su contexto, las autorizaciones de roles y los orígenes de confianza.
- Si la API NRPS reside en un origen HTTPS diferente al del issuer o token endpoint, el administrador debe añadir ese origen a `nrpsAllowedOrigins` de la plataforma registrada. No se aceptan URLs proporcionadas por el navegador.
- El cliente limita 25 páginas, 5.000 miembros y 2 MiB por página, valida contenido y contexto, prohíbe redirecciones y rechaza destinos no autorizados.

Pruebas automáticas: `node --test integration/lms/lti-nrps.test.mjs integration/lms/lti-nrps-server.test.mjs`.

**Pruebas con AulaP2P, 3 de noviembre de 2026:** Moodle tiene el endpoint OAuth registrado inaccesible (`ECONNREFUSED`). Sakai también tiene mal el puerto del endpoint registrado; al probar el puerto 8080 sin modificar el registro, responde `invalid_scope` para NRPS. Chamilo responde `invalid_client`. Canvas y Open edX aparecen arrancados, pero no están registrados en el proveedor LTI de pruebas. La lectura de matrículas NRPS todavía **no se ha podido confirmar** frente a estas instalaciones. Falta corregir la configuración del LMS y completar un lanzamiento firmado con scope NRPS. NRPS no sustituye los archivos `.p2lrn-result` utilizados por Analytics.

## Reproduccion H5P, SCORM y paquetes bajo LTI (diagnostico CSP)

Un lanzamiento LTI puede autenticar correctamente, cargar el Player y mostrar el
titulo, pero dejar vacio el marco de una actividad importada. El srcdoc de
un iframe sandbox heredaba la Content-Security-Policy del documento LTI:
el script de arranque interno de H5P/SCORM/paquete no tenia el nonce de la
sesion. La misma politica bloqueaba hojas CSS blob: y el contenedor de
altura fija podia recortar los botones de las actividades.

La integracion usa una solucion acotada, no unsafe-inline global para scripts:

- playerHtml publica un nonce generado por lanzamiento en la meta
  p2lrn-opaque-runtime-nonce, ademas de usarlo en su propio script LTI.
- withOpaqueRuntimeBootstrapNonce autoriza solamente el primer script del
  shell srcdoc generado internamente. No altera HTML arbitrario del paquete.
  El runtime normal sin meta LTI conserva su comportamiento.
- CSP conserva script-src basado en nonce y mantiene el sandbox de origen
  opaco (allow-scripts, sin allow-same-origin en esta modalidad), mientras
  permite CSS, multimedia y fuentes locales blob:/data:.
- El contenedor LTI crece con la altura real del Player para que los botones
  de H5P y el contenido SCORM no queden cortados por un height:100% fijo.

Al desplegar una modificacion, compilar el mismo Player existente con
node packages/player/scripts/build-dist.mjs y actualizar el proveedor LTI
sin regenerar sus claves, su base SQLite ni sus cursos. Confirmar en un
navegador real (no solo HTTP 200): pregunta H5P visible y boton Check
funcional; pagina SCORM visible y boton Next funcional; pruebas de
packages/toolkit/test/opaque-runtime-bootstrap-nonce.test.mjs,
packages/toolkit/test/opaque-runtime-security.test.mjs e
integration/lms/lti-server.test.mjs superadas.

Esta reparacion no certifica que el LMS haya recibido notas oficiales AGS.
Tampoco autoriza desactivar CSP o SameSite para ocultar errores.

## Diagnostico de DNS interno para LTI Advantage / AGS (7-11-2026)

Las IP fijas en Docker ExtraHosts pueden quedar obsoletas cuando se recrean los servicios de Moodle, Chamilo o Sakai. Se comprobo que el nombre DNS local de Moodle apuntaba al contenedor cron en vez de al ingress. La peticion OAuth daba ECONNREFUSED. Usar fetch contra el dominio del proxy sin conservar Host produjo HTTP 200 con cuerpo vacio.

La CLI del proveedor usa integration/lms/lti-local-qa-gateway.mjs cuando el modo local inseguro de QA esta autorizado mediante P2LRN_LTI_DEV_INSECURE=true. El modulo resuelve el alias interno del proxy y utiliza node:http preservando Host del LMS; exige un destino privado y no opera para HTTPS externos. Se permite configurar la etiqueta DNS mediante P2LRN_LTI_DEV_LMS_GATEWAY. El modo HTTPS de produccion conserva su transporte y sus controles existentes.

Para comprobarlo, ejecutar los tests integration/lms/*.test.mjs y consultar el endpoint /lti/health mediante el Host original. Comparar recuentos de SQLite antes y despues de actualizar. El reintento oficial de AGS debe usar solo POST /lti/admin/ags/retry, con autenticacion administrativa y un intento calificable previamente aprobado por el servidor. Confirmar la nota tambien en el libro del LMS, no solo en el outbox.

Resultado real: 44/44 pruebas LTI correctas, reintento del alumno QA de Moodle exitoso (HTTP 200, SENT) y 85/100 en grade_grades, curso historico 2. La nota de la cuenta administradora que no tiene rol de alumno sigue sin poder entregarse legitimamente. El curso nuevo de seguridad informatica y los otros LMS siguen pendientes de certificacion integral; consultar docs/interop/2026-11-07-prueba-real.md.

## Compatibilidad dual LTI 1.0/1.1 y LTI 1.3 para Chamilo

P2LRN conserva el proveedor **LTI 1.3** en `/lti/login`, `/lti/launch`, `/lti/deep-link`, `/lti/jwks`, AGS y NRPS; añade un canal **independiente y explícito** para los lanzamientos históricos `POST /lti/legacy/launch`. Los dos canales reutilizan los mismos paquetes `.p2lrn`, Player, estados, intentos y sistema de aprobación de notas, pero cada uno tiene registros, secretos y vinculaciones separados.

### LTI 1.0/1.1: compatibilidad sin degradación automática

- Para LTI 1.0/1.1, registrar un consumidor autorizado con `POST /lti/admin/legacy/platforms` (Bearer administrativo existente). El cuerpo JSON admite `id` con prefijo `legacy:`, `tenantId`, `consumerKey`, `sharedSecret` fuerte (24 caracteres o más), `issuerOrigin`, `launchUrl` terminado en `/lti/legacy/launch` y `status: "ACTIVE"`. La respuesta y `GET /lti/admin/legacy/platforms` **nunca muestran el secreto**; se cifra con AES-256-GCM mediante una clave derivada de la identidad RSA persistente del proveedor. Hay que conservar esa identidad para restaurar las inscripciones antiguas.
- `POST /lti/admin/legacy/bindings` recibe `registrationId`, `catalogId` y `entityId` del catálogo real. Devuelve `p2lrn_binding_id`. En el campo de parámetros personalizados de Chamilo se introduce `p2lrn_binding_id=<id>`; Chamilo envía `custom_p2lrn_binding_id` en el formulario firmado. No se duplica el archivo del curso ni se reutiliza una vinculación JWT 1.3 como vinculación OAuth1.
- El endpoint antiguo **solo acepta** formularios firmados por OAuth 1.0a con HMAC-SHA1 o HMAC-SHA256, marca temporal ±300 s, nonce de un solo uso persistido en SQLite, URL exacta permitida, clave de consumidor registrada, identificador de alumno y vínculo de contenido autorizado. Rechaza ausencia/alteración de firma, peticiones repetidas, mezcla con `id_token` o `state`, reuso de un vínculo de otra institución, secretos débiles y hosts de resultado no registrados. HTTP solo se admite en las instalaciones `.localhost` de QA con `P2LRN_LTI_DEV_INSECURE=true`.
- Cuando el lanzamiento lleva `lis_outcome_service_url` y `lis_result_sourcedid` válidos, el servidor puede devolver notas por **LTI 1.1 Basic Outcomes** con XML POX, OAuth `oauth_body_hash`, y verificación de respuesta de éxito del LMS. El resultado de la actividad **no se envía** por el mero reporte del navegador: exige la misma autorización del servidor de notas que en LTI 1.3. Sin servicio de notas, una calificación no se marca oficial. El proveedor acepta el literal `LTI-1p0` emitido por Chamilo, pero la devolución de resultados sigue dependiendo del servicio Basic Outcomes declarado y de su aceptación efectiva.

### LTI 1.3: sin cambios en la autenticación original

Las herramientas LTI 1.3 siguen usando OIDC, RS256, validaciones de `issuer`, `audience`, `nonce`, `deployment_id`, y AGS OAuth2. **No existe fallback silencioso a OAuth 1.0a.** Un POST LTI 1.0 enviado a `/lti/launch` se rechaza; un `id_token` enviado al endpoint legado también.

### Estado específico de Chamilo 2.0.3

El código instalado de Chamilo 2.0.3 expone las dos opciones en `src/LtiBundle/Form/ExternalToolType.php` (`lti1p1` y `lti1p3`), pero el controlador `CourseController::launch()` emite literalmente `LTI-1p0` y usa `OAuth1Helper::buildSignedPostParams()` sin seleccionar un flujo OIDC por versión. Por eso **no puede considerarse validada una integración Chamilo 1.3 solo por marcar su opción en el formulario**. El nuevo canal legado de P2LRN cubre la interoperabilidad con la ruta OAuth1, pero para certificar el consumidor **Chamilo LTI 1.3** faltan generar y verificar lanzamientos OIDC/JWT desde Chamilo, publicar sus JWKS y servir AGS con resultados reales en su libro de notas. Se mantiene pendiente y separado del certificado de P2LRN.

Referencias normativas: [1EdTech Basic Outcomes 1.1](https://www.imsglobal.org/spec/lti-bo/v1p1), [guía de migración LTI](https://standards.1edtech.org/lti/guides/migration/migration-guide) y [calendario de obsolescencia de las versiones anteriores](https://www.1edtech.org/lti-security-announcement-and-deprecation-schedule). Los estándares 1.0/1.1 están obsoletos para certificación oficial, aunque se mantiene soporte de compatibilidad exigido para instalaciones existentes.

### Pruebas verificadas

El test integrado `integration/lms/lti-legacy-integration.test.mjs` usa el servidor HTTP real, un paquete Toolkit auténtico, un registro legado cifrado y vinculado, sesión Player, reanudación de estado y aprobación de Basic Outcomes. Comprueba además protección anti-replay, aislamiento del endpoint 1.3 y que un resultado HTTP 200 no baste si el XML indica error. El test `lti-legacy.test.mjs` valida la firma, los secretos y los orígenes. Una prueba de laboratorio con un receptor simulado **no equivale** a la aceptación real de Chamilo; esa última exige la prueba estudiantil y la lectura del libro de notas.
