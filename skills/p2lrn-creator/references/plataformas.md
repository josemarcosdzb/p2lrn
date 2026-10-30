# P2LRN: instalación por plataforma

- **ChatGPT y Codex:** plugin Skills only, importación o revisión pública independientes. Para usar el Toolkit oficial debe haber Node 22+, proyecto con `@p2lrn/toolkit` instalado y herramientas de ejecución. Python por sí solo tiene funciones limitadas.
- **Claude / Claude Code:** importar la Skill cuando esté disponible; Claude Code puede ejecutar la API Node en un proyecto autorizado. No implica publicación pública ni concesión automática de permisos.
- **Gemini / Gemini CLI:** Skills de Gemini CLI bajo `.gemini/skills/p2lrn-creator/`. La versión web puede tener límites distintos y no garantizar Node/Python.
- **Grok / Grok Build:** directorio `.grok/skills/p2lrn-creator/`. Grok web no es lo mismo y la importación no certifica ejecución.
- **MCP:** servidor separado. Instalar esta Skill no conecta un MCP ni permite escritura. LMS/LTI requiere contexto, credenciales y Host autorizados.

Todas las distribuciones contienen `scripts/p2lrn_official.mjs` para el Toolkit real, versión de compatibilidad en `references/official-packages.json`, referencias para Player, Studio, Analytics y alternativa Python. No prometer funcionalidades que el entorno no ejecuta.

**Licencia:** desde el Anexo A del 30-10-2026 ciertos usos comerciales de formatos/Toolkit/Player están permitidos. Studio/Analytics tienen condiciones distintas. Consultar `NOTICE.md` y LICENSE, no usar una declaración legal genérica del conjunto.
