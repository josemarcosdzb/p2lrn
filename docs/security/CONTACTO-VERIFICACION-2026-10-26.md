# Comprobación de seguridad del formulario de contacto — 26/10/2026

## Sistema inspeccionado (producción)
- Proyecto Supabase: `p2lrn` (`yurtnmtesugykrqtujdx`).
- Formulario: `deploy/netlify/site/contacto/index.html`; código en `deploy/netlify/site/p2lrn.js`.
- Edge Function desplegada: `p2lrn-contact` v1, activa, `verify_jwt=false` (se necesita acceso anónimo para contactar).
- Camino del mensaje: navegador -> Edge Function `/functions/v1/p2lrn-contact` -> RPC privilegiada `submit_p2lrn_contact` -> tabla `public.contact_messages`. La clave de servicio no se envía al navegador.

## Verificaciones sobre la base activa
- `public.contact_messages`: RLS activa; INSERT para `anon` **false**, `authenticated` **false**, `service_role` **true**.
- No hay políticas RLS de inserción pública. Este estado **sustituye** al hallazgo histórico descrito en `AUDITORIA-2026-10-26.md`.
- `public.submit_p2lrn_contact`: `SECURITY INVOKER`, EXECUTE sólo `postgres` y `service_role`; no ejecutable por `anon` ni `authenticated`.
- `p2lrn_internal.contact_rate_windows`: RLS activa, sin acceso INSERT para roles anónimos ni autenticados.
- SQL de control: ventanas de 1 hora; 2 mensajes por hash de correo, 10 por hash de IP suministrada por la pasarela y 30 globales. Los contadores usan `INSERT .. ON CONFLICT .. DO UPDATE` con clave única: las actualizaciones concurrentes sobre la misma clave se serializan en PostgreSQL.
- Se ha ejecutado en la base real un test **dentro de BEGIN/ROLLBACK**: dos envíos de prueba admitidos y tercero rechazado por límite del correo, sin dejar mensajes ni consumir cuota. No es una prueba de concurrencia multi-sesión.

## Controles de la Edge Function inspeccionada
- Sólo método POST con origen esperado, CORS acotado, tipo JSON y tamaño máximo declarado/comprobado.
- Longitudes y estructura de campos controladas en servidor y otra vez en SQL; honeypot `company`.
- Devuelve `429` por límite; `503` si faltan la URL o clave de servicio; no muestra errores internos al cliente.
- La pausa de 30 segundos de `localStorage` sólo mejora la experiencia; **no** constituye la protección.
- Un cliente fuera del navegador puede falsificar `Origin`, `x-forwarded-for` u otras cabeceras. Se conservan el límite global y el límite por correo aunque se manipule el identificador IP. **No considerar que la IP sea una identidad autenticada**.
- No hay CAPTCHA/TURNSTILE verificable en el servidor. Los límites actuales evitan envíos ilimitados y la escritura directa, pero no impiden por completo spam distribuido ni agotamiento deliberado del cupo global.

## Pruebas y CI
- `scripts/verify-contact-security.mjs`: comprueba la ruta hacia Edge Function, ausencia de acceso directo desde el cliente a la tabla, mensaje 429, campos y honeypot. Incorporado al job `security-windows`.
- `tests/contact-rate-limit-transaction.sql`: reproducción SQL reversible de envíos válidos, repetidos e inválidos (entorno autorizado); no genera mensajes persistentes.
- **No ejecutado todavía**: cuatro conexiones simultáneas al mismo bucket contra una base desechable y la prueba de resistencia a falsificación de cabeceras del proxy. No afirmar que existe una ejecución E2E concurrente exitosa.
- El acceso de la tabla a través de PostgREST sigue cerrado para los roles públicos, aunque un cliente conozca la clave publicable.

## Pendientes para endurecimiento adicional
1. Activar un proveedor de prueba humana como Cloudflare Turnstile: widget en el formulario y verificación obligatoria en la Edge Function, con secreto únicamente en Supabase; configurar ambos lados conjuntamente para no bloquear usuarios normales. No hay claves Turnstile aportadas o verificadas y **no se ha activado**.
2. Revisar la cadena de proxies y usar sólo metadatos IP sobrescritos por infraestructura de confianza. Si no se puede garantizar, la cuota por IP sólo es orientativa.
3. Pruebas de concurrencia y carga en una instalación desechable; pruebas funcionales de envío legítimo en producción sólo con mensajes de prueba autorizados y controlados.
4. Observabilidad: alarmas por aumento de 429/503 y agotamiento del límite global, política de retención y rotación de datos personales.

No se declara el formulario invulnerable ni protegido contra todo spam. Las protecciones de servidor y la prohibición de INSERT anónimo se han comprobado **en la base activa**.
