# Auditoría cruzada P2LRN — 22-10-2026

**Objetivo.** Verificar, sin confundir canales, el comportamiento de:
1. Los cuatro paquetes `@p2lrn/*@0.5.0-alpha.10` descargados desde `registry.npmjs.org`, con caché nueva.
2. El código y los paquetes construidos desde la revisión concreta de `main` en GitHub.
3. Los archivos realmente servidos por `http://localhost:4183` en el runner Windows.

Una corrección **en el código** no equivale a una corrección **publicada en npm** ni **desplegada en local**. El veredicto "verificado" requiere ejecución y evidencia por canal. No modificar la lógica de los juegos para que pase un test.

## Evidencias existentes

- [39740974643 — instalación npm pública y primera UI](https://github.com/josemarcosfrodo/p2lrn/actions/runs/39740974643): cuatro tarballs públicos e integridad OK; falla el E2E de Studio al faltar el selector 3D moderno. La subida opcional de imágenes a GitHub también falla por cuota; las evidencias se conservan en Windows.
- [39743180030 — segunda batería Studio y Player](https://github.com/josemarcosfrodo/p2lrn/actions/runs/39743180030): instalación pública OK; actividades nativas y flujos de Studio sometidos a prueba; el E2E registra diferencias de interfaz con `main`.
- [39743634914 — 12 modalidades con Player público](https://github.com/josemarcosfrodo/p2lrn/actions/runs/39743634914): matriz `PUBLIC_NPM_NATIVE_VISUAL_SUMMARY` con 6/12 comprobaciones superadas. El resto incluye defectos reales y errores de clasificación/infraestructura descritos abajo.
- [39744609195 — 3D y huecos contrastados](https://github.com/josemarcosfrodo/p2lrn/actions/runs/39744609195): la escena 3D Ordenar se muestra cuando el servidor envía `.mjs` con MIME JavaScript; Rellenar huecos corresponde al cuestionario nativo y no a `.p2lrn-game-shell`.
- [39648695570 — reparación anterior del Player local](https://github.com/josemarcosfrodo/p2lrn/actions/runs/39648695570): PASS para rosco local con módulo ES revisado, URLs de contenido y portada. No demuestra que *todas* las mejoras posteriores de `main` estén desplegadas.
- [39745258814 — controles de fuente en Windows](https://github.com/josemarcosfrodo/p2lrn/actions/runs/39745258814): durante esta auditoría, las fases Chrome y Edge de `verify-local-viewer.mjs` habían pasado; el job completo no estaba finalizado cuando se anotó esta fila.
- [Capturas originales de npm conservadas en el repositorio](./README.md), incluidas las versiones de escritorio y móvil de Rosco, Crucigrama, 3D y Rellenar huecos.

## Registro de incidencias

| ID | Funcionalidad | npm 0.5.0-alpha.10 | Código GitHub `main` | Instalación local | Estado de certificación |
| --- | --- | --- | --- | --- | --- |
| QA-001 | Rosco circular | **Fallo demostrado:** 4 letras en línea, `verticalSpread=0`, sin `.p2lrn-rosco-center` | Existe renderer circular con posiciones trigonométricas, botones y progreso; prueba de Chrome/Edge en fuente | Pasó el test del rosco circular y de las URLs versionadas en 39648695570 | **No corregido en npm**; comparar SHA de la instalación actual |
| QA-002 | Crucigrama nativo | **Fallo demostrado:** ratio ancho/alto de celda ≈ 6,98, pistas no pulsables | Renderer actual tiene casillas por celda, controles de pista y avance por teclado; E2E de fuente los prueba | Verificación visual cruzada de crucigrama pendiente, no extrapolar el resultado del rosco | **No corregido en npm** |
| QA-003 | Autoría 3D Relacionar/Clasificar | Publicado: no ofrece modalidades modernas; la generación de `3d-matching` y `3d-classification` con el flujo de npm dio `Unknown questionnaire game renderer: .../standard` | Hay código y tests para modos 3D; requiere validar empaquetado y Player con los mismos casos | Pendiente de comparación y navegador real | **No corregido en npm** |
| QA-004 | Editor de componentes | E2E buscó selector moderno y no lo encontró; se presenta formulario de componente antiguo | El editor actual contempla selector de componentes (verificación de fuente) | Pendiente de comparación con Studio local instalado | **Diferencia de distribución**, pendiente E2E completo |
| QA-005 | Rellenar huecos, texto visible | El Player muestra un formulario de pregunta, pero el test antiguo lo clasificó como ausencia de `.p2lrn-game-shell` | El renderer `questionnaire-fill-blanks.js` delega en `questionnaire-runtime.js`; existe estructura `.p2lrn-q-shell` | Pendiente prueba de contexto, texto y escritura/selección | **No certificado**: fallo del comprobador anterior, no afirmar fallo de reproducción |
| QA-006 | Juego 3D Ordenar | Tras corregir el MIME `.mjs` en el servidor de **pruebas**, se observó el entorno Three.js/Rapier en Chrome | Motor 3D presente y cubierto por tests mecánicos | Falta E2E completo de entrada, física, interacción, corrección y puntuación | **Parcial**; el MIME fue un error del harness, no evidencia de defecto del paquete |
| QA-007 | Flujos Host: guardar, importar, reabrir y permisos | Instalación pública y varios smoke tests correctos; el E2E de Studio sigue detectando diferencias | Hay helpers y generadores para varias plataformas; falta certificar autorización específica de cada Host | No extrapolar a producción ni a todos los frameworks | **Parcial** |
| QA-008 | Diferencia Core/Player | En paquetes puede mostrarse formato Core `0.4.0` mientras npm es `0.5.0-alpha.10` | Son campos de versión diferentes | Comprobar ambos, no sustituir el formato del paquete por la versión del reproductor | **No implica por sí mismo un fallo** |

## Cómo se contrasta

Los scripts reutilizables de este repositorio aportan evidencia distinta:
- `scripts/verify-public-npm-e2e.mjs`: descarga e integridad exacta del registro público, sin tarballs locales.
- `scripts/verify-browser-from-npm.mjs`: edición, importación, guardado, exportación, Player y capturas reales desde npm.
- `scripts/verify-public-npm-native-visual.mjs`: visualización de juegos nativos con Player público en Chrome aislado.
- `scripts/verify-local-viewer.mjs`: Player construido desde fuente, Rosco/Crucigrama, eventos y capturas en Chrome y Edge.
- `scripts/verify-version-parity.mjs`: SHA-256 y marcadores funcionales de GitHub/nmp/local; lee los recursos HTTP de `localhost:4183`.
- `scripts/verify-main-local-visual-parity.mjs`: **mismos bytes** de cada paquete de prueba en Player construido desde `main`, Player local instalado y Player publicado.
- `scripts/verify-live-local-4183.mjs`: Chrome nuevo sobre servidor local real; rosco, módulos cacheados y portada.

Para cada nuevo run deben registrarse ID, SHA exacto de `main`, versión de los cuatro paquetes, canal, escritorio/móvil, resultado, hash y capturas; `NOT_TESTED`, `INCONCLUSO` y `FAIL` no son equivalentes.

## Condiciones para declarar lista una versión estable

No considerar apta para `latest` / `0.5.0` una publicación con defectos reproducibles en juegos nativos, creación 3D o los flujos esenciales de importación, guardado, exportación y reproducción. La aprobación exige tests visuales e interactivos del paquete **descargado desde npm**; no basta el código de `main`, un sitio local arreglado ni pasar unos pocos smoke tests. La validación de un Host de ejemplo no certifica automáticamente el resto de frameworks.

Este documento es un registro de comprobaciones verificables y de incertidumbres: **no declara P2LRN certificado para producción**.
