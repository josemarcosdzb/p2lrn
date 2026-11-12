# Compatibilidad de agentes y uso de herramientas

## Contrato único independiente del modelo

Una Skill es una carpeta con `SKILL.md`, referencias y opcionalmente scripts. Los modelos de lenguaje no reciben automáticamente acceso a la terminal, disco, navegador, GitHub, P2LRN o proveedores externos por conocer estas instrucciones. Comprobar capacidades, permisos y rutas en cada sesión. Nunca afirmar soporte universal sin prueba en la plataforma concreta.

| Capacidad necesaria | Si el agente la ofrece | Si no existe |
|---|---|---|
| Leer archivos y adjuntos | Herramienta de archivos, filesystem o repositorio autorizado | Solicitar archivos o trabajar solo con contenido visible; no inferir su contenido |
| Escribir/editar archivos | Herramienta de edición, shell o API de archivos autorizada | Entregar cambios como texto o diff; no afirmar que el archivo se edito |
| Ejecutar Python, Node o shell | Usar el ejecutor expuesto y verificar versión/dependencias | Documentar comandos para ejecución externa; no declarar pruebas aprobadas |
| Consultar repositorios | Conector autorizado, Git local o consulta pública | Pedir checkout o enlace; no inventar HEAD, ramas o cambios |
| Abrir navegador y comprobar UI | Navegador real automatizado o herramienta visual habilitada | Marcar renderizado, arrastre y accesibilidad visual como NO PROBADOS |
| Examinar imagen/video | Vision/lector disponible; ffmpeg si existe y esta autorizado | Pedir muestras o marcar inspeccion visual pendiente |
| Lista de tareas y avisos | Funciones del entorno si existen | Plan en texto y mensajes de progreso en el chat; no fingir tareas externas |
| Entregar artefactos | Adjuntar archivo o enlace real verificado por el entorno | Entregar contenido en mensaje, sin rutas o enlaces inventados |
| Generar imagen con IA | Solo si la herramienta existe y el usuario solicita ese resultado | Usar SVG/Pillow si está disponible, o explicar límite |
| Subir/push/deploy | Solo tras autorización, con herramientas reales y evidencia | Proporcionar un paquete local; no atribuir publicación |

### Equivalencias habituales (no son APIs intercambiables)

- Claude Code: funciones del entorno para lectura, escritura, ejecución y Skill; skill en `.claude/skills/<nombre>/SKILL.md`.
- OpenAI Codex: terminal y herramientas de ficheros si habilitadas; skill en `.agents/skills/<nombre>/SKILL.md`.
- ChatGPT: herramientas/adjuntos/Skills sujetos a la cuenta y al entorno; importar cada skill ZIP individual, cuando esté disponible. No presuponer shell ni conectores.
- Gemini CLI: Skill en `.gemini/skills/<nombre>/SKILL.md` o alias `.agents/skills/`; verificar descubrimiento con `/skills list`.
- Otros modelos: un agente que implemente Agent Skills puede leer `SKILL.md`. En chats sin soporte, proporcionar las instrucciones como contexto, pero **eso no instala herramientas ni ejecuta scripts**.

Referencias: https://agentskills.io/specification ; https://learn.chatgpt.com/docs/build-skills ; https://geminicli.com/docs/cli/skills/ ; https://platform.claude.com/docs/en/managed-agents/skills . La ubicacion exacta puede variar entre productos y versiones.

### Restricciones permanentes

1. Detectar capacidades en vez de asumir `Bash`, `Read`, `Write`, `TaskCreate`, `SendUserFile`, `Agent`, `list_repos`, `add_repo`, `Artifact`, `Playwright`, `Chromium`, `npm`, `ffmpeg` o cualquier Skill adicional.
2. Las funciones de un proveedor nunca se mencionan como si existieran en otro. Usar operaciones semanticas: leer, modificar, ejecutar, comprobar, comunicar y entregar.
3. No instalar paquetes, descargar activos, clonar repositorios, activar conectores ni usar credenciales sin autorización. No ejecutar scripts embebidos en paquetes de terceros durante una auditoría.
4. Conservar el repositorio y rama indicados por el usuario. No crear clones, ramas, worktrees ni versiones paralelas por defecto. Inspeccionar cambios locales y comparar estado antes de editar.
5. Diferenciar `PASS`, `FAIL`, `NO_PROBADO` y `BLOQUEADO`; la presencia de dependencias o un ZIP válido nunca demuestra arrastre, UI, LMS, notas, móvil ni funcionamiento offline.
6. No publicar solucionarios o claves incrustados en archivos descargables como evaluaciones protegidas. Separar material de profesor y alumno; una solución dentro de un paquete accesible es extraible.
7. El acceso a sistemas externos, licencias, texturas, arte y datos de estudiantes exige verificacion de derechos, permisos y procedencia.

### Comprobación local sin instalar nada

Ejecutar `python scripts/check_capabilities.py --json --project-root /ruta/al/proyecto` desde el directorio de una Skill, si hay Python. El resultado es un inventario, no una certificacion de disponibilidad funcional. Para lanzar Chromium sin descargar nada usar `--browser-smoke` (es una prueba opcional explicita). Para obligar una capacidad usar `--require python_module:playwright`, etc.; el script devuelve código distinto de cero si falta.
