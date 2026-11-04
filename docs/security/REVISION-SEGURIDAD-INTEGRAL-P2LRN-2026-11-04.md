# Revisión integral de las superficies de ataque P2LRN
**Fecha:** 4 de noviembre de 2026 · **Código:** `josemarcosdzb/p2lrn`, rama `main`.

## Alcance y límites de la revisión

Se contrastaron los riesgos propuestos con los motores de ZIP de Toolkit y Player,
Creator, HTML del editor Studio, sandbox SCORM/H5P/cmi5, canal MessageChannel,
Host de colaboración y resultados, SDK y servidor de Analytics, entrega offline
y compilación de la CDN. Se aplicaron mitigaciones y pruebas, pero **esto no es
una certificación, un pentest completo ni prueba de despliegue en producción**.
Los nuevos tests y el build de la versión final aún deben superar GitHub Actions
sin cancelaciones, así como pruebas funcionales de navegador y frameworks.

Una vulnerabilidad potencial de integración no equivale a una explotación confirmada:
P2LRN es SDK + componentes + adaptadores y, en muchas operaciones, el **Host**
decide identidad, cursos, permisos y datos académicos. No se inventan permisos
institucionales dentro de un paquete portable.

## Registro de hallazgos y mitigaciones

| Control | Evaluación y código actual | Riesgo pendiente |
| --- | --- | --- |
| ZIP Slip, rutas absolutas y escapes | `src/core/zip.ts` dispone de `safeZipPath`, extracción por carpeta temporal, `realpath`, O_EXCL y O_NOFOLLOW, y rechaza enlaces. **Creator** ahora valida también nombres reservados Windows, NTFS ADS (`file.txt:stream`), rutas hijas y colisiones por mayúsculas antes de escribir en `package-files/`. | El directorio padre debe ser controlado por el Host; una cuenta local que pueda escribir simultáneamente en él requiere aislamiento del sistema operativo. |
| ZIP bomb y saturación | Node limita expansión DEFLATE **durante** la inflación con `maxOutputLength`. En el navegador `inflateRawBounded` ahora corta el flujo antes de superar los bytes declarados, y tanto ZIP remoto como local tienen límite de lectura `ArrayBuffer`; el nested ZIP explicita 256 MiB por entrada bufferizada. | Los límites son diferentes según operación: extracción a disco usa 2000 archivos y 256 MiB descomprimidos por defecto, mientras que reproducción por rangos permite vídeos/3D más grandes. Un límite universal de 50 MiB dañaría cursos válidos; siguen pendientes pruebas de carga y CPU. |
| Manifiesto/prototype pollution | `parseP2LRNUntrustedJson` rechaza recursivamente `__proto__`, `constructor` y `prototype` en los JSON usados por Player. `canonicalizeIdentifiers` impide propagarlos al reconstruir objetos. | Analizadores de extensiones de terceros o plugins propios necesitan sus propios límites de confianza y análisis SAST. |
| Assets virtuales/traversal | El Player inventaría las entradas, comprueba digests, usa `safeZipPath` y el puente Service Worker. `safeWebLogicalPath` ahora rechaza escapes, separadores codificados y claves de prototipo; mapeo de recursos sin setters peligrosos. | La plataforma que entregue archivos externos debe evitar servir directorios reales mediante URLs del cliente. |
| HTML, SCORM, H5P, cmi5 | HTML pasivo sin scripts; SCORM/H5P/cmi5 se ejecutan en iframes de origen opaco o en un origen **separado** de la aplicación, con CSP y permisos del iframe restringidos. En origen dedicado se permite `allow-same-origin` para compatibilidad, nunca para dar acceso al DOM del LMS. | La ejecución legítima de JS dentro de SCORM/H5P **no equivale a código confiable del LMS**. Hacen falta escapes sandbox/CSP reales para todas las topologías, motores y navegadores. No eliminar JS o `allow-same-origin` sin probar compatibilidad. |
| `postMessage` y estado falso | Ya se comprueba `event.source === iframe.contentWindow`, el origen del runtime y el protocolo de MessageChannel. Ahora `isSafeRuntimeMessage` limita nodos, profundidad, bytes y claves peligrosas en SCORM/H5P/cmi5; los scores emitidos por SCO/H5P/cmi5 no deben ser autoritativos. | Un SCO malicioso puede enviar un score **de su propia actividad** incluso por canal legítimo: solo la verificación del Host hace una nota oficial. |
| Stored XSS en Studio | Editor HTML WYSIWYG y versión web usan política idéntica de etiquetas/atributos inertes, filtran URL activas, `on*`, `srcdoc`, SVG/MathML y CSS de riesgo. **Pegado y arrastre de HTML se sanean antes de montarlos en el DOM**. | No se considera un antivirus ni escaneo completo de SCORM/H5P (sus scripts son parte del formato). Auditar la sanitización en Chrome/Edge con corpus hostil y verificar conservación de edición y estilos. |
| SSRF en Studio | Los handlers propios `save/read/import` reciben bytes, **no realizan fetch a una URL arbitraria introducida por el alumno**. Importar desde URL en el navegador no equivale a SSRF de servidor. | Si un integrador añade una ruta de importación HTTP desde backend, debe fijar HTTPS, allowlist de dominios, DNS/IP pública comprobada y conectada, sin redirecciones y con egress bloqueado a redes internas. |
| IDOR/BOLA Studio | Los adaptadores obligan a autenticación, operación, curso y CSRF: los que aún estaban abiertos en Laravel, Symfony, Rails, Go, ASP.NET, Spring, Nest y Axum se cerraron en la auditoría previa del mismo día. | Solo la base de datos de la institución sabe si un usuario es propietario/editor del curso. Probar cada rol/tenant con el Host real; actualizar **instalaciones antiguas** generadas, que no reciben cambios de Git. |
| CORS y exposición de PII Analytics | Nuevo adaptador opcional `@p2lrn/analytics/server`: exige Host `authenticate`, `authorize` y `loadDataset`; CORS explícito, no-store, cuota de respuesta, filtrado por curso, alumnos y rol; máscaras de emails y campos potencialmente sensibles. | Debe integrarse en el servidor real y en consultas DB parametrizadas. La demo estática no equivale a un servidor de notas. Verificar GDPR y conservación institucional. |
| SQL/NoSQL injection Analytics | SDK visual no concatena consultas SQL. El adaptador valida IDs pero NO implementa base de datos ni puede certificar SQL del Host. | Emplear consultas preparadas, límites de consulta y autorización por tenant/curso en cada integración. |
| Resultados offline y alteración | La firma Ed25519 del encargo acredita que el docente emitió esa **asignación**, no que el alumno resolvió las actividades honestamente. Los archivos `.p2lrn-result` contienen datos controlados por el cliente y son informativos, no nota oficial. | HMAC dentro de la entrega offline **no garantiza** integridad cuando el alumno controla el ejecutable y la clave; tampoco la ofuscación de IndexedDB/localStorage. La calificación definitiva requiere Host independiente o evaluación supervisada. |
| Firma de resultados oficiales y replay | Ya existían recibos Ed25519 **firmados por Host tras verificar evidencia**. Nuevo `verifyAndRedeemP2LRNTrustedResultReceipt` verifica firma, clave anclada, alumno, curso, actividad, caducidad y exige consumo **atómico y duradero** del `receiptId`. | El implementador debe proporcionar un almacenamiento transaccional con UNIQUE por `receiptId` y actualizar la nota en la misma transacción. No confundir con una firma creada por el propio navegador. |
| Colaboración / actor spoofing | Handler HTTP ya exige login y ACL del Host, elimina identificadores actor enviados por cliente, comprueba origen y controla mensajes por minuto. Ahora también limita ráfagas por segundo por actor. | Rate limiter en memoria funciona **por proceso**. Un servidor WebSocket o varios workers requieren protección por conexión, límites distribuidos, controles de sala y desconexiones. |
| CDN / Supply Chain / SRI | `build-cdn.mjs` genera SHA-384 exacto para seis scripts **versionados** Player/Studio/Analytics; se publica `sri.json` y `index.json.*.integrity`. `verify-cdn-sri.mjs` compara hash con bytes distribuidos y comprueba cabeceras. `build-site.mjs` ya no sobrescribe las cabeceras CORS y CSP del CDN. | El Host debe fijar la versión **y el digest** en su HTML. `/current/` es mutable y no es una URL apropiada para pinning estable. SRI del loader no verifica automáticamente todos los módulos importados; reforzar cadena CI/CD, MFA y permisos de publicación. |
| CSP | Web pública tiene política CSP; CDN contiene políticas diferenciadas de runtime y cabeceras `nosniff`. | El LMS o la web que embebe `<p2lrn-player>` debe definir su propia CSP; no puede imponerse universalmente desde el SDK. |
| OIDC / PKCE | LTI 1.3 de P2LRN valida estado, nonce y token `id_token` del LMS con firma/asociación. | **PKCE es exigible al Host que implemente OAuth Authorization Code**, no a un lanzamiento LTI 1.3 con `id_token` por `form_post`. El ejemplo aportado por terceros no debe copiarse: guardar un token de acceso como cookie de sesión, comparación de estados sin controlar longitudes y falta de consumo de estado son decisiones inseguras. |
| LTI AGS/NRPS / SSRF de salida | Emisores y orígenes registrados, comprobación DNS de IP no pública y sin redirects por defecto. | Persiste posibilidad de cambio DNS entre validación y conexión (**TOCTOU**). Requiere conexión fijada a IP comprobada o egress de Host. No declarar cerrado. |
| NPM y bibliotecas H5P | El código fuente declara `0.5.0-alpha.12`; los paquetes del registro público siguen desalineados y `latest=0.0.0-stage`. | No lanzar nueva versión mientras falle la auditoría H5P individual de terceros y la batería global de CI. No desactivar los gates ni dar por cubierta la licencia con una advertencia al autor del curso. |

