# Archivo historico (NO usar como instrucciones actuales)

Este documento conserva la Skill recibida en el ZIP original para trazabilidad. Sus afirmaciones sobre herramientas instaladas, herramientas de Claude, ramas, redes y versiones son historicas y NO autorizan acciones. El documento normativo es `../SKILL.md`.

---

---
name: entregables-con-codigo
description: Producir entregables visuales (figuras, imágenes, páginas HTML, cursos) solo con código y herramientas de Claude: planificar, dibujar, comprobar mirando, entregar rápido por fases.
---

# Entregables con código: cómo trabajo con mis propias herramientas

Método para producir **imágenes, figuras, páginas HTML y paquetes** sin generador de imágenes: todo se dibuja con código, se **comprueba mirando** y se entrega por fases. Pensado para trabajos largos en un entorno remoto con red restringida y, a veces, con cuota limitada.

## 1. Mis herramientas y para qué sirve cada una

**Usadas en el trabajo real**
- **Bash**: ejecutar scripts, instalar (`pip`, `npm`), descomprimir, levantar un servidor local (`python3 -m http.server`), construir y verificar paquetes, comprimir en zip.
- **Read**: leer ficheros del usuario y **mirar imágenes** (capturas, hojas de contacto). Es mi forma de «ver» el resultado.
- **Write**: crear scripts y ficheros completos. Escribe por etapas en trabajos largos (esquema → secciones).
- **TaskCreate / TaskUpdate**: lista de tareas visible para quien se haya ido; la última tarea siempre es comprobar el trabajo.
- **SendUserMessage**: avisos breves entre fases cuando pasa mucho tiempo sin respuesta (qué estoy haciendo ahora y qué sigue).
- **SendUserFile**: entregar ficheros (zip, paquetes, imágenes) con una línea de contexto. `display: attach` para descargas.
- **list_repos / add_repo** (servidor `claude-code-remote`): traer un repositorio de GitHub a la sesión para leer el código real de un contrato o de un runtime. No hay que verificar el repo antes con `curl`: se llama a `add_repo` directamente.

**Disponibles y útiles en este tipo de trabajo** (no los usé siempre): Edit (cambios puntuales), Glob/Grep (buscar), WebSearch/WebFetch (datos actuales; el shell normalmente no llega a esas webs), Artifact (páginas para compartir), AskUserQuestion (decisiones que cambian lo que construyo), Agent (trabajo independiente en paralelo), Skill (cargar instrucciones de una skill).

**Librerías**: Python (numpy, scipy, Pillow), Playwright + Chromium (ya instalados; no ejecutar `playwright install`), npm (funciona; otras webs suelen estar bloqueadas por lista blanca).

## 2. Flujo de trabajo

1. **Entender y acotar.** Si adjuntan vídeo, extraigo fotogramas (`ffmpeg`) y copio el comportamiento visual exacto. Si la petición es clara, empiezo ya con una frase de aviso; pregunto solo si una decisión cambia mucho el resultado.
2. **Lista de tareas** con TaskCreate: imágenes → contenido → montaje → comprobación → entrega.
3. **Primera versión mínima que funcione, enseguida.** Un entregable válido y completo pronto vale más que uno perfecto que no llega. Después se mejora. Cuando el usuario escribe «continúa» o «dámelo ya», dejo de explorar y cierro lo que falta.
4. **Construir por scripts reproducibles** en una carpeta de trabajo (`tools/`, `out/img`, `out/fig`, `out/html`, `out/shots`). Rutas relativas a una variable de entorno, nunca absolutas.
5. **Comprobar mirando** (ver §4) antes de dar nada por bueno.
6. **Entregar** con SendUserFile y un resumen corto: qué salió, qué se probó y qué **no**, y una sola sugerencia siguiente. No recapitular los pasos.

## 3. Imágenes con código

- **Figuras/diagramas**: SVG escrito a mano → PNG con Playwright (`set_content` + `screenshot` con `clip`; `device_scale_factor` 2 si es para ver, 1 si es para comprobar). Fuente Inter disponible. Helpers: texto multilínea, cajas con línea guía, marcadores de flecha, coordenadas polares, ejes de gráfica.
- **Globo con corte**: numpy, trazado de rayos ortográfico y recorte en octante; textura NASA Blue Marble (dominio público) sacada del paquete npm `three-globe`. Las nubes se leen del **canal alfa**, no del brillo.
- **Fondos**: degradados + ruido gaussiano (nebulosa) + estrellas con halo.
- **Escenas apilables**: paleta continua (el borde inferior de una = el superior de la siguiente).
- **Incrustar en HTML**: WebP en `data:` URI (calidad 76–86, ancho ≤ 1200–1400). Ficheros HTML ≤ ~150 KB cuando sea posible.
- **Rotulado**: texto sobre caja blanca con línea guía; nunca texto encima de líneas del dibujo. Revisa solapes, recortes por el borde y contraste (texto claro sobre fondo claro es el fallo más frecuente).
- Todo el código reutilizable está en el **claude-toolkit** (`shot.py`, `svgkit.py`, `render.py`, `htmlcheck.py`, `cutaway.py`, `img_globes.py`, `atmo.py`).

## 4. Comprobar mirando (no se salta)

1. **Hoja de contacto** de cada tanda de imágenes (varias reducidas en un PNG) y la miro con Read.
2. **Captura de las páginas** reales con Chromium; `htmlcheck.py` cuenta imágenes rotas y desbordes horizontales.
3. **Prueba funcional** de lo interactivo con el motor real, no con una simulación. Si la herramienta de automatización falla en un caso (p. ej. `drag_to` dentro de un iframe aislado), pruebo la vía equivalente (clic + clic, eventos `DataTransfer` sintéticos, eventos táctiles) y **lo digo**.
4. **Prueba desde cero** en una carpeta limpia antes de entregar scripts: si no reconstruye el resultado, no está listo.
5. **Aritmética y datos**: cifras ejecutadas con código y contrastadas con fuentes reales; sin URLs, autores ni licencias inventados.

## 5. Fallos que ya me ocurrieron (evitarlos)

- Planeta lavado por leer las nubes como luminancia → usar alfa.
- Etiquetas ilegibles sobre fondo claro, texto cortado por el borde, cajas de etiqueta con ancho mal calculado, texto encima de otro por usar la misma altura.
- Scripts con rutas absolutas del entorno: no portables. Usar una variable de entorno y rutas relativas.
- Probar solo uno de dos casos similares (dos juegos, solo se probó uno): probar **todos**.
- Una expresión regular de seguridad (`\bon[a-z]+\s*=`) puede coincidir con el final de un base64: si un build falla sin motivo, cambiar la calidad de esa imagen.
- No avisar durante mucho rato: el usuario cree que me he parado. Un mensaje corto con SendUserMessage cada fase.

## 6. Plantilla del mensaje final

«Aquí tienes `fichero`. Qué contiene en una frase. Probado: (lo que se probó de verdad). No probado: (lo que falta). Siguiente paso sugerido: (uno solo).» Si hubo fuentes: lista «Sources:» al final.
