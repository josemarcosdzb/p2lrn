# P2LRN — auditoría de la sección de licencias (rama de diseño)
Fecha: 3 de noviembre de 2026
Rama: `redesign/home-sections-2026-11`
Ámbito: presentación y documentación pública de `/licencia/` y `/en/licencia/`.

## Autoridad y alcance

La autoridad contractual es `/LICENSE` (P2LRN-NCSL 1.0; texto original español), incluido su Anexo A del 30 de octubre de 2026; `/NOTICE.md` documenta alcance, excepciones y terceros. **Este trabajo no modifica LICENSE ni NOTICE.**

La base se declara *source-available* y no aprobada como open source por OSI. El Anexo A concede permisos comerciales concretos y vinculantes sobre código first-party bajo control del licenciante, sin convertir automáticamente todo el producto ni sus dependencias en software con licencia comercial sin restricciones.

- **A.1:** formato `.p2lrn`, distribución/venta de cursos e implementaciones compatibles de especificaciones y esquemas, sin otorgar patentes ni marcas.
- **A.2:** Player, Toolkit y lanzador nativo offline para uso, integración, modificación y redistribución comercial, con avisos, licencia y obligaciones de fuente correspondiente.
- **A.3:** Studio y Analytics **oficiales y sin modificar**, de uso propio dentro de instituciones públicas/privadas y academias, incluso cursos de pago. Configuraciones e integraciones documentadas permitidas; modificación, reventa, SaaS/LMS/servicio comercial para terceros requiere autorización previa y expresa.
- **A.4:** los autores conservan derechos sobre contenidos y resultados; terceros, marcas y derechos independientes quedan fuera de la concesión.

## Cambios incorporados y verificados (3 de noviembre de 2026)

- Pie de página: repositorio `https://github.com/josemarcosdzb/p2lrn` en Recursos y crédito final «Creado por Jose Marcos Diaz» / «Created by Jose Marcos Diaz». Se aplica al footer compartido, sin alterar los pies internos de formularios.
- Metadatos `repository.url` corregidos en los cinco paquetes npm; `scripts/check-publish-ready.mjs` impide reintroducir el antiguo propietario.
- Página bilingüe de licencias con tabla, obligaciones, FAQ, enlaces a `LICENSE` y `NOTICE.md`, y seis enlaces a los manifiestos de fuente de Player, Toolkit, Studio, Analytics y lanzador Windows, incluida descarga `.tar.gz`.
- Licencias comerciales especiales: las peticiones se realizan exclusivamente por el formulario de `/contacto/#solicitar-licencia` o `/en/contacto/#solicitar-licencia`; el formulario explica qué información enviar y que solo un acuerdo expreso por escrito puede autorizar el uso.
- Generadores de código fuente correspondientes por versión para Toolkit/Studio/Analytics y para el lanzador nativo, con SHA-256. El build de CDN publica snapshots de fuente por versión además de `current`.
- Auditoría H5P real sobre el snapshot fijado de Lumi: 144 bibliotecas, 4722 archivos, 96 MIT declarados, 11 MIT por texto completo del README, 2 MPL, 1 GPL3, 2 dominio público y **32 sin evidencia individual suficiente**.
- El control estricto `scripts/audit-third-party-licenses.mjs --strict` está integrado en `verify-npm-pack` y **bloquea intencionadamente la publicación** hasta resolver esos 32 casos. Consulta `docs/engineering/licensing-third-party-audit-2026-11-03.md`.
- CI nueva en la rama: `.github/workflows/p2lrn-license-design-qa.yml` con Windows self-hosted, Go 1.26, Chrome, build y gate de licencias.

## Resultado de las pruebas ejecutadas

- `node scripts/check-publish-ready.mjs` y `node scripts/verify-license-integration.mjs`: correctas.
- `node --test deploy/netlify/test/site-footer.test.mjs deploy/netlify/test/corresponding-source.test.mjs`: **9/9 correctas**; los tests modifican un archivo de prueba para demostrar que la verificación SHA detecta corrupción.
- `node scripts/browser-license-footer-qa.mjs`: **8/8** combinaciones ES/EN × 320, 390, 768 y 1280 px correctas; sin scroll horizontal, con enlaces y crédito en su posición.
- Fuente con hashes validada localmente: Toolkit **181 archivos**, Studio **51**, Analytics **10**, y el código nativo Go en archivo verificable.
- `node packages/player/scripts/build-dist.mjs` produjo 131 archivos con textos de licencias de Three.js, Rapier y H5P Standalone.
- `node packages/h5p-libraries/scripts/build.mjs` produjo 144 bibliotecas. La auditoría estricta falló por los 32 casos sin prueba de licencia; no se han ocultado o eliminado.
- `node deploy/netlify/build-site.mjs`: **PASS** con Go 1.26 portátil en Windows, sobre el commit de la rama `d70a909` (la rama puede continuar cambiando). Resultado: **134 páginas, 128 URL en sitemap bilingüe, 50 guías ES y 50 EN indexadas para búsqueda, enlaces locales validados, 4 ZIP de Skills**, Player 131 archivos y ejecutable Windows de 6.528.000 bytes con manifiesto/archivo fuente verificables. Además, `node scripts/browser-license-footer-qa.mjs --built`: **8/8** pruebas Chrome sobre el HTML compilado con footer compartido, formularios y enlaces correctos. Esta prueba local no certifica URLs públicas ni el último commit posterior.

## Qué falta para considerar cerrada la entrega

1. **Revisión jurídica formal** de la licencia y del Anexo A por un especialista, especialmente patentes en integraciones comerciales, límites de uso institucional y compatibilidad con obligaciones copyleft.
2. **Acreditar los derechos de 32 bibliotecas H5P** mediante licencia original/revisión/autorización. No suprimir funciones ni desactivar `--strict` para forzar una aprobación.
3. **Despliegue público y distribución verificada**: el build **local ya pasa** con Go 1.26; quedan la ejecución CI en el commit que finalmente se publique, la descarga real de Netlify/navegador y npm y el cotejo de versiones, licencias, avisos, hashes y fuente correspondiente publicada.
4. **Validación operativa del formulario comercial** y proceso de autorización contractual revisado; enviar el formulario no otorga licencia.
5. **Reconciliar con `main`**: la rama de diseño está divergida, por lo que no debe realizarse fusión ni `force push` hasta resolver diferencias con el trabajo más reciente del Player y la internacionalización.

Los documentos técnicos anteriores son evidencia de desarrollo; **no sustituyen una auditoría jurídica ni certifican un despliegue en producción**.

## Aceptación de la sección

La sección se considerará **técnicamente completa para distribución pública** cuando el build y los controles estrictos de terceros pasen sobre el commit final, el despliegue real se pruebe en navegador ES/EN, las licencias y avisos de los paquetes distribuidos se comprueben mediante descargas públicas y existan pruebas de correspondencia entre cada versión binaria, su manifiesto y su fuente. El build local y las pruebas Chrome del HTML compilado ya se han superado; eso no sustituye comprobar Netlify y npm en producción.

La **validez jurídica** requiere revisión profesional independiente.
