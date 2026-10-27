# P2LRN MCP integration — optional

This integration adds a **P2LRN-side MCP server** and a **client-side setup helper** without changing the P2LRN Core format, Reader, Player, Studio or four existing npm packages.

It uses the existing `@p2lrn/toolkit/reader` and `@p2lrn/toolkit/authoring` contracts. The server is a separate Node.js process and **never executes course payloads**. Imported/unsupported representations remain opaque.

## Inventario real de capacidades de MCP (27-10-2026)

**P2LRN Core** sigue siendo `0.4.0`; la versión del Toolkit es `0.5.0-alpha.11`. No confundir versiones de formato y producto. MCP es otro componente independiente (`0.1.0`).

**23 herramientas registradas**: ocho de lectura y quince de escritura en borradores (éstas solo aparecen si `P2LRN_MCP_WRITE=1`).

Lectura: `p2lrn_list_courses`, `p2lrn_read_course`, `p2lrn_read_entity`, `p2lrn_read_plan`, `p2lrn_validate_course`, `p2lrn_read_text_member`, `p2lrn_list_game_renderers`, `p2lrn_search_metadata`.

Edición optativa: `p2lrn_draft_new`, `p2lrn_draft_create`, `p2lrn_draft_read`, `p2lrn_draft_set_text`, `p2lrn_draft_set_rights`, `p2lrn_draft_add_unit`, `p2lrn_draft_set_children`, `p2lrn_draft_add_file`, `p2lrn_draft_add_web_content`, `p2lrn_draft_add_url`, `p2lrn_draft_add_native_activity`, `p2lrn_draft_edit_native_activity`, `p2lrn_draft_add_composite`, `p2lrn_draft_set_progression`, `p2lrn_draft_export`.

Las preguntas `true-false` con `trueFalseMode: multiple`, los cuatro campos de derechos y los renderizadores de juegos se gestionan mediante las herramientas nativas actuales y el registro de Toolkit. No se inventan herramientas específicas.

**Límites reales:** MCP no exporta paquetes offline `.p2lrn-offline.cmd`/`.p2lrn-offline.zip`, no importa `.p2lrn-result`, no controla la interfaz visual de Studio ni publica mediante LMS/LTI. Lo offline corresponde a Studio/Player; LTI/AGS es `integration/lms`. Los SHA-256 de resultados offline no son firmas digitales de confianza.

La Skill ChatGPT «P2LRN - Crear y descargar» es un empaquetador Python autónomo de un subconjunto Core 0.4.0. No instala el MCP, no sincroniza carpetas del PC ni se actualiza automáticamente al publicar código en GitHub. El usuario debe aprobar la instalación o conexión a su cuenta.

**Evitar Toolkit obsoleto:** `npm test` de MCP recompila Toolkit antes de probar la integración. `Conectar-P2LRN.cmd` también recompila Toolkit al configurar clientes, aunque exista `dist`, para no reutilizar binarios generados de un commit previo.

## Build and install, Windows (PowerShell)

```powershell
cd path\to\p2lrn\packages\toolkit
npm install
npm run build
cd ..\..\integration\mcp
npm install
npm test
```

Use Node.js 22+. Until packaged in a release, installation is from the checked-out repository.

## Crear cursos sin MCP: Skills P2LRN en ChatGPT, Claude y Gemini

Si solo se necesita **crear un nuevo archivo `.p2lrn` descargable a partir de una conversación**, no es necesario instalar el MCP, Node.js en el PC, el asistente Windows, un dominio, un proxy ni un túnel. Esto **no** conecta a carpetas del PC. No mezclarlo con el caso de leer/editar cursos privados existentes.

