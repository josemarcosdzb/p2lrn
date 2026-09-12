> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN 0.4.0 — Flujo real de transformación y lectura

Este documento explica la implementación de referencia con los paquetes utilizados durante las pruebas. No sustituye a `TRANSFORMATION.md` ni `READING.md`; es el recorrido práctico.

## 1. Qué significa transformar

P2LRN no convierte un SCORM, H5P, QTI o Common Cartridge destruyendo su formato original.

Hace dos cosas simultáneas:

```text
                    ┌─> paquete original preservado por SHA-256
archivo de entrada ─┤
                    └─> grafo educativo portable P2LRN
```

El paquete original permite fidelidad y recuperación. El grafo permite que otro LMS entienda la estructura común sin adoptar el modelo interno del LMS de origen.

## 2. Ejemplo real: SCORM 1.2

Entrada probada:

```text
Scorm12(1).zip
SHA-256: 549f888335523bb2bafd012610f158892dad1e158284bd1a8921ddfa7f47043f
```

### Paso 1 — detección

El conversor no confía en `.zip`. Abre el contenedor de forma segura, encuentra `imsmanifest.xml` y detecta los marcadores SCORM.

Resultado:

```text
format = scorm
version = 1.2
```

### Paso 2 — preservación

Los bytes originales se guardan sin modificarlos:

```text
packages/sha256/54/9f/549f888335523bb2bafd012610f158892dad1e158284bd1a8921ddfa7f47043f
```

No se vuelcan los cientos de ficheros internos al namespace P2LRN.

### Paso 3 — proyección

Del manifiesto se obtiene la semántica portable:

```text
Course: Golf Explained - CP Single SCO
  └─ Activity: Golf Explained
       └─ Resource
```

El Resource conserva dos formas de acceso conceptualmente diferentes:

```text
original-package
    -> SCORM completo preservado

primary package-member
    -> shared/launchpage.html
```

El segundo no copia `shared/launchpage.html`. Sólo identifica dónde vive dentro del SCORM preservado.

### Paso 4 — procedencia

`provenance/transformation.json` registra qué nodo P2LRN salió de cada identificador/recurso del manifiesto, qué bytes se preservaron y qué semántica sigue delegada a SCORM.

Para este caso:

```text
sourceBytes = exact
structuralProjection = partial
runtimeSemantics = delegated-to-source-profile
losses = []
```

`partial` no significa que se hayan perdido datos: significa que P2LRN no pretende reimplementar el runtime/sequencing SCORM. El SCORM original sigue siendo la autoridad para esa parte.

### Paso 5 — integridad

Se calculan:

```text
byteDigest
contentDigest
contentRoot
```

El P2LRN generado para este ejemplo tiene:

```text
contentRoot = sha256:98256247e80fe787bae59cf1d1ac624dfc6ab40bc5432c168badac4c4ef71fe2
```

### Paso 6 — autovalidación

El conversor vuelve a abrir lo que acaba de generar y pasa:

```text
Core
+ versión de perfiles
+ validación SCORM anidada
```

Si el `href` SCORM apunta a un fichero inexistente, la conversión falla.

## 3. Cómo se lee ese SCORM P2LRN

El lector no empieza ejecutando SCORM. Abrir y validar el contenedor sigue siendo una operación pasiva: no se ejecuta JavaScript del paquete durante esa fase.

Primero hace:

```text
P2LRNReader.open()
   ↓
validar contenedor + manifest + graph + hashes
   ↓
indexar portable IDs
   ↓
leer entrypoint Course
   ↓
recorrer jerarquía
```

Después consulta las capacidades del receptor.

Si el receptor declara `scorm.read`, el Resource resuelve a:

```json
{
  "kind": "package-member",
  "member": "shared/launchpage.html",
  "runtime": "scorm"
}
```

Eso es un **plan**. Todavía no se ha ejecutado nada.

A partir de Alpha 14, el Web Reader conserva las dos topologias SCORM de Alpha 13 y recupera del `todo-funciona` el parser de manifiesto y la base de navegacion lineal SCORM 2004. Sin runtime externo conserva el sandbox opaco. Con `runtimeBaseUrl` apuntando a un origen distinto, usa el runtime-host bajo una ruta configurable como `/runtime`, coloca `API`/`API_1484_11` en el frame padre del SCO y mantiene el documento del LMS fuera de su origen. El estado sigue persistiendo mediante `host-adapter` y nunca dentro del `.p2lrn`.

