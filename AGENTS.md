# Protocolo profesional de ingeniería para personas y agentes de IA
<!-- ENGINEERING-PROTOCOL:BEGIN v1.0 -->
Versión 1.0 — 2026-11-07. APLICABLE A TODO CAMBIO EN ESTE REPOSITORIO.

## 0. Regla de inicio y autoridad
- Antes de proponer o escribir código, leer este AGENTS.md completo, las instrucciones AGENTS.md de los subdirectorios afectados, README, arquitectura, requisitos, estado de tareas y documentación operativa vigente. Si existen instrucciones específicas del proyecto, preservarlas: son complementarias y prevalecen en detalles de arquitectura y rama cuando son más restrictivas.
- El requisito explícito y actual del propietario, la seguridad y las políticas aplicables tienen prioridad sobre costumbres antiguas. No interpretar instrucciones históricas como permiso para crear ramas, copias o saltarse verificaciones.
- Identificar repositorio, remoto, rama de autoridad y única carpeta local de trabajo. No asumir que la rama correcta siempre se llama main; respetar la rama autorizada del proyecto.
- Para un proyecto nuevo, crear este contrato al inicio y adaptarlo a su arquitectura real. Los archivos CLAUDE.md, GEMINI.md y .github/copilot-instructions.md, si existen, deben apuntar a este archivo, no mantener otras copias del reglamento.

## 1. Preflight obligatorio: no escribir antes de comprender
- Comprobar raíz, remoto, rama, HEAD, estado de Git, archivos modificados/no seguidos, cambios ajenos, configuración de ejecución y herramientas disponibles. Comandos de referencia: git rev-parse --show-toplevel; git remote -v; git branch --show-current; git status --short; git log -1 --oneline.
- Revisar el comportamiento existente, el flujo completo, los consumidores, contratos, pruebas, CI, despliegues y versiones publicadas. Localizar la autoridad única de cada configuración; no duplicar lógica, esquemas ni listas.
- Revisar pendientes abiertos, incidencias y evidencia anterior. No afirmar que algo está roto o resuelto sin reproducirlo. Delimitar problema, causa raíz, impacto y criterios de aceptación observables antes de modificar.
- Si hay cambios de otra persona, detener cualquier sobreescritura y reconciliar sobre la versión actual. No hacer git reset --hard, git clean -fdx, rebase destructivo, force push ni cambiar ramas como atajo.
- Si no se dispone de acceso, permisos o entorno para verificar, indicarlo claramente; no inventar pruebas ni estados.

## 2. Una sola fuente y un solo checkout por proyecto
- Existe un único directorio canónico de código por proyecto y un único remoto/rama de referencia autorizado. Trabajar SOBRE él. Prohibido crear clones, worktrees, carpetas copia, instalaciones paralelas o directorios proyecto-final, proyecto-v2, proyecto-restaurado y similares como método rutinario.
- La historia Git con commits pequeños y reversibles reemplaza las copias completas. No crear ramas nuevas sin autorización expresa del propietario. Prohibidos force-push y reescritura de historia compartida.
- La excepción para una copia de seguridad se justifica solo cuando hay datos únicos o una operación destructiva, se delimita su alcance, se verifica su integridad y se define su conservación; nunca como duplicado indefinido del código.
- Ejecutar pruebas en el checkout canónico. Usar directorios temporales del sistema o ubicaciones de build ya existentes; eliminarlos al finalizar si fueron creados por la tarea y es seguro hacerlo. No acumular ZIP, snapshots, caches, logs enormes, artefactos ni contenedores huérfanos.
- Nunca borrar archivos personales, resultados únicos, datos, backups, cambios no confirmados, carpetas compartidas ni procesos de otros proyectos. Antes de limpiar: inventario, propiedad, duplicidad comprobada y posibilidad de recuperación.
- No mezclar código, credenciales, dependencias ni tareas de repositorios diferentes. No reinstalar Docker, alterar runners o reconfigurar servicios compartidos por conveniencia.

