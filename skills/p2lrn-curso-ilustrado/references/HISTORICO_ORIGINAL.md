# Archivo historico (NO usar como instrucciones actuales)

Este documento conserva la Skill recibida en el ZIP original para trazabilidad. Sus afirmaciones sobre herramientas instaladas, herramientas de Claude, ramas, redes y versiones son historicas y NO autorizan acciones. El documento normativo es `../SKILL.md`.

---

---
name: p2lrn-curso-ilustrado
description: Crear o mejorar un curso .p2lrn con ilustraciones generadas por código, lecciones HTML ricas, juegos de arrastrar imágenes sobre un dibujo (formato nativo del Studio), test con solucionario, y empaquetarlo y verificarlo.
---

# Curso P2LRN ilustrado: método completo

Sirve para **crear o mejorar un curso `.p2lrn`** (formato P2LRN Core 0.4.0) con: imágenes propias dibujadas con código, lecciones HTML con buen contenido, actividades de **arrastrar fichas con imagen sobre un dibujo** igual que el Studio nativo, un test con solucionario y un paquete verificado.

Fue extraído de un trabajo real: el curso «Viaje al centro de la Tierra» (6 unidades, 14 lecciones, 17 ilustraciones, 2 juegos, test de 25 preguntas, 855 KB).

## 0. Reglas de trabajo (aprendidas por las malas)

1. **Entrega primero un paquete mínimo que funcione** (texto + 1-2 imágenes + 1 juego + test), verificado. Después mejora. El usuario puede quedarse sin cuota o impaciente; un `.p2lrn` válido a tiempo vale más que uno perfecto que nunca llega.
2. Avisa con una frase corta cada vez que cambies de fase (imágenes → lecciones → paquete). No narres cada paso.
3. Si el usuario dice «continúa» o «dámelo ya»: deja de explorar, cierra lo que falta y empaqueta.
4. Si el usuario adjunta un vídeo de la pantalla del Studio, **extrae fotogramas** (ffmpeg) y copia el comportamiento visual exacto. Eso define el estilo del juego.
5. Trabaja en una carpeta de scratchpad con subcarpetas: `build/` (scripts), `out/img/`, `out/fig/`, `out/html/`, `out/shots/`. Los ficheros subidos por el usuario son originales: trabaja sobre copias.
6. Todo se verifica **mirando**: hojas de contacto de las imágenes, captura de cada lección, prueba del juego en el runtime real, `verify` del paquete.

## 1. Herramientas y librerías

- **Bash / Read / Write** para todo; **Playwright + Chromium** (ya instalado; no ejecutes `playwright install`) para convertir SVG/HTML a PNG y para probar.
- **Python:** numpy, scipy, Pillow (WebP). **npm** funciona; el resto de la red suele estar restringida (lista blanca), así que las texturas se sacan de paquetes npm (p. ej. `three-globe`).
- **Script de empaquetado del usuario:** `p2lrn_package.py` (skill `p2lrn-creator`): clase `Composer`, `build(course, output)`, `verify(path)`. Se importa con `importlib` (ver §7).
- **Repositorio P2LRN (rama `mejorastudio`)** vía `list_repos`/`add_repo` para leer el contrato real del arrastre: `packages/toolkit/web/renderers/lesson-drop-runtime.js` y `lesson-drop-sandbox.js` (función `prepareStudioDropSandbox`).
- Para probar localmente: `python3 -m http.server 8765` sirviendo `packages/toolkit/web`.
- No hay generador de imágenes con IA: **todo se dibuja con código** (SVG, numpy, Pillow). Ventaja: texto nítido, sin errores ortográficos, tamaño pequeño y reproducible.

## 2. Pipeline de imágenes

### 2.1 SVG → PNG con Playwright (casi todas las figuras)

```python
from playwright.sync_api import sync_playwright
def shot(html, path, w, h, scale=1, transparent=False, wait=150):
    ctx = BR.new_context(viewport={'width': w, 'height': h}, device_scale_factor=scale)
    p = ctx.new_page(); p.set_content(html, wait_until='load'); p.wait_for_timeout(wait)
    p.screenshot(path=path, omit_background=transparent, clip={'x':0,'y':0,'width':w,'height':h}); ctx.close()
```