La recuperacion Alpha 14 conecta `continue`, `previous`, `choice`, `jump`, `adl.nav.request_valid.*` y el cambio de SCO despues de `Terminate()`. Las reglas pre/post/exit, control modes y rollup se preservan, pero todavia no se ejecutan como un motor S&N completo; por eso no se presenta como conformidad SCORM completa.

## 4. Recuperar el SCORM original

Como el origen fue `bit-exact`, puede recuperarse directamente.

La prueba realizada devuelve exactamente:

```text
original:  549f888335523bb2bafd012610f158892dad1e158284bd1a8921ddfa7f47043f
recovered: 549f888335523bb2bafd012610f158892dad1e158284bd1a8921ddfa7f47043f
```

Por tanto:

```text
SCORM -> P2LRN -> SCORM original
```

es exacto a nivel de bytes.

## 5. Ejemplo H5P cuando el LMS receptor no entiende H5P

El Crossword H5P queda como:

```text
Course
  └─ Activity (H5P)
       └─ Resource
            └─ original-package .h5p
```

El lector de referencia no afirma que sabe interpretar/ejecutar H5P. Su documento de capacidades declara preservación.

El import plan produce:

```text
status   = preservable
handling = preserve-opaque
```

Así el H5P puede entrar en otro LMS y volver a salir posteriormente sin haber sido destruido, aunque ese LMS no tenga todavía un player H5P.

## 6. Ejemplo Common Cartridge TOPkit

El cartridge suministrado tiene:

```text
419 Resources
116 organization items
303 webcontent
73 associated-content
32 discussion topics
7 QTI 1.2 assessments
3 Basic LTI 1.0 links
1 web link
```

P2LRN 0.4.0 genera:

```text
536 entidades P2LRN
419 Resources P2LRN
```

No se limita a los recursos visibles desde la organización; conserva/proyecta el inventario completo del manifiesto.

Tratamiento específico:

```text
webcontent
    -> package-member / Web Content

QTI 1.2
    -> QTI representation
    -> sourceVersion=1.2
    -> NO se finge QTI 3

Basic LTI 1.0
    -> external-tool intent
    -> rebindRequired=true
    -> NO se finge una registration LTI 1.3 ya configurada

web link
    -> remote representation con su URL real

discussion topic
    -> Activity de discusión + descriptor/prompt de origen
```

El cartridge completo sigue preservado bit a bit.

### Lectura de TOPkit con las capacidades actuales

Jerarquía:

```text
103 Activities
97 legibles por las capacidades de referencia
6 no legibles semánticamente en la jerarquía
```

Esas seis corresponden a contenido QTI para el que el lector de referencia no declara `qti.read`.

No se usa el IMSCC completo como falso fallback para decir que QTI se entiende.

### Import plan completo

Sobre los 419 Resources:

```text
412 interpretable
7 preservableOpaque
0 unsupported
```

Es decir: con las capacidades actuales puede importarse/preservarse el cartridge completo sin tirar esos siete QTI, aunque el lector de referencia aún no implemente el motor semántico QTI completo.

## 7. QTI 3

Se añadió detección directa de paquetes QTI 3 que usan `imsmanifest.xml`.

Eso es importante porque `imsmanifest.xml` también aparece en SCORM y Common Cartridge.

El detector distingue el paquete por los marcadores QTI (`QTI Package`, namespace y resource types).

Un QTI puede tener:

```text
organizations vacío
+ QTI items/tests
+ recursos compartidos
```

P2LRN no inventa módulos cuando no existen.

Proyección:

```text
QTI package
  -> Course contenedor
  -> Activity por item/test
  -> Resource por resource del manifest
  -> package-member al XML real
  -> dependencias QTI conservadas en metadata
```

Los recursos de apoyo, como imágenes, pueden exponerse como Web Content mientras siguen dentro del ZIP QTI original.

`responseProcessing`, scoring e interacciones continúan siendo QTI. El lector de referencia sólo reclama `qti.validate` y `qti.preserve` por ahora; no `qti.deliver`.

## 8. cmi5

Transformación principal:

```text
cmi5 Course -> P2LRN Course
cmi5 Block  -> P2LRN Unit
cmi5 AU     -> P2LRN Activity + Resource
```

Se conservan datos como:

```text
moveOn
masteryScore
launchMethod
url
launchParameters
entitlementKey
```

Si `url` es relativa, el plan puede ser `package-member`.

Si es absoluta:

```json
{
  "kind": "remote",
  "networkRequired": true
}
```

La validación no hace la petición HTTP.

## 9. LTI

LTI no se debe leer como si fuera simplemente una URL.

El plan es:

```json
{
  "kind": "external-tool",
  "runtime": "lti",
  "rebindRequired": true,
  "targetLinkUri": "..."
}
```

