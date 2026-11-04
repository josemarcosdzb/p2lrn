# Indexación en buscadores (P2LRN)

El dominio canónico es `https://p2lrn.org/`. La antigua URL `p2lrn.netlify.app` se redirige mediante HTTP 301. El sitio publica HTML, `robots.txt` y `sitemap.xml`. No sustituir esta configuración ni crear URLs duplicadas.

## Bing y buscadores compatibles con IndexNow

Primero, registrar `https://p2lrn.org/` en https://www.bing.com/webmasters/. Si ya hay una propiedad verificada en Google Search Console, Bing permite importarla. Enviar el sitemap `https://p2lrn.org/sitemap.xml` en Bing Webmaster Tools.

P2LRN publica el archivo de verificación público `/acc6b70e531da19216a0ab9303a647ff.txt` mediante el proceso normal de Netlify. Su contenido es la clave de 32 caracteres indicada en el propio nombre: **no es un secreto ni requiere variables de entorno**.

Tras el despliegue y solo cuando una página cambie:

```bash
node scripts/submit-indexnow.mjs --dry-run https://p2lrn.org/skills/ https://p2lrn.org/en/skills/
node scripts/submit-indexnow.mjs https://p2lrn.org/skills/ https://p2lrn.org/en/skills/
```

El script solo admite URLs absolutas `https://p2lrn.org/` sin fragmentos ni parámetros, comprueba la clave local y notifica a `https://api.indexnow.org/indexnow` por POST. Un HTTP 200 indica aceptación y un HTTP 202 indica aceptación pendiente de verificación de clave. Ninguno garantiza indexación o posicionamiento. No reenviar sin cambios, no añadir trabajos programados y no enviar 301 antiguas como URLs nuevas.

El envío se comparte con otros motores participantes de IndexNow, como Bing, Yandex, Naver, Seznam y Yep. Google no participa: utilizar Google Search Console por separado.

## Otros buscadores

- DuckDuckGo mantiene su propio rastreador y obtiene gran parte de sus enlaces de Bing; no tiene un portal de envío equivalente a Bing Webmaster Tools.
- Yahoo Search indica que las altas se tramitan a través de Bing Webmaster Tools.
- Ecosia utiliza proveedores como Bing, Google y EUSP según región y dispositivo.
- Brave Search tiene índice independiente, por lo que necesita descubrir y rastrear contenido útil y enlazado.

Las solicitudes de verificación de propietario en Bing o Google requieren una sesión autorizada del titular. No inventar códigos de verificación, estadísticas de posición ni promesas de primera página.

Referencias: https://www.indexnow.org/documentation · https://www.bing.com/webmasters/ · https://duckduckgo.com/duckduckgo-help-pages/results/sources · https://search.brave.com/help/brave-search-crawler
