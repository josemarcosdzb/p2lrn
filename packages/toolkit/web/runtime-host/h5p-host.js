const PROTOCOL = 'p2lrn-h5p-runtime/1';
const LEGACY_PROTOCOL = 'p2rln-h5p-runtime/1';
const stage = document.getElementById('h5p-stage');
const errorBox = document.getElementById('h5p-error');
let port = null;
let player = null;
let h5pWindow = null;
let xapiHandler = null;
let activeProtocol = PROTOCOL;
let activeObjectUrls = [];
const MAX_STATE_JSON_BYTES = 2 * 1024 * 1024;
const MAX_XAPI_JSON_BYTES = 1024 * 1024;
const MAX_STATIC_FILES = 10000;
const MAX_STATIC_BYTES = 512 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: false});

function send(action, payload = {}) { if (port) port.postMessage({protocol:activeProtocol, action, ...payload}); }
function boundedJson(value, label, maxBytes) {
  const text = JSON.stringify(value);
  if (text == null) return null;
  const bytes = encoder.encode(text).byteLength;
  if (bytes > maxBytes) { const error = new Error(`${label} exceeds ${maxBytes} UTF-8 bytes.`); error.code = 'P2LRN_H5P_RUNTIME_PAYLOAD_TOO_LARGE'; throw error; }
  return JSON.parse(text);
}
function softError(phase, error) { send('error', {phase, error:String(error?.message ?? error)}); }
function fail(error) {
  const message = String(error?.message ?? error ?? 'H5P runtime error');
  if (errorBox) { errorBox.hidden = false; errorBox.textContent = message; }
  send('error', {error:message, code:error?.code ?? null});
}
function stateSnapshot() {
  try {
    const instance = h5pWindow?.H5P?.instances?.[0] ?? globalThis.H5P?.instances?.[0];
    if (!instance || typeof instance.getCurrentState !== 'function') return null;
    return boundedJson(instance.getCurrentState(), 'H5P state', MAX_STATE_JSON_BYTES);
  } catch (error) { softError('state-snapshot', error); return null; }
}
function emitState(reason) { const state = stateSnapshot(); if (state != null) send('state', {state, reason}); }
function resize() {
  try {
    const doc = h5pWindow?.document ?? document;
    const height = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0, 100);
    send('resize', {height});
  } catch {}
}

