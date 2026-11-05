
# P2LRN Universal Runtime — evolución compatible con Core 0.4.0

**Rama de trabajo:** `mejorastudio`. **Contrato de diagnóstico:** `https://p2lrn.org/schema/execution-plan/1`, versión 1. **Estado:** primera fase implementada; no equivale a certificar P2LRN 1.0 ni a completar SCORM/QTI/cmi5/H5P. No se altera ZIP/ZIP64, `META-INF/manifest.json`, `content/graph.json` ni su autoridad semántica.

## 1. Principio del sistema

El paquete describe experiencias educativas. El Reading System (Player, Renderer Registry, Dependency Registry, Host Adapter y Capability Broker) determina qué puede reproducir sin confiar en JavaScript ni permisos arbitrarios del curso. Conservamos los contratos existentes:

- Core 0.4.0, grafo portable, contentRoot, hashes, deltas y firmas Ed25519 independientes.
- Renderer Registry: el paquete puede solicitar un renderizador, pero nunca descargarlo o ejecutarlo automáticamente.
- Dependency Registry: registro de librerías del runtime; no secretos ni scripts externos del alumno.
- Host Capabilities: el Host decide identidad, autorizaciones y proveedores de servicios; el paquete solo declara necesidades semánticas.
- Host Adapter v1: estado, progreso y eventos del alumno almacenados fuera del curso.
- Sandboxes H5P/SCORM y contenido externo aislado del origen y credenciales del LMS.

## 2. Funcionalidad incorporada en `mejorastudio`

1. `DependencyRegistry.inspect()` examina presencia y versión de dependencias sin invocar sus `load()` ni descargar código. `resolve()` exige las versiones declaradas explícitamente.
2. `negotiateP2LRNExecution()` selecciona con el registro existente, valida dependencias, permisos y capacidades, y devuelve `ready`, `conditional` o `blocked`, con errores legibles.
3. Si el renderer o su versión son obligatorios, no hay degradación silenciosa. Solo se prueban alternativas cuando son opcionales y realmente admiten la representación completa.
4. En preflight offline se rechazan representaciones remotas que no tienen alternativa embebida; un hash en una URL no equivale a disponer de sus bytes sin red.
5. Player utiliza este contrato en `#renderEntity` **antes** de importar el módulo renderer, emitiendo `p2lrn:executionpreflight` o `p2lrn:executionblocked`. Los permisos y las dependencias se revalidan durante la carga real.
6. `inspectP2LRNPackageExecution()` produce un informe de todas las actividades del paquete verificado sin ejecutar sus contenidos. Es una evaluación estática del runtime disponible, no una prueba de reproducción.
7. H5P inspecciona el **cierre transitivo de dependencias exactas**, incluyendo `h5p.json`, referencias anidadas `content.json` y bibliotecas `library.json`; detecta duplicados, ciclos y límites de tamaño. Player emite `p2lrn:h5pdependencies` antes del iframe.
8. El SDK ESM, el API global `P2LRN` y las declaraciones TypeScript ofrecen el mismo contrato, sin crear otra autoridad del paquete.

### Significado de los resultados

| Estado | Garantía |
| --- | --- |
| `ready` | Hay un renderizador y las dependencias/permiso inspeccionables se cumplen. No certifica que todo el contenido externo funcione. |
| `conditional` | Motor seleccionado; quedan comprobaciones en lanzamiento o semánticas externas parciales. |
| `blocked` | No puede ejecutarse con las condiciones actuales: no se inicia el runtime bloqueado. |

### Informes conservadores por perfil

| Perfil | Clasificación | Limitación honesta |
| --- | --- | --- |
| Cuestionario y componentes nativos | renderer-defined | No implica una calificación oficial |
| H5P | runtime-validated / conditional | Bibliotecas dinámicas y ejecución interna necesitan prueba |
| SCORM | bounded / conditional | Secuenciación SCORM 2004 no certificada completa |
| QTI | subset / conditional | No sustituye un procesador completo de QTI 3 |
| cmi5 | preview / conditional | Sesiones de producción/LRS requieren Host real |
| Common Cartridge / IMS | preserved-projected / conditional | Contenidos especializados pueden no ejecutarse |

## 3. Ejemplo en una plataforma LMS o en Studio

Los siguientes métodos están en la rama de desarrollo. No asumir que versiones npm anteriores ya incluyen estas APIs.

```js
import {openP2LRNPackageURL,inspectPackageExecution} from '@p2lrn/player';

const course=await openP2LRNPackageURL('/courses/biologia.p2lrn');
const normal=await inspectPackageExecution(course,{offline:false});
const offline=await inspectPackageExecution(course,{offline:true});

console.table(normal.activities.map(item=>({
  activity:item.activityId,
  status:item.status,
  renderer:item.rendererId,
  limitations:item.limitations.join(', ')
})));
if(offline.blocked){
  console.warn('Actividades sin garantía offline:',
    offline.activities.filter(x=>x.status==='blocked'));
}
```

El Player invoca la negociación automáticamente, de modo que el integrador no tiene que implementarla de nuevo. Esta API sirve para mostrar compatibilidad antes de publicar un curso o construir un paquete offline. La aplicación configura sus permisos y autenticación con el Host; la información del curso nunca equivale a autorización.

## 4. H5P: comprobación previa real

`inspectH5PPackage()` devuelve ahora un `dependencyClosure` con `required`, `bundled`, `missing`, `dynamic`, `complete` y `requiresTrustedLibraryResolver`. Las versiones se comparan por nombre, mayor y menor.

`complete:true` significa que el **paquete H5P** contiene sus dependencias preloaded transitivas. No demuestra que el contenido sea ejecutable ni que tenga las bibliotecas dinámicas. Si faltan, solo un origen de bibliotecas **confiable y fijado por el Host** puede resolverlas. La CSP estricta y el sandbox no se relajan.

## 5. Trabajo que realmente falta para P2LRN 1.0

- **SCORM 2004:** secuenciación, rollup, objetivos, control modes y terminación normativa, con corpus real.
- **QTI 3:** ejecución completa de interacciones, `responseProcessing`, adaptatividad y conformance independiente.
- **cmi5/xAPI:** launch/session con seguridad LMS, Statements, State API, LRS de producción e identidad autorizada.
- **H5P:** resolución y validación end-to-end de bibliotecas dinámicas y externas, y pruebas completas en navegadores.
- **Offline universal:** empaquetar de verdad el cierre de dependencias, runtimes y recursos para ejecutar sin red; la etiqueta offline del preflight no materializa bytes.
- **Distribución:** npm/CDN/Player/Studio con versiones alineadas, paquetes instalados y pruebas SHA/ejecución idénticas.
- **Interoperabilidad:** segunda implementación, corpus público, accesibilidad y confianza de firmas/rotación y revocación.

## 6. Puertas de validación

El workflow `.github/workflows/p2lrn-universal-runtime-qa.yml` ejecuta tests de negociación, seguridad, offline y H5P en Windows. La disponibilidad estática no sustituye las pruebas reales de SCORM, H5P, cmi5 y QTI en Player ni la aceptación de npm y CDN. Registrar evidencia del mismo SHA antes de fusionar o publicar.

**Política de ramas:** trabajar solo en `mejorastudio`, preservando sus modificaciones de Studio y Quest 3D. No fusionar con `main` ni publicar sin verificación y resolución de divergencias.
