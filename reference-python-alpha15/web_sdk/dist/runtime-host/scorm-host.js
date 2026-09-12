import {createScormApi, normalizeScormVersion, SCORM_RUNTIME_PROTOCOL} from '../scorm-runtime-core.js';

const stage = document.getElementById('stage');
const files = new Map();
const urls = new Map();
let content = null;
let runtime = null;
let apiFacade = null;
let runtimeVersion = '1.2';
let runtimeIdentity = {learnerId:'', learnerName:'', launchData:''};
let activePath = '';
let initialized = false;
let channel = null;
let channelSend = null;

function fatal(message) {
  const pre = document.createElement('pre');
  pre.className = 'error';
  pre.textContent = String(message);
  stage.replaceChildren(pre);
}

function reply(action, payload = {}) {
  if (!channelSend) return;
  channelSend({protocol: SCORM_RUNTIME_PROTOCOL, action, ...payload});
}

function normalize(path) {
  const out = [];
  for (const part of String(path || '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else {
      out.push(part);
    }
  }
  return out.join('/');
}

function resolve(base, ref) {
  const raw = String(ref || '').trim();
  if (!raw || raw[0] === '#' || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return null;
  const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(raw);
  const target = match?.[1] || '';
  const root = target.startsWith('/');
  const baseDir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const path = normalize(root ? target.slice(1) : baseDir + target);
  return path && files.has(path) ? {path, suffix: (match?.[2] || '') + (match?.[3] || '')} : null;
}

function text(path) {
  return new TextDecoder('utf-8', {fatal: false}).decode(files.get(path).buffer);
}

function rewriteCss(css, base, stack = new Set()) {
  return String(css)
    .replace(/@import\s+(?:url\()?\s*(['"]?)([^'"\)\s;]+)\1\s*\)?\s*;/gi, (all, _q, ref) => {
      const resolved = resolve(base, ref);
      if (!resolved || stack.has(resolved.path) || !files.get(resolved.path)?.mediaType?.includes('css')) return all;
      const next = new Set(stack);
      next.add(resolved.path);
      return rewriteCss(text(resolved.path), resolved.path, next);
    })
    .replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi, (all, _q, ref) => {
      const resolved = resolve(base, ref);
      return resolved && urls.has(resolved.path) ? `url("${urls.get(resolved.path)}${resolved.suffix}")` : all;
    });
}

function apiBridgeBootstrap() {
  return `(function(){try{var p=window.parent;if(p&&p!==window){if(p.API&&!window.API)Object.defineProperty(window,'API',{value:p.API,writable:false,configurable:false});if(p.API_1484_11&&!window.API_1484_11)Object.defineProperty(window,'API_1484_11',{value:p.API_1484_11,writable:false,configurable:false});if(!window.opener){try{Object.defineProperty(window,'opener',{value:p,writable:false,configurable:true});}catch(_e){try{window.opener=p;}catch(_e2){}}}}}catch(_e){}})();`;
}

function rewriteHtml(path) {
  const source = text(path);
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('base').forEach((node) => node.remove());

  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline' blob:; img-src blob: data:; media-src blob: data:; font-src blob: data:; frame-src blob: data: about:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none';";
  doc.head?.prepend(csp);

  const bridge = doc.createElement('script');
  bridge.textContent = apiBridgeBootstrap();
  csp.after(bridge);

  const attrs = ['src', 'href', 'poster', 'data', 'background'];
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of attrs) {
      if (!el.hasAttribute(attr)) continue;
      const raw = el.getAttribute(attr);
      const resolved = resolve(path, raw);
      if (!resolved) continue;
      const tag = el.tagName.toLowerCase();
      const mediaType = files.get(resolved.path)?.mediaType || '';
      if ((tag === 'a' || tag === 'area') && (mediaType.includes('html') || mediaType.includes('xhtml'))) {
        el.setAttribute(attr, '#');
        el.setAttribute('data-p2rln-member', resolved.path);
        continue;
      }
      if ((tag === 'iframe' || tag === 'frame') && (mediaType.includes('html') || mediaType.includes('xhtml'))) {
        el.removeAttribute(attr);
        el.setAttribute('data-p2rln-frame-member', resolved.path);
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
    const member = anchor.getAttribute('data-p2rln-member');
    if (member) {
      event.preventDefault();
      void navigate(member);
      return;
    }
    const href = anchor.getAttribute('href') || '';
    if (href && href !== '#' && !href.startsWith('#')) {
      event.preventDefault();
      reply('blocked-navigation', {href, member: path});
    }
  });

  for (const frame of doc.querySelectorAll('[data-p2rln-frame-member]')) {
    const member = frame.getAttribute('data-p2rln-frame-member');
    try {
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads');
      frame.srcdoc = rewriteHtml(member);
      frame.addEventListener('load', () => wireDocument(frame.contentDocument, member), {once: true});
    } catch {}
  }
}

function makeUrls() {
  for (const [path, file] of files) {
    if (file.mediaType.includes('html') || file.mediaType.includes('xhtml') || file.mediaType.includes('css')) continue;
    urls.set(path, URL.createObjectURL(new Blob([file.buffer], {type: file.mediaType || 'application/octet-stream'})));
  }
  for (const [path, file] of files) {
    if (!file.mediaType.includes('css')) continue;
    const compiled = rewriteCss(text(path), path, new Set([path]));
    urls.set(path, URL.createObjectURL(new Blob([compiled], {type: 'text/css'})));
  }
}

function installApi(initialState, learnerId, learnerName, launchData, version, navigationState = null) {
  runtimeVersion = version;
  runtimeIdentity = {learnerId, learnerName, launchData};
  runtime = createScormApi({
    version,
    initialState,
    learnerId,
    learnerName,
    launchData,
    requestValid: navigationState?.requestValid ?? {},
    onChange: (state, meta) => reply('state', {state, meta}),
    onNavigationRequest: (request, state) => reply('navigation-request', {request, state}),
  });
  if (!apiFacade) {
    const names = version === '2004'
      ? ['Initialize','Terminate','GetValue','SetValue','Commit','GetLastError','GetErrorString','GetDiagnostic']
      : ['LMSInitialize','LMSFinish','LMSGetValue','LMSSetValue','LMSCommit','LMSGetLastError','LMSGetErrorString','LMSGetDiagnostic'];
    const facade = {};
    for (const method of names) facade[method] = (...args) => runtime.api[method](...args);
    apiFacade = Object.freeze(facade);
    const name = version === '2004' ? 'API_1484_11' : 'API';
    Object.defineProperty(window, name, {value: apiFacade, writable: false, configurable: false, enumerable: true});
  }
}

async function navigate(path) {
  if (!files.has(path)) throw new Error(`SCORM launch member not found: ${path}`);
  const mediaType = files.get(path).mediaType || '';
  if (!mediaType.includes('html') && !mediaType.includes('xhtml')) throw new Error(`SCORM launch member is not HTML/XHTML: ${path}`);
  activePath = path;

  const next = document.createElement('iframe');
  next.id = 'content';
  next.title = 'SCORM content';
  next.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads');
  next.setAttribute('referrerpolicy', 'no-referrer');
  next.addEventListener('load', () => {
    try { wireDocument(next.contentDocument, path); } catch {}
    reply('ready', {member: path});
  }, {once: true});
  next.srcdoc = rewriteHtml(path);
  content = next;
  stage.replaceChildren(next);
}

async function initialize(data) {
  if (initialized) return;
  initialized = true;
  const version = normalizeScormVersion(data.version || '1.2');
  for (const file of data.files || []) {
    if (!file || typeof file.path !== 'string' || !(file.buffer instanceof ArrayBuffer)) continue;
    files.set(file.path, {mediaType: String(file.mediaType || 'application/octet-stream'), buffer: file.buffer});
  }
  makeUrls();
  installApi(data.initialState || {}, String(data.learnerId || ''), String(data.learnerName || ''), String(data.launchData || ''), version, data.navigationState || null);
  await navigate(String(data.launchMember || ''));
  reply('initialized', {version, files: files.size, topology: 'isolated-parent-api'});
}

function onChannelMessage(event) {
  const data = event.data;
  if (!data || data.protocol !== SCORM_RUNTIME_PROTOCOL) return;
  if (data.action === 'init') {
    void initialize(data).catch((error) => {
      fatal(error?.message || String(error));
      reply('error', {message: String(error?.message || error)});
    });
    return;
  }
  if (data.action === 'navigate' && initialized) {
    const state = data.initialState && typeof data.initialState === 'object' ? data.initialState : {};
    installApi(state, runtimeIdentity.learnerId, runtimeIdentity.learnerName, runtimeIdentity.launchData, runtimeVersion, data.navigationState || null);
    void navigate(String(data.launchMember || '')).then(() => {
      reply('navigated', {member:String(data.launchMember || ''), itemIdentifier:data.itemIdentifier ?? null});
    }).catch((error) => {
      fatal(error?.message || String(error));
      reply('error', {message:String(error?.message || error)});
    });
  }
}

function onConnect(event) {
  if (channel || event.source !== parent) return;
  const data = event.data;
  const port = event.ports?.[0] ?? null;
  if (!data || data.protocol !== SCORM_RUNTIME_PROTOCOL || data.action !== 'connect' || !port) return;
  channel = port;
  // Bind the native port method before any same-origin SCO exists. Imported
  // content can see the deliberately minimal parent API frame, but it never
  // receives the private MessagePort used to cross back to the LMS.
  channelSend = port.postMessage.bind(port);
  port.onmessage = onChannelMessage;
  port.start?.();
  window.removeEventListener('message', onConnect);
  reply('connected', {topology: 'isolated-parent-api'});
}

window.addEventListener('message', onConnect);
window.addEventListener('unload', () => {
  try { channel?.close?.(); } catch {}
  for (const url of urls.values()) {
    try { URL.revokeObjectURL(url); } catch {}
  }
});

parent.postMessage({protocol: SCORM_RUNTIME_PROTOCOL, action: 'shell-ready', topology: 'isolated-parent-api'}, '*');
