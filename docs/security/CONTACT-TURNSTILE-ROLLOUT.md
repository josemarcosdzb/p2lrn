# P2LRN contacto: despliegue antispam con Turnstile

La Edge Function original desplegada (v2) se versionó desde Supabase sin incluir secretos. Se mantiene la validación de tamaños, orígenes, honeypot y los límites SQL del servidor. Se ha añadido soporte para verificación real de Cloudflare Turnstile por HTTPS desde Supabase.

**IMPORTANTE: NO ESTÁ ACTIVADO EN PRODUCCIÓN** mientras no existan una sitekey y una secret key reales del dominio. No despliegues `TURNSTILE_REQUIRED=true` sin configurar antes la secret y el widget en ambos formularios.

1. Registra un widget Turnstile para los hostnames públicos P2LRN. Coloca la sitekey pública en `data-turnstile-sitekey` de los formularios de `/contacto/` y `/en/contacto/`.
2. Ajusta la CSP de las rutas de contacto para permitir únicamente `https://challenges.cloudflare.com` en script, frame y connect, conservando el dominio Supabase para envío.
3. Instala `TURNSTILE_SECRET_KEY` como secreto de la Edge Function (nunca en Git ni frontend), y configura `TURNSTILE_REQUIRED=true`.
4. Despliega `supabase/functions/p2lrn-contact/index.ts`, ejecuta pruebas con tokens válidos, caducados, reutilizados y malformados; confirma hostname y action `contact`.
5. Comprueba la disponibilidad del contacto legítimo y los códigos 403, 429 y 503 sin consumir envíos reales durante la auditoría.
6. La defensa per-IP basada en cabeceras reenviadas exige verificar en el gateway cuáles son confiables. El cap global 30/h sigue pudiendo ser agotado por tráfico automatizado; requiere revisión de cuotas con telemetría real.

No se sustituye el Turnstile por un CAPTCHA de cliente sin Siteverify. Consulte la documentación oficial de Cloudflare.