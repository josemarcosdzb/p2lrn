# Recetas de autoría y comprobación P2LRN

Son ejemplos procedentes del trabajo original. Para el contrato actual del runtime prevalecen las fuentes de la versión de P2LRN instalada. No ejecutar HTML ni JS no confiable durante inspeccion de un ZIP.

## Ilustraciones y HTML

- Dibujar figuras mediante SVG y, si existen, Playwright/Chromium o Pillow/NumPy; mantener fuentes/colores proporcionados por el proyecto. Capturar y revisar solapes, contraste y límites de bordes con el navegador real.
- Figuras tipicas: capas concentricas, seccion en octante, volcanes, placas, atmosferas apiladas y diagramas con rotulos. Para globo con nubes en alfa, no interpretar blanco opaco como transparencia.
- Convertir PNG a WebP con Pillow/Sharp solo cuando la transformacion preserve el objetivo. Incrustar imágenes como `data:` solo cuando el contrato del renderer lo permita; proporcionar `alt` descriptivos y `figcaption`.
- El HTML de las lecciones estaticas puede incluir tablas y elementos didacticos permitidos por el sanitizador; el HTML de los juegos de arrastrar va a sandbox más estricto, que puede eliminar `<style>`, `<script>` y SVG. Comprobar la versión real.
- No asumir que las tipografias, librerias gráficas o el paquete npm `three-globe` existen. No descargar texturas sin autorización y verificar procedencia/licencia antes de reutilizar recursos.

## Estructura de arrastre Studio (solo si runtime compatible)

| Papel | Atributo de ejemplo |
|---|---|
| Actividad | `data-p2lrn-dnd="1"`, `data-p2lrn-layout="drag-drop"` |
| Tablero | `data-p2lrn-dnd-board` |
| Imagen | `data-p2lrn-dnd-image` |
| Zona | `data-p2lrn-dnd-zone`, `data-p2lrn-dnd-accept` |
| Ficha | `data-p2lrn-dnd-item`, imagen con `data-p2lrn-dnd-item-image` |
| Bandeja | `data-p2lrn-dnd-tray` |
| Mensajes | `data-p2lrn-dnd-status`, `role="status"`, `aria-live="polite"` |

- Si los huecos contienen texto, comprobar 320 px y ampliar area visible o cambiar distribución sin ocultar el contenido.
- Comprobar posicion del objeto soltado, seleccionado único, posibilidad de cambiar ficha, desplazamiento con raton y móvil, reinicio y finalizacion incompleta.
- Revisar objetivos superpuestos: varios destinos no deben competir por la misma coordenada.
- Las pruebas Playwright con DOM sintetico no acreditan eventos de puntero reales ni navegación con lector de pantalla. Marcar cada medio por separado.

## Cuestionarios y solucionarios

- Las preguntas usan IDs estables, enunciados, alternativas y soluciones con tipos realmente admitidos por la versión del Toolkit.
- Si el perfil permite `embedded-key`, considerar que cualquier persona que descargue el paquete puede extraer claves; no prometer seguridad contra copia.
- Si se necesita un examen protegido, evaluar y guardar respuestas en un backend autorizado o mediante flujo LTI preparado para ello; separar claves de alumno y docente, con pruebas reales.
- Crear un solucionario desde el mismo conjunto de preguntas, **en un recurso docente independiente y no público**. No colocarlo tras el test como lección de acceso libre.
- No atribuir notas del Player al libro oficial del LMS sin retorno AGS confirmado.

## Lecciones y rigor

- Estructura util: pregunta inicial, explicación, figura con `alt`, tabla cuando aporta valor, ejercicio, fuente contrastada. Textos redactados para docentes y alumnos, sin instrucciones internas ni jerga del desarrollador.
- En contenidos de Tierra: cifras aproximadas deben marcarse como tales y revisarse frente a fuentes cientificas vigentes; no usar el material historico como autoridad automatica.
- Documentar derechos, autores reales y licencias de fotografias, ilustraciones, fuentes y texturas.

## Entrega y pruebas

Un paquete creado con `verify: valid` se reporta como válido estructuralmente, **no como funcionalmente certificado**. Las pruebas de apertura en Studio, Player, juegos, accesibilidad, LMS y offline necesitan evidencias independientes de cada entorno. Conservar SHA-256 y reporte; declarar explicitamente faltantes.
