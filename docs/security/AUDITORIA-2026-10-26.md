# Auditoría de seguridad P2LRN — 26 de octubre de 2026

## Alcance

Repositorio privado `josemarcosfrodo/p2lrn`, web `https://p2lrn.netlify.app/`, los cuatro paquetes npm de P2LRN (Toolkit, Player, Studio, H5P Libraries), conectores MCP, empaquetado de cursos, ejecución aislada de contenidos externos, configuración CI y formulario de contacto de Supabase. Auditoría de código, dependencias, cabeceras HTTP y regresión funcional automatizada. No es una certificación de invulnerabilidad ni sustituye un pentest profesional.

## Resultados comprobados

- **Dependencias:** `npm audit` sobre los cinco manifiestos y sus `package-lock.json` generados muestra **cero vulnerabilidades conocidas** en Toolkit, Player, Studio, H5P Libraries y MCP después de las correcciones.
- **Toolkit:** 179 pruebas correctas, ninguna fallida y 1 omitida por no disponer de permisos para crear enlaces simbólicos en Windows. Incluye firmas Ed25519, comprobación de integridad, límites de archivos, rutas y aislamiento de recursos.
- **MCP:** 30 correctas, ninguna fallida y 1 omitida por el mismo límite de Windows. Incluye autenticación Bearer, control de origen, DNS rebinding, permisos de escritura y validación de rutas.
- **Studio:** 8 pruebas del instalador y rutas aprobadas, más 5 pruebas específicas de seguridad de almacenamiento/subidas correctas (1 omitida).
- **Player:** distribución compilada con 127 archivos; 4 pruebas de seguridad del runtime correctas.
- **Web:** 54 documentos HTML inspeccionados mediante el nuevo verificador de CSP. En las plantillas inspeccionadas no se encontraron bloques `<script>` sin `src` ni handlers inline de los tipos comprobados. Se comprobó que el sitio público responde por HTTPS, con HSTS.
- **Supabase P2LRN:** RLS activado en `public.contact_messages`, política de inserción pública limitada por validaciones de campos. Su asesor de seguridad no comunicó advertencias en el momento de la revisión.

## Hallazgos y medidas aplicadas

| Riesgo | Evidencia | Medida aplicada |
| --- | --- | --- |
| Dependencia vulnerable | `integration/mcp` usaba `fflate 0.8.2`, afectada por CVE-2026-45820, bloqueo de ZIP64 malformado | Actualizada a `0.8.3`, versión corregida según GHSA-px8p-9vwx-vf98 |
| Agotamiento de memoria en importación | Las rutas de Studio acumulaban `request.arrayBuffer()` antes de verificar el tamaño real | Lectura de streaming limitada y cancelación temprana en guardar, importar y leer documentos |
| Salida del directorio de almacenamiento | Validación de ruta léxica insuficiente ante directorios enlazados | Validación de `realpath` del directorio y raíz y rechazo de enlaces simbólicos en el archivo de destino |
| Cabeceras web incompletas | En la web activa no aparecían CSP, `nosniff`, política de referencias ni otros controles | Archivo `deploy/netlify/site/_headers` con políticas por rutas; seguridad genérica para todos los recursos y CSP de documentos sin `unsafe-inline` ni `unsafe-eval` en scripts |
| Control de cadena de suministro insuficiente | El CI anterior no bloqueaba dependencias con avisos de nivel moderado o mayor | `security-windows` añadido **dentro del workflow existente**, con `npm ci`, `npm audit`, pruebas de Studio y verificación de CSP |
| Resoluciones no reproducibles | Faltaban archivos de bloqueo versionados de los cinco árboles npm | Cinco lockfiles incorporados y verificados |

La política CSP del sitio se limita a las páginas propias: **no se impone a los iframes/runtimes H5P y SCORM servidos desde `/player/`**, que requieren una política diferente y un origen aislado. Se han conservado los flujos funcionales y no se han creado ramas nuevas.

## Riesgos abiertos y restricciones

1. **Web activa:** las nuevas cabeceras están incorporadas al repositorio, pero **no están en producción** hasta un despliegue posterior. No se ejecutó ningún despliegue ni se alteró Netlify.
2. **Paquetes npm públicos:** siguen en `next=0.5.0-alpha.11` y `latest=0.0.0-stage`; no se han republicado paquetes.
3. **Formulario de contacto:** la pausa de 30 segundos definida en `localStorage` se puede eludir. Hace falta protección efectiva en servidor, cuota e idealmente validación antiautomatización, preservando RLS.
4. **Autorización de Studio:** las rutas auxiliares publicables necesitan que la aplicación anfitriona imponga identidad, permisos, CSRF, cuotas y políticas de guardado. No deben exponerse como endpoints públicos sin controles.
5. **Contenido activo externo:** SCORM, H5P y paquetes externos deben conservar aislamiento de origen. H5P usa excepciones CSP de compatibilidad en su runtime; cualquier reducción debe validarse con bibliotecas reales.
6. **Protección GitHub:** al comienzo de la auditoría `main` no tenía reglas activas para impedir reescrituras forzadas, borrado o imponer CI. No se activaron PR obligatorias ni se bloquearon los cambios directos en `main`.
7. **Cobertura:** no se efectuaron ataques en producción, fuzzing exhaustivo de ZIP, pruebas de carga, análisis de cada biblioteca H5P de terceros ni pentest autenticado en todos los LMS. Dos pruebas de symlinks quedaron omitidas debido a los permisos del Windows utilizado.

## Continuidad

Antes de publicar una versión npm o desplegar cambios web, exigir CI de seguridad exitoso, comprobar navegación real en navegador y reproducir los flujos de Studio, Player, SCORM y H5P con aplicaciones anfitrionas. No clasificar como seguridad certificada ningún elemento pendiente.

Fuentes: https://github.com/advisories/GHSA-px8p-9vwx-vf98 ; https://docs.netlify.com/manage/routing/headers/

## Resultado posterior de GitHub Actions

La ejecución [40330106866](https://github.com/josemarcosfrodo/p2lrn/actions/runs/40330106866), asociada al commit de seguridad `d32b1d5`, terminó con estado general **failure**, aunque los jobs independientes **security-windows**, **mcp-connectors-windows** y **lms-contracts-windows** finalizaron **success**. El job `toolkit-and-cdn` falló al verificar el visor en navegador: `studio-component-cdn` informó `Offline assignment dialog is not open` y `studio-website-ui` informó `Visual Studio website did not initialize`. No se atribuye ese fallo a los cambios de seguridad sin un análisis causal. El límite de cuota de artefactos de GitHub impidió subir algunas evidencias, aunque se conservaron archivos de evidencia en Windows. **La validación integral del sitio sigue pendiente.**
