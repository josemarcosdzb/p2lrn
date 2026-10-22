# Auditoría de preguntas y juegos — 2026-10-22

## Alcance

Se ha revisado la creación, edición, validación, puntuación, vista de alumno, exportación/reapertura y distribución de los ocho tipos de pregunta nativos y las doce modalidades de juego de Studio/Player.

Preguntas estándar verificadas: `single-choice`, `multiple-choice`, `true-false`, `text`, `fill-blanks`, `ordering`, `matching` y `classification`.

Juegos verificados: `memory`, `matching`, `ordering`, `classification`, `true-false`, `fill-blanks`, `word-search`, `crossword`, `rosco`, `3d`, `3d-matching` y `3d-classification`.

## Fallos corregidos

- El enunciado de pregunta era un campo de una línea. Ahora es un área multilínea amplia y conserva enunciado, tiempo y puntuación al cambiar de tipo.
- Rellenar huecos podía mostrar al alumno la propia respuesta. Ahora los huecos se insertan dentro del texto y las respuestas quedan ocultas también para paquetes antiguos compatibles.
- Rellenar huecos sólo permitía escribir. Ahora admite `text` y `drag`, con banco de palabras y distractores.
- La opción múltiple con puntuación parcial podía conceder puntuación completa al seleccionar todas las respuestas. Las opciones incorrectas ahora descuentan aciertos efectivos.
- Algunos editores permitían borrar respuestas/elementos hasta producir preguntas estructuralmente inválidas. Se han añadido límites mínimos a elección, ordenar, relacionar, clasificar y huecos.
- Studio perdió accidentalmente el `export` de `renderQuestionnaireVisualEditor`, lo que impedía registrar Studio CDN/web. Se ha restaurado y se valida en build y navegador.
- Los 3D no reproducían la mecánica de Quest de AulaP2P: Ordenar y Clasificar ahora transportan físicamente el objeto con el jugador; Relacionar mantiene un extremo de cuerda flexible unido al jugador hasta conectar la pareja.
- `packages/player/dist` podía quedar detrás de la distribución construida. Se añadió la comparación/gate de paridad y se reconstruye antes de validar.
- Se corrigieron cadenas mojibake detectadas en Studio/gates (`Qué hace`, `Lección`).

## Gates ejecutados

- Toolkit: 136/136 pruebas correctas.
- Matriz de los ocho tipos: validación y puntuación correcta/incorrecta; selección múltiple total no obtiene puntuación completa.
- `verify-local-viewer.mjs`: Studio CDN y web, exportación/reapertura, móvil, cuestionarios y los tres modos 3D sin fallos.
- Matriz visual de 12 juegos: `github-main` y `running-local-files` en `PASS` para las doce modalidades.
- Empaquetado npm local: Toolkit, Player, H5P Libraries y Studio empaquetan e instalan correctamente; 144 librerías H5P presentes.
- Navegador desde tarballs npm instalados: Studio, Player, SCORM, H5P, QTI, cmi5, juegos, móvil y reapertura en `PASS`.

## Regla de sincronización

La fuente de verdad es `main`. Tras cada cambio de Studio/Player se debe reconstruir la distribución, comparar la matriz fuente/local y volver a sincronizar `localhost:4183` desde el build validado. No se considera terminado un cambio sólo porque pase en source si la distribución o la copia servida difieren.
