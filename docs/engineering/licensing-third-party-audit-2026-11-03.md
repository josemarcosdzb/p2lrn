# P2LRN — revisión de licencias de terceros y riesgos jurídicos

Fecha de comprobación: 3 de noviembre de 2026
Rama: `redesign/home-sections-2026-11`
Versión: `0.5.0-alpha.12`

## Alcance y evidencia

La auditoría técnica ejecutó `node packages/h5p-libraries/scripts/build.mjs` sobre el snapshot fijado de `Lumieducation/Lumi`, commit `236912f8e3c07a6b5c7ece4930b98fec2b6d3f6a`, con comprobación de SHA-256 del archivo descargado. El corpus generado contiene **144 bibliotecas, 4.722 archivos, 39.376.322 bytes**. Se leyeron los `library.json` reales y se contrastaron con `dist/index.json`.

Se ejecutó también `node packages/player/scripts/build-dist.mjs`, que generó 131 archivos. Se inspeccionaron tres textos de licencia incluidos en la distribución del Player: Three.js 0.186.1 (MIT), Rapier 3D 0.21.0 (Apache-2.0) y h5p-standalone 3.8.2 (MIT). No se han atribuido derechos sobre el software de terceros a P2LRN.

## Inventario verificado

| Evidencia | Número |
| --- | ---: |
| H5P: MIT declarado en `library.json` | 96 |
| H5P: licencia MIT completa en `README.md` original (sin campo en `library.json`) | 11 |
| H5P: MPL declarado | 1 |
| H5P: MPL2 declarado | 1 |
| H5P: GPL3 declarado | 1 |
| H5P: dominio público declarado (`pd`) | 2 |
| H5P: sin permiso individual suficientemente acreditado | **32** |
| **Total** | **144** |

El archivo `THIRD_PARTY_NOTICES.md` del paquete H5P identifica la procedencia de Lumi y su metadato AGPL-3.0; ello **no sustituye** las licencias particulares de las bibliotecas. Los 11 casos MIT se respaldan con los textos completos y copyright del propio README distribuido, sin inferir derechos por similitud de nombre o versión.

### Bibliotecas pendientes de acreditar (32)

- `flowplayer-1.0`
- `H5P.Audio-1.2`
- `H5P.ContinuousText-1.2`
- `H5P.DragNBar-1.4`
- `H5P.DragNResize-1.2`
- `H5P.ExportableTextArea-1.3`
- `H5P.ImageMultipleHotspotQuestion-1.0`
- `H5P.JoubelUI-1.3`
- `H5P.Link-1.3`
- `H5P.Nil-1.0`
- `H5P.Table-1.1`
- `H5P.Text-1.1`
- `H5PEditor.ARMarkerGenerator-1.0`
- `H5PEditor.BranchingQuestion-1.0`
- `H5PEditor.DateTime-1.0`
- `H5PEditor.DragQuestion-1.10`
- `H5PEditor.Duration-1.1`
- `H5PEditor.GameMap-1.2`
- `H5PEditor.ImageCoordinateSelector-1.2`
- `H5PEditor.ImageHotspotQuestion-1.8`
- `H5PEditor.ImportantDescription-0.1`
- `H5PEditor.InfoWall-0.2`
- `H5PEditor.InfoWallPassiveList-0.1`
- `H5PEditor.InputRow-1.0`
- `H5PEditor.KewArCode-1.0`
- `H5PEditor.RadioGroup-1.1`
- `H5PEditor.RadioSelector-1.2`
- `H5PEditor.Shape-1.0`
- `H5PEditor.ThreeDModelLoader-1.0`
- `H5PEditor.Timecode-1.2`
- `H5PEditor.UrlField-1.2`
- `H5PEditor.Wizard-1.2`

No hay licencia individual concluyente para estos archivos en los campos y encabezados inspeccionados del snapshot. No debe asignarse MIT, AGPL, GPL u otra licencia sin evidencia del titular/autor o de la fuente original.

