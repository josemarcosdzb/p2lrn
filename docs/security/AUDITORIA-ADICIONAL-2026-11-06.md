# Auditoría incremental de seguridad — P2LRN (6 de noviembre de 2026)

## Alcance y evidencia
Revisión del repositorio público `josemarcosdzb/p2lrn`, de cabeceras HTTP en `p2lrn.org`, del código real de Supabase Edge Function `p2lrn-contact` (v2), de la función SQL `submit_p2lrn_contact` y de workflows de GitHub Actions. Los archivos `.p2lrn` de terceros no se consideran código confiable.

Las pruebas ejecutadas localmente incluyen: `node --test scripts/test-security-hardening.test.mjs scripts/test-contact-turnstile.test.mjs` (11/11), `node scripts/verify-site-security.mjs` (135 páginas), `node scripts/verify-contact-security.mjs`. La batería ampliada de ZIP/H5P/Studio NO está globalmente aprobada: algunas pruebas fallaron y requieren diagnóstico; no presentar la CI global como verde.

## Correcciones implantadas

| Hallazgo | Estado | Evidencia |
|---|---|---|
| Asociación Windows que interpolaba `%1` en PowerShell `-Command` | Código corregido | `integration/windows/register-p2lrn-reader.ps1`; usa ejecutable directo, Node + Reader JS o PowerShell `-File` |
| PR en self-hosted Windows público | Riesgo del disparador reducido | `p2lrn-ci.yml` solo admite push/dispatch; `p2lrn-pr-safe.yml` ejecuta PR en `ubuntu-latest`. Cada job Windows mantiene además una condición defensiva |
| CSP/clickjacking ausentes en páginas ES/EN | Código y web pública corregidos | `deploy/netlify/site/_headers`; comprobados HTTP 200 con CSP y X-Frame-Options en páginas previamente vulnerables |
| Snippet CDN mutable sin SRI | Ejemplos principales corregidos | Ocho páginas reciben URL versionada y SHA-384 de `sri.json` en `build-site.mjs`; comprobado en `/docs/cdn/` público |
| Aviso privacidad sobre telemetría | Texto publicado | `deploy/netlify/site/privacidad/index.html` |
| `SECURITY.md` y `security.txt` ausentes | Publicados | `/.well-known/security.txt` devuelve HTTP 200 |
| `upload-artifact@v4` sin SHA | Corregido | `.github/workflows/p2lrn-native-offline-windows.yml` |
| Endpoint de contadores anónimos sin cuota explícita | Mitigación añadida | `netlify/functions/p2lrn-conversion.mjs` exporta `rateLimit` de plataforma, 60/min por IP y dominio; comprobar aplicación real en logs de despliegue |
| Edge Function de contacto fuera de Git | Versionada | `supabase/functions/p2lrn-contact/index.ts` procede de v2 desplegada, ampliada con soporte Turnstile |
| Token Turnstile aceptado sin validación servidor | Implementación preparada, NO activa | Validación `Siteverify` de token único, hostname y action; 7/7 casos simulados; no hay claves reales configuradas |

## Riesgos adicionales y pendientes reales

1. **Protección de rama**: la API GitHub indica `main.protected=false`. Requiere reglas de protección del repositorio (restricción de force-push/delete y revisión del código con permisos). No confundir la protección de CI con protección de la rama.
2. **Runners permanentes**: incluso tras sacar `pull_request` del workflow Windows, código que se fusione a `main` se ejecutará en ese runner. Aislarlo en una VM dedicada, efímera y sin datos personales ni credenciales privilegiadas. Los ajustes de aprobación y grupo de runners no se certifican desde el YAML.
3. **Formulario global 30/h y falta de Turnstile activo**: `p2lrn-contact` v2 utiliza RPC con cuotas 30 global/10 por IP/2 por email y honeypot. Un atacante distribuido puede agotar la cuota compartida. Para completar el endurecimiento, obtener una sitekey y secret key reales, configurar CSP de Turnstile, establecer `TURNSTILE_REQUIRED=true`, desplegar y certificar. No poner claves de prueba en producción.
4. **Identificación de IP para cuotas**: el código desplegado usa cabeceras `cf-connecting-ip`, `x-real-ip` o `x-forwarded-for`. Es indispensable confirmar cuáles son reescritas por el gateway confiable, antes de asumir que un cliente no puede falsear su IP lógica. No afirmar una evasión demostrada sin esa prueba.
5. **Versiones CDN fijas reutilizadas**: la ruta `/player/0.5.0-alpha.12/` se reconstruye en sucesivos despliegues. SRI detecta cambios inesperados, pero una URL de versión sin inmutabilidad garantizada puede romper una integración externa. La publicación necesita versiones nuevas e inmutables por release y retención de artefactos.
6. **Distribución npm**: el registro público debe certificar el release nuevo; un commit en `main` no actualiza los paquetes npm existentes. Los cambios de asociación Windows tampoco actualizan asociaciones ya registradas en otros equipos.
7. **Identificación legal**: el Aviso legal identifica al titular por su nombre pero no incluye todos los posibles datos fiscales exigibles. No inventar un NIF; completar según la forma jurídica y las obligaciones aplicables.
8. **Escaneo de código**: el barrido de archivos controlados no encontró PEM, PFX, claves privadas o patrones reconocibles de secretos; no equivale a un escaneo de todo el historial Git ni de dependencias. El inventario de `child_process` incluye usos de `execFile`/ `spawn` a revisar según flujos de confianza, sin que su presencia demuestre RCE.
9. **CI ampliada**: no certificar seguridad integral hasta resolver fallos en pruebas H5P, descompresión ZIP y rutas de importación, y confirmar CI completa, navegadores y empaquetado npm/CDN.

## Recomendaciones de despliegue

Primero, confirmar que `main` utiliza solo la fuente aprobada y que PR de forks no llegan a Windows; después, restringir el runner fuera de entornos personales y establecer reglas de rama. Inspeccionar los despliegues de Netlify (cabeceras, SRI y cuota) y realizar revisión controlada de Supabase con claves Turnstile reales. Repetir pruebas de regresión sin datos de alumnos, sin secretos y sin generar tráfico abusivo.

**Estado:** mejoras importantes implantadas y verificadas parcialmente. No significa vulnerabilidades cero, que la totalidad de la CI esté aprobada, ni que Turnstile/npm/otros equipos Windows ya hayan quedado actualizados.
