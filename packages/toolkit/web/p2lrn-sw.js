/* P2LRN static virtual-resource Service Worker v1.
 *
 * This file is intentionally standalone so a static host can serve/copy it at
 * the root (for example /p2lrn-sw.js) without bundling the whole player into
 * the service worker. The page registers verified package metadata through a
 * MessageChannel; byte ranges are authenticated against the per-chunk map
 * emitted by P2LRN Creator Alpha 10.
 */

export const P2LRN_SW_PROTOCOL = 'p2lrn-static-bridge/1';
export const VIRTUAL_MARKER = '/__p2lrn__/v1/';
export const LEGACY_VIRTUAL_MARKER = '/__p2rln__/v1/';
export const REGISTRY_CACHE = 'p2lrn-static-bridge-registry-v1';
export const LEGACY_REGISTRY_CACHE = 'p2rln-static-bridge-registry-v1';
export const MAX_BUFFERED_RESOURCE = 64 * 1024 * 1024;
export const MAX_ROUTE_RESOURCES = 4096;
export const MAX_ROUTE_CHUNK_DIGESTS = 262144;

const LOCAL_SIGNATURE = 0x04034b50;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const textDecoder = new TextDecoder('utf-8', {fatal: true});
const memoryRoutes = new Map();
const resolvedOffsets = new Map();

function u16(view, offset) { return view.getUint16(offset, true); }
function u32(view, offset) { return view.getUint32(offset, true); }

export function parseVirtualRange(value, size) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(text);
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size < 0) return {invalid: true};
  if (size === 0) return {invalid: true};
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return {invalid: true};
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    if (!Number.isSafeInteger(start) || start < 0 || start >= size) return {invalid: true};
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(end) || end < start) return {invalid: true};
    end = Math.min(end, size - 1);
  }
  return {start, end};
}