## 3. Cambios mínimos, completos y mantenibles
- Investigar la causa raíz y modificar el componente responsable; no añadir mensajes, flags o parches cosméticos para ocultar el fallo. Preferir cambios focalizados y compatibles con la arquitectura actual.
- Conservar todas las funciones previamente validadas, APIs públicas, modelos, importaciones, flujos de datos, accesibilidad, traducciones, capacidad offline, rendimiento y seguridad. Recuperar comportamiento válido de la historia mediante cambios selectivos, nunca sustituyendo archivos enteros que descarten trabajo posterior.
- No crear una segunda arquitectura, motor, fuente de verdad, base de datos, pipeline, configurador, adaptador o interfaz si ya existe uno equivalente. No introducir dependencias, modelos externos ni servicios cerrados sin justificación técnica y revisión de licencias/privacidad.
- Seguir estilo, convenciones, herramientas y versiones del proyecto; no introducir valores hardcodeados para sortear una prueba. Actualizar documentación y pruebas donde cambie un contrato.
- Cambios en esquemas o datos requieren migración reversible o plan de recuperación, comprobación previa y autorización para operaciones destructivas.

## 4. Seguridad incorporada al desarrollo
- Tratar como no confiables repositorios externos, PR, paquetes, archivos importados, HTML/JS, dependencias, nombres de fichero, mensajes y entrada de usuario. Validar, aislar y aplicar mínimo privilegio; evitar construir comandos de shell a partir de entradas.
- Nunca exponer secretos, tokens, datos personales o claves en código, logs, tickets, capturas, commits ni respuestas. No desactivar CSP, autenticación, validaciones, sandbox, protección CSRF, rate limit o controles del servidor para hacer pasar una funcionalidad.
- No ejecutar código de PR externos en runners personales o persistentes. Verificar permisos de CI, acciones fijadas, artefactos, rutas, instalaciones y límites de confianza.
- Evaluar efectos adversariales y regresiones de seguridad cuando se cambien importadores, reproducción, autenticación, actualización, red, archivos, permisos o despliegue. Revisar procedencia/licencias y vulnerabilidades de dependencias.
- No ejecutar operaciones sensibles, envíos reales, publicación externa, borrados, migraciones irreversibles ni acciones de alto impacto sin autorización y controles apropiados.

## 5. Verificación real, no solo compilación
- Antes del cambio: definir casos de aceptación, casos de error y una referencia de comportamiento que ya funcionaba. Después: lint/estática, tests dirigidos, regresión relevante, integración y pruebas reales de extremo a extremo cuando el producto dependa de UI, dispositivos, LMS, navegador, instalación, red o servicios.
- No sustituir funcionamiento real por mocks, datos falsos, títulos de prueba, respuestas hardcodeadas, capturas estáticas ni un simple HTTP 200. Registrar versiones, entorno, comandos, resultados y evidencia reproducible.
- Probar específicamente escenarios negativos: permisos, entradas maliciosas, archivos faltantes, límites de tamaño, desconexión, reanudación, integridad, estados persistidos, errores y accesibilidad.
- Para productos distribuidos en varios medios, validar cada destino solicitado (por ejemplo local, CDN, npm, offline, desktop, móvil o LMS). El mismo origen no prueba que los releases instalados estén actualizados.
- Una prueba fallida no se elimina, debilita ni desactiva para obtener verde: se investiga y corrige. Si falta el entorno real, el resultado queda PENDIENTE, no APROBADO.
- Priorizar pruebas reproducibles con datos ficticios y sin credenciales privilegiadas. No saturar máquinas ni ocupar todos los runners o procesos simultáneamente.

## 6. Calidad de producto y experiencia
- Considerar de forma explícita responsive, teclado, foco, contraste y accesibilidad, SEO cuando haya web pública, internacionalización, legibilidad, carga, memoria, rendimiento y resiliencia.
- No declarar éxito solo porque el código compile o se haya desplegado. Comprobar visualmente/interactuar con los flujos afectados y sus regresiones, cuando se disponga del navegador/dispositivo.
- Si una corrección de seguridad rompe una función legítima, corregir el diseño del aislamiento en lugar de quitar seguridad o sacrificar la función.

