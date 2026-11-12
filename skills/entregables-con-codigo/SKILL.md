---
name: entregables-con-codigo
description: "Crear y verificar entregables visuales y educativos reproducibles mediante código, incluyendo ilustraciones, HTML y recursos para P2LRN; adaptar el flujo a ChatGPT, Claude, Codex, Gemini y agentes compatibles sin asumir shell, herramientas, librerias ni servicios disponibles."
---

# Entregables reproducibles con código

## Flujo de ejecución independiente del agente

Leer [COMPATIBILIDAD_AGENTES.md](references/COMPATIBILIDAD_AGENTES.md) y, cuando interese, [RECETAS_VISUALES.md](references/RECETAS_VISUALES.md). El [HISTORICO_ORIGINAL.md](references/HISTORICO_ORIGINAL.md) es solo trazabilidad; ignora sus presuposiciones de herramientas.

1. Verificar archivos, preferencias, licencias y entorno; evitar modificar o sobreescribir originales sin solicitud. Usar el proyecto vigente, no crear clones o ramas sin peticion.
2. Detectar Python, Node, librerias y CLI mediante `python scripts/check_capabilities.py --json --project-root /ruta/al/proyecto` si la terminal existe. Sin terminal, no alegar pruebas ejecutadas.
3. Elegir la herramienta más sencilla **realmente disponible** para SVG, PNG, WebP, HTML, PDF o video. Si el usuario exige edición con código, no sustituirla con una captura sintetica o diseno inventado.
4. Planificar el contenido, producir un resultado correcto de punta a punta y despues mejorar lo pedido. Guardar el código fuente, metadatos, rutas relativas y hashes de los artefactos.
5. Validar dimensiones, legibilidad, recortes, contraste y accesibilidad visual mediante capturas reales si existe navegador/visor. Probar flujos interactivos con su runtime verdadero, no una recreacion.
6. Probar generación reproducible cuando existan dependencias; no instalar ni descargar automáticamente. Reportar lo que no se pudo verificar.
7. Entregar artefactos realmente creados por el medio del agente; indicar `PASS`, `FAIL`, `NO_PROBADO` o `BLOQUEADO`, nunca inventar enlaces ni acciones en segundo plano.

## Herramientas: equivalencia por capacidad, no por nombre

No exigir `Bash`, `Read`, `Write`, `TaskCreate`, `TaskUpdate`, `SendUserMessage`, `SendUserFile`, `Agent`, `list_repos` ni `add_repo` de Claude. Cada plataforma debe resolver **leer, ejecutar, escribir, inspeccionar y entregar** con sus propios medios. Si no hay acceso a archivos o ejecución, proporcionar una receta ejecutable externa y marcar bloqueos.

Los ejemplos del proyecto original estan en `03-claude-toolkit/` en el ZIP completo, **no en esta Skill individual**. Si se necesita manipular un `.p2lrn`, delegar el empaquetado en Toolkit P2LRN verificado o en la Skill `p2lrn-curso-ilustrado` si existe; no crear un empaquetador de formatos propio desde este documento.
