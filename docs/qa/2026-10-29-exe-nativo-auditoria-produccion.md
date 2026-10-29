# P2LRN · Auditoría del ejecutable offline Windows

Fecha: 29 de octubre de 2026  
Estado: **lanzador nativo implementado; publicación oficial firmada todavía NO certificada**.

## Objetivo y alcance

Sustituir el archivo Windows CMD de una sola pieza por un ejecutable PE de 64 bits sin dependencias instalables ni PowerShell. Reutilizar el mismo paquete `.p2lrn`, Player, eventos, firma opcional Ed25519 del encargo, comprobante del profesor y devolución `.p2lrn-result`. No construir otro Player ni alterar el contrato de cursos.

## Componentes integrados

- `native/offline-launcher/main.go`: servidor HTTP local nativo Go, ZIP incorporado al ejecutable, comprobación SHA-256 de los bytes del ZIP, límites de extracción, rechazo de rutas absolutas/recorridos `..`/enlaces simbólicos/archivos especiales/nombres duplicados, carpeta temporal, protección de `Host`, métodos GET/HEAD y cabeceras de seguridad.
- `native/offline-launcher/dialog_windows.go`: error visible a través de Windows MessageBox; no consola al compilar con `-H windowsgui`.
- `native/offline-launcher/main_test.go` y `smoke.py`: pruebas unitarias y proceso real para detectar archivos alterados, solicitudes a un Host diferente, métodos prohibidos y continuidad de origen local.
- `packages/toolkit/web/studio/offline-assignment.js`: formato del EXE final: plantilla PE + ZIP verificado + pie de 56 bytes con identificador `P2LRN-EXE-V1`, tamaño uint64 LE y SHA-256 del ZIP. Conserva exportaciones ZIP/CMD y los límites de seguridad previos.
- `deploy/netlify/build-offline-executable.mjs`: compilación reproducible de Go a Windows x64 sin CGO; ejecuta tests y publica manifiesto con SHA-256 del ejecutable base. No declara firma Authenticode inexistente.
- `deploy/netlify/site/studio/studio.js`: descarga plantilla EXE del mismo origen y coteja tamaño, formato PE y SHA-256 con el manifiesto generado por la compilación antes de empaquetar.
- UI y documentación: Windows EXE como formato visible; ZIP y CMD conservados; la guía distingue firma del encargo de firma del editor.

## Verificaciones ejecutadas en esta auditoría

1. Se compiló el lanzador Windows x64 desde Go en el entorno aislado Linux: artefacto PE32+ GUI, aproximadamente 5,3 MB. Esto prueba construcción cruzada, **no** ejecución en Windows.
2. El mismo núcleo compilado para Linux superó pruebas de extracción ZIP, hash incorrecto, rutas peligrosas, métodos HTTP no permitidos y Host falso.
3. Se ejecutó un proceso real de prueba: página y archivos servidos en `127.0.0.1`, 403 ante Host falso, 405 ante POST, 404 ante recorrido de directorios, rechazo del ZIP alterado.
4. Al reiniciar la misma entrega, la dirección local resultó idéntica. Este comportamiento preserva el origen de `localStorage` para intentos reanudables.
5. Se incorporaron pruebas de empaquetado nativo PE/ZIP en el conjunto Node y una workflow Windows dedicada con checkout aislado para evitar el conflicto histórico de `.git/config`.

## Requisitos para declarar la versión oficialmente lista para producción

**Bloqueantes:**

- Obtener y configurar un certificado de firma de código Authenticode de una entidad confiable, o un servicio de firma equivalente. **Hay que firmar el EXE final después de incorporar el curso**; la firma del ejecutable base no autentica automáticamente cada variante.
- Validar la firma del ejecutable final mediante `signtool verify /pa` y el comportamiento en Windows Defender/SmartScreen/Smart App Control. Una firma válida no garantiza ausencia inmediata de avisos de reputación.
- Superar el flujo completo con un curso P2LRN real en Windows: exportar `.exe`, ejecutar offline, responder, cerrar y reanudar, descargar `.p2lrn-result`, importar con comprobante original en Studio, contrastar tiempos, evidencias y puntuación.
- Aprobar CI nativa Windows y CI global y confirmar el nuevo manifiesto/EXE publicados en Netlify. Los jobs autoalojados tenían bloqueos concurrentes del archivo `.git/config`; el nuevo flujo usa un checkout separado pero queda por verificar una ejecución exitosa.

**Límites intrínsecos que no son bugs:**

- El equipo personal del alumno no se vuelve inviolable. Un atacante puede cambiar una entrega y recalcular hashes no firmados.
- La firma Ed25519 del encargo no autentica respuestas, notas ni identidad del alumno. Studio presenta puntuaciones declaradas como informativas.
- Los plazos absolutos e intentos siguen dependiendo del reloj y almacenamiento local. No se ha implementado vigilancia, bloqueo del SO ni TPM.

## Uso

En `/studio/`: abre un curso, entra en `Entrega offline`, elige **Windows 64 bits · ejecutable .exe (un archivo)** y, si necesitas autenticar las condiciones, marca `Firmar el encargo`. Conserva fuera del archivo del alumno el comprobante del profesor. El archivo EXE es para pruebas internas hasta completar el gate de firma y validación real de Windows.

Este informe describe únicamente lo comprobado. La presencia de código o de una workflow en GitHub por sí sola no certifica un despliegue ni un sistema de evaluación antifraude.
