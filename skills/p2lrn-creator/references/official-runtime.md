# APIs oficiales P2LRN para Skills

P2LRN Core 0.4.0, Toolkit/Player/Studio/Analytics 0.5.0-alpha.12, Authoring API 1. La Skill **invoca componentes publicados**, no duplica Creator, Reader, Player, Studio o Analytics. Las versiones verificadas se encuentran en `official-packages.json` y se comprueban contra el repositorio al construir los ZIP.

## Toolkit Node 22+ (cuando está instalado y autorizado)

```bash
node scripts/p2lrn_official.mjs capabilities --root /ruta/proyecto
node scripts/p2lrn_official.mjs create plan.json nuevo.p2lrn --root /ruta/proyecto
node scripts/p2lrn_official.mjs verify nuevo.p2lrn --root /ruta/proyecto
node scripts/p2lrn_official.mjs inspect nuevo.p2lrn --root /ruta/proyecto
node scripts/p2lrn_official.mjs open original.p2lrn proyecto-importado --root /ruta/proyecto
node scripts/p2lrn_official.mjs edit proyecto-importado cambios.json --root /ruta/proyecto
node scripts/p2lrn_official.mjs build proyecto-importado nuevo-editado.p2lrn --root /ruta/proyecto
node scripts/p2lrn_official.mjs read-document apuntes.docx --root /ruta/proyecto
```

El plan permite `title`, `language`, `description`, `rights`, `units`, `operations`. Estas últimas llaman a los métodos reales `setCourseRights`, `setCourseMetadata`, `setEntityText`, `setChildren`, `setProgression`, `addUnit`, `addFile`, `addUrl`, `addWebContent`, `addQuestionnaire`, `addComponent`, `addComposite` de `P2LRNAuthoringWorkspace`; el payload `options` sigue sus contratos. Nunca `replace` ni `update` arbitrario. Se bloquea sobrescritura de `.p2lrn` y proyectos, versiones de Toolkit no validadas y métodos arbitrarios.

Ejemplo:

```json
{"title":"Astronomía inicial","language":"es","rights":{"author":"Docente"},"units":[{"key":"u1","title":"Sistema solar","parent":"course"}],"operations":[{"method":"addUrl","options":{"key":"recurso1","title":"Material","url":"https://example.org/curso","parent":"u1"}}]}
```

Las fuentes para cuestionarios y componentes deben cumplir el esquema oficial. Validación `strictProfiles` y `validateProfilePayloads` no acredita renderizado 3D.

## Interfaz Player, Studio, Reader y Analytics

- **Studio:** web `https://p2lrn.org/studio/` o componente `@p2lrn/studio` y peer Player. Contiene importaciones, edición WYSIWYG, vista alumno y exportación de cursos y entregas `.p2lrn-offline.exe` Windows, ZIP y CMD legado. No reproducir el editor dentro de la Skill.
- **Player:** `https://p2lrn.org/demo/` o `@p2lrn/player` / `<p2lrn-player src="/courses/curso.p2lrn">`. Se necesita navegador y prueba visual real para afirmar que un juego 2D/3D funciona.
- **Reader documental:** `readDocument` de Toolkit. Dependencias opcionales pueden limitar PDF; no prometer OCR.
- **Analytics:** `@p2lrn/analytics`, necesita una fuente de datos de Host autorizado. Sólo grades con `authoritative === true` son oficiales.
- **MCP:** servicio opcional independiente con 23 herramientas; lectura y escritura con permisos separados. La Skill no registra servidores ni activa escritura automáticamente.
- **LMS/LTI 1.3:** `integration/lms`, requiere credenciales/Host y pruebas reales. No simular transferencias.

## Novedades del Studio visual y ensamblaje

La Skill distribuida incluye `references/studio-arrastre-ensamblaje-3d.md`, con los tres recorridos distintos de arrastre: **mover objetos en el editor**, **arrastrar fichas a zonas sobre una imagen** y **ensamblar GLB en 3D**. Es guía para usar la interfaz oficial; el adaptador CLI no ejecuta pulsaciones ni sustituye la edición interactiva.

- Editor WYSIWYG: `command-bar.js` y `studio-object-tools.js` compartidos entre Studio web y npm, con `Archivo`, `Formato`, `Insertar`, posición, tamaño, formas y contenedores.
- Arrastrar y soltar: `studio-drop-activity.js` (autoría), `renderers/lesson-drop-runtime.js` (Player en iframe aislado); `drag-scored` y `fill-blanks` modo arrastre son otros contratos.
- Ensamblaje 3D: juego `assembly-3d`, pregunta nativa `classification` con `assembly3d`, GLB incrustado, piezas/submallas, jaulas de destino, encaje geométrico y validación del Player. Usar `studio/assembly-3d-editor.js` y `assembly-3d-core.js`; `addQuestionnaire` por sí solo no demuestra la escena jugable.

**No atribuir la versión del código fuente a lo publicado.** Validar en navegador real, exportar/reabrir y comprobar npm/CDN antes de anunciar compatibilidad.

## Seguridad y licencia

No ejecutar recursos de un `.p2lrn` durante inspección ni instalar paquetes sin autorización. Las notas de un resultado SHA-256 no están firmadas. Las rutas de los archivos y la exportación se validan antes de entregar. El Anexo A de LICENSE del 30-10-2026 modifica permisos comerciales para formato/Toolkit/Player y permisos institucionales para Studio/Analytics sin modificar. No llamarlo Open Source OSI.

Si Node/Toolkit no están disponibles, utilizar el script Python sólo para crear **cursos nuevos sencillos**, con test `valid: true`, explicando limitaciones. Para editar/importar arbitrarios, esperar al Toolkit oficial.