## Pruebas añadidas (requieren ejecución de CI final)

- `packages/toolkit/test/browser-zip-decompression-security.test.mjs`: tamaño declarado falsificado en ZIP, expansión acotada, lectura local sin buffer descontrolado y rutas peligrosas.
- `packages/toolkit/test/player-untrusted-json.test.mjs`: prototipos en manifest y grafo.
- `packages/toolkit/test/runtime-message-security.test.mjs`: puentes SCORM/H5P, tamaño, profundidad, ciclos, prototipos.
- `packages/toolkit/test/web-content-entrypoint.test.mjs`: escapes de assets codificados y claves reservadas.
- `packages/toolkit/test/creator-import-disk-path-security.test.mjs`: Windows ADS, rutas, nombres reservados.
- `packages/toolkit/test/collaboration-http.test.mjs`: rate limit por ráfaga.
- `packages/studio/test/html-sanitizer-security.test.mjs`: paridad de saneamiento en Studio npm y Studio web, y saneamiento de pegado/arrastre.
- `packages/analytics/test/secure-dataset-http.test.mjs`: autorización por curso/actor, CORS, PII, grades informativas, errores y cuotas.
- `packages/player/test/trusted-result-receipt.test.mjs`: fraude por replay, firmas, caducidad y cruce de alumnos.
- `scripts/verify-cdn-sri.mjs`: SHA-384 de bytes y supervivencia de cabeceras tras el build; integrado en `scripts/verify-distribution-identity.mjs`.