function safePath(value) {
  const text = String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!text || text.startsWith('/') || text.includes('\0')) throw new Error(`Invalid H5P path: ${text}`);
  const parts = text.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe H5P path: ${text}`);
  return parts.join('/');
}
function dependencyKey(dep) {
  const name = String(dep?.machineName ?? '').trim();
  const major = Number(dep?.majorVersion);
  const minor = Number(dep?.minorVersion);
  return name && Number.isInteger(major) && Number.isInteger(minor) ? `${name}-${major}.${minor}` : null;
}
function dependencyList(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`H5P ${label} must be an array.`);
  return value.map((entry, index) => {
    const key = dependencyKey(entry);
    if (!key) throw new Error(`H5P ${label}[${index}] requires machineName and integer majorVersion/minorVersion.`);
    return {machineName:String(entry.machineName), majorVersion:Number(entry.majorVersion), minorVersion:Number(entry.minorVersion)};
  });
}
function mediaType(path) {
  const clean = String(path).split(/[?#]/, 1)[0].toLowerCase();
  const ext = clean.includes('.') ? clean.slice(clean.lastIndexOf('.')) : '';
  return ({
    '.json':'application/json; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8',
    '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp',
    '.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.mp4':'video/mp4','.webm':'video/webm',
    '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.eot':'application/vnd.ms-fontobject'
  })[ext] ?? 'application/octet-stream';
}
function parseJson(bytes, label) {
  try { return JSON.parse(decoder.decode(bytes)); }
  catch (error) { throw new Error(`Invalid H5P JSON in ${label}: ${error?.message ?? String(error)}`); }
}
function normalizeRef(basePath, raw) {
  const value = String(raw ?? '').trim();
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(value)) return null;
  const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/u.exec(value);
  const target = match?.[1] ?? '';
  const base = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/') + 1) : '';
  const parts = [];
  for (const part of (target.startsWith('/') ? target.slice(1) : base + target).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return {path:parts.join('/'), suffix:(match?.[2] ?? '') + (match?.[3] ?? '')};
}
function blobUrl(bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], {type:type || 'application/octet-stream'}));
  activeObjectUrls.push(url);
  return url;
}
function clearObjectUrls() {
  for (const url of activeObjectUrls) { try { URL.revokeObjectURL(url); } catch {} }
  activeObjectUrls = [];
}

function staticFiles(data) {
  if (!Array.isArray(data.files) || data.files.length > MAX_STATIC_FILES) {
    const error = new Error('Invalid or excessive H5P static-runtime file list.');
    error.code = 'P2LRN_H5P_RUNTIME_TOO_LARGE';
    throw error;
  }
  const files = new Map();
  let total = 0;
  for (const item of data.files) {
    if (!item || typeof item.path !== 'string' || !(item.buffer instanceof ArrayBuffer)) continue;
    const path = safePath(item.path);
    if (files.has(path)) throw new Error(`Duplicate H5P runtime path: ${path}`);
    total += item.buffer.byteLength;
    if (total > MAX_STATIC_BYTES) {
      const error = new Error(`H5P runtime payload exceeds ${MAX_STATIC_BYTES} bytes.`);
      error.code = 'P2LRN_H5P_RUNTIME_TOO_LARGE';
      throw error;
    }
    files.set(path, new Uint8Array(item.buffer));
  }
  return files;
}

function bundledLibraries(files) {
  const exact = new Map();
  const aliases = new Map();
  for (const [path, bytes] of files) {
    const match = /^([^/]+)\/library\.json$/iu.exec(path);
    if (!match) continue;
    const metadata = parseJson(bytes, path);
    const key = dependencyKey(metadata);
    if (!key) throw new Error(`Invalid H5P library metadata: ${path}`);
    const descriptor = {source:'bundle', folder:match[1], metadata, key};
    exact.set(key, descriptor);
    aliases.set(match[1], descriptor);
    if (!aliases.has(String(metadata.machineName))) aliases.set(String(metadata.machineName), descriptor);
  }
  return {exact, aliases};
}

async function sharedLibrary(dep, sharedBaseUrl) {
  if (!sharedBaseUrl) return null;
  const candidates = [dependencyKey(dep), String(dep.machineName)].filter(Boolean);
  for (const folder of candidates) {
    const url = new URL(`${encodeURIComponent(folder)}/library.json`, sharedBaseUrl);
    let response;
    try { response = await fetch(url.href, {mode:'cors', credentials:'omit', cache:'no-store'}); } catch { continue; }
    if (!response.ok) continue;
    let metadata;
    try { metadata = await response.json(); } catch { continue; }
    if (dependencyKey(metadata) !== dependencyKey(dep)) continue;
    return {source:'shared', folder, metadata, key:dependencyKey(dep), baseUrl:new URL(`${encodeURIComponent(folder)}/`, sharedBaseUrl).href};
  }
  return null;
}

function contentLibraryDependencies(content) {
  const found = new Map();
  const stack = [content];
  while (stack.length) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'library' && typeof child === 'string') {
        const match = /^(.+?)\s+(\d+)\.(\d+)$/u.exec(child.trim());
        if (match) {
          const dep = {machineName:match[1], majorVersion:Number(match[2]), minorVersion:Number(match[3])};
          found.set(dependencyKey(dep), dep);
        }
      }
      stack.push(child);
    }
  }
  return [...found.values()];
}

async function dependencyClosure(h5p, bundled, sharedBaseUrl, content = null) {
  const declared = dependencyList(h5p.preloadedDependencies, 'preloadedDependencies');
  const contentDeps = contentLibraryDependencies(content);
  const directByKey = new Map();
  for (const dep of [...declared, ...contentDeps]) directByKey.set(dependencyKey(dep), dep);
  const direct = [...directByKey.values()];
  if (!direct.some((dep) => dep.machineName === h5p.mainLibrary)) throw new Error(`H5P mainLibrary ${h5p.mainLibrary} is not declared in preloadedDependencies.`);
  const resolved = new Map();
  const visiting = new Set();

  async function visit(dep) {
    const key = dependencyKey(dep);
    if (resolved.has(key)) return;
    if (visiting.has(key)) throw new Error(`Circular H5P preloaded dependency near ${key}.`);
    visiting.add(key);
    let library = bundled.exact.get(key) ?? null;
    if (!library) library = await sharedLibrary(dep, sharedBaseUrl);
    if (!library) {
      const error = new Error(`Missing H5P library: ${dep.machineName} ${dep.majorVersion}.${dep.minorVersion}`);
      error.code = 'P2LRN_H5P_LIBRARIES_MISSING';
      throw error;
    }
    for (const child of dependencyList(library.metadata.preloadedDependencies, `${key} preloadedDependencies`)) await visit(child);
    visiting.delete(key);
    resolved.set(key, library);
  }
  for (const dep of direct) await visit(dep);
  return {direct, ordered:[...resolved.values()]};
}

function rewriteCss(text, cssPath, files, objectUrls, stack = new Set()) {
  const rewriteReference = (raw) => {
    const resolved = normalizeRef(cssPath, raw.replace(/^['"]|['"]$/g, ''));
    if (!resolved) return raw;
    const url = objectUrls.get(resolved.path);
    return url ? `"${url}${resolved.suffix}"` : raw;
  };
  let out = String(text);
  out = out.replace(/@import\s+(?:url\()?\s*(['"]?)([^'")\s;]+)\1\s*\)?\s*;/giu, (all, _quote, ref) => {
    const resolved = normalizeRef(cssPath, ref);
    if (!resolved || stack.has(resolved.path) || !files.has(resolved.path) || !resolved.path.toLowerCase().endsWith('.css')) return all;
    const next = new Set(stack);
    next.add(resolved.path);
    return rewriteCss(decoder.decode(files.get(resolved.path)), resolved.path, files, objectUrls, next);
  });
  return out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/giu, (_all, _quote, ref) => `url(${rewriteReference(ref)})`);
}

function defaultIntegrationL10n() {
  return {H5P:{
    fullscreen:'Fullscreen',disableFullscreen:'Disable fullscreen',download:'Download',copyrights:'Rights of use',embed:'Embed',
    size:'Size',showAdvanced:'Show advanced',hideAdvanced:'Hide advanced',copyrightInformation:'Rights of use',close:'Close',
    title:'Title',author:'Author',year:'Year',source:'Source',license:'License',thumbnail:'Thumbnail',noCopyrights:'No copyright information available.',
    reuse:'Reuse',reuseContent:'Reuse Content',reuseDescription:'Reuse this content.',downloadDescription:'Download this content as a H5P file.',
    copyrightsDescription:'View copyright information.',embedDescription:'View embed code.',h5pDescription:'H5P content.',
    contentChanged:'This content has changed since you last used it.',startingOver:'You will be starting over.',by:'by',showMore:'Show more',
    showLess:'Show less',subLevel:'Sublevel',confirmDialogHeader:'Confirm action',confirmDialogBody:'Please confirm that you wish to proceed.',
    cancelLabel:'Cancel',confirmLabel:'Confirm',licenseU:'Undisclosed',licenseCCBY:'Attribution',licenseCCBYSA:'Attribution-ShareAlike',
    licenseCCBYND:'Attribution-NoDerivs',licenseCCBYNC:'Attribution-NonCommercial',licenseCCBYNCSA:'Attribution-NonCommercial-ShareAlike',
    licenseCCBYNCND:'Attribution-NonCommercial-NoDerivs',licenseCC40:'4.0 International',licenseCC30:'3.0 Unported',licenseCC25:'2.5 Generic',
    licenseCC20:'2.0 Generic',licenseCC10:'1.0 Generic',licenseGPL:'General Public License',licenseV3:'Version 3',licenseV2:'Version 2',
    licenseV1:'Version 1',licensePD:'Public Domain',licenseCC010:'CC0 1.0 Universal',licensePDM:'Public Domain Mark',licenseC:'Copyright'
  }};
}

async function loadScript(doc, src) {
  await new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load H5P script: ${src}`));
    doc.head.append(script);
  });
}
function loadStylesheet(doc, href) {
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  doc.head.append(link);
}