**Acción de liberación:** obtener y conservar para cada biblioteca pendiente una licencia original trazable (texto oficial, repositorio y revisión/commit, o autorización expresa), revisar los avisos exigidos e incorporar esa evidencia antes de permitir que `scripts/audit-third-party-licenses.mjs --strict` apruebe la publicación. La prueba estricta queda intencionadamente **bloqueada por los 32 casos**.

## Revisión de coherencia jurídica de la licencia P2LRN

Revisión documental; **no es dictamen jurídico profesional** ni modifica `LICENSE`.

1. El texto base de P2LRN-NCSL 1.0 restringe los usos comerciales. El Anexo A del 30/10/2026 actúa como concesión adicional para casos expresamente enumerados; el resumen web debe señalar que ambos textos rigen conjuntamente.
2. **A.1:** concesión respecto de copyright del formato y especificaciones, sin patentes ni marcas. Debe revisarse si una implementación comercial de una especificación necesita alguna concesión de patente adicional.
3. **A.2:** uso comercial, modificación y redistribución de Player, Toolkit y lanzador nativo, con avisos de cambios y fuente correspondiente. La sección 15 de la licencia base menciona expresamente patente para uso no comercial; hay que analizar la ausencia de concesión comercial de patente en A.2 antes de presentar permisos como absolutamente libres de patentes.
4. **A.3:** uso interno no modificativo de Studio y Analytics incluso en instituciones con ánimo de lucro y cursos de pago, pero no comercialización, transformación o prestación a terceros como SaaS/LMS. Conviene delimitar contractualmente los casos de proveedores de hosting o integradores que actúan por cuenta de una academia.
5. **A.4 y secciones 12-14:** los cursos son de sus autores; no se licencian por ello bibliotecas H5P, marcas ni materiales de terceros. Revisar el uso de marcas P2LRN al distribuir ejecutables derivados.
6. **Secciones 9 y 10:** suministro de fuente en formas no fuente, distribuciones modificadas y modificaciones accesibles por red, incluidos requisitos de disponibilidad durante al menos tres años cuando se use URL pública.
7. **AGPL/GPL/MPL/CC y combinación de obras:** la separación técnica entre paquetes no demuestra por sí misma compatibilidad de licencias o ausencia de obligaciones de divulgación de código. Debe revisarse la forma exacta de incorporación y distribución de dependencias copyleft por un especialista.
8. El nombre de marca/crédito de la web «Jose Marcos Diaz» no modifica la titularidad de copyright que el `LICENSE` identifica con el nombre completo.

La validación jurídica formal exige revisión y aprobación de profesional competente. Hasta entonces no se modificará el texto vinculante sin decisión expresa de su titular.

## Evidencia de publicación

- **Pruebas de código ejecutadas:** compilación Player y H5P, auditoría de manifiestos y README, lectura de avisos y licencia fuente.
- **Verificación estricta:** fallida por 32 bibliotecas sin evidencia suficiente; este fallo no debe maquillarse ni desactivar el gate.
- **GitHub/CDN/npm:** cada versión distribuida debe contrastarse con su tarball, hash, `LICENSE`, `NOTICE.md`, `THIRD_PARTY_NOTICES.md` y fuente correspondiente. Una prueba local no acredita que el CDN público ya se haya actualizado.
- **Licencias comerciales especiales:** la página `/licencia/` enlaza al formulario `/contacto/#solicitar-licencia`; la solicitud no concede permiso sin autorización escrita.

## Comandos reproducibles

```bash
node packages/h5p-libraries/scripts/build.mjs
node packages/player/scripts/build-dist.mjs
node scripts/audit-third-party-licenses.mjs --strict
node scripts/check-publish-ready.mjs
node scripts/verify-license-integration.mjs
```

Se conserva el código de los 32 casos en el corpus de pruebas para no perder funcionalidades sin autorización. No se debe distribuir una versión nueva afirmando que esta auditoría está completada mientras los casos no estén resueltos.
