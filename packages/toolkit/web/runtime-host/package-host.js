const PROTOCOL = 'p2lrn-package-runtime/1';
const stage = document.getElementById('stage');
const files = new Map();
const urls = new Map();
let channel = null;
let active = false;

function reply(action, payload = {}) {
  channel?.postMessage({protocol:PROTOCOL, action, ...payload});
}
function fatal(message) {
  const pre = document.createElement('pre');
  pre.className = 'error';
  pre.textContent = String(message);
  stage.replaceChildren(pre);
}
function normalize(path) {
  const out = [];
  for (const part of String(path || '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}
function resolve(base, ref) {
  const raw = String(ref || '').trim();
  if (!raw || raw[0] === '#' || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return null;
  const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/u.exec(raw);
  const target = match?.[1] || '';
  const root = target.startsWith('/');
  const baseDir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const path = normalize(root ? target.slice(1) : baseDir + target);
  return path && files.has(path) ? {path, suffix:(match?.[2] || '') + (match?.[3] || '')} : null;
}
function text(path) {
  return new TextDecoder('utf-8', {fatal:false}).decode(files.get(path).buffer);
}
function stripSourceMapDirectives(source) {
  return String(source)
    .replace(/\/\/[#@]\s*sourceMappingURL=.*$/gmu, '')
    .replace(/\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\//gmu, '');
}
function rewriteCss(css, base, stack = new Set()) {
  return String(css)
    .replace(/@import\s+(?:url\()?\s*(['"]?)([^'")\s;]+)\1\s*\)?\s*;/giu, (all, _q, ref) => {
      const resolved = resolve(base, ref);
      if (!resolved || stack.has(resolved.path) || !files.get(resolved.path)?.mediaType?.includes('css')) return all;
      const next = new Set(stack); next.add(resolved.path);
      return rewriteCss(text(resolved.path), resolved.path, next);
    })
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/giu, (all, _q, ref) => {
      const resolved = resolve(base, ref);
      return resolved && urls.has(resolved.path) ? `url("${urls.get(resolved.path)}${resolved.suffix}")` : all;
    });
}
function rewriteHtml(path) {
  const doc = new DOMParser().parseFromString(text(path), 'text/html');
  doc.querySelectorAll('base').forEach((node) => node.remove());
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline' blob:; img-src blob: data:; media-src blob: data:; font-src blob: data:; frame-src blob: data: about:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none';";
  if (!doc.querySelector('meta[name="viewport"]')) {
    const viewport = doc.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width,initial-scale=1';
    doc.head?.append(viewport);
  }
  const fit = doc.createElement('style');
  fit.setAttribute('data-p2lrn-runtime-fit', '1');
  fit.textContent = 'img,video,canvas,svg{max-width:100%;height:auto}iframe,object,embed{max-width:100%}';
  doc.head?.append(fit);
  doc.head?.prepend(csp);
  const attrs = ['src','href','poster','data','background'];
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of attrs) {
      if (!el.hasAttribute(attr)) continue;
      const raw = el.getAttribute(attr);
      const resolved = resolve(path, raw);
      if (!resolved) continue;
      const tag = el.tagName.toLowerCase();
      const mt = files.get(resolved.path)?.mediaType || '';
      if ((tag === 'a' || tag === 'area') && (mt.includes('html') || mt.includes('xhtml'))) {
        el.setAttribute(attr, '#');
        el.setAttribute('data-p2lrn-member', resolved.path);
        continue;
      }
      if ((tag === 'iframe' || tag === 'frame') && (mt.includes('html') || mt.includes('xhtml'))) {
        el.removeAttribute(attr);
        el.setAttribute('data-p2lrn-frame-member', resolved.path);
        continue;
      }
      if (urls.has(resolved.path)) el.setAttribute(attr, urls.get(resolved.path) + resolved.suffix);
    }
    if (el.hasAttribute('style')) el.setAttribute('style', rewriteCss(el.getAttribute('style'), path));
    if (el.hasAttribute('srcset')) {
      el.setAttribute('srcset', el.getAttribute('srcset').split(',').map((item) => {
        const bits = item.trim().split(/\s+/);
        const resolved = resolve(path, bits[0]);
        if (resolved && urls.has(resolved.path)) bits[0] = urls.get(resolved.path) + resolved.suffix;
        return bits.join(' ');
      }).join(', '));
    }
  }
  for (const style of doc.querySelectorAll('style')) style.textContent = rewriteCss(style.textContent || '', path);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
function wireDocument(doc, path) {
  if (!doc) return;
  doc.addEventListener('click', (event) => {
    const anchor = event.target?.closest?.('a,area');
    if (!anchor) return;
    const member = anchor.getAttribute('data-p2lrn-member');
    if (member) {
      event.preventDefault();
      void navigate(member);
      return;
    }
    const href = anchor.getAttribute('href') || '';
    if (href && href !== '#' && !href.startsWith('#')) {
      event.preventDefault();
      reply('blocked-navigation', {href, member:path});
    }
  });
  for (const frame of doc.querySelectorAll('[data-p2lrn-frame-member]')) {
    const member = frame.getAttribute('data-p2lrn-frame-member');
    try {
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads');
      frame.srcdoc = rewriteHtml(member);
      frame.addEventListener('load', () => wireDocument(frame.contentDocument, member), {once:true});
    } catch {}
  }
}
function makeUrls() {
  for (const [path, file] of files) {
    if (file.mediaType.includes('html') || file.mediaType.includes('xhtml') || file.mediaType.includes('css')) continue;
    urls.set(path, URL.createObjectURL(new Blob([file.mediaType.includes('javascript') ? stripSourceMapDirectives(text(path)) : file.buffer], {type:file.mediaType || 'application/octet-stream'})));
  }
  for (const [path, file] of files) {
    if (!file.mediaType.includes('css')) continue;
    urls.set(path, URL.createObjectURL(new Blob([rewriteCss(text(path), path, new Set([path]))], {type:'text/css'})));
  }
}
async function navigate(path) {
  const normalized = normalize(path);
  if (!normalized || !files.has(normalized)) throw new Error(`Package launch member not found: ${path}`);
  const media = files.get(normalized).mediaType || '';
  if (!media.includes('html') && !media.includes('xhtml')) throw new Error(`Package launch member is not HTML/XHTML: ${normalized}`);
  const iframe = document.createElement('iframe');
  iframe.id = 'content';
  iframe.title = 'External package content';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.addEventListener('load', () => {
    try { wireDocument(iframe.contentDocument, normalized); } catch {}
    reply('ready', {member:normalized});
  }, {once:true});
  iframe.srcdoc = rewriteHtml(normalized);
  stage.replaceChildren(iframe);
}
async function initialize(data) {
  if (active) return;
  active = true;
  let total = 0;
  for (const file of data.files || []) {
    if (!file || typeof file.path !== 'string' || !(file.buffer instanceof ArrayBuffer)) continue;
    const path = normalize(file.path);
    if (!path || files.has(path)) continue;
    total += file.buffer.byteLength;
    if (total > 512 * 1024 * 1024) throw new Error('External package runtime payload exceeds 512 MiB.');
    files.set(path, {mediaType:String(file.mediaType || 'application/octet-stream'), buffer:file.buffer});
  }
  makeUrls();
  await navigate(String(data.launchMember || ''));
  reply('initialized', {files:files.size, profile:data.profile ?? null});
}
function onMessage(event) {
  const data = event.data;
  if (!data || data.protocol !== PROTOCOL) return;
  if (data.action === 'init') void initialize(data).catch((error) => { fatal(error?.message || String(error)); reply('error', {message:String(error?.message || error)}); });
  if (data.action === 'navigate' && active) void navigate(String(data.launchMember || '')).catch((error) => reply('error', {message:String(error?.message || error)}));
}
window.addEventListener('message', (event) => {
  const data = event.data;
  const p = event.ports?.[0] ?? null;
  if (channel || event.source !== parent || !data || data.protocol !== PROTOCOL || data.action !== 'connect' || !p) return;
  channel = p;
  channel.onmessage = onMessage;
  channel.start?.();
  reply('connected');
});
window.addEventListener('unload', () => { try { channel?.close?.(); } catch {} for (const url of urls.values()) try { URL.revokeObjectURL(url); } catch {} });
parent.postMessage({protocol:PROTOCOL, action:'shell-ready'}, '*');