async function initializeStatic(data) {
  clearObjectUrls();
  const files = staticFiles(data);
  const h5pBytes = files.get('h5p.json');
  const contentBytes = files.get('content/content.json');
  if (!h5pBytes || !contentBytes) throw new Error('H5P runtime payload requires h5p.json and content/content.json.');
  const h5p = parseJson(h5pBytes, 'h5p.json');
  const contentJson = parseJson(contentBytes, 'content/content.json');
  if (!h5p?.mainLibrary) throw new Error('H5P h5p.json must declare mainLibrary.');
  const bundled = bundledLibraries(files);
  const closure = await dependencyClosure(h5p, bundled, data.sharedLibrariesUrl || null, contentJson);

  const objectUrls = new Map();
  // Non-CSS assets first so CSS rewriting can point at stable blob URLs.
  for (const [path, bytes] of files) {
    if (path.toLowerCase().endsWith('.css') || path.toLowerCase().endsWith('.js') || path.toLowerCase().endsWith('.json')) continue;
    objectUrls.set(path, blobUrl(bytes, mediaType(path)));
  }
  for (const [path, bytes] of files) {
    if (!path.toLowerCase().endsWith('.css')) continue;
    const css = rewriteCss(decoder.decode(bytes), path, files, objectUrls, new Set([path]));
    objectUrls.set(path, blobUrl(encoder.encode(css), 'text/css'));
  }
  for (const [path, bytes] of files) {
    if (!path.toLowerCase().endsWith('.js')) continue;
    objectUrls.set(path, blobUrl(bytes, 'text/javascript'));
  }

  const styles = [];
  const scripts = [];
  for (const library of closure.ordered) {
    const metadata = library.metadata;
    for (const item of Array.isArray(metadata.preloadedCss) ? metadata.preloadedCss : []) {
      const rel = safePath(String(item?.path ?? ''));
      if (library.source === 'bundle') {
        const path = `${library.folder}/${rel}`;
        const url = objectUrls.get(path);
        if (!url) throw new Error(`Missing bundled H5P CSS asset: ${path}`);
        styles.push(url);
      } else {
        styles.push(new URL(rel, library.baseUrl).href);
      }
    }
    for (const item of Array.isArray(metadata.preloadedJs) ? metadata.preloadedJs : []) {
      const rel = safePath(String(item?.path ?? ''));
      if (library.source === 'bundle') {
        const path = `${library.folder}/${rel}`;
        const url = objectUrls.get(path);
        if (!url) throw new Error(`Missing bundled H5P JS asset: ${path}`);
        scripts.push(url);
      } else {
        scripts.push(new URL(rel, library.baseUrl).href);
      }
    }
  }

  const mainDependency = closure.direct.find((dep) => dep.machineName === h5p.mainLibrary);
  const mainLibrary = closure.ordered.find((lib) => lib.key === dependencyKey(mainDependency));
  if (!mainLibrary) throw new Error(`H5P main library could not be resolved: ${h5p.mainLibrary}`);

  const previousState = data.previousState == null ? null : boundedJson(data.previousState, 'Previous H5P state', MAX_STATE_JSON_BYTES);
  const contentId = 'p2lrn-h5p';
  const contentUserData = previousState == null ? undefined : [{dataType:'state', previousState:JSON.stringify(previousState), subContentId:'*'}];
  const libraryName = `${mainLibrary.metadata.machineName} ${mainLibrary.metadata.majorVersion}.${mainLibrary.metadata.minorVersion}`;
  const integration = {
    baseUrl: location.origin,
    url: String(data.xAPIObjectIRI || location.href),
    contents: {
      [`cid-${contentId}`]: {
        library:libraryName,
        title:String(data.title ?? h5p.title ?? ''),
        url:String(data.xAPIObjectIRI || location.href),
        contentUrl:location.href,
        jsonContent:JSON.stringify(contentJson),
        styles,
        scripts,
        fullScreen:true,
        exportUrl:undefined,
        embedCode:'',
        resizeCode:'',
        displayOptions:{copyright:false,embed:false,export:false,frame:false,icon:false,copy:false},
        contentUserData,
        metadata:{title:String(data.title ?? h5p.title ?? ''),license:'U'},
      },
    },
    core:{
      styles:[new URL('styles/h5p.css', data.runtimeAssetsUrl).href],
      scripts:[new URL('frame.bundle.js', data.runtimeAssetsUrl).href],
    },
    saveFreq:false,
    postUserStatistics:false,
    reportingIsEnabled:false,
    ajax:{},
    l10n:defaultIntegrationL10n(),
  };

  const outer = document.createElement('iframe');
  outer.className = 'p2lrn-h5p-inner';
  outer.title = String(data.title ?? h5p.title ?? 'H5P');
  outer.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups');
  outer.setAttribute('allow', 'fullscreen');
  outer.style.cssText = 'display:block;width:100%;min-height:480px;border:0;background:#fff';
  stage.replaceChildren(outer);

  const doc = outer.contentDocument;
  const win = outer.contentWindow;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="h5p-content" data-content-id="p2lrn-h5p"></div></body></html>');
  doc.close();

  win.H5PIntegration = integration;
  win.H5P = {preventInit:true};

  // Patch the content-file resolver before H5P libraries execute. H5P content
  // files stay inside the verified P2LRN/H5P payload and are exposed only as
  // ephemeral blob URLs in the isolated runtime frame.
  await loadScript(doc, integration.core.scripts[0]);
  const H5P = win.H5P;
  if (!H5P || typeof H5P.init !== 'function') throw new Error('H5P core runtime failed to initialize.');

  const originalGetPath = typeof H5P.getPath === 'function' ? H5P.getPath.bind(H5P) : null;
  H5P.getPath = function(path, id) {
    const raw = String(path ?? '').replace(/^\.\//, '');
    const key = raw.startsWith('content/') ? raw : `content/${raw}`;
    const mapped = objectUrls.get(key);
    if (mapped) return mapped;
    return originalGetPath ? originalGetPath(path, id) : raw;
  };

  for (const href of integration.core.styles) loadStylesheet(doc, href);
  for (const href of styles) loadStylesheet(doc, href);
  for (const src of scripts) await loadScript(doc, src);

  H5P.preventInit = false;
  H5P.init();
  player = {destroy(){ try { outer.src = 'about:blank'; } catch {} outer.remove(); }};
  h5pWindow = win;

  const dispatcher = win.H5P?.externalDispatcher;
  if (dispatcher?.on) {
    xapiHandler = (event) => {
      const source = event?.data?.statement ?? event?.statement ?? event?.data ?? null;
      if (source) {
        try { const statement = boundedJson(source, 'H5P xAPI statement', MAX_XAPI_JSON_BYTES); if (statement) send('xapi', {statement}); }
        catch (error) { softError('xapi', error); }
      }
      emitState('xapi');
      queueMicrotask(resize);
    };
    dispatcher.on('xAPI', xapiHandler);
  }
  const ro = globalThis.ResizeObserver ? new ResizeObserver(() => {
    try {
      const height = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0, 480);
      outer.style.height = `${Math.ceil(height)}px`;
      send('resize', {height});
    } catch {}
  }) : null;
  if (ro) ro.observe(doc.body);
  setTimeout(resize, 0);
  send('ready', {mainLibrary:h5p.mainLibrary, mode:'static-memory', dependencies:closure.ordered.length});
}

