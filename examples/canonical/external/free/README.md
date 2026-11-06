# Paquetes gratuitos externos de la galería P2LRN

Esta carpeta conserva **19 paquetes** en `provenance.json`, cada uno con su fuente, licencia, SHA-256 del ZIP/H5P/IMSCC original y SHA-256 del nuevo archivo `.p2lrn`. La conversión emplea `convertExternalPackage` del Toolkit oficial. No se sobrescriben los originales.

| Perfil | Número | Origen y licencia |
|---|---:|---|
| SCORM 1.2/2004 | 7 | XtoSCORM, MIT, https://xtoscorm.com/scorm-example |
| H5P | 7 | Ejemplos H5P.org conservados por `justineuro/h5p-view`, CC BY 4.0 por defecto según https://h5p.org/licensing, salvo excepciones de derechos de uso de medios individuales |
| IMS Common Cartridge | 3 | `instructure/common-cartridge-viewer`, fixtures con licencia MIT, https://github.com/instructure/common-cartridge-viewer |
| QTI 2.2/3.0 | 2 | Preguntas de demostración creadas por `scripts/import-community-formats.mjs`, con `GENERATED-LICENSE.md` MIT |

La fuente original se conserva byte a byte dentro del contenedor; la transformación mantiene metadatos y estructura **hasta el alcance declarado de cada perfil**. La preservación no implica ejecución de todos los perfiles, conformidad SCORM 2004, procesamiento completo QTI ni calificaciones oficiales.

El comprobador de integridad y procedencia es:

```sh
node scripts/verify-community-samples.mjs
```

La comprobación funcional real requiere construir la web y ejecutar Chrome/Edge, incluyendo inspección del DOM dentro de los iframes, navegación, interacción, eventos, galería y capturas:

```sh
node deploy/netlify/build-site.mjs
node scripts/browser-external-format-visual-qa.mjs
```

El workflow `p2lrn-community-browser-qa.yml` ejecuta este proceso en el runner Windows y guarda evidencias en `Downloads/P2LRN-QA-LOCAL/community-browser/<run_id>/`; **no utiliza los artefactos de GitHub Actions**. Se marca `browserVerified: false` hasta que una verificación funcional suficiente quede documentada y vinculada a la versión del paquete.

El workflow `p2lrn-community-live-audit.yml` comprueba el catálogo y las rutas públicas en `p2lrn.org` y Netlify por separado. La rama de trabajo es `mejorastudio`; producción se despliega desde `main`. Un paquete presente en la rama no debe mostrarse como publicado si no figura en la web.