- Página base: `*{box-sizing:border-box;margin:0}`, `font-family:Inter,Carlito,sans-serif` (Inter está disponible).
- Helper de texto multilínea `T(x, y, líneas, tamaño, peso, color, ancla)`; flechas con `<marker>`; fondos `#f7fbff`.
- Tamaños de salida: figuras 1400×(380–720); tableros de juego 1600×1200; fichas 640×200 a escala 1,5 con esquinas transparentes.
- **Paleta del interior terrestre:** corteza `#7b4a33`, manto superior `#b9541f`, manto inferior `#e1771f`, núcleo externo `#f4a81d`, núcleo interno `#ffe28f`; texto `#17304a`, titulares `#0f2f4d`, secundario `#4a6580`.
- Ingredientes reutilizables: perfil de capas a escala (barra horizontal), círculo con capas concéntricas, rayos curvos polares (`pol(cx,cy,r,ángulo)`), líneas de campo dipolar `r = L·sin²θ`, comparación de tamaños con círculos a escala, gráfica de temperatura/presión con puntos marcados, cortes tectónicos, ciclo en pentágono con flechas y atajos discontinuos, bandas de atmósfera con degradado continuo arriba/abajo.
- **Etiquetas:** pon cada texto en una caja blanca con línea guía; no dejes texto sobre líneas del dibujo. Revisa siempre solapes, recortes por el borde y contraste.

### 2.2 Globo con corte en octante (numpy, sin 3D)

- Trazado de rayos ortográfico en numpy: esfera + octante recortado; las caras del corte se colorean con capas concéntricas (radios 0,215 / 0,545 / 0,875 / 0,962 / 1,0, corteza ensanchada a propósito) y ruido para textura; emisión mayor cuanto más profundo (`[0.95,0.62,0.22,0.05,0.0]`).
- Textura de la Tierra: `npm pack three-globe@2.31.0` → `example/img/earth-blue-marble.jpg` (NASA Blue Marble, dominio público) y `clouds/clouds.png`.
- **Las nubes se leen del canal alfa**, no con `convert('L')` (daba ≈1 en todas partes y el planeta salía lavado). Umbral `smooth(0.10,0.95)*0.80`, luz ambiente 0,16.
- Fondo espacial: degradado azul muy oscuro + nebulosa (ruido gaussiano) + estrellas con halo; halo atmosférico azul alrededor del limbo.
- Para colocar puntos sobre la cara cortada (líneas guía de un juego): elegir la cara visible cuya dirección de 45° apunta arriba a la derecha y proyectar con la misma matriz de rotación.

### 2.3 Escenas de atmósfera (tiras apilables)

- Cinco tiras 1344×384 (exosfera, termosfera, mesosfera, estratosfera, troposfera) con **paleta continua**: el borde inferior de una tira coincide con el superior de la siguiente, de modo que juntas forman un solo paisaje.
- Objetos por capa: satélites y estrellas; aurora + EEI; meteoros + nubes noctilucentes; ozono, rayos UV y globo sonda; nubes, avión y montaña.

### 2.4 Incrustar imágenes en HTML

- Convierte a **WebP** (calidad 76–86, ancho máx. 1000–1400) y pásalas a `data:image/webp;base64,…`. Fichas con transparencia: RGBA.
- Cada lección HTML debe quedar **por debajo de 500 000 caracteres** (límite de `clean_html`). Objetivo práctico: ≤ 150 KB por lección, ≤ 2 imágenes grandes.
- Haz una **hoja de contacto** (varias imágenes reducidas a 1000–1100 px en un PNG) y mírala antes de seguir.

## 3. Juegos de arrastrar «como el Studio»

### 3.1 Qué se ve en el Studio nativo