async function initializeServer(data) {
  if (!globalThis.H5PStandalone?.H5P) throw new Error('H5P Standalone runtime assets are unavailable.');
  const previousState = data.previousState == null ? null : boundedJson(data.previousState, 'Previous H5P state', MAX_STATE_JSON_BYTES);
  const prior = previousState == null ? undefined : [{dataType:'state', previousState:JSON.stringify(previousState), subContentId:'*'}];
  const options = {
    id:'p2lrn-h5p',
    title:String(data.title ?? ''),
    h5pJsonPath:String(data.sessionUrl).replace(/\/$/, ''),
    contentJsonPath:String(data.contentUrl).replace(/\/$/, ''),
    librariesPath:String(data.librariesUrl).replace(/\/$/, ''),
    frameJs:new URL('frame.bundle.js', data.runtimeAssetsUrl).href,
    frameCss:new URL('styles/h5p.css', data.runtimeAssetsUrl).href,
    contentUserData:prior,
    xAPIObjectIRI:String(data.xAPIObjectIRI ?? ''),
    embedType:data.embedType === 'div' ? 'div' : 'iframe',
    fullScreen:true, frame:false, copyright:false, export:false, embed:false, icon:false, saveFreq:false,
  };
  player = await new globalThis.H5PStandalone.H5P(stage, options);
  const iframe = stage.querySelector('iframe.h5p-iframe');
  h5pWindow = iframe?.contentWindow ?? globalThis;
  const dispatcher = h5pWindow?.H5P?.externalDispatcher ?? globalThis.H5P?.externalDispatcher;
  if (dispatcher?.on) {
    xapiHandler = (event) => {
      const source = event?.data?.statement ?? event?.statement ?? event?.data ?? null;
      if (source) {
        try { const statement = boundedJson(source, 'H5P xAPI statement', MAX_XAPI_JSON_BYTES); if (statement) send('xapi', {statement}); }
        catch (error) { softError('xapi', error); }
      }
      emitState('xapi');
      queueMicrotask(resize);
    };
    dispatcher.on('xAPI', xapiHandler);
  }
  const ro = globalThis.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(stage);
  setTimeout(resize, 0);
  send('ready', {mainLibrary:data.mainLibrary ?? null, mode:'server-session'});
}

async function initialize(data) {
  if (Array.isArray(data.files)) return initializeStatic(data);
  return initializeServer(data);
}
function onPortMessage(event) {
  const data = event.data;
  if (!data || data.protocol !== activeProtocol) return;
  if (data.action === 'init') initialize(data).catch(fail);
  if (data.action === 'flush') emitState('flush');
}
window.addEventListener('beforeunload', () => { emitState('unload'); clearObjectUrls(); });
window.addEventListener('message', (event) => {
  const data = event.data;
  if (event.source !== parent || !data || ![PROTOCOL, LEGACY_PROTOCOL].includes(data.protocol) || data.action !== 'connect' || !event.ports?.[0] || port) return;
  activeProtocol = data.protocol;
  port = event.ports[0];
  port.onmessage = onPortMessage;
  port.start?.();
  send('connected');
});
parent.postMessage({protocol:PROTOCOL, action:'shell-ready'}, '*');
parent.postMessage({protocol:LEGACY_PROTOCOL, action:'shell-ready'}, '*');
