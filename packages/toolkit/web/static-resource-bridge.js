import {webContentMapping, webEntrypointDirectory} from './web-content-core.js';

export const STATIC_BRIDGE_PROTOCOL = 'p2lrn-static-bridge/1';
export const DEFAULT_SERVICE_WORKER_SCOPE = '/__p2lrn__/';

function encodeLogical(path) {
  return String(path).split('/').filter((part) => part.length).map(encodeURIComponent).join('/');
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomCapability() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function messageWorker(worker, message, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    if (!worker) { resolve(null); return; }
    const channel = new MessageChannel();
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, timeoutMs);
    channel.port1.onmessage = (event) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(event.data ?? null);
    };
    try { worker.postMessage(message, [channel.port2]); }
    catch (error) { clearTimeout(timer); reject(error); }
  });
}

function normalizeScopeHref(scope = DEFAULT_SERVICE_WORKER_SCOPE) {
  if (!globalThis.location) return null;
  const url = new URL(String(scope || DEFAULT_SERVICE_WORKER_SCOPE), location.href);
  if (url.origin !== location.origin) {
    const error = new Error('P2LRN Service Worker scope must be same-origin.');
    error.code = 'P2LRN_SERVICE_WORKER_SCOPE_CROSS_ORIGIN';
    throw error;
  }
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

async function exactRegistration(container, scopeHref) {
  if (!container || !scopeHref) return null;
  if (typeof container.getRegistrations === 'function') {
    const registrations = await container.getRegistrations();
    return registrations.find((registration) => registration?.scope === scopeHref) ?? null;
  }
  const registration = await container.getRegistration(scopeHref);
  return registration?.scope === scopeHref ? registration : null;
}

function withWorker(reply, worker) {
  if (!reply || typeof reply !== 'object') return reply;
  const result = {...reply};
  Object.defineProperty(result, 'worker', {value: worker, enumerable: false});
  return result;
}

export function virtualResourceRoot(scope, {baseUrl = globalThis.location?.href ?? 'http://127.0.0.1/'} = {}) {
  const url = new URL(String(scope || '/'), baseUrl);
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  if (!url.pathname.endsWith('/__p2lrn__/')) url.pathname += '__p2lrn__/';
  url.pathname += 'v1/';
  return url.href;
}

export async function pingP2LRNServiceWorker({scope = DEFAULT_SERVICE_WORKER_SCOPE} = {}) {
  const container = globalThis.navigator?.serviceWorker;
  if (!container || !globalThis.location) return null;
  const scopeHref = normalizeScopeHref(scope);
  const registration = await exactRegistration(container, scopeHref);
  const worker = registration?.active ?? null;
  if (!worker) return null;

  const reply = await messageWorker(worker, {type: 'P2LRN_PING_V1'});
  return reply?.ok === true && reply.protocol === STATIC_BRIDGE_PROTOCOL
    ? withWorker(reply, worker)
    : null;
}

export async function installP2LRNServiceWorker({
  url = '/p2lrn-sw.js',
  scope = DEFAULT_SERVICE_WORKER_SCOPE,
} = {}) {
  const container = globalThis.navigator?.serviceWorker;
  if (!container || !globalThis.location || !['http:', 'https:'].includes(location.protocol)) {
    const error = new Error('Service Worker API is unavailable in this context.');
    error.code = 'P2LRN_SERVICE_WORKER_UNAVAILABLE';
    throw error;
  }
  const absolute = new URL(url, location.href);
  if (absolute.origin !== location.origin) {
    const error = new Error('P2LRN Service Worker must be same-origin.');
    error.code = 'P2LRN_SERVICE_WORKER_CROSS_ORIGIN';
    throw error;
  }

  const scopeHref = normalizeScopeHref(scope);
  const existing = await exactRegistration(container, scopeHref);
  if (existing?.active && existing.active.scriptURL !== absolute.href) {
    const error = new Error(`A different Service Worker already owns scope ${new URL(scopeHref).pathname}; P2LRN will not replace it automatically.`);
    error.code = 'P2LRN_SERVICE_WORKER_CONFLICT';
    throw error;
  }

  const registration = existing ?? await container.register(absolute.href, {scope: scopeHref, type: 'module'});
  let worker = registration.active ?? registration.installing ?? registration.waiting;
  if (worker && worker.state !== 'activated') {
    await new Promise((resolve) => {
      const done = () => {
        if (worker.state === 'activated' || worker.state === 'redundant') {
          worker.removeEventListener('statechange', done);
          resolve();
        }
      };
      worker.addEventListener('statechange', done);
      done();
    });
  }
  worker = registration.active ?? worker;
  const reply = await messageWorker(worker, {type:'P2LRN_PING_V1'});
  if (!reply?.ok || reply.protocol !== STATIC_BRIDGE_PROTOCOL) {
    const error = new Error('P2LRN Service Worker installed but did not answer the P2LRN protocol handshake.');
    error.code = 'P2LRN_SERVICE_WORKER_NOT_READY';
    throw error;
  }
  return withWorker(reply, worker);
}

async function resourceConfig(pkg, embeddedPath) {
  const payload = pkg.payload(embeddedPath);
  if (!payload.archiveEntry) return null;
  return {
    embeddedPath: payload.path,
    mediaType: payload.mediaType,
    size: payload.size,
    byteDigest: payload.byteDigest,
    archiveEntry: payload.archiveEntry,
    rangeIntegrity: await payload.rangeIntegrity(),
  };
}

function findRepresentation(pkg, representationId) {
  for (const entity of pkg.graph.entities ?? []) {
    if (entity.type !== 'resource') continue;
    const rep = (entity.representations ?? []).find((item) => item.id === representationId);
    if (rep) return rep;
  }
  return null;
}

export class StaticResourceBridge {
  constructor(pkg) {
    this.pkg = pkg;
    this.ping = null;
    this.routeCapabilities = new Map();
  }

  async available() {
    if (!this.pkg?.sourceUrl || !globalThis.location) return false;
    const source = new URL(this.pkg.sourceUrl, location.href);
    if (source.origin !== location.origin) return false;
    this.ping = await pingP2LRNServiceWorker();
    return Boolean(this.ping);
  }

  async registerRoute(label, resources) {
    if (!this.ping && !(await this.available())) return null;
    const sourceUrl = new URL(this.pkg.sourceUrl, location.href).href;
    const routeId = (await sha256Hex(`${sourceUrl}\n${this.pkg.manifest.integrity.contentRoot}\n${label}`)).slice(0, 48);
    let capability = this.routeCapabilities.get(routeId);
    if (!capability) {
      capability = randomCapability();
      this.routeCapabilities.set(routeId, capability);
    }
    const config = {version: '2', routeId, capability, sourceUrl, contentRoot: this.pkg.manifest.integrity.contentRoot, resources};
    const worker = this.ping?.worker ?? null;
    if (!worker) return null;
    const reply = await messageWorker(worker, {type: 'P2LRN_REGISTER_V1', config});
    if (!reply?.ok || reply.protocol !== STATIC_BRIDGE_PROTOCOL || reply.routeId !== routeId || reply.capability !== capability) return null;
    this.ping = withWorker(reply, worker);
    return {routeId, capability, scope: reply.scope};
  }

  async resolve(request, context = {}) {
    if (!(await this.available())) return null;
    if (request.kind === 'embedded' && request.path) {
      const resource = await resourceConfig(this.pkg, request.path);
      if (!resource) return null;
      const seekable = resource.archiveEntry.method === 0 && Boolean(resource.rangeIntegrity);
      if (request.requireSeekable && !seekable) return null;
      const route = await this.registerRoute(`embedded:${request.path}`, {asset: resource});
      if (!route) return null;
      const root = virtualResourceRoot(route.scope);
      return {url: new URL(`${route.routeId}/${route.capability}/asset`, root).href, verified: true, seekable};
    }
    if (request.kind === 'web-base') {
      const rep = findRepresentation(this.pkg, context.representationId ?? request.representationId);
      if (!rep) return null;
      const mapping = webContentMapping(rep, new Set(this.pkg.manifest.files.map((item) => item.path)));
      if (!mapping) return null;
      const resources = {};
      for (const [logical, embedded] of Object.entries(mapping.assets)) {
        const config = await resourceConfig(this.pkg, embedded);
        if (!config) return null;
        resources[logical] = config;
      }
      const route = await this.registerRoute(`web:${rep.id}`, resources);
      if (!route) return null;
      const directory = request.logicalDirectory ?? webEntrypointDirectory(mapping);
      const suffix = encodeLogical(directory);
      const root = virtualResourceRoot(route.scope);
      const base = new URL(`${route.routeId}/${route.capability}/${suffix}`, root).href;
      return {url: base.endsWith('/') ? base : `${base}/`, verified: true, seekable: false};
    }
    return null;
  }
}

export function createStaticResourceBridge(pkg) { return new StaticResourceBridge(pkg); }
