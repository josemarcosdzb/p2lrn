# Recetas visuales por formato (uso condicionado a disponibilidad)

## SVG e imágenes

- SVG: geometría y texto vectorial; `rsvg-convert` o renderizador de navegador para PNG cuando exista, comparando fuentes y captura final. Si hay Playwright pero no Chromium, no afirmar que hubo renderizado.
- Pillow: conversion PNG/WebP/JPEG, modo RGB/RGBA, miniaturas y composición. Verificar dimensiones tras conversion y preservar originales.
- NumPy/SciPy: fondos, ruido, globos con corte y composición alfa. Es geometría renderizada, no un activo 3D editable.
- OpenCV y scikit-image: alineacion, deteccion de bordes y mascaras, si realmente estan instaladas.
- Sharp y ImageMagick: alternativas para recodificar y redimensionar, disponibles solo tras comprobación.

## Video

- `ffprobe -v error -show_entries format=duration -of json entrada.mp4` para duracion si existe FFmpeg.
- `ffmpeg -i entrada.mp4 -vf fps=1 fotogramas/f_%03d.png` para inspeccion, sin fingir que los fotogramas son un video nuevo.
- Generar montaje con cortes, audio y dimension del original cuando asi lo pida el usuario. Verificar contenido final viendo el fichero real, no solo el código de salida.

## Documentos y PDF

- `pdftoppm` para páginas en imagen; LibreOffice para conversion Office si el entorno lo permite; ReportLab, python-docx, python-pptx, openpyxl o herramientas oficiales de documentos segun disponibilidad.
- Respetar formatos y pedir las dependencias pertinentes solo si faltan y el usuario autoriza instalación.

## Controles de calidad

- Revisar hoja de contacto, captura real, imagen rota, desbordes y contenido cortado a diferentes anchos; para un juego hacer clicks, puntero, táctil y teclado separados.
- Revisar referencias, autoría y licencias, sin descargar activos de terceros automáticamente.
- Archivar fuentes editables, salida y metadatos reales. Una Skill del proveedor no garantiza que el resultado sea portable; los archivos generados si pueden serlo.
