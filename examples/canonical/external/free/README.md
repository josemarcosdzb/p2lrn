# Paquetes gratuitos externos para el catálogo de P2LRN

Estos siete cursos de prueba **reales** proceden de XtoSCORM: https://xtoscorm.com/scorm-example. El autor los distribuye bajo **licencia MIT**. Conservamos el ZIP original sin modificar dentro de cada contenedor `.p2lrn` (Core 0.4.0) y su SHA-256 en `provenance.json`, junto con el origen y el SHA-256 del nuevo contenedor.

- SCORM 1.2: Snack Safety, Dog Maths 101, Working for a Cat 101 y Procrastination 101 (recuperación de sesión).
- SCORM 2004: Snack Safety, Dog Maths 101 (varios SCO) y Could This Have Been an Email?.

Cada curso se convierte con `convertExternalPackage` del Toolkit oficial y supera validación estructural. **No equivalen a una certificación funcional en el navegador**, ni demuestran compatibilidad integral SCORM 2004. Se mantienen con `browserVerified:false` hasta superar pruebas reales de interacción y seguimiento. Las bibliotecas y enlaces externos solo se ejecutan dentro del runtime aislado que corresponda.

Ejecutar `node scripts/verify-community-samples.mjs` desde la raíz del repositorio para comprobar integridad y preservación exacta del original. La web debe generar el catálogo exclusivamente a partir de este corpus verificado, sin enlaces arbitrarios a contenido no aprobado.