La instalación destino debe conectar ese recurso con su propia registration/deployment LTI.

P2LRN no transporta:

```text
private keys
client secrets
access tokens
credenciales del deployment de origen
```

## 10. CASE, xAPI y accesibilidad

La prueba `advanced-interoperability.p2lrn` demuestra que P2LRN no es sólo un wrapper de formatos heredados.

Incluye en un único grafo:

```text
Course / Unit
LTI Activity
Objective alineado a CASE
semántica xAPI de Activity
Web Resource
representación normal
representación accessible
```

El Core sigue siendo el mismo.

CASE describe la alineación; xAPI describe semántica de eventos potenciales; accesibilidad relaciona representaciones; ninguno obliga a meter historial del alumno o credenciales en el curso.

## 11. Plan neutral para importar en un LMS

`P2LRNReader.import_plan()` genera una salida sin IDs de base de datos.

Conceptualmente:

```text
P2LRN
  ↓ validate
  ↓ read graph
  ↓ capability negotiation
  ↓
ImportPlan
  ├─ structuralObjects[]
  ├─ resources[]
  ├─ interpretable
  ├─ preservableOpaque
  └─ unsupported
```

El adaptador de Moodle/AulaP2P/Sakai/etc. es quien transforma después portable IDs en IDs locales.

Ejemplo de persistencia:

```text
urn:uuid:P2LRN-A -> curso.id 821
urn:uuid:P2LRN-B -> modulo.id 944
urn:uuid:P2LRN-C -> actividad.id 1502
```

Ese mapa debe persistirse para futuras exportaciones.

## 12. Importación prevista en AulaP2P

La frontera correcta sigue siendo:

```text
aulap2p.curso.v1
      ↕ adaptador
P2LRN
```

### Exportar

```text
snapshot consistente del curso
 -> recuperar/crear portable IDs
 -> sustituir archivoId/URLs internas por Resources
 -> materializar assets por digest
 -> exportar perfiles especializados
 -> preservar paquetes originales si existen
 -> provenance
 -> manifest + contentRoot
 -> self-validate
```

### Importar

```text
P2LRN
 -> validate
 -> import_plan
 -> BEGIN TRANSACTION
 -> crear/actualizar Course
 -> crear Units/Activities/Objectives
 -> almacenar assets/packages
 -> ejecutar adaptadores de perfiles soportados
 -> preservar perfiles no entendidos pero preservables
 -> portableId -> localId
 -> COMMIT
```

Si falla una parte obligatoria, no debe dejar un curso medio importado.

## 13. Tres round-trips distintos

### A. Fuente original

```text
SCORM -> P2LRN -> mismo SCORM
```

Ya probado byte a byte.

### B. P2LRN neutral

```text
P2LRN A -> reader/writer neutral -> P2LRN B
```

El ZIP y `packageId` cambian, pero `contentRoot` permanece igual. Ya probado.

### C. LMS a LMS

```text
AulaP2P -> P2LRN -> segundo LMS -> P2LRN
```

Éste sigue siendo el gate grande pendiente: requiere implementar el adaptador real de AulaP2P y una segunda implementación independiente.

## 14. Estado de las pruebas

La suite de referencia actual pasa:

```text
44/44 tests
```

La matriz de conversión final pasa:

```text
12/12 casos
0 fallos
```

Incluye todos los paquetes suministrados y un fixture adicional de empaquetado QTI 3.

## Lector propio de la extensión `.p2lrn`

Desde 0.4.0 hay que separar claramente tres piezas:

```text
archivo.p2lrn
    ↓
P2LRN Reading System
    ↓
Core + navegación + resolución
    ↓
runtime de perfil sólo cuando haga falta
```

El usuario no necesita importar primero el archivo en AulaP2P para abrirlo. El lector P2LRN abre directamente la extensión, valida el paquete y presenta el curso.

El lector base puede mostrar contenido P2LRN nativo/pasivo. Si encuentra una Activity SCORM, H5P, QTI o cmi5, identifica exactamente la representación y el payload, pero sólo la ejecuta si dispone del runtime correspondiente.

Por tanto:

```text
.p2lrn = formato
P2LRN Reader = aplicación que abre el formato
runtime = módulo especializado de ejecución
```

No se introduce una copia del ejecutable del lector dentro de cada `.p2lrn`, porque eso duplicaría software, dificultaría actualizaciones y convertiría cada curso en un contenedor ejecutable innecesario.

Uso de referencia:

```bash
p2lrn-reader curso.p2lrn
```

Una instalación puede asociar posteriormente `.p2lrn` al lector para que un doble clic produzca el mismo flujo.