Una **imagen grande** con **huecos de línea discontinua** colocados encima; debajo, una **bandeja de fichas con imagen**. Al soltar, la ficha **rellena el hueco** (`object-fit: contain`), el hueco se pone verde, aparece «Correcto: N de M fichas colocadas» y hay «Reiniciar actividad». Lo que NO hay que hacer: cajas pequeñas «Zona 1…5» y fichas casi invisibles (anillos finos).

### 3.2 Contrato del runtime (atributos obligatorios)

| Elemento | Atributo |
|---|---|
| Contenedor | `data-p2lrn-layout="drag-drop"` y `data-p2lrn-dnd="1"` |
| Tablero | `data-p2lrn-dnd-board` (con `position:relative` y `aspect-ratio`) |
| Imagen de fondo | `data-p2lrn-dnd-image` (`position:absolute;inset:0;width:100%;height:100%;object-fit:contain`) |
| Hueco | `data-p2lrn-dnd-zone="zone-item-N"` + `data-p2lrn-dnd-accept="item-N"` (+ `data-p2lrn-dnd-label` para el rótulo) |
| Bandeja | `data-p2lrn-dnd-tray` |
| Ficha | `data-p2lrn-dnd-item="item-N"` con una `<img data-p2lrn-dnd-item-image>` dentro |
| Estado | `data-p2lrn-dnd-status` (**obligatorio**, `role="status"`, `aria-live="polite"`) |

El runtime soporta HTML5 drag, punteros táctiles y «clic en la ficha, luego clic en el hueco» (accesible con teclado/táctil).

### 3.3 Restricciones del sandbox (si las incumples, el juego se rompe o se limpia)

- **Solo estilos en línea (`style="…"`)**. Prohibidos: `<style>`, `<svg>`, `z-index`, `url(` y `position:fixed` dentro de `style`.
- Imágenes solo como `data:` PNG/JPEG/WebP/GIF/AVIF. La imagen del tablero y las fichas van incrustadas.
- **Los huecos no deben solaparse**: gana el elemento superior. Reparte huecos en columna o cuadrícula sin cruces.
- Escribe el juego como un **fragmento `<article style="…">…</article>`** (no documento completo): el `Composer` ya lo envuelve en `<html><body>`. Pon `font-family` y `color` en el propio `<article>`.

### 3.4 Diseño que funciona

- **Aspect ratio de ficha = aspect ratio del hueco**, así la imagen llena el hueco sin bandas. Ejemplo: hueco 42 % × 17,5 % de un tablero 4:3 de 1600×1200 → 672×210 px (3,2:1) → fichas 640×200. Escenas de atmósfera: 672×192 → tiras 1344×384.
- Huecos en la columna derecha (`left:56%; width:42%`), alturas 16–17,5 %, separación uniforme. El tablero lleva en la imagen los rótulos, las alturas y **líneas guía** hasta cada hueco.
- **Juego 1 (interior):** globo cortado a la izquierda; cada hueco rotulado con la profundidad (0–35, 35–660, 660–2 890, 2 890–5 150, 5 150–6 371 km); las fichas son tarjetas con muestra de color y nombre de la capa. Orden de fichas mezclado.
- **Juego 2 (atmósfera):** perfil con las cinco capas rotuladas a la izquierda; las fichas son escenas que, al colocarse, reconstruyen el paisaje completo.
- Añade encima una caja «Cómo se juega» y debajo tres tarjetas de pistas (color, profundidad/altura, estado). Pie con créditos.

### 3.5 Cómo probarlo con el runtime real

Carga en Playwright una página que importa `/renderers/lesson-drop-sandbox.js` desde el servidor local, construye un `iframe srcdoc` con `sandbox="allow-scripts"` y comprueba: `interactive == true`, 5 zonas / 5 fichas, clic-ficha + clic-hueco coloca («Correcto: 1 de 5…»), eventos táctiles sintéticos, reinicio. El `drag_to` de Playwright es **poco fiable dentro del iframe**; no lo uses como prueba única. **Prueba los dos juegos, no solo el primero.**

## 4. Lecciones HTML

### 4.1 Restricciones (`clean_html`)

