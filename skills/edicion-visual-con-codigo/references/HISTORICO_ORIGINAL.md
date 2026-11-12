# Archivo historico (NO usar como instrucciones actuales)

Este documento conserva la Skill recibida en el ZIP original para trazabilidad. Sus afirmaciones sobre herramientas instaladas, herramientas de Claude, ramas, redes y versiones son historicas y NO autorizan acciones. El documento normativo es `../SKILL.md`.

---

---
name: edicion-visual-con-codigo
description: Edición y creación visual con todo lo que tengo: dibujo con código (Pillow, numpy, SVG+Chromium), ffmpeg, ImageMagick, OpenCV, sharp, PDF/Office, skills de diseño y herramientas de Claude. Elegir la herramienta y comprobar mirando.
---

# Edición visual con código: todo mi equipamiento y cómo usarlo

Guía para **crear, editar, convertir y revisar** imágenes, vídeo, gráficos, PDF y documentos con las herramientas que realmente tengo. Marca qué se usó en un trabajo real y qué está solo disponible.

**Límites que hay que decir con claridad:** no tengo un generador de imágenes con IA ni un editor tipo Photoshop; todo lo visual se hace dibujando con código, componiendo y comprobando capturas. No tengo Inkscape, potrace, cairosvg ni moviepy. La red del entorno suele estar restringida (lista blanca: npm, pip, GitHub), así que las texturas y recursos se sacan de paquetes npm/pip o los aporta el usuario. El control del navegador en vivo no entra en el plan gratuito.

## 1. Qué herramienta para cada tarea

| Quiero… | Uso | Estado |
|---|---|---|
| Diagramas, esquemas, gráficas a medida, carteles de texto nítido | **SVG escrito a mano → PNG con Playwright/Chromium** (fuente Inter) | **Usado** (casi todas las figuras del curso) |
| Render 3D simple sin motor 3D (globo cortado, relieves, degradados) | **numpy + scipy + Pillow** (trazado de rayos, ruido, composición alfa) | **Usado** |
| Fondos, estrellas, nebulosas, texturas | numpy + `gaussian_filter` + Pillow | **Usado** |
| Convertir/reducir imágenes (PNG→WebP, redimensionar) | **Pillow** (Python) o **sharp** (Node, muy rápido) | Pillow **usado**; sharp disponible |
| Textura de la Tierra | paquete npm **three-globe** (NASA Blue Marble, dominio público) | **Usado** |
| Sacar fotogramas de un vídeo, medir, recortar, recodificar | **ffmpeg / ffprobe** | **Usado** (fotogramas de una grabación de pantalla) |
| Convertir, recortar, componer, montar hojas de contacto | **ImageMagick `convert`** y **`wand`** | disponible |
| Filtros, detección de bordes, alineación, máscaras, limpieza | **OpenCV (`cv2`)**, **scikit-image**, **imageio** | disponible |
| Gráficas de datos | **matplotlib**, **seaborn** (o la skill `dataviz`) | disponible |
| SVG → PNG rápido sin navegador | **`rsvg-convert`** (menos fiel con fuentes que Chromium) | disponible |
| Diagramas de flujo/secuencia desde texto | **`mmdc` (Mermaid)** | disponible |
| Páginas de PDF a imagen | **`pdftoppm`** | disponible |
| Documento → PDF | **LibreOffice** (`--headless --convert-to pdf`) | disponible |
| Crear PDF/Word/PowerPoint/Excel por código | **reportlab, pdf-lib, pdfjs-dist; python-docx, docx; python-pptx, pptxgenjs; openpyxl** (o las skills `pdf`, `docx`, `pptx`, `xlsx`) | disponible |
| Arte generativo interactivo | skill **`algorithmic-art`** (p5.js) | disponible |
| Carteles/arte estático en PNG/PDF | skill **`canvas-design`** | disponible |
| Páginas web con estilo cuidado | skill **`frontend-design`**, **`artifact-design`**, **`theme-factory`**, **`web-artifacts-builder`** (React complejo) | disponible |
| Diagramas dentro de páginas publicadas | skill **`artifact-diagramming`** | disponible |
| Gráficos y paneles | skill **`dataviz`** y tarjeta `chart_display_v0` | disponible |
| Vídeo nuevo desde cero | skill **`video-making`** (no edita vídeos que me des) | disponible |
| Publicar una página para compartir | **Artifact** (según cuenta: tipos Diseño, Diapositivas, Panel…) | disponible |
| Tarjetas de lugares, productos, itinerarios, recetas, tiempo | herramientas `*_display_v0`, `weather_fetch`, `show_widget` | disponible |
| Imágenes de referencia | **`image_search`** (solo para inspirarme; no copiar obras, logos ni personajes) | disponible |

## 2. Recetas que funcionan