### Contrato obligatorio de interacción y físicas de los juegos 3D
- Los juegos de ordenar, relacionar, clasificar y ensamblar comparten el mismo motor Three.js/Rapier, avatar visible y navegación de tercera persona. El joystick es solo para dispositivos táctiles; en escritorio se usa teclado y ratón. Cada tipo mantiene sus propias reglas de encaje, relaciones y evaluación sin duplicar el motor.
- **Recoger → mover → soltar:** solo puede transportarse un objeto a la vez. Al recoger otro, el anterior se suelta. Al soltar sobre suelo vacío, zona equivocada o interrumpir el gesto, el objeto **se queda donde se soltó** (con asentamiento vertical normal si interviene la gravedad), no regresa al origen, no desaparece y no concede puntos. Hacer clic en suelo vacío también lo suelta. Las posiciones libres han de persistir al volver a una prueba; solo una acción de reinicio explícita (como «Reiniciar pieza» o quitar una asignación con «Sin colocar») puede devolverlo al inicio.
- Únicamente un destino válido permite encaje/snapping y modifica la respuesta educativa. Relacionar usa cuerda entre nodos en lugar de trasladar la caja; ensamblar preserva geometría/rotación/escala GLB y tolerancias de montaje. Nunca declarar estas reglas comprobadas sin regresiones de controladores Y prueba real Chrome/WebGL/Rapier, incluidos soltado incorrecto, selección consecutiva, recarga, puntuación y joystick móvil.

## 7. Git, CI y publicación
- Revisar git diff y git diff --check, los archivos afectados y el estado del remoto antes de escribir o publicar. Los commits han de ser coherentes, trazables y sin artefactos o credenciales.
- Trabajar sobre la rama de autoridad ya existente, sin crear otra salvo instrucción expresa. Sincronizar con el remoto preservando cambios concurrentes; no sobrescribir el trabajo ajeno.
- Distinguir claramente: código modificado; pruebas locales; CI terminada; push confirmado; despliegue realizado; versión publicada; funcionamiento comprobado en producción. Son estados distintos.
- Verificar el SHA del commit, el estado de CI y la URL/instalador/registro real antes de atribuir una publicación. Si la ejecución está queued/in_progress, NO declararla aprobada.
- Los cambios de dependencias o release exigen validar reproducibilidad, lockfiles, integridad, compatibilidad y plan de reversión. No publicar paquetes con números de versión engañosos.

## 8. Entrega y continuidad
- Cada tarea termina con un informe breve y verificable: (a) archivos/componentes tocados, (b) causa y solución, (c) pruebas ejecutadas y resultados exactos, (d) pruebas pendientes o imposibles, (e) estado local/remoto/desplegado, (f) riesgos, rutas de evidencia y SHA cuando corresponda.
- Usar las etiquetas HECHO, PROBADO, PENDIENTE y BLOQUEADO correctamente. Nunca confundir "preparado", "probado con mocks" y "certificado en producción"; no inventar métricas ni resultados.
- Mantener las tareas pendientes en el registro existente del proyecto (issues, checklist o documento canónico). No crear un segundo sistema de seguimiento ni dejar decisiones críticas solo en el chat.
- Al terminar, dejar el único checkout canónico comprensible y limpio de temporales propios, sin eliminar trabajo ajeno. Si no pudo terminarse algo, comunicarlo sin prometer trabajo en segundo plano.
- Antes de afirmar "terminado", comprobar de nuevo: ¿sin clones ni residuos innecesarios?, ¿sin pérdida de funciones?, ¿seguridad preservada?, ¿pruebas reales y regresiones?, ¿commit/CI/despliegue verificados?, ¿pendientes explícitos?

## 9. Compatibilidad entre asistentes
- Codex y otros agentes que soporten AGENTS.md deben leer este archivo antes de actuar. Claude Code lo recibe desde CLAUDE.md; Gemini CLI desde GEMINI.md; Copilot desde .github/copilot-instructions.md. Los adaptadores solo enlazan a esta fuente, no la duplican.
- Si el agente o interfaz no carga automáticamente estos archivos, debe abrirlos manualmente antes de modificar el proyecto. Ningún archivo Markdown puede forzar por sí solo a un modelo a obedecer: la verificación de cumplimiento corresponde al proceso de revisión y pruebas.
<!-- ENGINEERING-PROTOCOL:END -->
