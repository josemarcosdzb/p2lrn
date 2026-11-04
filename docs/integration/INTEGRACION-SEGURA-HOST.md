# Integración segura de P2LRN en un LMS/Host (Node.js)

**Estado:** APIs incorporadas al código de `main`; comprobar la versión publicada antes de instalar. El paquete `0.5.0-alpha.12` ya distribuido no contiene estas nuevas APIs. No copiar `dist` manualmente ni mezclar versiones.

## Responsabilidades, sin duplicar seguridad

| Protección | Biblioteca P2LRN | Configuración del integrador |
| --- | --- | --- |
| ZIP / Zip Slip | `@p2lrn/toolkit/core`: `unpackP2LRNArchive()` valida rutas ZIP, CRC, tamaños, colisiones, tipos y escritura en directorio nuevo | Elegir un directorio padre confiable y limitar qué usuarios pueden llamar a la operación |
| Identidad | `@p2lrn/player/server`: `createP2LRNJwtAuthenticator()` verifica criptográficamente JWT, emisor, audiencia, caducidad y JWKS | URL oficial del emisor, audiencia y JWKS; si ya tiene sesión propia, puede aportar `authenticate()` |
| Colaboración | `createP2LRNCollaborationHandler()` rechaza identidad suministrada por el paquete y restringe orígenes, tamaño y operaciones | Consultar la matrícula real, asignar tenant/grupo/curso desde su base de datos, autorizar cada operación y conectar un almacenamiento persistente |
| Resultados conectados | `createP2LRNResultAuthority()` firma con Ed25519 una **calificación comprobada por el Host**; `verifyP2LRNTrustedResultReceipt()` verifica firma y vínculos | Mantener la clave privada solo en el servidor y calcular/verificar la nota contra datos fiables del LMS |

No hay una forma segura de deducir la identidad del alumno, su matrícula o una calificación oficial exclusivamente a partir de un `.p2lrn`: el Host debe aportar esas fuentes de confianza. P2LRN proporciona las implementaciones reutilizables; el desarrollador configura los conectores con su sistema de usuarios y datos.

## Requisitos

- Node.js 22 o superior para Toolkit y el ejemplo.
- `@p2lrn/toolkit` y `@p2lrn/player` de **la misma versión que contenga estas APIs**. No utilizar ejemplos de `main` con paquetes antiguos de npm.
- Un emisor OIDC/JWT conocido (RS256 por defecto; ES256/EdDSA solo cuando el emisor lo requiera expresamente). El Host fija `issuer`, `audience`, `jwksUri`; no se aceptan algoritmos tomados de una URL o token sin permitirlos.
- Base de datos de matrícula y grupos, servicio de colaboración persistente y registro fiable de resultados. Son datos del Host y no deben estar en el paquete del alumno.
- Clave privada Ed25519 de emisión de recibos guardada fuera del código, navegador y cursos; clave pública distribuible para verificar. No generar una clave efímera por cada reinicio si se necesita validar recibos históricos.

## Ejemplo oficial de configuración

Ver el código de <a href="../../examples/integration/secure-host-node.mjs"><code>examples/integration/secure-host-node.mjs</code></a>. El integrador configura sus fuentes de confianza:

```js
import {readFileSync} from 'node:fs';
import {createSecureP2LRNHost} from './examples/integration/secure-host-node.mjs';

// Estas dos implementaciones son del LMS: no se pueden inventar desde P2LRN.
import {repository, collaborationService} from './mi-lms/servicios.mjs';

const p2lrn = createSecureP2LRNHost({
  issuer: process.env.LMS_OIDC_ISSUER,
  audience: process.env.LMS_P2LRN_AUDIENCE,
  jwksUri: process.env.LMS_OIDC_JWKS_URL,
  jwtAlgorithms: ['RS256'],
  allowedOrigins: ['https://campus.ejemplo.org'],
  repository,
  collaborationService,
  signingPrivateKey: readFileSync(process.env.LMS_P2LRN_SIGNING_PRIVATE_KEY_FILE),
  signingPublicKey: readFileSync(process.env.LMS_P2LRN_SIGNING_PUBLIC_KEY_FILE),
  signingKeyId: process.env.LMS_P2LRN_SIGNING_KEY_ID,
});

// Express (o adaptador equivalente de Node). NO hay login abierto por defecto.
app.post('/api/p2lrn/collaboration',p2lrn.collaboration);

// Extraer solo a un directorio NUEVO cuyo padre controle el servidor.
await p2lrn.unpackCourse('/srv/importaciones/curso.p2lrn','/srv/cursos/curso-123');

// Después de autenticar la petición del alumno y recuperar un intento propio
// del LMS, el servidor puede emitir un recibo de evaluación comprobada:
const recibo = await p2lrn.issueConnectedReceipt({
  request: peticionAutenticada,
  attemptId: 'id-interno-del-intento',
});
// Guárdalo asociado al intento. Usa la clave pública para verificarlo.
const valido = p2lrn.checkConnectedReceipt(recibo,{
  actor:{issuer:process.env.LMS_OIDC_ISSUER,subjectId:'id-alumno-verificado'},
  assignmentId:recibo.body.assignmentId,
  courseId:recibo.body.courseId,
  contentRoot:recibo.body.contentRoot,
});
```

