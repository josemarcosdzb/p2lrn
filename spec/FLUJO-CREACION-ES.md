> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# Cómo se crea un paquete P2LRN

P2LRN necesita tres piezas distintas:

```text
P2LRN Creator -> .p2lrn -> P2LRN Reader
       ^
       |
transformadores de SCORM/H5P/QTI/cmi5/IMSCC
```

## Creación desde cero

El usuario o una aplicación de autoría trabaja primero sobre un proyecto editable. En el creador de referencia ese proyecto se llama `p2lrn.project.json`.

Ejemplo:

```bash
p2lrn-create init curso-fisica --title "Física I" --language es
p2lrn-create add-unit curso-fisica --key mecanica --title "Mecánica"
p2lrn-create add-file curso-fisica introduccion.html --key intro --title "Introducción" --parent mecanica
p2lrn-create build curso-fisica fisica.p2lrn
```

El último comando no copia simplemente una carpeta a ZIP. Hace:

```text
proyecto editable
    -> valida estructura
    -> asigna/recupera IDs portables estables
    -> convierte la estructura a Course/Unit/Activity/Resource
    -> calcula SHA-256 de cada fichero
    -> deduplica bytes iguales
    -> escribe assets/sha256
    -> genera content/graph.json
    -> genera META-INF/manifest.json
    -> calcula contentRoot
    -> crea el ZIP P2LRN
    -> vuelve a abrirlo y lo valida
```

Sólo después de superar ese último paso se considera creado el `.p2lrn`.

## Creación a partir de otro estándar

```bash
p2lrn-create convert curso-scorm.zip curso.p2lrn
```

En ese caso el Creator reutiliza el transformador preservation-first ya definido:

```text
paquete original
   -> detectar estándar real
   -> validar estructura
   -> preservar original por SHA-256
   -> proyectar semántica portable
   -> guardar procedencia/fidelidad
   -> construir P2LRN
   -> validar P2LRN y payload de perfil
```

## Qué es estándar y qué no

`p2lrn.project.json` NO forma parte del formato interoperable. Es sólo el formato de proyecto del Creator de referencia.

Un editor Moodle, AulaP2P, una aplicación de escritorio o un servicio web puede tener su propio modelo interno y llamar directamente a la API de construcción P2LRN.

Lo que sí tiene que salir igual es el `.p2lrn` final.

## Elegir presentación sin engordar el paquete

Un cuestionario nativo puede sugerir un renderer instalado por la plataforma:

```bash
p2lrn-create add-questionnaire mi-curso quiz.json --key quiz \
  --renderer https://p2lrn.org/renderer/questionnaire/memory \
  --renderer-version 1
```

Esto **no mete el juego dentro del `.p2lrn`**. Sólo guarda el identificador declarativo del renderer preferido. El reproductor de la plataforma lo carga bajo demanda si está instalado y si puede representar el cuestionario completo. Si la preferencia es opcional y no puede hacerlo, usa otro renderer compatible; nunca elimina preguntas para forzar la conversión.

La regla de empaquetado normal es: contenido y assets propios dentro del `.p2lrn`; player, renderers genéricos y motores compartidos instalados una vez en el host. Véanse `RENDERER-REGISTRY.md` y `THIN-PACKAGES.md`.
