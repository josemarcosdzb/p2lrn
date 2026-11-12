---
name: edicion-visual-con-codigo
description: "Crear, editar, convertir y auditar imágenes, SVG, video, documentos y recursos visuales para contenidos P2LRN utilizando herramientas locales existentes; elegir estrategias equivalentes en Claude, ChatGPT, Codex, Gemini u otros agentes sin inventar software instalado."
---

# Edición visual con herramientas verificadas

Leer [COMPATIBILIDAD_AGENTES.md](references/COMPATIBILIDAD_AGENTES.md) antes de elegir herramientas. Consultar [RECETAS_EDICION.md](references/RECETAS_EDICION.md) segun formato. El [HISTORICO_ORIGINAL.md](references/HISTORICO_ORIGINAL.md) conserva experiencias previas y no autoriza afirmaciones sobre el entorno actual.

## Seleccion de pipeline

1. Recibir archivo fuente y resultado solicitado. Si el usuario proporciona video o imagen, inspeccionarlo antes de reemplazar o recrear algo.
2. Detectar software en vez de asumir que existe: `python scripts/check_capabilities.py --json --project-root /ruta/al/proyecto`. Sin terminal, trabajar solo con herramientas realmente expuestas y comunicar limitaciones.
3. Elegir operaciones reversibles que conserven los originales: SVG vectorial para diagramas, Pillow/Sharp/ImageMagick para conversiones, FFmpeg para video, Playwright/Chromium o renderer SVG para capturas; usar alternativas solo si estan verificadas.
4. Antes de usar IA de imagen, comprobar que está disponible y que responde al encargo; no afirmar ni prohibir universalmente los generadores de imagen por ser un modelo concreto. Para una solicitud de **código editable**, producir el código real, no solo un raster.
5. Mantener metadatos utiles, fuentes/licencias, relación de aspecto, alt y contraste. Evitar reescalados destructivos, texto ilegible, solapes y recortes en móvil.
6. Validar visualmente con archivos generados y pruebas de apertura reales. La exportacion correcta no acredita el aspecto final ni el funcionamiento dentro de P2LRN.
7. Entregar rutas/archivos existentes y estado exacto por formato y por entorno; no proclamar instalación de librerias, navegador, Skill o consola sin haberla comprobado.

## Integración con P2LRN

Para introducir resultados en cursos, verificar que el tipo de asset y perfil estan admitidos por Toolkit/Studio/Player instalados. Evitar etiquetas/capas falsas en capturas. No introducir scripts arbitrarios en lecciones. Si se pide un paquete `.p2lrn` completo, usar `p2lrn-curso-ilustrado` o el Toolkit oficial; esta Skill no implementa otro Writer.

Los helpers originales de ilustracion viven en `03-claude-toolkit/` dentro del ZIP del proyecto, no en el ZIP de esta Skill. No asumir que estan disponibles en otras sesiones.
