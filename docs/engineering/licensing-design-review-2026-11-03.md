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

## Cambios implementados

- `deploy/netlify/site/licencia/index.html`: explicación en español, actualización de jerarquía visual, diez secciones, tabla semántica de cinco componentes, cinco verificaciones de redistribución, seis preguntas frecuentes, enlace al contrato `/LICENSE`, `/NOTICE.md`, y el manifiesto de fuente del Player.
- `deploy/netlify/site/en/licencia/index.html`: versión inglesa editorialmente revisada, estructuralmente equivalente, con aviso de prevalencia del contrato español; corrige el anterior `Volver arriba` residual.
- `deploy/netlify/site/p2lrn.css`: estilos limitados a `.license-page`, adaptación a móvil, tabla desplazable con teclado, estados de foco, FAQ nativas con `details/summary` y control de movimiento reducido.
- `scripts/generate-site-english.mjs`: retiene la página jurídica inglesa como documento revisado para no sobrescribirla al regenerar todo `/en/`.
- `scripts/verify-license-page.mjs`: verificación de referencias al Anexo A, paridad ES/EN de estructura, enlaces y anclas, cinco filas, seis FAQ, cobertura de fuente, avisos y adaptación.
- `scripts/verify-license-integration.mjs`: incorpora la comprobación anterior al flujo de integración ya usado en CI.

Los ejemplos y la tabla son resúmenes informativos; la autoridad sigue siendo LICENSE. **No se ha habilitado un sistema de compra, cobro o concesión automática de licencias.**

## Qué falta antes de dar por completa la sección

1. **Revisión jurídica formal** de la versión 1.0 y del Anexo A, especialmente el alcance de uso interno vs SaaS/servicios a terceros, responsabilidad, marcas y patentes. La revisión técnica no certifica suficiencia legal.
2. **Prueba de navegador sobre despliegue de la rama**: comprobar rutas, indexación, hreflang, focus/teclado, enlaces públicos, móviles (320, 390 y 768 px) y escritorio. Validar el menú global, las FAQ y el desbordamiento de la tabla.
3. **Comprobación de descargas reales**: `/LICENSE`, `/NOTICE.md`, manifiesto `/player/current/source/SOURCE-MANIFEST.json`, paquetes npm publicados y sus licencias/avisos. El enlace de manifiesto actual documenta Player; faltan verificaciones de fuente por versión para todas las distribuciones cubiertas.
4. **Inventario verificable de terceros** en las distribuciones finales (incluidas bibliotecas H5P, assets y licencias de dependencias), no solo ejemplos principales.
5. **Proceso de licencias comerciales especiales** para modificaciones o uso SaaS de Studio/Analytics: canal de solicitud, evaluación y contrato autorizado, sin publicar tarifas ni condiciones no aprobadas.
6. **Trazabilidad de versiones**: correlacionar edición de LICENSE/NOTICE, versión npm, CDN, binarios, manifiestos y archivo de condiciones aplicables a cada versión.
7. **Integración de rama**: la rama de diseño está divergida respecto de `main`; resolver los conflictos de publicación y del generador bilingüe antes de integrar, sin perder funcionalidades posteriores.

## Aceptación de la sección

La sección se considerará **técnicamente completa** cuando el verificador de licencias y el build de Netlify pasen en el estado final de la rama, la página y sus enlaces se prueben en navegador real ES/EN a las resoluciones indicadas, los avisos de paquetes se comprueben mediante descargas reales y exista evidencia de las correspondencias de fuente/versiones.

La **validez jurídica** requiere revisión profesional independiente.