async function sha256(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function virtualEtag(resource) {
  return `"p2lrn-${String(resource.byteDigest).slice('sha256:'.length)}"`;
}

function contentHeaders(resource, {length = resource.size, range = null, seekable = false} = {}) {
  const headers = new Headers({
    'Content-Type': resource.mediaType || 'application/octet-stream',
    'Content-Length': String(length),
    'ETag': virtualEtag(resource),
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  if (seekable) headers.set('Accept-Ranges', 'bytes');
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${resource.size}`);
  return headers;
}

function validateDigest(value, label) {
  if (!DIGEST_RE.test(String(value ?? ''))) throw new Error(`${label} must be sha256:<64 lowercase hex>.`);
}

function safeVirtualPath(value, label) {
  const path = String(value ?? '');
  if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/')) {
    throw new Error(`Invalid ${label}: ${path}`);
  }
  const parts = path.split('/');
  if (parts.length > 32 || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid ${label}: ${path}`);
  }
  if (/^[A-Za-z]:/u.test(parts[0] ?? '')) throw new Error(`Invalid ${label}: ${path}`);
  return path;
}

export function validateRouteConfig(config, expectedOrigin = null) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || config.version !== '1') throw new Error('Invalid P2LRN static route config.');
  if (!/^[a-f0-9]{32,64}$/.test(String(config.routeId ?? ''))) throw new Error('Invalid P2LRN static route id.');
  const source = new URL(config.sourceUrl);
  if (!['http:', 'https:'].includes(source.protocol)) throw new Error('P2LRN static bridge source must be HTTP(S).');
  const localHttp = source.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(source.hostname);
  if (source.protocol === 'http:' && !localHttp) throw new Error('P2LRN static bridge requires HTTPS outside local development.');
  if (expectedOrigin && source.origin !== expectedOrigin) throw new Error('P2LRN static bridge only accepts same-origin package sources.');
  validateDigest(config.contentRoot, 'contentRoot');
  if (!config.resources || typeof config.resources !== 'object' || Array.isArray(config.resources) || !Object.keys(config.resources).length) throw new Error('P2LRN static route requires resources.');
  const resourceEntries = Object.entries(config.resources);
  if (resourceEntries.length > MAX_ROUTE_RESOURCES) throw new Error(`P2LRN static route has too many resources (${resourceEntries.length} > ${MAX_ROUTE_RESOURCES}).`);
  const resources = {};
  let totalChunkDigests = 0;
  for (const [logical, raw] of resourceEntries) {
    safeVirtualPath(logical, 'P2LRN virtual logical path');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid P2LRN virtual resource: ${logical}`);
    validateDigest(raw.byteDigest, `byteDigest ${logical}`);
    if (!Number.isSafeInteger(raw.size) || raw.size < 0) throw new Error(`Invalid P2LRN virtual size: ${logical}`);
    const embeddedPath = safeVirtualPath(raw.embeddedPath, `embedded path ${logical}`);
    const entry = raw.archiveEntry;
    if (!entry || !Number.isSafeInteger(entry.localOffset) || entry.localOffset < 0 || ![0, 8].includes(entry.method) || !Number.isSafeInteger(entry.compressedSize) || entry.compressedSize < 0 || entry.uncompressedSize !== raw.size) throw new Error(`Invalid ZIP entry metadata: ${logical}`);
    let rangeIntegrity = null;
    if (raw.rangeIntegrity != null) {
      const ri = raw.rangeIntegrity;
      if (!ri || !Number.isSafeInteger(ri.chunkSize) || ri.chunkSize < 65536 || ri.chunkSize > 8388608 || ri.size !== raw.size || ri.byteDigest !== raw.byteDigest || !Array.isArray(ri.chunks)) throw new Error(`Invalid range-integrity metadata: ${logical}`);
      const expected = raw.size ? Math.ceil(raw.size / ri.chunkSize) : 0;
      if (ri.chunks.length !== expected) throw new Error(`Invalid range-integrity chunk count: ${logical}`);
      totalChunkDigests += ri.chunks.length;
      if (totalChunkDigests > MAX_ROUTE_CHUNK_DIGESTS) throw new Error(`P2LRN static route has too many range-integrity chunk digests (> ${MAX_ROUTE_CHUNK_DIGESTS}).`);
      for (const chunk of ri.chunks) validateDigest(chunk, `chunk digest ${logical}`);
      if (entry.method !== 0) throw new Error(`Chunk-ranged resource must be ZIP_STORED: ${logical}`);
      rangeIntegrity = {chunkSize: ri.chunkSize, size: ri.size, byteDigest: ri.byteDigest, chunks: [...ri.chunks]};
    }
    resources[logical] = {
      embeddedPath,
      mediaType: raw.mediaType || 'application/octet-stream',
      size: raw.size,
      byteDigest: raw.byteDigest,
      archiveEntry: {...entry},
      rangeIntegrity,
    };
  }
  return {version: '1', routeId: config.routeId, sourceUrl: source.href, contentRoot: config.contentRoot, resources};
}

function registryKey(routeId, origin = globalThis.location?.origin ?? 'https://p2lrn.invalid') {
  return `${origin}/__p2lrn_registry__/v1/${routeId}`;
}
function legacyRegistryKey(routeId, origin = globalThis.location?.origin ?? 'https://p2rln.invalid') {
  return `${origin}/__p2rln_registry__/v1/${routeId}`;
}


export async function persistRouteConfig(config) {
  const normalized = validateRouteConfig(config, globalThis.location?.origin ?? null);
  memoryRoutes.set(normalized.routeId, normalized);
  if (globalThis.caches) {
    const cache = await caches.open(REGISTRY_CACHE);
    await cache.put(registryKey(normalized.routeId), new Response(JSON.stringify(normalized), {headers: {'Content-Type': 'application/json'}}));
  }
  return normalized;
}

export async function loadRouteConfig(routeId) {
  if (memoryRoutes.has(routeId)) return memoryRoutes.get(routeId);
  if (!globalThis.caches) return null;
  const cache = await caches.open(REGISTRY_CACHE);
  let response = await cache.match(registryKey(routeId));
  if (!response) {
    const legacyCache = await caches.open(LEGACY_REGISTRY_CACHE);
    response = await legacyCache.match(legacyRegistryKey(routeId));
  }
  if (!response) return null;
  const normalized = validateRouteConfig(await response.json(), globalThis.location?.origin ?? null);
  memoryRoutes.set(routeId, normalized);
  return normalized;
}

async function fetchExactRange(url, start, end, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {'Range': `bytes=${start}-${end}`},
    cache: 'no-store',
  });
  if (response.status !== 206) throw new Error(`Outer package stopped honoring HTTP Range (${response.status}).`);
  const contentRange = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/.exec(response.headers.get('Content-Range') ?? '');
  if (!contentRange || Number(contentRange[1]) !== start || Number(contentRange[2]) !== end) throw new Error('Outer package returned an inconsistent Content-Range.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== end - start + 1) throw new Error('Outer package returned a truncated byte range.');
  return bytes;
}

async function resolveDataStart(route, logical, resource, fetchImpl) {
  const cacheKey = `${route.routeId}\0${logical}`;
  if (resolvedOffsets.has(cacheKey)) return resolvedOffsets.get(cacheKey);
  const offset = resource.archiveEntry.localOffset;
  const header = await fetchExactRange(route.sourceUrl, offset, offset + 29, fetchImpl);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (u32(view, 0) !== LOCAL_SIGNATURE) throw new Error(`Invalid local ZIP header: ${resource.embeddedPath}`);
  const flags = u16(view, 6);
  const method = u16(view, 8);
  const nameLength = u16(view, 26);
  const extraLength = u16(view, 28);
  if (flags & 0x1) throw new Error(`Encrypted ZIP member is not allowed: ${resource.embeddedPath}`);
  if (method !== resource.archiveEntry.method) throw new Error(`ZIP method mismatch: ${resource.embeddedPath}`);
  if (nameLength) {
    const nameBytes = await fetchExactRange(route.sourceUrl, offset + 30, offset + 30 + nameLength - 1, fetchImpl);
    const localName = textDecoder.decode(nameBytes);
    if (localName !== resource.embeddedPath) throw new Error(`Local/central ZIP name mismatch: ${resource.embeddedPath}`);
  }
  const start = offset + 30 + nameLength + extraLength;
  resolvedOffsets.set(cacheKey, start);
  return start;
}

function chunkVerifiedStream(route, logical, resource, start, end, fetchImpl) {
  const integrity = resource.rangeIntegrity;
  const chunkSize = integrity.chunkSize;
  const first = Math.floor(start / chunkSize);
  const last = Math.floor(end / chunkSize);
  let chunkIndex = first;
  return new ReadableStream({
    async pull(controller) {
      if (chunkIndex > last) { controller.close(); return; }
      try {
        const dataStart = await resolveDataStart(route, logical, resource, fetchImpl);
        const chunkStart = chunkIndex * chunkSize;
        const chunkEnd = Math.min(resource.size - 1, chunkStart + chunkSize - 1);
        const bytes = await fetchExactRange(route.sourceUrl, dataStart + chunkStart, dataStart + chunkEnd, fetchImpl);
        const actual = await sha256(bytes);
        if (actual !== integrity.chunks[chunkIndex]) throw new Error(`P2LRN chunk integrity mismatch: ${resource.embeddedPath}#${chunkIndex}`);
        const from = Math.max(start, chunkStart) - chunkStart;
        const to = Math.min(end, chunkEnd) - chunkStart + 1;
        controller.enqueue(bytes.slice(from, to));
        chunkIndex += 1;
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function fullVerifiedBytes(route, logical, resource, fetchImpl) {
  if (resource.size > MAX_BUFFERED_RESOURCE) throw new Error('Virtual resource requires chunk integrity for bounded static delivery.');
  const dataStart = await resolveDataStart(route, logical, resource, fetchImpl);
  let bytes;
  if (resource.archiveEntry.compressedSize === 0) {
    bytes = new Uint8Array();
  } else {
    const compressed = await fetchExactRange(route.sourceUrl, dataStart, dataStart + resource.archiveEntry.compressedSize - 1, fetchImpl);
    if (resource.archiveEntry.method === 0) bytes = compressed;
    else {
      let inflater;
      try { inflater = new DecompressionStream('deflate-raw'); }
      catch { throw new Error('Static bridge cannot decompress deflate-raw in this browser.'); }
      bytes = new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(inflater)).arrayBuffer());
    }
  }
  if (bytes.byteLength !== resource.size) throw new Error(`P2LRN virtual size mismatch: ${resource.embeddedPath}`);
  if (await sha256(bytes) !== resource.byteDigest) throw new Error(`P2LRN virtual byteDigest mismatch: ${resource.embeddedPath}`);
  return bytes;
}