- **ChatGPT:** existe una Skill «P2LRN – Crear y descargar» instalada en un entorno de ChatGPT. Contiene un empaquetador Python autónomo de un subconjunto P2LRN Core `0.4.0` que construye y verifica un nuevo `.p2lrn` cuando el entorno puede ejecutar scripts y adjuntar archivos. El uso depende de la habilitación de Skills en la cuenta. En ChatGPT: Complementos → Habilidades; no se instala automáticamente en todas las cuentas. Referencia: https://help.openai.com/es-es/articles/20001066-skills-in-chatgpt. Esta Skill no constituye instalación MCP, no lee el PC ni garantiza round-trip de todos los perfiles.
- **Claude:** admite Skills personalizadas en claude.ai y Claude Code donde las funciones y permisos están disponibles. Requiere adaptar/probar el paquete de Skill y sus scripts para el entorno de Claude: que acepte un `SKILL.md` **no demuestra** que genere paquetes P2LRN válidos. https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview.
- **Gemini web:** la función Skills se despliega según cuenta, región y producto. Google también ofrece Gems para instrucciones reutilizables si no hay Skills. **La ejecución de la Skill P2LRN de ChatGPT no está validada en Gemini web**. No basta con producir JSON o escribir una respuesta con extensión `.p2lrn`; hay que ejecutar un empaquetador compatible y verificar el ZIP. https://support.google.com/gemini/answer/17094296 y https://support.google.com/gemini/answer/15146780.
- **Gemini CLI:** admite Agent Skills con `SKILL.md` bajo `~/.gemini/skills/` o `.gemini/skills/`. El comando `gemini skills list` permite inspeccionarlas y `gemini skills link <directorio>` registra un directorio autorizado para desarrollo. **Esto no instala MCP** pero requiere tener Gemini CLI. Ver https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/using-agent-skills.md.
- **Grok:** no se declara una Skill P2LRN ejecutable e instalada para Grok. Puede ayudar a preparar contenido, pero no se garantiza un `.p2lrn` descargable sin un empaquetador probado.

La Skill ChatGPT y los descriptores MCP son artefactos **distintos**: el ZIP `p2lrn-conector-mcp.zip` no es la Skill; no hay una descarga pública de la Skill ofrecida por la web P2LRN. Si otro entorno recibe un paquete compatible, debe verificar su procedencia, derechos, scripts y resultado.

Documentación navegable: `/docs/conectores/skills/` (sin MCP) y `/docs/conectores/gemini/` (Gemini web, CLI y MCP opcional).

## Gemini CLI con el MCP local opcional

Si Gemini CLI necesita **leer y validar los archivos del PC** en lugar de crear un curso nuevo desde la conversación, puede utilizar el servidor MCP P2LRN ya implementado en `integration/mcp/server.mjs --stdio`:

```powershell
# Desde la raíz de P2LRN, después de descargar y extraer el kit oficial:
.\integration\mcp\Conectar-P2LRN.cmd --root C:\MisCursos --clients gemini --install --verify
```

El asistente pide permisos para modificar la configuración de Gemini CLI, conserva los demás servidores y verifica las herramientas `p2lrn_list_courses` y `p2lrn_validate_course`. La configuración está en `~/.gemini/settings.json` (o perfil de Windows equivalente). Utiliza el mismo servidor P2LRN, sin otra implementación; mantiene `P2LRN_MCP_WRITE=0` por defecto. **No es una conexión directa a Gemini web**.

## Local MCP (recommended)

A client starts the server via stdio and specifies an absolute directory of **authorized** courses:

```powershell
$env:P2LRN_MCP_ROOT = 'C:\p2lrn-courses'
$env:P2LRN_MCP_WRITE = '0'
node .\integration\mcp\server.mjs --stdio
```

The server only lists/opens validated `.p2lrn` packages below the explicit directory. It rejects traversal, symlinks, and internal draft/export directories. By default only read tools are advertised.