### SVG → PNG con Chromium (la base)
```python
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width':1400,'height':700}, device_scale_factor=2).new_page()  # 2 si lo va a ver una persona; 1 para comprobar
    pg.set_content('<html><body style="margin:0;font-family:Inter">'+svg+'</body></html>')
    pg.screenshot(path='fig.png', clip={'x':0,'y':0,'width':1400,'height':700}, omit_background=False)
```
Chromium y Playwright ya están instalados: no ejecutar `playwright install`. Transparencia: `omit_background=True` y fondo transparente.

### Conversión y tamaño
```bash
python3 -c "from PIL import Image; Image.open('a.png').convert('RGB').save('a.webp','WEBP',quality=80,method=6)"
node -e "require('sharp')('a.png').resize(1200).webp({quality:80}).toFile('a.webp')"
convert a.png -resize 1200x -quality 85 a.jpg           # ImageMagick
rsvg-convert -w 1400 fig.svg -o fig.png
mmdc -i flujo.mmd -o flujo.png                         # Mermaid (no necesita -p)
```

### Vídeo y PDF
```bash
ffprobe -v error -show_entries stream=width,height,duration -of default=nw=1 v.mp4
ffmpeg -i v.mp4 -vf fps=1 frames/f_%03d.png              # un fotograma por segundo
ffmpeg -i v.mp4 -c:v libx264 -crf 23 -preset veryfast out.mp4   # veryfast salvo que pidan la mejor calidad
pdftoppm -r 150 -png doc.pdf pagina                       # PDF -> imágenes
libreoffice --headless --convert-to pdf documento.docx
```

### Render 3D sin motor (núcleo de lo que hice)
- Trazado de rayos ortográfico en numpy sobre una esfera con un octante recortado; las caras del corte se colorean por capas concéntricas con ruido; luz difusa + ambiente.
- Textura de la Tierra leyendo la imagen **equirrectangular** y muestreando con `map_coordinates`. **Las nubes se leen del canal alfa, no como luminancia** (si no, el planeta sale lavado).
- Halo atmosférico: brillo exponencial fuera del limbo, azul `(0.28,0.55,1.0)`.
- Código listo en el **claude-toolkit**: `cutaway.py`, `img_globes.py`, `atmo.py`, `svgkit.py`, `shot.py`, `render.py`, `htmlcheck.py`.

## 3. Buenas prácticas de diseño

- **Jerarquía**: título grande, subtítulo en gris azulado, cuerpo ≥ 16 px. Paleta corta (3–5 colores) y coherente; una familia tipográfica (Inter).
- **Rotulado legible**: caja blanca con línea guía; nunca texto sobre líneas del dibujo; contraste suficiente (texto claro sobre fondo claro es el fallo más común).
- **Escenas apilables**: el borde inferior de una = el superior de la siguiente (degradado continuo).
- **Proporciones**: si una imagen va a rellenar un hueco, su relación de aspecto debe ser igual a la del hueco.
- **Peso**: WebP 76–86 de calidad, ancho ≤ 1200–1400, HTML incrustando imágenes ≤ ~150 KB por página cuando se pueda.
- **Originalidad**: no reproducir obras, logotipos, portadas, pósters ni personajes conocidos, ni dibujar personajes de marca; diseños y personajes originales, y símbolos genéricos sí. No descargar ni incrustar fotos de personas públicas.

## 4. Comprobar mirando (obligatorio)

1. **Hoja de contacto** de cada tanda de imágenes y mirarla con Read.
2. **Captura real** de las páginas con Chromium; contar imágenes rotas (`[...document.images].filter(i=>!i.naturalWidth).length`) y desborde horizontal (`scrollWidth > clientWidth`).
3. Para entregas interactivas, probar con el **motor real**; si la automatización falla en un caso (p. ej. `drag_to` dentro de un iframe aislado), probar la vía equivalente y **decirlo**.
4. Reconstruir desde cero en una carpeta limpia antes de entregar scripts.
5. Revisar cifras con código y fuentes reales; no inventar URLs, autores ni licencias.

## 5. Flujo y entrega

1. Lista de tareas (TaskCreate/TaskUpdate); la última: comprobar.
2. Versión mínima que funcione primero; mejorar después. Aviso corto con SendUserMessage al cambiar de fase.
3. Entrega con SendUserFile (`display: attach` para descargas) y resumen: qué salió, qué se probó y qué **no**, y un solo paso siguiente.

## 6. Fallos conocidos

- Planeta lavado por leer nubes como luminancia → usar alfa.
- Texto cortado por el borde, cajas de etiqueta mal dimensionadas, etiquetas solapadas por usar la misma altura.
- Scripts con rutas absolutas del entorno → usar una variable de entorno y rutas relativas.
- Probar solo uno de dos casos casi iguales → probar todos.
- `rsvg-convert` no siempre respeta bien las fuentes: para texto fiel, usar Chromium.