### Comandos de verificación del repositorio

```bash
cd packages/toolkit
npm ci
npm run build
node --test test/browser-zip-decompression-security.test.mjs \
  test/player-untrusted-json.test.mjs \
  test/runtime-message-security.test.mjs \
  test/creator-import-disk-path-security.test.mjs \
  test/web-content-entrypoint.test.mjs \
  test/collaboration-http.test.mjs

cd ../..
node --test packages/studio/test/html-sanitizer-security.test.mjs
node --test packages/analytics/test/secure-dataset-http.test.mjs
node --test packages/player/test/trusted-result-receipt.test.mjs
node deploy/netlify/build-site.mjs
node scripts/verify-cdn-sri.mjs
node scripts/verify-distribution-identity.mjs
```

Los comandos anteriores son **procedimiento de aceptación**, no una declaración
de que todas las suites hayan aprobado. En esta sesión, el terminal Windows
alcanzó su límite de procesos concurrentes y GitHub Actions dejó varios runs
en cola/cancelados por commits sucesivos. No hay confirmación todavía de un
CI global limpio ni de prueba de navegador final para el último commit.

## Política de publicación y compatibilidad

Ninguna de estas medidas autoriza automáticamente una actualización NPM o
un despliegue en LMS de terceros. Las plantillas de seguridad que requieren
callbacks del Host **fallan cerradas** en su ausencia, no sustituyen el
sistema de cuentas, cursos ni base de datos. La política de saneamiento WYSIWYG
solo gobierna el **editor**; los scripts legítimos de paquetes SCORM/H5P
permanecen disponibles dentro del runtime aislado del Player.

Para una entrega: fijar un commit estable; compilar Toolkit y distribuciones,
ejecutar toda la regresión y tests reales en Chrome/Edge, comprobar los cinco
tarballs y hashes del CDN, ejecutar escáner de secretos/historial y auditoría de
dependencias vendorizadas; y validar login/ACL, notas, rutas y políticas en el
Host que vaya a utilizar P2LRN.

**Conclusión:** múltiples riesgos ya estaban controlados y otros se han
reforzado en código, pero el ciclo final de certificación y las integraciones
con servidores externos quedan expresamente abiertos.