Las referencias `app`, `peticionAutenticada` y `./mi-lms/servicios.mjs` corresponden al servidor de la institución: el ejemplo es **una plantilla de integración, no un servidor de demostración con credenciales ficticias**. El módulo oficial falla si falta una dependencia de confianza.

### Contratos que debe proporcionar el LMS

`repository.findEnrollment({actor, packageId, contentRoot, entityId})` busca el recurso en la base de datos y devuelve **exactamente** `packageId`, `entityId`, `contentRoot`, `tenantId`, `courseId` y `groupId` autorizados. Los identificadores del navegador son **claves de búsqueda, no pruebas de autorización**; la plantilla exige coincidencia exacta con la matrícula obtenida del servidor.

`repository.canUseRoom({actor, operation, context, room})` decide permisos por operación. El `collaborationService` comprueba además que cada `sessionId` pertenece al actor y al curso/sala del servidor, nunca solo al identificador enviado por el cliente. En producción debe persistir sesiones y eventos fuera del proceso Node (por ejemplo, PostgreSQL/Redis).

`repository.getVerifiedAttempt({actor, attemptId})` busca un intento perteneciente al alumno autenticado. `repository.gradeFromTrustedEvidence(...)` devuelve `{verified:true,score,maxScore,evidenceId}` **únicamente** después de verificar resultados calculados en el servidor, un examen supervisado o evidencias confiables. No debe copiar `result.summary.latestScore` ni creer en una cadena SHA-256 enviada por el alumno.

### Código del navegador

El Player envía únicamente el contexto portátil del curso, no `actorId` ni `userId`.

```js
const provider = P2LRN.createHttpCollaborationProvider({
  endpoint: '/api/p2lrn/collaboration',
  getHeaders: () => ({Authorization: 'Bearer '+tokenDeSesionDelHost})
});
player.capabilityBroker = P2LRN.createCapabilityBroker({
  providers:[provider],
  authorize:({capabilityId})=>capabilityId==='collaboration.room',
});
```

El Host debería entregar tokens de corta duración; no introducir JWT en URLs WebSocket, documentos `.p2lrn`, parámetros de consulta o almacenamiento público.

## ¿Qué verifica realmente el resultado offline?

La firma Ed25519 que genera Studio durante la exportación autentica **el encargo** cuando se compara con el recibo original conservado por el profesor. La cadena de evidencias y los hashes de un `.p2lrn-result` detectan incoherencias accidentales o alteraciones sin recalcular, **pero un alumno que controla su dispositivo puede recalcularlos**.

**Nunca** etiquetar un resultado devuelto offline como `authoritative` solo porque su SHA-256 es válido o porque el encargo tiene firma. Una nota oficial debe proceder de una evaluación que el Host haya verificado independientemente. El recibo conectado Ed25519 vincula actor, curso, encargo, raíz del contenido, nota y evidencia de servidor. Deben conservarse los recibos y detectar duplicados por `receiptId`/`assignmentId`; firma no significa resistencia a la repetición ni certificación del dispositivo del alumno.

## Seguridad operativa

1. No aceptar destino ZIP existente ni un directorio padre modificable por usuarios no confiables. Descomprimir ZIP ajenos en espacio temporal privado con límites estrictos. `unpackP2LRNArchive` nunca ejecuta contenido extraído.
2. Servir el Host solo mediante TLS y no incluir claves JWT de firma simétrica o claves privadas Ed25519 en Studio/Player.
3. No habilitar CORS `*` para endpoints autenticados. Los orígenes permitidos se configuran explícitamente.
4. Aplicar RLS/autorización en el almacenamiento del LMS, rate limiting distribuido, auditoría y política de retención; la protección de memoria del proceso Node no cubre varios servidores.
5. Revisar que el JWKS del emisor sea HTTPS oficial y que sus algoritmos estén fijados por configuración. Cambiar o revocar claves requiere gestionar su historial de verificación.
6. Ejecutar los tests `packages/toolkit/test/safe-unpack.test.mjs`, `packages/player/test/host-jwt-auth.test.mjs` y `packages/player/test/trusted-result-receipt.test.mjs` antes de publicar un paquete nuevo.

**Límite importante:** estas medidas no convierten una evaluación completamente offline, en un equipo controlado por el alumno, en una prueba irrefutable de su identidad o su puntuación.
