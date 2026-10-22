# Evidencias visuales de P2LRN npm 0.5.0-alpha.10 — 22 de octubre de 2026

[Registro de incidencias y verificación cruzada npm / GitHub main / localhost](./MATRIZ-AUDITORIA.md).

El [CI completo de código fuente 39745258814](https://github.com/josemarcosfrodo/p2lrn/actions/runs/39745258814) terminó en **SUCCESS**, incluyendo Toolkit, Studio/Player Chrome y Edge, build web y verificaciones de paquete. **Eso no certifica el npm 0.5.0-alpha.10**, cuyas pruebas reales detectaron regresiones. Se ejecutan gates independientes desde el registro público.

Origen: paquetes instalados con caché nueva desde https://registry.npmjs.org, no archivos tar locales.

Runs: [Matriz de Studio/Player y casos importados](https://github.com/josemarcosfrodo/p2lrn/actions/runs/39743180030), [Matriz visual independiente](https://github.com/josemarcosfrodo/p2lrn/actions/runs/39743634914).

Capturas JPEG reducidas de pruebas reales de Chrome, a partir de la ejecución 39743634914. Se conservan las capturas PNG originales en la carpeta de evidencias del runner Windows. No son diseños de ejemplo.

## Hallazgos
- Rosco nativo: letras en fila, sin distribución circular ni panel de progreso (defecto de presentación).
- Crucigrama nativo: casillas muy alargadas y desplazamiento horizontal interno (defecto de presentación).
- Crucigrama H5P: muestra cuadrícula y pistas; no debe confundirse con el crucigrama nativo.
- Studio: flujo de autoría, guardado y vista alumno; faltan los controles modernos 3D y de componente presentes en main.

## Capturas
- [npm-studio-ui.jpg](./npm-studio-ui.jpg)
- [native-npm-rosco.jpg](./native-npm-rosco.jpg)
- [native-npm-rosco-mobile.jpg](./native-npm-rosco-mobile.jpg)
- [native-npm-crossword.jpg](./native-npm-crossword.jpg)
- [native-npm-crossword-mobile.jpg](./native-npm-crossword-mobile.jpg)
- [npm-player-h5p-crossword-p2lrn-mobile.jpg](./npm-player-h5p-crossword-p2lrn-mobile.jpg)

Esta revisión de screenshots **no certifica producción**; identifica diferencias entre npm publicado y el código de desarrollo.

## Comprobación adicional de modalidades 3D y rellenar huecos

Ejecución de seguimiento: [39744609195](https://github.com/josemarcosfrodo/p2lrn/actions/runs/39744609195). La carga 3D se ha repetido con el MIME JavaScript correcto para los módulos `.mjs`.

- [3D Ordenar en escritorio](./native-npm-3d.jpg) y [3D Ordenar en móvil](./native-npm-3d-mobile.jpg): la escena WebGL/Three.js/Rapier carga; el fallo MIME anterior era del servidor de pruebas
- [Rellenar huecos en escritorio](./native-npm-fill-blanks.jpg) y [Rellenar huecos en móvil](./native-npm-fill-blanks-mobile.jpg): se reproduce en el cuestionario estándar, no en un renderer de juego independiente
- Dos modalidades 3D adicionales siguen ausentes o no se generan en npm `0.5.0-alpha.10`

Aviso: la carga visible y el diseño no equivalen todavía a una prueba completa de interacción y puntuación 3D.

## Validación del código fuente actual, separada de npm publicado

La [ejecución Windows 39745258814](https://github.com/josemarcosfrodo/p2lrn/actions/runs/39745258814) terminó en SUCCESS: 124/124 pruebas de Toolkit, 7/7 de Studio setup, controles del runtime y navegador, construcción web, y correspondencia de 115 archivos de Player, 4.723 archivos H5P y 11 archivos de Studio entre las distribuciones npm generadas localmente y CDN.

**No equiparar este resultado con una certificación del npm 0.5.0-alpha.10 ya publicado**, cuyo rosco y crucigrama nativos permanecen antiguos. Las pruebas fuente y las pruebas independientes de publicación responden preguntas diferentes.

## Integración Express

Se ha añadido una comprobación externa con un proyecto Express independiente, generado por la CLI de Studio desde npm. Debe evaluar autenticación del anfitrión, autorizaciones, guardado, Reader, importación y una captura de Studio en Chrome, sin dar por satisfechos casos no ejecutados.
