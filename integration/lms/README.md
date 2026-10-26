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

Solo para pruebas de loopback es posible habilitar P2LRN_LTI_DEV_INSECURE=true y usar un origen HTTP localhost. **Las conexiones reales LTI 1.3 entre plataformas requieren HTTPS.**

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

## Calificaciones reales con AGS

El servidor guarda cualquier nota observada sin enviarla automáticamente. Después de comprobar la evaluación, el administrador puede consultar los identificadores de intentos autorizados:

    GET /lti/admin/attempts?tenantId=centro-001

Para validar y enviar una nota oficial, POST /lti/admin/grades con JSON:

    {"attemptId":"ID_REAL_DEL_INTENTO","normalized":0.85,"completed":true}

La nota se registra antes del envío, genera una entrada idempotente en una cola persistente y solicita un token AGS mediante una aserción JWT firmada. Si la plataforma devuelve error o está desconectada, la calificación permanece pendiente: GET /lti/admin/ags/pending y POST /lti/admin/ags/retry con JSON que contenga outboxId.

Se requiere el scope AGS score y el identificador lineitem en el launch firmado. La entrega se limita a URLs autorizadas y rechaza redirecciones. La corrección automática de todos los juegos y cuestionarios no se deduce simplemente de un score enviado por el navegador.

## Validación y limitaciones

Ejecutar los tests en Windows con el job lms-contracts-windows de P2LRN CI, o desde una terminal con Node.js 22.13+:

    node --test integration/lms/lms-contracts.test.mjs
    node --test integration/lms/lti-provider.test.mjs
    node --test integration/lms/lti-store.test.mjs
    node --test integration/lms/lti-server.test.mjs
    node --test integration/lms/package-validation.test.mjs

Los tests HTTP automatizados usan una plataforma de ensayo que firma JWT reales, un paquete auténtico y una respuesta OAuth/AGS simulada. **No certifican** que Moodle, Chamilo o Sakai ya tengan la herramienta P2LRN registrada. Para verificar cada instancia real, completar registro bidireccional, HTTPS, selección profesor, lanzamiento alumno, reanudación y recepción de nota AGS en esa plataforma.

SQLite WAL está orientado a un único servidor; escalar a varios procesos/servidores requiere una base de datos compartida. NRPS es optativo y no está implementado en este módulo. Los navegadores que bloqueen por completo las cookies de terceros pueden requerir un flujo de almacenamiento o postMessage específico de LTI que se debe comprobar en E2E.
