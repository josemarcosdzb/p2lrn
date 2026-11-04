# Auditoría de seguridad y verificación de P2LRN — 4 noviembre 2026

Repositorio: josemarcosdzb/p2lrn. Base de la auditoría: main 2f6691ca57dcd7296bb3aae4640a7a64c38b89e3 (posteriores cambios ajenos se conservarán al integrar).

## Alcance y resultados ejecutados

- Dependencias: npm audit --audit-level=low en Player, Analytics, Studio, Toolkit y H5P Libraries: 0 avisos en cada paquete, con lockfiles presentes. Esto NO inspecciona el código H5P vendorizado.
- Toolkit: 218 pruebas, 217 aprobadas, 0 fallidas, 1 omitida; incluidas las tres pruebas de protección ZIP. TypeScript compilado con la versión fijada del repositorio tras solucionar el error de firma TS2554 sin retirar maxOutputLength.
- Player, Analytics, Studio, LTI/NRPS, conectores y H5P: 107 pruebas, 107 aprobadas, 0 fallidas. Studio setup: ocho rutas/objetivos probados, incluido generador Django y Express.
- Studio Django: prueba adicional REAL en Django 5.2.19 con CSRF 403, anónimo 401, ausencia de callback de permisos 403, permiso por curso, subida y sustitución atómicas, traversal y exceso de tamaño 400/413, Reader e Import 403. Resultado: DJANGO_STUDIO_SECURITY_OK.
- SCORM/H5P/HTML/cmi5: ocho escenarios reales Chrome headless correctos (actividad SCORM 1.2 con puntuación 100; H5P Crossword xAPI; dependencia ausente y contenido hostil SCORM 1.2, SCORM 2004, HTML, cmi5 y H5P). Bloqueadas las solicitudes de red no autorizadas; escenarios repetidos después del parche vendorizado.
- H5P: reconstrucción desde Lumi commit 236912f8e3c07a6b5c7ece4930b98fec2b6d3f6a, con SHA-256 de origen 388ca78e78cf26fe428a973f008a2a4583052e3732cc5c92ae990e4edf57f9b5. Catálogo: 144 bibliotecas, 4722 archivos. El hash y la enumeración de archivos se verificaron.
- NPM: cinco tarballs locales 0.5.0-alpha.12 empaquetados e instalados juntos sin publicar. Los archivos instalados comprueban el SHA-256 H5P corregido y las rutas Django protegidas. El empaquetado completo se detiene de forma intencional al ejecutar la auditoría estricta de licencias de terceros.

## Correcciones de seguridad incorporadas en esta auditoría

1. H5P/jQuery UI CVE-2022-31160 (confirmada): la biblioteca jQuery.ui-1.10 integra internamente jQuery UI 1.13.0 con el código checkboxradio vulnerable. Se aplica la corrección puntual del commit oficial 8cc5bae1caa1fcf96bf5862c5646c787020ba3f9 mediante script reproducible que exige SHA-256 de origen c97ce1981a8a5bc7c22d5e3afc824dc0c25629e554f7e3f4c408cc3494cf98ad y salida 082af49919f57b9e0a51a4a8edf6a17424b7c7a2079dd3b6eae7e8419b2e4cd5. El manifest generado registra original, parche y origen. Dos pruebas de seguridad de este parche pasan y las ocho pruebas de navegador vuelven a pasar. No se afirma que toda la biblioteca sea jQuery UI 1.13.2.
2. Studio Django: se eliminan los csrf_exempt, se requiere autenticación de sesión y callback P2LRN_STUDIO_AUTHORIZE que devuelva True, se valida el curso, se limita el cuerpo recibido, se restringen nombres y se escriben cursos mediante temporal y os.replace con limpieza. Se prueban los tres endpoints contra Django real.
3. Studio Express: installP2LRNStudio(app,{authenticate,authorize,verifyCsrf}) falla al registrar rutas si falta cualquiera de los tres callbacks. Las peticiones no autorizadas se rechazan antes de que express.raw procese el fichero. Nueva prueba de denegación por identidad/permisos/CSRF y autorización por operación.
4. Toolkit ZIP: el límite real de descompresión maxOutputLength sigue vigente. Se adapta el tipado a @types/node 22.10.0 y se compila con TypeScript 5.6.3; se conservan los tres ensayos ZIP.
5. Cadena de publicación: verify-npm-pack.mjs comprueba el hash de bytes H5P dentro del paquete instalado y los tres guards CSRF Django y las rutas Express con autenticación. La auditoría estricta de terceros NO se salta.

## Bloqueos y riesgos pendientes — no declarar seguridad total

ALTO — Las plantillas generadas por Studio para otros frameworks (Next.js, FastAPI, Flask, etc.) todavía requieren que el integrador configure autenticación, autorización por curso, CSRF, límites y gestión de rutas. No todas implementan protección obligatoria como Django y Express. Las plantillas son ejemplos técnicos, NO servicios listos para exponer directamente a Internet. Deben cerrarse o probarse con cada framework antes de distribuir un generador considerado seguro por defecto.
ALTO — La auditoría de licencias individuales de H5P sigue bloqueada por 32 bibliotecas sin evidencia suficientemente contrastada. El gate --strict termina en error correctamente; no se han eliminado actividades ni deshabilitado el control.
MEDIO — Existen numerosos puntos potenciales de inyección y evaluación dinámica en bibliotecas H5P vendorizadas; una búsqueda de patrones NO basta para atribuir vulnerabilidades o absolver 4722 archivos. Deben realizarse SAST/SCA con reglas para bibliotecas vendorizadas, revisión de CVEs por versión y pruebas de aislamiento por modo real.
MEDIO — Los iframes aislados mantienen allow-scripts + allow-same-origin únicamente en origen separado cuando la compatibilidad requiere API SCORM/H5P; falta una auditoría browser E2E para todas las topologías, versiones LMS y políticas CSP reales.
MEDIO — El almacenamiento de resultados de referencia serializa escrituras dentro de UN proceso; varios servidores requieren mutex distribuido/almacenamiento transaccional, cuota de disco y control de velocidad del Host.
INFRA — GitHub Actions Windows no ejecuta el checkout: error reproducible de permisos al escribir .git/config en el runner self-hosted p2lrn-security. El script de CI reporta fallo de infraestructura antes de probar el código. Se ejecutaron pruebas locales en Windows. No declarar CI global aprobado.
INFRA — La prueba de symlinks de Studio no pudo crear enlaces en Windows; no certifica protección frente a un atacante local capaz de modificar rutas simultáneamente.
PUBLICACIÓN — No se publican versiones NPM desde esta auditoría. Cualquier publicación exige credenciales propias aprobadas por npm y superar los gates de licencias.

## Limitaciones

La revisión no certifica ausencia absoluta de vulnerabilidades. No se completó un escaneo independiente del historial Git completo con Gitleaks ni un SAST integral con Semgrep/CodeQL/Trivy/OSV por no estar instaladas esas herramientas en el host. No se alteraron ramas ajenas ni se eliminaron funcionalidades.