Prohibido: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<svg>`, `<math>`, atributos `on…=` y `javascript:`; máximo 500 000 caracteres. **Sí se permiten** `<style>`, `<details>`, tablas e imágenes `data:`. Pasa un **fragmento** (CSS + `<div class="l">…</div>`); el Composer añade `<html><head><title>`.

> Riesgo raro: la expresión `\bon[a-z]+\s*=` (sin distinguir mayúsculas) podría coincidir con el final de un base64 (`/onXyz=`). Si el build falla con «Active scripts…», cambia la calidad de esa imagen y reconstruye.

### 4.2 Plantilla de lección (lo que dio buen resultado)

1. Etiqueta de unidad + `h1` + frase de entrada (lead).
2. Un párrafo gancho con un dato sorprendente.
3. Tarjetas de cifras (`.stat`: valor grande + etiqueta).
4. Figura con `alt` descriptivo y pie (`figcaption`).
5. Tabla comparativa (en un contenedor con scroll horizontal).
6. Recuadros `dato` (naranja), `clave` (verde) e `info` (azul).
7. «Comprueba lo que has aprendido»: 2–3 `<details><summary>` con respuesta.
8. Pie de fuentes y créditos de la lección.

CSS compartido en un `<style>` con clases prefijadas (`.l`, `.stat`, `.cd`, `.tw`…). Tipografía `Inter,'Segoe UI',Roboto,Arial`, `line-height:1.7`, ancho máx. 920 px, `clamp()` en los títulos. Revisa a 1000 px y a ancho móvil.

### 4.3 Contenido: reglas

- Cifras redondeadas con «≈» cuando son aproximadas; indica el margen de incertidumbre (temperaturas y presiones profundas).
- Español con tildes y separador de miles con espacio (`6 371 km`). Verifica ortografía en títulos (p. ej. «tectónica»).
- Cita fuentes reales (USGS, NASA, NOAA, OMM, Smithsonian GVP, PREM). **No inventes URLs, autores ni derechos.**
- Escribe siempre lo que representa el dibujo («esquema didáctico, sin escala»).

### 4.4 Datos de referencia (Tierra y atmósfera)

- Radio 6 371 km. Capas: corteza 0–35 km (oceánica ≈ 7, continental ≈ 35, hasta 70 bajo el Himalaya); manto superior 35–660; manto inferior 660–2 890; núcleo externo 2 890–5 150 (líquido); núcleo interno 5 150–6 371 (radio 1 221 km, sólido).
- Presión (PREM): 660 km ≈ 24 GPa; límite manto-núcleo ≈ 136 GPa; núcleo interno ≈ 329 GPa; centro ≈ 364 GPa. Densidad: corteza 2,7–3,0; manto 3,4–5,6; núcleo externo 9,9–12,2; interno 12,8–13,1 g/cm³.
- Temperatura aprox.: 100 km ≈ 1 300 °C; 660 km ≈ 1 900 °C; límite manto-núcleo ≈ 3 700 °C; núcleo interno ≈ 5 400 °C.
- Volumen: manto 84 %, núcleo 16 %, corteza 1 %. Descubrimientos: Mohorovičić 1909, Gutenberg 1914 (núcleo líquido), Lehmann 1936 (núcleo interno).
- Atmósfera: troposfera 0–12 km (≈ −56 °C), estratosfera 12–50 (ozono 15–35 km), mesosfera 50–85 (≈ −90 °C), termosfera 85–600 (> 1 000 °C), exosfera 600–10 000 km; línea de Kármán 100 km. Aire seco: N₂ 78,08 %, O₂ 20,95 %, Ar 0,93 %, CO₂ ≈ 0,042 %. Mitad del aire por debajo de 5,5 km; 99 % por debajo de 32 km.

## 5. Test y solucionario

- Tipos válidos: `single-choice`, `multiple-choice`, `true-false`, `text`, `fill-blanks`, `ordering`, `matching`, `classification`. Cada pregunta: `id`, `prompt`, `points` (entero > 0), `type`, `choices` y `solution` (`{"choiceIds":[…]}`).
- IDs: `q01`, y opciones `q01a`, `q01b`… `true-false` simple: exactamente 2 opciones.
- **Evita el defecto clásico** (la correcta siempre es la «a», 3 opciones): usa 4 opciones, distractores plausibles (p. ej. diámetro frente a radio) y **baraja con un `random.Random(semilla)`** poniendo primero la correcta y registrando su letra final para el solucionario.
- Presentación: `{"questionMode":"one-at-a-time","shuffleQuestions":false,"showFeedback":"after-submit"}` (valores válidos de `showFeedback`: `after-submit` o `never`). Se pasa como `payload` completo con `schema` `https://p2lrn.org/schema/native-questionnaire/0.4.0`, `version` `0.4.0`, `grading:{mode:'embedded-key'}`.
- Mezcla tipos: ≈ 20 de opción única, 3 verdadero/falso, 2 de respuesta múltiple. 1 punto cada una.
- El **solucionario** es una lección HTML con tabla (n.º, pregunta, respuesta correcta con letra, explicación) y una guía de interpretación de la nota. Se genera **desde los mismos datos** que el test para que no se desincronicen.

