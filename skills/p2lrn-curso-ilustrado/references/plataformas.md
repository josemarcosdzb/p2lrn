# P2LRN: instalación por plataforma

- **ChatGPT y Codex:** plugin Skills only, importación o revisión pública independientes. Para usar el Toolkit oficial debe haber Node 22+, proyecto con `@p2lrn/toolkit` instalado y herramientas de ejecución. Python por sí solo tiene funciones limitadas.
- **Claude / Claude Code:** importar la Skill cuando esté disponible; Claude Code puede ejecutar la API Node en un proyecto autorizado. No implica publicación pública ni concesión automática de permisos.
- **Gemini / Gemini CLI:** Skills de Gemini CLI bajo `.gemini/skills/p2lrn-creator/`. La versión web puede tener límites distintos y no garantizar Node/Python.
- **Grok / Grok Build:** directorio `.grok/skills/p2lrn-creator/`. Grok web no es lo mismo y la importación no certifica ejecución.
- **MCP:** servidor separado. Instalar esta Skill no conecta un MCP ni permite escritura. LMS/LTI requiere contexto, credenciales y Host autorizados.

**Paridad de funciones:** las cinco distribuciones deben contener el mismo `SKILL.md` de autoría oficial, la matriz de paquetes y `references/studio-arrastre-ensamblaje-3d.md`. Esta referencia describe mover/redimensionar objetos en Studio, la actividad de zonas con fichas `drag-drop`, la pregunta `drag-scored` y el ensamblaje `assembly-3d` con GLB/jaulas. Los nombres de menús, las versiones y la comprobación de guardado deben contrastarse con el editor real; ninguna Skill ejecuta gestos de ratón por sí misma.

**Revisión por proveedor:** comprobar por separado el ZIP de ChatGPT, Codex, Claude, Gemini y Grok; un mismo archivo fuente no demuestra que los cinco paquetes servidos por el CDN se hayan actualizado o instalado. Las instrucciones de uso pueden adaptarse al proveedor, pero las referencias, capacidades soportadas y límites deben ser iguales.

Todas las distribuciones contienen `scripts/p2lrn_official.mjs` para el Toolkit real, versión de compatibilidad en `references/official-packages.json`, referencias para Player, Studio, Analytics y alternativa Python. No prometer funcionalidades que el entorno no ejecuta.

**Licencia:** desde el Anexo A del 30-10-2026 ciertos usos comerciales de formatos/Toolkit/Player están permitidos. Studio/Analytics tienen condiciones distintas. Consultar `NOTICE.md` y LICENSE, no usar una declaración legal genérica del conjunto.
