> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Thin Packages - packaging rule alpha 5

Status: experimental packaging rule layered on Core 0.4.0.

## 1. Rule

A normal `.p2lrn` package SHOULD contain educational content and content-specific assets, not generic runtime code already supplied by a compatible Reading System.

A package therefore normally contains:

```text
manifest + graph + activity data + content-specific image/audio/video/model assets
```

and normally does **not** contain:

```text
p2lrn-player.js
all questionnaire renderers
all game engines
Three.js or another generic 3D engine
CSS for unrelated activity types
copies of host persistence/network adapters
generic composite traversal/runtime code
```

This is the default **thin** distribution model.

## 2. Why

The same player can be loaded once by AulaP2P, Moodle, WordPress, a normal site or another host. Browser/module caching then shares renderer code across every package on the page. A ten-question package should not become multi-megabyte merely because the ecosystem also supports 3D.

## 3. Declarative selection, not embedded implementation

A package may name a preferred renderer through `https://p2lrn.org/ext/renderer-preference/1`. Naming a renderer does not embed it. The Reading System decides whether that trusted renderer is installed and compatible.

The Creator `--renderer` option stores only this declarative URI hint. A native composite similarly stores only traversal/completion policy; its children are graph references to activities already present in the same package. A native component stores only component/version identifiers plus authored data; implementation and migration code remain host-installed.

## 4. Content-specific assets

Assets that are genuinely authored content remain part of portability: for example a course-specific image, narration, GLB model, texture or subtitle file. Shared standard controls, generic pedestals, game chrome and renderer libraries belong to the installed renderer unless preservation requirements explicitly require otherwise.

## 5. Foreign packages

Bit-preserved H5P, SCORM, cmi5, QTI/Common Cartridge packages are content artifacts and may legitimately be embedded as source representations. Their presence does not imply that P2LRN should duplicate the corresponding execution engine inside every outer package.

## 6. Offline/self-contained distributions

A future self-contained/offline application bundle may package a Reading System plus only the runtime modules needed by a chosen package. Such a bundle is a deployment artifact around `.p2lrn`; it is not the canonical thin interchange package and must not change the package's semantic graph/content identity merely to bundle software.

## 7. No arbitrary package JavaScript by default

The modular runtime alpha does not treat arbitrary JavaScript inside a package as an automatically trusted component. Executable host modules are installed/registered by the Reading System. This both limits package weight and keeps code trust separate from content trust. Native component implementation renderers are additionally non-selectable from package hints, so a data-only component cannot route around the host Component Registry.