To preview client integration (without editing the client's configuration):

```powershell
node .\integration\mcp\install-client.mjs --client claude --root C:\p2lrn-courses
node .\integration\mcp\install-client.mjs --client cursor --root C:\p2lrn-courses
```

After reviewing the printed JSON, add `--write` to configure the selected installed AI client. It preserves other configured servers and backs up the original JSON.

**Draft write tools are opt-in**: append `--enable-drafts` to the client setup command. They edit isolated authoring workspaces and produce a newly validated `.p2lrn` in `.p2lrn-mcp-exports/`, **never replacing the source** or deploying to a third-party LMS. Calls include an expected SHA-256 of the project JSON to reject stale writes. The model/client must display changes and obtain user consent before using write tools.

## ChatGPT web leyendo cursos del PC sin un dominio propio

Una aplicación de IA instalada en Windows puede ejecutar P2LRN por `stdio` con `Conectar-P2LRN.cmd`; es la solución más sencilla y **no requiere dominio, HTTP ni servidor en la nube**. Los cursos permanecen en `P2LRN_MCP_ROOT`. El modelo de IA puede funcionar localmente o en la nube, según el cliente; no son equivalentes.

**ChatGPT web no puede iniciar directamente `stdio` ni leer `127.0.0.1` del ordenador del usuario.** Para conectar ChatGPT web con el servidor privado del PC **sin comprar un dominio, abrir un puerto ni configurar un proxy público**, puede utilizarse el [Secure MCP Tunnel de OpenAI](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), si la cuenta y el área de trabajo tienen los permisos correspondientes.

1. Preparar el kit P2LRN local y comprobar que `integration/mcp/server.mjs --stdio` responde usando una carpeta autorizada con `P2LRN_MCP_WRITE=0`. El archivo ZIP no incluye `tunnel-client`.
2. En la configuración de túneles MCP de OpenAI Platform, crear o elegir un `tunnel_id` asociado al área de trabajo ChatGPT que utilizará la conexión. Son necesarios permisos adecuados de lectura/uso/gestión de túneles y permiso para crear complementos MCP.
3. Descargar `tunnel-client` desde el enlace oficial y leer `tunnel-client help quickstart`. Crear un perfil de tipo `stdio` que lance el mismo `node .../integration/mcp/server.mjs --stdio`, apuntando a una **ruta absoluta** del servidor P2LRN. Configurar localmente `P2LRN_MCP_ROOT` y `P2LRN_MCP_WRITE=0`. No incluir las claves ni los cursos en los argumentos del navegador, GitHub o el ZIP.
4. Ejecutar `tunnel-client doctor --profile p2lrn-local --explain` y `tunnel-client run --profile p2lrn-local` (el nombre del perfil se elige al configurarlo). El proceso del túnel debe permanecer activo cuando ChatGPT necesite usar las herramientas.
5. En ChatGPT: Complementos → Añadir servidor MCP personalizado → Túnel. Seleccionar el mismo identificador, configurar la autenticación admitida y comprobar `p2lrn_list_courses` y `p2lrn_validate_course` con cursos de prueba.

Esta opción es **privada**, depende de `tunnel-client` y de los permisos de OpenAI. No se despliega automáticamente al instalar P2LRN ni sirve para publicar un plugin público en el directorio global. La vía de plugin local para ChatGPT Desktop es distinta; la [distribución de plugins Desktop only](https://developers.openai.com/plugins/deploy/desktop-only) tiene requisitos de elegibilidad/aprobación y el kit MCP no equivale a una instalación de ese plugin.

## HTTP for a protected local bridge

```powershell
$env:P2LRN_MCP_ROOT = 'C:\p2lrn-courses'
$env:P2LRN_MCP_TOKEN = '<a-long-random-secret-at-least-32-bytes>'
node .\integration\mcp\server.mjs --http
```

HTTP is bound to `127.0.0.1:37871/mcp` and requires `Authorization: Bearer <token>` plus host/origin validation. **Do not expose this loopback HTTP service directly to the internet or treat its static bearer as OAuth.** A public ChatGPT-compatible connector needs a separately managed authenticated HTTPS tunnel/bridge with OAuth (where required) and explicit user-account authorization. This project does **not** install an app into ChatGPT automatically.

```powershell
node .\integration\mcp\install-client.mjs --client chatgpt
```

This prints connection instructions, not a fake installation.

## Tool categories

Read: `p2lrn_list_courses`, `p2lrn_read_course`, `p2lrn_read_entity`, `p2lrn_read_plan`, `p2lrn_validate_course`, `p2lrn_read_text_member`, `p2lrn_search_metadata`. Search covers metadata; short text members are read explicitly and opaque payloads remain untouched.

Opt-in draft editing: `p2lrn_draft_new`, `p2lrn_draft_create`, `p2lrn_draft_read`, `p2lrn_draft_set_text`, `p2lrn_draft_add_unit`, `p2lrn_draft_set_children`, `p2lrn_draft_add_file`, `p2lrn_draft_add_web_content`, `p2lrn_draft_add_url`, `p2lrn_draft_add_native_activity`, `p2lrn_draft_add_composite`, `p2lrn_draft_set_progression`, `p2lrn_draft_export`. All edit paths call typed Toolkit authoring methods. A fully integrated Studio visual approval workflow and production OAuth connector remain separate delivery gates.

## Regression gates

Run `npm test` in this directory after building Toolkit, then the main Windows P2LRN CI. The MCP integration does not publish existing npm packages or modify local Studio/Player installations.

## Conectores web para ChatGPT, Claude y Grok (mismo servidor)

Los tres clientes web aceptan un servidor MCP remoto. **El MCP de P2LRN es uno solo** y los tres conectores comparten el endpoint HTTPS. Se necesita configurar cada cuenta en su interfaz; ningún script local puede instalar el plugin en una cuenta externa de forma silenciosa.

### Ejecutar el servidor en una máquina con los paquetes autorizados

```powershell
$env:P2LRN_MCP_ROOT = 'C:\p2lrn-courses'
$env:P2LRN_MCP_WRITE = '0'
$env:P2LRN_MCP_TOKEN = '<clave-aleatoria-de-mas-de-32-bytes>'
$env:P2LRN_MCP_PUBLIC_ORIGIN = 'https://courses.your-domain.example'
node .\integration\mcp\server.mjs --http
```

El servidor continúa enlazado a `127.0.0.1`. Configura un túnel/proxy HTTPS autenticado hacia `127.0.0.1:37871` para obtener la dirección real que usarán los clientes (`https://tu-dominio/mcp`). **No abras 37871 a Internet**. `P2LRN_MCP_PUBLIC_ORIGIN` debe ser exactamente el origen público de ese proxy; cualquier otro Host/Origin es rechazado antes de MCP. Nunca confíes en `X-Forwarded-Host` no validado.

### Construir el plugin y las configuraciones de las tres IA

```powershell
cd integration\mcp
npm install --ignore-scripts
node prepare-connectors.mjs --endpoint https://tu-dominio/mcp --out .generated\connectors
```

El generador **no inventa una URL**: exige HTTPS real y bloquea `localhost`, IP directas, URL con contraseñas o parámetros con tokens. Produce `chatgpt/p2lrn-plugin.zip` con un manifiesto Agent Plugins y MCP, una guía de uso y los archivos `claude/connection.json`, `grok/connection.json` y `README.md`. No guarda tokens ni altera la configuración de las cuentas. Los paquetes generados quedan ignorados por Git.

**ChatGPT:** Plugins > + > Añadir servidor MCP personalizado. Registrar la URL HTTPS (o Secure MCP Tunnel), configurar la autenticación y revisar los permisos. El ZIP generado es material para pruebas privadas: **no es una publicación en el directorio de plugins**. El servidor actual emplea bearer fijo: el portal de publicación pública no admite completar ese método; para una versión pública con múltiples usuarios hay que integrar OAuth, autorización individual, verificación de dominio y revisión del plugin.

**Claude web:** Customize > Connectors > Add > Custom > Web. Registrar la URL, configurar un encabezado `Authorization: Bearer` en la interfaz y comprobar las herramientas. Claude Desktop local sigue usando el instalador `install-client.mjs` mediante `stdio`.

**Grok web:** grok.com/connectors > New Connector > Custom. Registrar la misma URL y completar el mecanismo de autenticación. En planes Business/Enterprise el administrador puede tener que provisionar el conector.

En todos los casos, probar primero `p2lrn_list_courses`, después `p2lrn_read_course` y validar que el modelo NO recibe herramientas de escritura mientras `P2LRN_MCP_WRITE=0`.

### Evidencia automatizada

Las pruebas de `test/connector.test.mjs` verifican manifiestos y ZIP, URLs inválidas, rechazo de hosts externos y orígenes falsos, token bearer y negociación real MCP a través de HTTP. El workflow canónico Windows incluye estas pruebas sin crear otro workflow.

**Pendiente para distribución pública:** OAuth multiusuario y su consentimiento, disponibilidad HTTPS estable, aprobación del usuario para registrar la conexión, pruebas E2E dentro de las interfaces reales de ChatGPT, Claude y Grok, y publicación en sus catálogos si se desea.

## Instalación local: asistente único y más clientes de IA

**No requiere HTTPS, un dominio ni token para conectarse desde una IA instalada en el equipo.** Todos los programas utilizan el mismo servidor MCP y las mismas herramientas, mediante el transporte local stdio.

### Windows: doble clic

Abre `integration/mcp/Conectar-P2LRN.cmd` con doble clic. El asistente comprueba Node 22+, prepara las dependencias si faltan y pide una carpeta concreta de cursos (valor predeterminado: `Documentos/P2LRN`). No concede acceso al resto de Descargas ni al disco. Detecta clientes, permite seleccionar uno o varios, ofrece lectura sola o edición en borradores, enseña las rutas que modificará, pide confirmación, conserva otros MCP y comprueba la conexión real. El proceso MCP se ejecuta bajo demanda, no en segundo plano.

### Comandos para usuarios avanzados

```powershell
# Asistente guiado
node integration/mcp/connect-local.mjs

# Conexión local sin internet para la inferencia
node integration/mcp/connect-local.mjs --root C:\MisCursos --clients claude,cursor,windsurf,gemini --install --verify

# Habilitar escritura segura en borradores y exportaciones nuevas
node integration/mcp/connect-local.mjs --root C:\MisCursos --clients auto --enable-drafts --install --verify

# VS Code, solo en el proyecto elegido
node integration/mcp/connect-local.mjs --root C:\MisCursos --clients vscode --workspace C:\MiProyecto --install --verify

# Obtener configuración genérica y comandos para más aplicaciones, sin instalarlas
node integration/mcp/connect-local.mjs --root C:\MisCursos --clients generic,codex,claude-code,opencode,chatgpt-desktop
```

Si se ejecuta sin el lanzador de Windows, es necesario tener Toolkit compilado y dependencias instaladas; el `.cmd` hace esa preparación automáticamente.

### Clientes soportados

| Cliente | Tipo de instalación local |
| --- | --- |
| Claude Desktop | JSON automático, tras confirmación |
| Cursor | JSON automático, tras confirmación |
| Windsurf | JSON automático, tras confirmación |
| Gemini CLI | JSON automático, tras confirmación |
| VS Code | JSON en `.vscode/mcp.json` del proyecto explícito |
| Codex CLI, Claude Code y OpenCode | Genera configuración/instrucción para revisar y registrar según versión del cliente |
| Cualquier IA que admita MCP stdio | Entrada genérica con `command`, `args` y `env` |
| ChatGPT Desktop | Entrada de desarrollo local; instalación de plugins stdio sujeta a elegibilidad y aprobación de OpenAI |

**Para ChatGPT web, Claude web y Grok web** hay que utilizar HTTPS o un túnel compatible, porque sus servidores no pueden iniciar un proceso stdio local directamente. La opción local no necesita OAuth remoto: el proceso se ejecuta con los permisos de usuario del sistema operativo y solo ve la carpeta de cursos seleccionada.

Se conservan todas las herramientas ya disponibles de Reader/Authoring a través del mismo servidor para cualquier cliente compatible. La escritura solo modifica copias en borrador, verifica digests y exporta un `.p2lrn` nuevo. No se modifica el núcleo de P2LRN, no se crean ramas ni tareas programadas y no se publica npm automáticamente.

## Auditoría con modelo de IA local (sin nube)

Esta integración incluye dos ensayos aislados para no confundir la compatibilidad MCP con la autonomía del modelo:

- `node test/local-agent-matrix.e2e.mjs`: ofrece varias herramientas reales al modelo y registra cuáles decide e invoca sin intervención; si el modelo falla, los controles del MCP quedan diferenciados de los éxitos autónomos.
- `node test/local-agent-structured.e2e.mjs`: el modelo local genera material educativo en JSON (curso, preguntas, relaciones, secuencias 3D, sopa de letras y aviso); el Toolkit valida y genera paquetes nativos exclusivamente en una carpeta temporal.

Por defecto usa el servidor Ollama de `127.0.0.1:11434` y el modelo `qwen3:4b`, configurable mediante `P2LRN_LOCAL_AGENT_URL` (solo loopback) y `P2LRN_LOCAL_AGENT_MODEL`. No descarga modelos, no lee cursos personales ni usa inferencia en la nube. Es intencionadamente una **prueba de laboratorio**, no un servicio agente ni un despliegue de producción. Los scripts generan un resultado explícito de cada operación y dejan el estado global como fallido si hay errores. No se ejecutan automáticamente en cada push.