export async function serveVirtualResource(routeInput, logical, request, {fetchImpl = fetch} = {}) {
  const route = validateRouteConfig(routeInput, null);
  const resource = route.resources[logical];
  if (!resource) return new Response('P2LRN virtual resource not found', {status: 404});
  const method = String(request.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) return new Response('Method not allowed', {status: 405, headers: {'Allow': 'GET, HEAD'}});
  const etag = virtualEtag(resource);
  if (resource.size === 0) {
    const headers = contentHeaders(resource, {length: 0, seekable: false});
    return new Response(method === 'HEAD' ? null : new Uint8Array(), {status: 200, headers});
  }
  const requestedRange = request.headers.get('Range');
  const ifRange = request.headers.get('If-Range');
  const canSeek = resource.archiveEntry.method === 0 && Boolean(resource.rangeIntegrity);
  const honorRange = Boolean(requestedRange && canSeek && (!ifRange || ifRange === etag));
  if (honorRange) {
    const selected = parseVirtualRange(requestedRange, resource.size);
    if (!selected || selected.invalid) {
      return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${resource.size}`, 'Accept-Ranges': 'bytes', 'ETag': etag}});
    }
    const headers = contentHeaders(resource, {length: selected.end - selected.start + 1, range: selected, seekable: true});
    if (method === 'HEAD') return new Response(null, {status: 206, headers});
    return new Response(chunkVerifiedStream(route, logical, resource, selected.start, selected.end, fetchImpl), {status: 206, headers});
  }
  if (canSeek) {
    const headers = contentHeaders(resource, {seekable: true});
    if (method === 'HEAD') return new Response(null, {status: 200, headers});
    return new Response(chunkVerifiedStream(route, logical, resource, 0, Math.max(0, resource.size - 1), fetchImpl), {status: 200, headers});
  }
  const bytes = method === 'HEAD' ? null : await fullVerifiedBytes(route, logical, resource, fetchImpl);
  const headers = contentHeaders(resource, {seekable: false});
  return new Response(bytes, {status: 200, headers});
}

export function extractVirtualTarget(url) {
  const parsed = new URL(url);
  let marker = VIRTUAL_MARKER;
  let index = parsed.pathname.indexOf(marker);
  if (index < 0) { marker = LEGACY_VIRTUAL_MARKER; index = parsed.pathname.indexOf(marker); }
  if (index < 0) return null;
  const tail = parsed.pathname.slice(index + marker.length);
  const parts = tail.split('/');
  const routeId = parts.shift() || '';
  if (!/^[a-f0-9]{32,64}$/.test(routeId) || !parts.length) return null;
  let logical;
  try { logical = parts.map((part) => decodeURIComponent(part)).join('/'); }
  catch { return null; }
  return {routeId, logical};
}

async function handleServiceWorkerFetch(request) {
  const target = extractVirtualTarget(request.url);
  if (!target) return null;
  const route = await loadRouteConfig(target.routeId);
  if (!route) return new Response('P2LRN virtual route expired', {status: 404});
  try { return await serveVirtualResource(route, target.logical, request); }
  catch (error) { return new Response(`P2LRN virtual resource error: ${error?.message ?? error}`, {status: 502}); }
}

const sw = globalThis.self;
if (sw?.addEventListener && sw?.registration) {
  sw.addEventListener('install', (event) => event.waitUntil(sw.skipWaiting()));
  sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));
  sw.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'P2LRN_PING_V1') {
      event.ports?.[0]?.postMessage({ok: true, protocol: P2LRN_SW_PROTOCOL, scope: sw.registration.scope});
      return;
    }
    if (data.type === 'P2LRN_REGISTER_V1') {
      event.waitUntil((async () => {
        try {
          const route = await persistRouteConfig(data.config);
          event.ports?.[0]?.postMessage({ok: true, protocol: P2LRN_SW_PROTOCOL, routeId: route.routeId, scope: sw.registration.scope});
        } catch (error) {
          event.ports?.[0]?.postMessage({ok: false, error: error?.message ?? String(error)});
        }
      })());
    }
  });
  sw.addEventListener('fetch', (event) => {
    if (!extractVirtualTarget(event.request.url)) return;
    event.respondWith(handleServiceWorkerFetch(event.request));
  });
}
