---
name: p2lrn-curso-ilustrado
description: "Crear, revisar o mejorar cursos .p2lrn ilustrados con lecciones HTML, imágenes, actividades de arrastrar y cuestionarios; empaquetar con Toolkit oficial cuando esté disponible y comprobar estructura, seguridad, accesibilidad y ejecución real sin asumir herramientas del modelo."
---

# P2LRN: crear y revisar cursos ilustrados

## Principio

Reutilizar P2LRN oficial y conservar fuentes y materiales del usuario. Esta Skill NO instala el Player, Studio, Toolkit, acceso a GitHub, navegador ni empaquetadores. Valorar los archivos y capacidades reales antes de actuar. Compatible por instrucciones con agentes que lean `SKILL.md`; la ejecución depende de las herramientas concedidas al agente.

Leer primero [COMPATIBILIDAD_AGENTES.md](references/COMPATIBILIDAD_AGENTES.md). Para recetas visuales, HTML, datos del curso y esquema de juegos, usar [RECETAS_CURSO.md](references/RECETAS_CURSO.md). Si se precisa entender el origen de la Skill, existe [HISTORICO_ORIGINAL.md](references/HISTORICO_ORIGINAL.md), que no tiene prioridad normativa.

## 1. Verificar el entorno y seleccionar ruta real

1. Identificar entradas, resultados pedidos, raíz del proyecto P2LRN, rama, cambios locales, salida, autorizaciones y derechos. No duplicar ni sobrescribir el repo ni el curso original.
2. Si existe Python, ejecutar `python scripts/check_capabilities.py --json --project-root /ruta/P2LRN` para descubrir herramientas SIN instalar nada. Si no hay ejecución de código, preguntar por el entorno o entregar instrucciones comprobables sin fingir pruebas.
3. **Ruta preferente:** comprobar las APIs reales de `@p2lrn/toolkit` (y su versión) en el checkout/paquete instalado. Utilizar el Writer/Reader/Authoring oficial para crear, abrir, editar, exportar y verificar. Consultar los scripts incluidos en esta Skill, `scripts/p2lrn_official.mjs` y `scripts/p2lrn_package.py`, y su compatibilidad con `references/official-runtime.md` y `references/official-packages.json` antes de ejecutar.
4. **Ruta Python limitada:** solo para nuevos cursos Core 0.4.0 compatibles, usar `scripts/p2lrn_package.py` incluido para cursos nuevos simples Core 0.4.0; validar después. El empaquetador alternativo no sustituye a Toolkit ni permite editar paquetes arbitrarios. No usarlo para editar/reescribir paquetes arbitrarios.
5. Si ninguna ruta existe, informar `BLOQUEADO` y la dependencia concreta, preservando entradas y trabajo ya hecho; no crear una imitación de formato ni instalar un paquete sin autorización.
6. Node/npm, Playwright/Chromium, FFmpeg, NumPy, SciPy, Pillow, fuentes o la red son **opcionales según tarea** y se detectan; no asumir que vienen instalados en ningún modelo.

## 2. Construcción respetando el contrato

- Preparar contenido docente, estructura por unidades, imágenes, juegos y evaluación con IDs estables, metadatos y derechos reales. No inventar titular, licencia, créditos ni URL.
- Crear HTML sin scripts activos ni recursos inseguros. Usar el sanitizador y contratos de la versión instalada. Distinguir HTML estático de la lección de arrastrar: sus reglas de sandbox son distintas.
- Los juegos de arrastrar se crean con el **runtime nativo** y atributos `data-p2lrn-dnd-*` que acepte la versión inspeccionada, no con otro motor o imagen fingida. Examinar `packages/toolkit/web/renderers/lesson-drop-runtime.js` y `lesson-drop-sandbox.js` del checkout elegido; la mera existencia del renderer NO prueba que funcione.
- Solucionarios: generar a partir de claves fuente para evitar divergencias, pero **no incluirlos como lección libremente accesible** si la evaluación debe proteger respuestas. El paquete del alumno con claves embebidas no es confidencial; separar solucionario del docente, restringir distribución y comprobar exposición real.
- No modificar el curso original al mejorar. Exportar una nueva versión solo si el usuario lo requiere; comparar unidades, assets y evaluaciones para detectar pérdida de funcionalidad.

## 3. Verificacion con evidencia

1. `verify` del paquete con Writer/Reader oficial o del subconjunto usado: integridad, esquema, relaciones, assets, referencias, claves y respuestas.
2. Abrir **todas** las lecciones afectadas en Player/Studio real cuando exista navegador. Capturas a 320/390/768/1280 px y comprobación de recortes, imágenes, texto alternativo y contraste.
3. Probar cada juego de forma independiente: clic+clic, teclado, arrastre de puntero real, táctil real si hay dispositivo, reinicio y guardado. Eventos `DataTransfer` sinteticos solo prueban la ruta sintetica; no se etiquetan como arrastre real.
4. Para LMS/LTI, comprobar autenticacion, progreso, reentrada, notas AGS y Deep Linking en cada LMS autorizado; `verify` o HTTP 200 NO certifican LMS ni notas. No insertar credenciales en evidencias.
5. Registrar resultado por escenario con `PASS`, `FAIL`, `NO_PROBADO` o `BLOQUEADO` y mencionar entorno, versiones, rutas, SHA-256 y evidencia.
6. Entregar archivo existente y verificado mediante el mecanismo disponible; no inventar enlaces, commits, ejecutables ni pruebas.

## 4. Scripts de ejemplo, no de ejecución automatica

El archivo de trabajo de origen incluia `02-scripts-del-curso/` y `03-claude-toolkit/` fuera de esta Skill. **No estan dentro de este paquete individual**. Solo usarlos si el usuario aporta esas carpetas o si existen en su proyecto. Nunca exigir carpetas `claude-*`, endpoints MCP ni herramientas exclusivas de un proveedor. Preferir los componentes oficiales y los scripts ya existentes en el proyecto.

## Dependencias y scripts incluidos

Este paquete incluye `scripts/p2lrn_package.py`, `scripts/p2lrn_official.mjs`, sus pruebas y sus contratos oficiales reutilizados desde `skills/p2lrn-creator/`. No ejecutar instalaciones automáticas y no considerar la creación de un ZIP prueba de Studio, Player o LMS.
