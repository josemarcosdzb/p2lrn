import {WEB_CONTENT_PROFILE, webContentMapping, webEntrypointDirectory} from '../web-content-core.js';

const decoder = new TextDecoder('utf-8', {fatal: true});

function cspFor(baseUrl = null) {
  if (!baseUrl) return "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
  const origin = new URL(baseUrl, document.baseURI).origin;
  return `default-src 'none'; img-src ${origin} data: blob:; media-src ${origin} data: blob:; style-src ${origin} 'unsafe-inline'; font-src ${origin} data:; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri ${origin}`;
}

function prepareHtml(text, baseUrl = null) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  doc.querySelectorAll('base').forEach((node) => node.remove());
  const meta = doc.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = cspFor(baseUrl);
  doc.head.prepend(meta);
  if (baseUrl) {
    const base = doc.createElement('base');
    base.href = baseUrl;
    doc.head.insertBefore(base, meta.nextSibling);
  }
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

export async function render({container, bytes, representation, resolveResourceUrl}) {
  const media = String(representation.mediaType ?? '').split(';', 1)[0].trim().toLowerCase();
  const text = decoder.decode(bytes);
  if (media === 'text/plain') {
    const pre = document.createElement('pre');
    pre.textContent = text;
    container.append(pre);
    return {destroy() { container.replaceChildren(); }};
  }
  if (media === 'text/html') {
    let baseUrl = null;
    if (representation.profile === WEB_CONTENT_PROFILE) {
      const mapping = webContentMapping(representation);
      if (mapping) {
        if (typeof resolveResourceUrl !== 'function') {
          const error = new Error('This web-content bundle requires a host virtual-resource bridge for relative assets.');
          error.code = 'P2LRN_VIRTUAL_RESOURCE_UNAVAILABLE';
          throw error;
        }
        const resolved = await resolveResourceUrl({
          kind: 'web-base',
          purpose: 'passive-html-assets',
          logicalPath: mapping.entrypoint,
          logicalDirectory: webEntrypointDirectory(mapping),
        });
        if (!resolved) {
          const error = new Error('The host did not provide a verified virtual URL for this web-content bundle.');
          error.code = 'P2LRN_VIRTUAL_RESOURCE_UNAVAILABLE';
          throw error;
        }
        baseUrl = resolved.url;
      }
    }
    const iframe = document.createElement('iframe');
    iframe.className = 'p2lrn-html';
    iframe.setAttribute('sandbox', '');
    iframe.referrerPolicy = 'no-referrer';
    iframe.srcdoc = prepareHtml(text, baseUrl);
    container.append(iframe);
    return {destroy() { iframe.srcdoc = ''; container.replaceChildren(); }};
  }
  throw new Error(`Representación textual no soportada: ${representation.mediaType}`);
}