## 6. Estructura de curso recomendada

`01 Introducción` · `02 Estructura interna` · `03 Procesos` · `04 Atmósfera` · `05 Actividades de arrastrar` · `06 Evaluación y respuestas` (test + solucionario + fuentes). Los juegos van como actividades `lesson` con el fragmento `<article>`; el test como `quiz` con `payload`.

## 7. Empaquetado y verificación

```python
import importlib.util, json
spec = importlib.util.spec_from_file_location('pk', '<ruta>/p2lrn-creator/scripts/p2lrn_package.py')
pk = importlib.util.module_from_spec(spec); spec.loader.exec_module(pk)
course = {
  'title': '…', 'description': '…', 'language': 'es', 'createdAt': 'AAAA-MM-DD',
  'units': [ {'title': '01. Introducción', 'role': 'module', 'lessons': [
      {'type': 'lesson', 'title': '…', 'html': FRAGMENTO},
      {'type': 'quiz', 'title': '…', 'payload': PAYLOAD} ]} ]}
rep = pk.build(course, 'salida.p2lrn')   # construye y llama a verify()
print(json.dumps(rep, ensure_ascii=False))
```

- Derechos: solo claves `author`, `createdAt`, `license`, `copyrightHolder`. Pon `createdAt`; **no inventes autor ni licencia** salvo que el usuario los dé. Conserva los metadatos del curso original si lo mejoras.
- CLI equivalente: `p2lrn_package.py build --input curso.json --output x.p2lrn` y `p2lrn_package.py verify x.p2lrn`.
- Resultado esperado: `"valid": true`, conteo de unidades y lecciones y `warnings: []`.

## 8. Lista de comprobación final

1. `verify` → `valid: true`.
2. Descomprime el `.p2lrn`, abre varias lecciones con Playwright y comprueba: sin imágenes rotas (`[...document.images].filter(i=>!i.naturalWidth).length === 0`), tablas legibles, nada recortado. Mira al menos 4-5 capturas.
3. Prueba **los dos juegos** con el runtime real (§3.5).
4. Revisa el test: la correcta no es siempre la misma letra; el solucionario coincide con las claves.
5. Revisa las cifras y los créditos (NASA Blue Marble, USGS, NOAA…). Declara que los esquemas son didácticos.
6. Entrega con `SendUserFile` (`display: attach`) y un resumen corto: qué se hizo, qué se probó y qué no, y una única sugerencia siguiente.

## 9. Mejoras pendientes (haz esto la próxima vez)

- Automatizar una prueba de arrastre HTML5 real y ejecutarla en **ambos** juegos antes de entregar.
- Una pasada de estilo a las figuras con un solo módulo de componentes (etiquetas con caja, flechas, ejes) para evitar solapes sin tener que retocar a mano.
- Hacer una comprobación automática de solapes de texto (cajas delimitadoras con `getBBox`) en los SVG.
- Añadir un segundo juego de relacionar (matching) y un crucigrama con las renderizaciones nativas del Composer.
- Guardar la receta de cada imagen en un JSON para regenerar el curso con otra paleta o idioma.