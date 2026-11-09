import {renderCourseRights} from './course-rights.js';
import {playerUiText} from './renderers/ui-i18n.js';
import {createResultRecorder} from './result-recorder.js';
import {createDefaultDependencyRegistry} from './dependency-registry.js';
import {RendererRegistry} from './renderer-registry.js';
import {negotiateP2LRNExecution,inspectP2LRNPackageExecution,P2LRN_EXECUTION_PLAN_SCHEMA,P2LRN_EXECUTION_PLAN_VERSION} from './execution-negotiation.js';
import {registerBuiltInRenderers} from './built-in-renderers.js';
import {createDefaultComponentRegistry} from './component-registry.js';
import {dispatchRuntimeEvent} from './runtime-events.js';
import {createHostAdapter, normalizeHostAdapter} from './host-adapter.js';
import {createCapabilityBroker, createToolCapabilityProvider, createMcpCapabilityProvider, normalizeCapabilityBroker, capabilityRequirements, mergeCapabilityRequirements, capabilityOperationAllowed, projectCapabilityContext, validateCapabilityGraph, HOST_CAPABILITY_EXTENSION} from './capability-broker.js';
import {createOfflineHostAdapter, createMemoryOfflineStore, createIndexedDbOfflineStore, createOfflineSyncController, DEFAULT_OFFLINE_DB_NAME} from './offline-host-adapter.js';
import {createActivityTracker, DEFAULT_ACTIVITY_IDLE_AFTER_MS} from './activity-tracker.js';
import {createLearningEvent, createLearningEventStream, observeLearningEvents, learningEventCategory, LEARNING_EVENT_SCHEMA, LEARNING_EVENT_MODEL_VERSION} from './learning-events.js';
import {createMemoryResourceLibrary, createCacheStorageResourceLibrary, createResourceLibraryResolver, createResourceLibraryCapabilityProvider, RESOURCE_LIBRARY_CAPABILITY_ID, DEFAULT_RESOURCE_LIBRARY_CACHE} from './resource-library.js';
import {createMemoryCollaborationHub, COLLABORATION_CAPABILITY, COLLABORATION_OPERATIONS} from './collaboration-provider.js';
import {createHttpCollaborationProvider, COLLABORATION_HTTP_VERSION, COLLABORATION_HTTP_MEDIA_TYPE} from './collaboration-http-provider.js';
import {createMemorySharedResourceStore} from './shared-resource-store.js';
import {BufferZipArchive, openRemoteZipArchive, readResponseBounded, safeZipPath} from './zip-source.js';
import {createMemoryPackageCache, createCacheStoragePackageCache, createPackageCacheFetch, normalizePackageCache, DEFAULT_PACKAGE_CACHE_NAME} from './package-cache.js';
import {Sha256State, verifiedBinaryBlob, verifiedBinaryStream} from './stream-integrity.js';
import {WEB_CONTENT_PROFILE, webContentMapping} from './web-content-core.js';
import {rangeIntegrityPointer, validateRangeIntegrityIndex, RANGE_INTEGRITY_MEDIA_TYPE} from './range-integrity-core.js';
import {createStaticResourceBridge, installP2LRNServiceWorker} from './static-resource-bridge.js';
import {representationPayload} from './package-member.js';
import {configureRuntimeHost, getRuntimeHostConfig} from './runtime-host-config.js';
import {canonicalIdentifier, canonicalizeIdentifiers, identifierIs, parseP2LRNUntrustedJson} from './identifiers.js';
import {PROGRESSION_PROFILE, createProgressionModel, normalizeProgressionState, progressionContext, progressionEnabled, progressionRule, updateProgressionState, validateProgressionGraph} from './progression-core.js';

export const P2LRN_WEB_SDK_VERSION = '0.5.0-alpha.12';
export const P2LRN_TOOLKIT_VERSION = '0.5.0-alpha.12';
export const P2LRN_CORE_VERSION = '0.4.0';

export const DEFAULT_LIMITS = Object.freeze({
  packageBytes: 256 * 1024 * 1024,
  streamedPackageBytes: 64 * 1024 * 1024 * 1024,
  entries: 5000,
  entryBytes: 16 * 1024 * 1024 * 1024,
  bufferedEntryBytes: 256 * 1024 * 1024,
  totalUncompressedBytes: 128 * 1024 * 1024 * 1024,
  centralDirectoryBytes: 64 * 1024 * 1024,
  compressionRatio: 250,
});
const ROLE_SCORE = {primary: 40, rendered: 35, accessible: 34, fallback: 20, source: 10, 'original-package': 5};
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_GRAPH_BYTES = 32 * 1024 * 1024;
const MAX_ENTRYPOINTS = 1024;
const MAX_PROFILES = 256;
const MAX_MANIFEST_FILES = 5000;
const MAX_GRAPH_ENTITIES = 50000;
const MAX_GRAPH_RELATIONS = 100000;
const textDecoder = new TextDecoder('utf-8', {fatal: true});
const textEncoder = new TextEncoder();

const playerStyleUrl = new URL('./p2lrn-player.css', import.meta.url);
// Preserve the generated runtime revision for styles, not just ES modules.
playerStyleUrl.search = new URL(import.meta.url).search;
const PLAYER_STYLESHEET = playerStyleUrl.href;
const NATIVE_COMPOSITE_ACTIVITY_TYPE = 'https://p2lrn.org/type/composite';
const NATIVE_COMPOSITE_PROFILE = 'https://p2lrn.org/profile/native-composite';
const NATIVE_COMPOSITE_MEDIA_TYPE = 'application/vnd.p2lrn.composite+json';
const NATIVE_COMPONENT_ACTIVITY_TYPE = 'https://p2lrn.org/type/component';
const NATIVE_COMPONENT_PROFILE = 'https://p2lrn.org/profile/native-component';
const NATIVE_COMPONENT_MEDIA_TYPE = 'application/vnd.p2lrn.component+json';

export const defaultDependencyRegistry = createDefaultDependencyRegistry();
export const defaultRendererRegistry = registerBuiltInRenderers(new RendererRegistry({dependencies: defaultDependencyRegistry}));
export const defaultComponentRegistry = createDefaultComponentRegistry();

function decodeJson(bytes, label) {
  let text;
  try { text = textDecoder.decode(bytes); }
  catch { throw new Error(`${label} is not valid UTF-8.`); }
  try { return parseP2LRNUntrustedJson(text); }
  catch (error) { throw new Error(`${label} is not valid or contains unsafe JSON keys: ${error.message}`); }
}

function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite JSON number.');
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error('JSON integer exceeds interoperable safe range.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new Error('Unsupported JSON value for canonicalization.');
}

async function digest(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    const hash = new Uint8Array(await subtle.digest('SHA-256', input));
    return `sha256:${[...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  return new Sha256State().update(input).digestString();
}

async function contentDigest(bytes, mediaType, label) {
  const base = String(mediaType || '').split(';', 1)[0].trim().toLowerCase();
  if (base === 'application/json' || base.endsWith('+json')) {
    const object = decodeJson(bytes, label);
    return digest(textEncoder.encode(canonicalize(object)));
  }
  return digest(bytes);
}

function normalizedIntegrityInput(manifest) {
  const entrypoints = manifest.entrypoints.map(({id, type, role}) => ({id, type, role})).sort((a, b) => compareTuples(a, b, ['role', 'type', 'id']));
  const profiles = manifest.profiles.map(({id, version, requirement}) => ({id, version, requirement})).sort((a, b) => compareTuples(a, b, ['id', 'version', 'requirement']));
  const files = manifest.files.map(({path, mediaType, contentDigest: cd}) => ({path, mediaType, contentDigest: cd})).sort((a, b) => compareStrings(a.path, b.path));
  const g = manifest.graph;
  return {
    format: manifest.format,
    formatVersion: manifest.formatVersion,
    entrypoints,
    graph: {schema: g.schema, mediaType: g.mediaType, contentDigest: g.contentDigest},
    profiles,
    files,
  };
}

function ensureManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Manifest must be an object.');
  if (!['P2LRN', 'P2RLN'].includes(manifest.format) || manifest.formatVersion !== '0.4.0') throw new Error('Only P2LRN Core 0.4.0 packages (including legacy P2RLN Alpha15) are supported by this player.');
  if (manifest.graph?.path !== 'content/graph.json') throw new Error('Core 0.4.0 requires content/graph.json.');
  if (!Array.isArray(manifest.entrypoints) || manifest.entrypoints.length < 1) throw new Error('Manifest has no entrypoint.');
  if (manifest.entrypoints.length > MAX_ENTRYPOINTS) throw new Error(`Manifest has too many entrypoints (${manifest.entrypoints.length} > ${MAX_ENTRYPOINTS}).`);
  if (!Array.isArray(manifest.profiles) || !Array.isArray(manifest.files)) throw new Error('Manifest profile/file inventory is invalid.');
  if (manifest.profiles.length > MAX_PROFILES) throw new Error(`Manifest has too many profiles (${manifest.profiles.length} > ${MAX_PROFILES}).`);
  if (manifest.files.length > MAX_MANIFEST_FILES) throw new Error(`Manifest has too many files (${manifest.files.length} > ${MAX_MANIFEST_FILES}).`);
  if (!manifest.integrity?.contentRoot?.startsWith('sha256:')) throw new Error('Manifest has no valid contentRoot.');
}

function ensureGraphShape(graph, manifest) {
  if (!graph || graph.graphVersion !== '0.4.0' || !Array.isArray(graph.entities) || !Array.isArray(graph.relations)) throw new Error('Invalid P2LRN graph structure.');
  if (graph.entities.length > MAX_GRAPH_ENTITIES) throw new Error(`P2LRN graph has too many entities (${graph.entities.length} > ${MAX_GRAPH_ENTITIES}).`);
  if (graph.relations.length > MAX_GRAPH_RELATIONS) throw new Error(`P2LRN graph has too many relations (${graph.relations.length} > ${MAX_GRAPH_RELATIONS}).`);
  const ids = new Map();
  for (const entity of graph.entities) {
    if (!entity?.id || !entity?.type || ids.has(entity.id)) throw new Error(`Invalid or duplicate graph entity id: ${entity?.id}`);
    ids.set(entity.id, entity);
  }
  for (const entity of graph.entities) {
    const children = Array.isArray(entity.children) ? entity.children : [];
    if (new Set(children).size !== children.length) throw new Error(`Duplicate child reference in entity: ${entity.id}`);
    for (const child of children) if (!ids.has(child)) throw new Error(`Broken child reference: ${child}`);
    if (entity.resource && ids.get(entity.resource)?.type !== 'resource') throw new Error(`Broken resource reference: ${entity.resource}`);
    for (const resource of entity.resources ?? []) if (ids.get(resource)?.type !== 'resource') throw new Error(`Broken resource reference: ${resource}`);

    if (entity.type === 'activity' && entity.activityType === NATIVE_COMPOSITE_ACTIVITY_TYPE) {
      if (!children.length) throw new Error(`Native composite activity has no children: ${entity.id}`);
      for (const child of children) if (ids.get(child)?.type !== 'activity') throw new Error(`Native composite child is not an Activity: ${child}`);
      const resource = ids.get(entity.resource);
      const representations = Array.isArray(resource?.representations) ? resource.representations : [];
      const compositeRep = representations.find((rep) =>
        rep?.profile === NATIVE_COMPOSITE_PROFILE &&
        rep?.mediaType === NATIVE_COMPOSITE_MEDIA_TYPE &&
        rep?.location?.type === 'embedded'
      );
      if (!compositeRep) throw new Error(`Native composite activity has no embedded composite representation: ${entity.id}`);
    }
    if (entity.type === 'activity' && entity.activityType === NATIVE_COMPONENT_ACTIVITY_TYPE) {
      const resource = ids.get(entity.resource);
      const representations = Array.isArray(resource?.representations) ? resource.representations : [];
      const componentRep = representations.find((rep) =>
        rep?.profile === NATIVE_COMPONENT_PROFILE &&
        String(rep?.mediaType ?? '').split(';', 1)[0].trim().toLowerCase() === NATIVE_COMPONENT_MEDIA_TYPE &&
        rep?.location?.type === 'embedded'
      );
      if (!componentRep) throw new Error(`Native component activity has no embedded component representation: ${entity.id}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const walk = (id) => {
    if (visiting.has(id)) throw new Error(`Hierarchy cycle detected at entity: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const entity = ids.get(id);
    for (const child of entity?.children ?? []) walk(child);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids.keys()) walk(id);

  for (const ep of manifest.entrypoints) if (ids.get(ep.id)?.type !== ep.type) throw new Error(`Broken entrypoint: ${ep.id}`);
  validateProgressionGraph(graph, manifest);
  validateCapabilityGraph(graph);
  return ids;
}

function normalizeLimits(limits = DEFAULT_LIMITS) {
  return Object.freeze({...DEFAULT_LIMITS, ...(limits ?? {})});
}

async function verifyDescriptorBytes(bytes, descriptor) {
  if (bytes.byteLength !== descriptor.size) throw new Error(`Manifest size mismatch: ${descriptor.path}`);
  if (await digest(bytes) !== descriptor.byteDigest) throw new Error(`byteDigest mismatch: ${descriptor.path}`);
  if (await contentDigest(bytes, descriptor.mediaType, descriptor.path) !== descriptor.contentDigest) throw new Error(`contentDigest mismatch: ${descriptor.path}`);
  return bytes;
}

function isCanonicalJson(mediaType) {
  const base = String(mediaType ?? '').split(';', 1)[0].trim().toLowerCase();
  return base === 'application/json' || base.endsWith('+json');
}

async function openP2LRNArchive(rawZip, {eagerPayloadVerification = false, sourceUrl = null} = {}) {
  if (!rawZip.entries.has('META-INF/manifest.json')) throw new Error('P2LRN manifest is missing.');
  const manifestEntry = rawZip.entries.get('META-INF/manifest.json');
  if (manifestEntry.uncompressedSize > MAX_MANIFEST_BYTES) throw new Error(`P2LRN manifest exceeds safety limit (${manifestEntry.uncompressedSize} > ${MAX_MANIFEST_BYTES} bytes).`);
  const manifestBytes = await rawZip.read('META-INF/manifest.json');
  const manifest = decodeJson(manifestBytes, 'manifest');
  ensureManifestShape(manifest);
  const descriptors = [manifest.graph, ...manifest.files];
  const descriptorByPath = new Map(descriptors.map((descriptor) => [descriptor.path, descriptor]));
  const declared = descriptors.map((descriptor) => descriptor.path);
  if (new Set(declared).size !== declared.length) throw new Error('Manifest declares duplicate paths.');
  const allowed = new Set(['META-INF/manifest.json', ...declared]);
  for (const name of rawZip.names()) if (!allowed.has(name)) throw new Error(`Uninventoried package payload: ${name}`);
  for (const descriptor of descriptors) {
    safeZipPath(descriptor.path);
    const entry = rawZip.entries.get(descriptor.path);
    if (!entry) throw new Error(`Manifest declares missing payload: ${descriptor.path}`);
    if (entry.uncompressedSize !== descriptor.size) throw new Error(`ZIP/manifest size mismatch: ${descriptor.path}`);
  }

  const expectedRoot = await digest(textEncoder.encode(canonicalize(normalizedIntegrityInput(manifest))));
  if (expectedRoot !== manifest.integrity.contentRoot) throw new Error('contentRoot mismatch.');

  const verifiedCache = new Map();
  const verifiedPaths = new Set();
  const hostVerifiedPaths = new Set();
  const readVerified = async (path) => {
    if (verifiedCache.has(path)) return verifiedCache.get(path).slice();
    const descriptor = descriptorByPath.get(path);
    const bytes = await rawZip.read(path);
    if (!descriptor) return bytes;
    await verifyDescriptorBytes(bytes, descriptor);
    verifiedPaths.add(path);
    if (bytes.byteLength <= 8 * 1024 * 1024) verifiedCache.set(path, bytes.slice());
    return bytes;
  };

  if (Number(manifest.graph?.size) > MAX_GRAPH_BYTES) throw new Error(`P2LRN graph exceeds safety limit (${manifest.graph.size} > ${MAX_GRAPH_BYTES} bytes).`);
  const graphBytes = await readVerified(manifest.graph.path);
  if (graphBytes.byteLength > MAX_GRAPH_BYTES) throw new Error(`P2LRN graph exceeds safety limit (${graphBytes.byteLength} > ${MAX_GRAPH_BYTES} bytes).`);
  const graph = canonicalizeIdentifiers(decodeJson(graphBytes, 'graph'));
  const entities = ensureGraphShape(graph, manifest);
  const declaredProfiles = new Set(manifest.profiles.map((profile) => canonicalIdentifier(profile.id)));
  const inventory = new Set(declared);
  for (const entity of graph.entities) {
    if (entity.type !== 'resource') continue;
    for (const rep of entity.representations ?? []) {
      if (rep.profile && !declaredProfiles.has(canonicalIdentifier(rep.profile))) throw new Error(`Representation profile is not declared: ${rep.profile}`);
      const location = rep.location ?? {};
      if (location.type === 'embedded' && !inventory.has(location.path)) throw new Error(`Embedded representation is not inventoried: ${location.path}`);
      if (rep.profile === WEB_CONTENT_PROFILE) webContentMapping(rep, inventory);
    }
  }

  const rangePointer = rangeIntegrityPointer(graph, inventory);
  let rangeIndexPromise = null;
  const loadRangeIntegrity = async () => {
    if (!rangePointer) return null;
    if (!rangeIndexPromise) {
      rangeIndexPromise = (async () => {
        const descriptor = descriptorByPath.get(rangePointer.indexPath);
        if (!descriptor) throw new Error('range-integrity index is not declared in manifest files.');
        const media = String(descriptor.mediaType ?? '').split(';', 1)[0].trim().toLowerCase();
        if (!identifierIs(media, RANGE_INTEGRITY_MEDIA_TYPE)) throw new Error('range-integrity index has the wrong media type.');
        const index = validateRangeIntegrityIndex(decodeJson(await readVerified(rangePointer.indexPath), 'range-integrity map'), inventory);
        for (const [path, entry] of Object.entries(index.entries)) {
          const target = descriptorByPath.get(path);
          const zipEntry = rawZip.entries.get(path);
          if (!target || target.size !== entry.size || target.byteDigest !== entry.byteDigest) throw new Error(`range-integrity target metadata mismatch: ${path}`);
          if (!zipEntry || zipEntry.method !== 0) throw new Error(`range-integrity target must be ZIP_STORED: ${path}`);
        }
        return index;
      })();
    }
    return rangeIndexPromise;
  };

  if (eagerPayloadVerification) {
    for (const descriptor of descriptors) await readVerified(descriptor.path);
  }

  const streamVerified = async (path) => {
    const descriptor = descriptorByPath.get(path);
    if (!descriptor || typeof rawZip.stream !== 'function' || isCanonicalJson(descriptor.mediaType)) {
      return new Blob([await readVerified(path)]).stream();
    }
    return verifiedBinaryStream(await rawZip.stream(path), descriptor, {
      label: path,
      onVerified: () => verifiedPaths.add(path),
    });
  };

  const payload = (path) => {
    const descriptor = descriptorByPath.get(path);
    if (!descriptor) throw new Error(`P2LRN payload is not inventoried: ${path}`);
    const entry = rawZip.entries.get(path);
    return Object.freeze({
      path,
      mediaType: descriptor.mediaType,
      size: descriptor.size,
      byteDigest: descriptor.byteDigest,
      contentDigest: descriptor.contentDigest,
      seekable: entry?.method === 0,
      compressionMethod: entry?.method ?? null,
      archiveEntry: entry ? Object.freeze({
        localOffset: entry.localOffset, method: entry.method, compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize, crc32: entry.crc,
      }) : null,
      rangeIntegrity: async () => {
        const index = await loadRangeIntegrity();
        return index?.entries?.[path] ? Object.freeze({chunkSize: index.chunkSize, ...index.entries[path]}) : null;
      },
      rangeDescriptor: async () => {
        if (typeof rawZip.entryRange !== 'function') return null;
        return rawZip.entryRange(path);
      },
      read: () => readVerified(path),
      stream: () => streamVerified(path),
      blob: async (type = descriptor.mediaType) => {
        if (typeof rawZip.stream === 'function' && !isCanonicalJson(descriptor.mediaType)) {
          const blob = await verifiedBinaryBlob(await rawZip.stream(path), descriptor, {type, label: path});
          verifiedPaths.add(path);
          return blob;
        }
        return new Blob([await readVerified(path)], {type: type || 'application/octet-stream'});
      },
    });
  };

  const zip = Object.freeze({
    entries: rawZip.entries,
    transport: rawZip.transport,
    zip64: Boolean(rawZip.zip64),
    names: () => rawZip.names(),
    read: readVerified,
    stream: streamVerified,
  });

  return {
    zip,
    manifest,
    graph,
    entities,
    payload,
    sourceUrl,
    rangeIntegrity: loadRangeIntegrity,
    verification: Object.freeze({
      mode: eagerPayloadVerification ? 'eager' : 'lazy',
      transport: rawZip.transport,
      zip64: Boolean(rawZip.zip64),
      archiveBytes: rawZip.totalSize ?? rawZip.buffer?.byteLength ?? null,
      verifiedPaths,
      hostVerifiedPaths,
    }),
  };
}

export async function openP2LRNPackageBytes(buffer, limits = DEFAULT_LIMITS) {
  if (!(buffer instanceof ArrayBuffer)) throw new Error('Package bytes must be an ArrayBuffer.');
  const effectiveLimits = normalizeLimits(limits);
  if (buffer.byteLength > effectiveLimits.packageBytes) throw new Error(`P2LRN package exceeds full-buffer limit (${buffer.byteLength} bytes).`);
  const zip = await BufferZipArchive.open(buffer, effectiveLimits);
  return openP2LRNArchive(zip, {eagerPayloadVerification: true});
}

export async function openP2LRNPackageURL(url, options = {}) {
  const limits = normalizeLimits(options.limits ?? DEFAULT_LIMITS);
  const packageCache = normalizePackageCache(options.packageCache ?? null);
  const cacheOnly = options.cacheMode === 'cache-only';
  const fetchImpl = packageCache ? createPackageCacheFetch({
    store:packageCache,
    networkFetch:cacheOnly ? null : (options.fetchImpl ?? globalThis.fetch),
    networkFirst:!cacheOnly,
  }) : options.fetchImpl;
  const zip = await openRemoteZipArchive(url, limits, {
    fetchImpl,
    fetchOptions: options.fetchOptions,
  });
  const eager = zip.transport !== 'range';
  return openP2LRNArchive(zip, {eagerPayloadVerification: eager, sourceUrl: String(url)});
}

function defaultPackageCacheStore() {
  if (!globalThis.caches) throw new Error('Cache Storage is unavailable; provide an explicit P2LRN package cache store.');
  return createCacheStoragePackageCache();
}

export async function cacheP2LRNPackageURL(url, options = {}) {
  const limits = normalizeLimits(options.limits ?? DEFAULT_LIMITS);
  const store = normalizePackageCache(options.store ?? options.packageCache ?? defaultPackageCacheStore());
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable for P2LRN package caching.');
  const sourceUrl = new URL(String(url), globalThis.location?.href ?? 'http://127.0.0.1/').href;
  const response = await (fetchImpl === globalThis.fetch ? fetchImpl.bind(globalThis) : fetchImpl)(sourceUrl,{cache:'no-store',credentials:'same-origin',...(options.fetchOptions??{}),headers:{...(options.fetchOptions?.headers??{})}});
  if (!response?.ok) throw new Error(`P2LRN package cache fetch failed (${response?.status ?? 'network error'}).`);
  const bytes = await readResponseBounded(response, limits.packageBytes, {label:'P2LRN package cache download'});
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const pkg = await openP2LRNPackageBytes(buffer, limits);
  const entry = await store.put({sourceUrl,contentRoot:pkg.manifest.integrity.contentRoot,packageId:pkg.manifest.packageId,bytes:buffer,cachedAt:new Date().toISOString()});
  return Object.freeze({sourceUrl:entry.sourceUrl,contentRoot:entry.contentRoot,packageId:entry.packageId,size:entry.size,cachedAt:entry.cachedAt});
}

export async function openCachedP2LRNPackage(contentRoot, options = {}) {
  const store = normalizePackageCache(options.store ?? options.packageCache ?? defaultPackageCacheStore());
  const entry = await store.getByContentRoot(String(contentRoot));
  if (!entry) { const error=new Error('P2LRN package is not present in the offline cache: '+String(contentRoot)); error.code='P2LRN_PACKAGE_CACHE_MISS'; throw error; }
  const pkg = await openP2LRNPackageURL(entry.sourceUrl,{...options,packageCache:store,cacheMode:'cache-only'});
  if (pkg.manifest.integrity.contentRoot !== entry.contentRoot) { const error=new Error('Cached P2LRN package contentRoot mismatch.'); error.code='P2LRN_PACKAGE_CACHE_INTEGRITY'; throw error; }
  return pkg;
}

function titleOf(entity) {
  const title = entity?.title ?? {};
  return (/^en(?:-|$)/i.test(document.documentElement?.lang??'') ? (title.en ?? title.es) : (title.es ?? title.en)) ?? title.und ?? Object.values(title)[0] ?? entity?.id ?? 'P2LRN';
}

function roleRank(rep) { return ROLE_SCORE[rep.role] ?? 0; }

function compareStrings(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareTuples(a, b, keys) {
  for (const key of keys) {
    const result = compareStrings(a[key], b[key]);
    if (result) return result;
  }
  return 0;
}

const HTMLElementBase = globalThis.HTMLElement ?? class {};

export class P2LRNPlayerElement extends HTMLElementBase {
  static get p2lrnVersion() { return P2LRN_WEB_SDK_VERSION; }
  static get p2rlnVersion() { return P2LRN_WEB_SDK_VERSION; }
  static get observedAttributes() { return ['src', 'node', 'renderer', 'runtime-base-url', 'navigation']; }

  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._adapter = null;
    this._capabilityBroker = null;
    this._capabilityContextResolver = null;
    this._packageCache = null;
    this._resourceResolver = null;
    this._activityTracker = null;
    this._resultRecorder = null;
    this._learningEventObserver = null;
    this._package = null;
    this._runtimeByContainer = new Map();
    this._activityLoading = new Map();
    this._loadGeneration = 0;
    this._rendererStyleLinks = [];
    this._rendererStyles = new Set();
    this._suppressAutoReload = false;
    this._staticResourceBridge = null;
    this._progressionEnabled = false;
    this._progressionState = normalizeProgressionState(null);
    this._progressionModel = null;
    this._progressionRootId = null;
    this._progressionContextValue = null;
    this._progressionLoadedKey = null;
    this._progressionButtons = new Map();
    this._progressionSaveQueue = Promise.resolve();
    this._onProgressionRuntimeEvent = (event) => { void this.#handleProgressionRuntimeEvent(event); };
    for (const type of ['p2lrn:rendered','p2lrn:score','p2lrn:statechange','p2lrn:complete']) {
      this.addEventListener(type, this._onProgressionRuntimeEvent);
    }
  }

  connectedCallback() { if (!this._suppressAutoReload) void this.reload(); }
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected || this._suppressAutoReload) return;
    if (name !== 'src' && this._package) {
      void this.#renderPackage().catch((error) => {
        this.#renderError(error?.message ?? String(error));
        dispatchRuntimeEvent(this, 'p2lrn:error', {phase: 'render', error: error?.message ?? String(error)}, this.#packageContext());
      });
      return;
    }
    void this.reload();
  }
  startResultCapture(options = {}) {
    this._resultRecorder?.stop();
    this._resultRecorder = createResultRecorder(this, options);
    return this._resultRecorder;
  }
  get resultRecorder() { return this._resultRecorder; }
  get packageId() { return this._package?.manifest?.packageId ?? null; }
  get contentRoot() { return this._package?.manifest?.integrity?.contentRoot ?? null; }
  set adapter(value) { this._adapter = normalizeHostAdapter(value); }
  get adapter() { return this._adapter; }
  set capabilityBroker(value) { this._capabilityBroker = normalizeCapabilityBroker(value); }
  get capabilityBroker() { return this._capabilityBroker; }
  set capabilityContextResolver(value) {
    if(value!=null && typeof value!=='function')throw new TypeError('P2LRN capabilityContextResolver must be a function.');
    this._capabilityContextResolver=value??null;
  }
  get capabilityContextResolver() { return this._capabilityContextResolver; }
  set packageCache(value) { this._packageCache = normalizePackageCache(value); }
  get packageCache() { return this._packageCache; }
  set resourceResolver(value) {
    if(value==null){this._resourceResolver=null;return;}
    if(typeof value==='function'){this._resourceResolver=value;return;}
    if(typeof value?.resolve==='function'){this._resourceResolver=value.resolve.bind(value);return;}
    throw new TypeError('P2LRN resourceResolver must be a function or expose resolve().');
  }
  get resourceResolver() { return this._resourceResolver; }

  async cacheSource(options = {}) {
    const src=this.getAttribute('src');
    if(!src)throw new Error('P2LRN Player has no src to cache.');
    const store=normalizePackageCache(options.store ?? this._packageCache ?? defaultPackageCacheStore());
    this._packageCache=store;
    return cacheP2LRNPackageURL(src,{...options,store});
  }

  async loadCachedPackage(contentRoot, options = {}) {
    const generation=++this._loadGeneration;
    this.#cleanupRuntime();
    this.#renderLoading();
    try {
      const store=normalizePackageCache(options.store ?? this._packageCache ?? defaultPackageCacheStore());
      this._packageCache=store;
      this._package=await openCachedP2LRNPackage(contentRoot,{...options,store});
      this._staticResourceBridge=null;
      if(generation!==this._loadGeneration)return null;
      await this.#renderPackage();
      dispatchRuntimeEvent(this,'p2lrn:ready',{kind:'package',packageId:this._package.manifest.packageId,contentRoot:this._package.manifest.integrity.contentRoot,source:'offline-cache'},this.#packageContext());
      return this._package;
    } catch(error) {
      if(generation!==this._loadGeneration)return null;
      this.#renderError(error?.message ?? String(error));
      dispatchRuntimeEvent(this,'p2lrn:error',{phase:'package-cache-load',error:error?.message ?? String(error)},this.#packageContext());
      throw error;
    }
  }

  startActivityTracking(options = {}) {
    this.stopActivityTracking();
    const externalOnEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
    const target = options.target ?? globalThis.document;
    const interactionTarget = options.interactionTarget ?? this;
    this._activityTracker = createActivityTracker({...options, target, interactionTarget, onEvent: (type, payload) => {
      try { externalOnEvent?.(type, payload); } catch {}
      dispatchRuntimeEvent(this, type, payload, this.#packageContext(), {adapter:this._adapter});
    }});
    return this._activityTracker;
  }
  stopActivityTracking() {
    const tracker = this._activityTracker;
    this._activityTracker = null;
    return tracker?.stop?.() ?? null;
  }
  startLearningEventTracking(options = {}) {
    this.stopLearningEventTracking();
    this._learningEventObserver = observeLearningEvents({target:this,...options});
    return this._learningEventObserver;
  }
  stopLearningEventTracking() {
    const observer=this._learningEventObserver;
    this._learningEventObserver=null;
    observer?.stop?.();
    return observer?.stream?.snapshot?.() ?? null;
  }
  set runtimeBaseUrl(value) {
    if (value == null || String(value).trim() === '') this.removeAttribute('runtime-base-url');
    else this.setAttribute('runtime-base-url', String(value));
  }
  get runtimeBaseUrl() { return this.getAttribute('runtime-base-url') || getRuntimeHostConfig().baseUrl; }

  async reload() {
    const src = this.getAttribute('src');
    if (!src) { this.#renderError('Falta el atributo src del paquete .p2lrn.'); return; }
    const generation = ++this._loadGeneration;
    this.#cleanupRuntime();
    this.#renderLoading();
    try {
      this._package = await openP2LRNPackageURL(src,{packageCache:this._packageCache});
      this._staticResourceBridge = null;
      if (generation !== this._loadGeneration) return;
      await this.#renderPackage();
      dispatchRuntimeEvent(this, 'p2lrn:ready', {kind: 'package', packageId: this._package.manifest.packageId, contentRoot: this._package.manifest.integrity.contentRoot}, this.#packageContext());
    } catch (error) {
      if (generation !== this._loadGeneration) return;
      this.#renderError(error?.message ?? String(error));
      dispatchRuntimeEvent(this, 'p2lrn:error', {phase: 'package-load', error: error?.message ?? String(error)}, this.#packageContext());
    }
  }

  async #prepareProgression(root) {
    const enabled = progressionEnabled(this._package?.manifest);
    this._progressionEnabled = enabled;
    this._progressionButtons.clear();
    if (!enabled) {
      this._progressionState = normalizeProgressionState(null);
      this._progressionModel = null;
      this._progressionRootId = null;
      this._progressionContextValue = null;
      this._progressionLoadedKey = null;
      return;
    }
    this._progressionRootId = root.id;
    this._progressionModel = createProgressionModel(root.id, this._package.entities);
    this._progressionContextValue = progressionContext(this._package, root.id);
    const key = `${this._package.manifest.integrity.contentRoot}|${root.id}`;
    if (this._progressionLoadedKey === key) return;
    this._progressionLoadedKey = key;
    this._progressionState = normalizeProgressionState(null);
    if (this._adapter?.loadState) {
      try {
        const stored = await this._adapter.loadState(this._progressionContextValue);
        this._progressionState = normalizeProgressionState(stored);
      } catch (error) {
        dispatchRuntimeEvent(this, 'p2lrn:error', {
          phase:'progression-load',
          error:String(error?.message ?? error),
        }, this._progressionContextValue, {adapter:this._adapter});
      }
    }
  }

  #progressionRequirementText(status, minScore = null) {
    if (status === 'viewed') return playerUiText('ver');
    if (status === 'passed') return playerUiText(minScore == null ? 'aprobar' : `aprobar con al menos un ${minScore}%`);
    return playerUiText(minScore == null ? 'completar' : `completar con al menos un ${minScore}%`);
  }

  #progressionLockMessage(entityId) {
    const reasons = this._progressionModel?.lockReasons(entityId, this._progressionState) ?? [];
    const reason = reasons[0];
    if (!reason) return playerUiText('Este contenido está bloqueado por una regla de progresión.');
    if (reason.kind === 'gateFollowing') {
      const source = this._package.entities.get(reason.entityId);
      const title = source ? titleOf(source) : reason.entityId;
      return playerUiText('Debes ')+this.#progressionRequirementText(reason.status, reason.minScore)+` “${title}”`+playerUiText(' antes de continuar.');
    }
    const conditions = reason.conditions ?? [];
    const names = conditions.slice(0, 3).map((condition) => {
      const source = this._package.entities.get(condition.entity);
      const title = source ? titleOf(source) : condition.entity;
      const status = condition.status ?? 'completed';
      return `${this.#progressionRequirementText(status, condition.minScore ?? null)} “${title}”`;
    });
    const joiner = playerUiText(reason.mode === 'any' ? ' o ' : ' y ');
    return names.length ? playerUiText('Para acceder debes ')+names.join(joiner)+'.' : playerUiText('Completa los requisitos previos para continuar.');
  }

  #refreshProgressionNav() {
    if (!this._progressionEnabled || !this._progressionModel) return;
    for(const button of this.shadowRoot?.querySelectorAll('[data-p2lrn-lesson-target]')??[]){
      const id=button.dataset.p2lrnLessonTarget;
      const locked=this._progressionModel?.isLocked(id,this._progressionState)===true;
      button.disabled=locked;
      button.title=locked?this.#progressionLockMessage(id):'';
    }
    for (const [entityId, item] of this._progressionButtons.entries()) {
      const {button, entity, baseTitle} = item;
      const locked = entity.type === 'activity' && this._progressionModel.isLocked(entityId, this._progressionState);
      const required = this._progressionModel.isRequired(entityId);
      button.classList.toggle('p2lrn-locked', locked);
      button.classList.toggle('p2lrn-required', required);
      if (entity.type === 'activity') button.setAttribute('aria-disabled', locked ? 'true' : 'false');
      const requiredLabel = required ? playerUiText(' · Obligatorio') : '';
      button.textContent = `${locked ? '🔒 ' : ''}${baseTitle}${requiredLabel}`;
      button.title = locked ? this.#progressionLockMessage(entityId) : (required ? playerUiText('Contenido obligatorio') : '');
    }
  }

  async #handleProgressionRuntimeEvent(event) {
    if (!this._progressionEnabled || !this._progressionModel || !this._progressionContextValue) return;
    const update = updateProgressionState(this._progressionState, event);
    if (!update.changed) return;
    this._progressionState = update.state;
    this.#refreshProgressionNav();
    if (this._adapter?.saveState) {
      const snapshot = normalizeProgressionState(this._progressionState);
      const context = this._progressionContextValue;
      this._progressionSaveQueue = this._progressionSaveQueue
        .catch(() => undefined)
        .then(() => this._adapter.saveState(snapshot, context))
        .catch((error) => {
          dispatchRuntimeEvent(this, 'p2lrn:error', {
            phase:'progression-save',
            error:String(error?.message ?? error),
          }, context, {adapter:this._adapter});
        });
    }
    dispatchRuntimeEvent(this, 'p2lrn:progressionchange', {
      entityId:update.entityId,
      state:this._progressionState.entities[update.entityId] ?? null,
    }, this._progressionContextValue, {adapter:this._adapter});
  }

  #base() {
    this.shadowRoot.replaceChildren();
    this._rendererStyleLinks = [];
    this._rendererStyles = new Set();
    const playerStyle = document.createElement('link');
    playerStyle.rel = 'stylesheet';
    playerStyle.href = PLAYER_STYLESHEET;
    const shell = document.createElement('section');
    shell.className = 'p2lrn-shell';
    this.shadowRoot.append(playerStyle, shell);
    return shell;
  }

  #ensureRendererStyles(stylesheets = []) {
    const shell = this.shadowRoot.querySelector('.p2lrn-shell');
    for (const value of stylesheets) {
      const href = String(value);
      if (!href || this._rendererStyles.has(href)) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      this.shadowRoot.insertBefore(link, shell ?? null);
      this._rendererStyleLinks.push(link);
      this._rendererStyles.add(href);
    }
  }

  #renderLoading() {
    const shell = this.#base();
    const head = document.createElement('div'); head.className = 'p2lrn-head';
    const strong = document.createElement('strong'); strong.textContent = 'P2LRN';
    const status = document.createElement('span'); status.className = 'p2lrn-status'; status.textContent = 'Verificando paquete…';
    head.append(strong, status);
    const stage = document.createElement('div'); stage.className = 'p2lrn-stage';
    const message = document.createElement('div'); message.className = 'p2lrn-message'; message.textContent = playerUiText('Cargando contenido educativo.');
    stage.append(message); shell.append(head, stage);
  }

  #renderError(message) {
    const shell = this.#base();
    const head = document.createElement('div'); head.className = 'p2lrn-head';
    const strong = document.createElement('strong'); strong.textContent = 'P2LRN';
    const status = document.createElement('span'); status.className = 'p2lrn-status'; status.textContent = 'Error';
    head.append(strong, status);
    const stage = document.createElement('div'); stage.className = 'p2lrn-stage';
    const box = document.createElement('div'); box.className = 'p2lrn-message p2lrn-error'; box.textContent = message;
    stage.append(box); shell.append(head, stage);
  }

  async #renderPackage() {
    this.#cleanupRuntime();
    const pkg = this._package;
    const requested = this.getAttribute('node');
    const entrypoint = requested ? {id: requested} : (pkg.manifest.entrypoints.find((item) => item.role === 'primary') ?? pkg.manifest.entrypoints[0]);
    const root = pkg.entities.get(entrypoint.id);
    if (!root) throw new Error(playerUiText('No existe el nodo solicitado: ')+entrypoint.id);
    const primaryCourseEntrypoint = pkg.manifest.entrypoints.find((item) => item.role === 'primary' && item.type === 'course')
      ?? pkg.manifest.entrypoints.find((item) => item.type === 'course');
    const progressionRoot = primaryCourseEntrypoint ? pkg.entities.get(primaryCourseEntrypoint.id) : root;
    await this.#prepareProgression(progressionRoot ?? root);

    const shell = this.#base();
    const head = document.createElement('div'); head.className = 'p2lrn-head';
    const strong = document.createElement('strong'); strong.textContent = titleOf(root);
    const status = document.createElement('span');
    status.className = 'p2lrn-status';
    const integrityLabel = pkg.verification?.mode === 'lazy' ? playerUiText('Manifest/grafo verificados · payload bajo demanda') : playerUiText('Integridad válida');
    const transportLabel = pkg.verification?.transport === 'range' ? ' · HTTP Range' : '';
    const zip64Label = pkg.verification?.zip64 ? ' · ZIP64' : '';
    status.textContent = `${integrityLabel} · Formato Core ${pkg.manifest.formatVersion} · Player ${P2LRN_WEB_SDK_VERSION}${transportLabel}${zip64Label}`;
    head.append(strong, status); shell.append(head);
    const rightsBox=document.createElement('section');rightsBox.className='p2lrn-rights';
    renderCourseRights(rightsBox,(progressionRoot?.type==='course'?progressionRoot:null)??(root.type==='course'?root:null));
    if(!rightsBox.hidden)shell.append(rightsBox);

    if (root.type === 'activity' || root.type === 'resource') {
      const stage = document.createElement('div'); stage.className = 'p2lrn-stage'; shell.append(stage);
      if (root.type === 'activity' && this._progressionModel?.isLocked(root.id, this._progressionState)) {
        this.#stageMessage(stage, this.#progressionLockMessage(root.id));
        return;
      }
      await this.#renderEntity(root, stage);
      if(root.type==='activity'){
        const ordered=[];const seenIds=new Set();
        const visit=entity=>{
          if(!entity||seenIds.has(entity.id))return;
          seenIds.add(entity.id);
          if(entity.type==='activity')ordered.push(entity);
          for(const child of entity.children??[])visit(pkg.entities.get(child));
        };
        visit(progressionRoot??root);
        this.#appendLessonNavigation(stage,root,ordered,target=>this.setAttribute('node',target.id));
      }
      return;
    }

    // A host such as Studio already has the course outline. In that case the
    // Player renders only the selected node's content, without a competing
    // internal tree. Standalone Player instances retain their own navigation.
    const externalNavigation = this.getAttribute('navigation') === 'external';
    const layout = document.createElement('div');
    layout.className = externalNavigation ? 'p2lrn-layout p2lrn-layout-external' : 'p2lrn-layout';
    const nav = externalNavigation ? null : document.createElement('nav');
    if (nav) {
      nav.className = 'p2lrn-nav';
      nav.setAttribute('aria-label', playerUiText('Contenido P2LRN'));
      layout.append(nav);
    }
    const stage = document.createElement('div'); stage.className = 'p2lrn-stage';
    layout.append(stage); shell.append(layout);
    const activities = [];
    const seen = new Set();
    const walk = (entity, depth = 0) => {
      if (!entity || seen.has(entity.id)) return;
      seen.add(entity.id);
      if (entity.type === 'activity') activities.push(entity);
      if (nav && entity.type !== 'course') {
        const button = document.createElement('button');
        const baseTitle = titleOf(entity);
        button.type = 'button'; button.className = `depth-${Math.min(depth, 3)}`; button.textContent = baseTitle;
        button.disabled = entity.type !== 'activity';
        this._progressionButtons.set(entity.id, {button, entity, baseTitle});
        if (entity.type === 'activity') button.addEventListener('click', async () => {
          if (this._progressionModel?.isLocked(entity.id, this._progressionState)) {
            this.#stageMessage(stage, this.#progressionLockMessage(entity.id));
            return;
          }
          nav.querySelectorAll('[aria-current="true"]').forEach((item) => item.removeAttribute('aria-current'));
          button.setAttribute('aria-current', 'true');
          await this.#renderEntity(entity, stage);
          this.#appendLessonNavigation(stage,entity,activities,async target=>{
            if(this._progressionModel?.isLocked(target.id,this._progressionState))return;
            nav.querySelectorAll('[aria-current="true"]').forEach(item=>item.removeAttribute('aria-current'));
            this._progressionButtons.get(target.id)?.button?.setAttribute('aria-current','true');
            await this.#renderEntity(target,stage);
            this.#appendLessonNavigation(stage,target,activities,async next=>{
              const button=this._progressionButtons.get(next.id)?.button;
              if(button&&!button.disabled)button.click();
            });
          });
        });
        nav.append(button);
      }
      if (!(entity.type === 'activity' && entity.activityType === NATIVE_COMPOSITE_ACTIVITY_TYPE)) {
        for (const childId of entity.children ?? []) walk(pkg.entities.get(childId), depth + 1);
      }
    };
    walk(root, 0);
    // Common Cartridge may contain legitimate webcontent resources that the
    // source LMS did not link from its <organizations> outline (Canvas exports
    // do this for standalone pages). Keep the canonical graph unchanged, but
    // surface those verified package members as navigable fallback resources.
    // Never turn course-settings metadata, opaque ZIPs or unverified remotes
    // into executable activities.
    const orphanCommonCartridge=[];
    const commonCartridge=pkg.manifest.profiles.some(profile=>
      canonicalIdentifier(profile.id)==='https://p2lrn.org/profile/common-cartridge');
    if(commonCartridge){
      const referenced=new Set(activities.map(activity=>activity.resource).filter(Boolean));
      for(const resource of pkg.entities.values()){
        if(resource?.type!=='resource'||referenced.has(resource.id))continue;
        const launch=(resource.representations??[]).find(rep=>
          rep.location?.type==='package-member'&&
          /\.(?:html?|xhtml)$/iu.test(String(rep.location.member??'')) &&
          rep.role!=='original-package');
        if(!launch)continue;
        const member=String(launch.location.member);
        const filename=member.split('/').pop()??'';
        const label=filename.replace(/\.(?:html?|xhtml)$/iu,'').replace(/[-_]+/gu,' ').trim()||
          playerUiText('Recurso importado');
        const button=nav?document.createElement('button'):null;
        if(button){
          button.type='button';button.className='depth-1';
          button.textContent=label;
          button.setAttribute('data-p2lrn-imported-resource',resource.id);
          button.addEventListener('click',async()=>{
            nav.querySelectorAll('[aria-current="true"]').forEach(item=>item.removeAttribute('aria-current'));
            button.setAttribute('aria-current','true');
            await this.#renderEntity(resource,stage);
          });
          nav.append(button);
        }
        orphanCommonCartridge.push({resource,button});
      }
    }
    this.#refreshProgressionNav();
    if (activities.length) {
      const firstActivity = activities.find((activity) => !this._progressionModel?.isLocked(activity.id, this._progressionState));
      if (firstActivity) {
        if (nav) this._progressionButtons.get(firstActivity.id)?.button?.setAttribute('aria-current', 'true');
        await this.#renderEntity(firstActivity, stage);
        this.#appendLessonNavigation(stage,firstActivity,activities,target=>{
          const button=this._progressionButtons.get(target.id)?.button;
          if(button&&!button.disabled)button.click();
        });
      } else {
        this.#stageMessage(stage, this.#progressionLockMessage(activities[0].id));
      }
    } else if (orphanCommonCartridge.length) {
      const first=orphanCommonCartridge[0];
      first.button?.setAttribute('aria-current','true');
      await this.#renderEntity(first.resource,stage);
    } else {
      const message = document.createElement('div'); message.className = 'p2lrn-message'; message.textContent = 'Este nodo no contiene actividades reproducibles.'; stage.append(message);
    }
  }

  #appendLessonNavigation(stage,current,activities,navigate){
    const position=activities.findIndex(entry=>entry.id===current?.id);
    if(position<0||activities.length<2)return;
    stage.querySelector(':scope > .p2lrn-lesson-navigation')?.remove();
    const bar=document.createElement('nav');
    bar.className='p2lrn-lesson-navigation';
    bar.setAttribute('aria-label',playerUiText('Navegaci?n entre lecciones'));
    const add=(label,target)=>{
      const button=document.createElement('button');button.type='button';
      button.textContent=target?playerUiText(label)+': '+titleOf(target):playerUiText(label);
      button.disabled=!target||this._progressionModel?.isLocked(target.id,this._progressionState)===true;
      if(target)button.dataset.p2lrnLessonTarget=target.id;
      if(button.disabled&&target)button.title=this.#progressionLockMessage(target.id);
      button.addEventListener('click',()=>{
        if(!target||this._progressionModel?.isLocked(target.id,this._progressionState))return;
        void navigate(target);
      });
      bar.append(button);
    };
    add('Anterior',activities[position-1]??null);
    const indicator=document.createElement('span');
    indicator.textContent=playerUiText('Lecci\u00f3n ')+(position+1)+' / '+activities.length;
    indicator.setAttribute('aria-live','polite');bar.append(indicator);
    add('Siguiente',activities[position+1]??null);
    stage.append(bar);
  }

  #rootCourseEntity() {
    if (!this._package) return null;
    const id = (this._package.manifest.entrypoints?.find((item) => item.type === 'course' && item.role === 'primary')
      ?? this._package.manifest.entrypoints?.find((item) => item.type === 'course'))?.id;
    return id ? this._package.entities.get(id) ?? null : null;
  }

  async #negotiateHostCapabilities(entity, resource) {
    const requests = mergeCapabilityRequirements(
      capabilityRequirements(this.#rootCourseEntity()),
      capabilityRequirements(entity),
      capabilityRequirements(resource),
    );
    if (!requests.length) return Object.freeze({requests, statuses:Object.freeze([]), blocked:Object.freeze([])});
    const context = Object.freeze({
      packageId:this._package?.manifest?.packageId ?? null,
      contentRoot:this._package?.manifest?.integrity?.contentRoot ?? null,
      entityId:entity?.id ?? null,
      resourceId:resource?.id ?? null,
    });
    const statuses = this._capabilityBroker
      ? await this._capabilityBroker.negotiate(requests, context)
      : Object.freeze(requests.map((request) => Object.freeze({id:request.id, required:request.required, available:false, provider:null, operations:Object.freeze([]), fallback:request.fallback ?? null})));
    const blocked = Object.freeze(statuses.filter((status) => status.required && !status.available));
    dispatchRuntimeEvent(this, 'p2lrn:capability', {requests, statuses, blocked:blocked.map((item)=>item.id)}, context, {adapter:this._adapter});
    return Object.freeze({requests, statuses, blocked});
  }

  #startActivityLoading(stage, entity) {
    this.#stopActivityLoading(stage);
    const state={entityId:entity.id,ready:false,onReady:null,onError:null,timer:null};
    state.onReady=event=>{
      if(event.detail?.context?.entityId === entity.id){
        state.ready=true;
        this.#stopActivityLoading(stage,state);
      }
    };
    state.onError=event=>{
      if(event.detail?.context?.entityId === entity.id)this.#stopActivityLoading(stage,state);
    };
    this._activityLoading.set(stage,state);
    stage.setAttribute('data-p2lrn-loading','true');
    stage.dataset.p2lrnLoadingLabel=playerUiText('Cargando actividad?');
    stage.setAttribute('aria-busy','true');
    this.addEventListener('p2lrn:activityready', state.onReady);
    this.addEventListener('p2lrn:error', state.onError);
    state.timer=setTimeout(()=>{
      if(this._activityLoading.get(stage)===state)
        stage.dataset.p2lrnLoadingLabel=playerUiText('La actividad est? tardando m?s de lo habitual?');
    },12000);
    return state;
  }

  #stopActivityLoading(stage, waiting=this._activityLoading.get(stage)) {
    if(!waiting||this._activityLoading.get(stage)!==waiting)return;
    this._activityLoading.delete(stage);
    this.removeEventListener('p2lrn:activityready',waiting.onReady);
    this.removeEventListener('p2lrn:error',waiting.onError);
    if(waiting.timer!==null)clearTimeout(waiting.timer);
    delete stage.dataset.p2lrnLoading;
    delete stage.dataset.p2lrnLoadingLabel;
    stage.removeAttribute('aria-busy');
  }

  async #renderEntity(entity, stage, {requestedRenderer = undefined} = {}) {
    this.#cleanupRuntime(stage);
    stage.replaceChildren();
    if (entity?.type === 'activity' && this._progressionModel?.isLocked(entity.id, this._progressionState)) {
      this.#stageMessage(stage, this.#progressionLockMessage(entity.id));
      return null;
    }
    let resource = entity;
    if (entity.type === 'activity') {
      if (!entity.resource) { this.#stageMessage(stage, playerUiText('La actividad no tiene un recurso directo.')); return null; }
      resource = this._package.entities.get(entity.resource);
    }
    if (!resource || resource.type !== 'resource') { this.#stageMessage(stage, playerUiText('El recurso no existe o no es reproducible.')); return null; }

    const capabilityState = await this.#negotiateHostCapabilities(entity, resource);
    if (capabilityState.blocked.length) {
      this.#stageMessage(stage, playerUiText('Esta actividad requiere capacidades del host no disponibles: ') + capabilityState.blocked.map((item)=>item.id).join(', '));
      return null;
    }
    const declaredCapabilityIds = new Set(capabilityState.requests.map((request)=>request.id));

    const allRepresentations = [...(resource.representations ?? [])];
    const representations = allRepresentations.filter((candidate) => {
      if (['embedded', 'package-member'].includes(candidate.location?.type)) return true;
      return candidate.location?.type === 'remote'
        && /^sha256:[0-9a-f]{64}$/.test(String(candidate.location.expectedDigest ?? ''))
        && (this._resourceResolver != null || typeof this._adapter?.resolveResourceUrl === 'function');
    });
    if (!representations.length) {
      this.#stageMessage(stage, allRepresentations.length ? playerUiText('El reproductor web no abre representaciones remotas sin un adaptador compatible.') : playerUiText('El recurso no contiene representaciones.'));
      return null;
    }

    const waiting=this.#startActivityLoading(stage,entity);
    const excluded = new Set();
    const strictRenderer = requestedRenderer === undefined ? this.getAttribute('renderer') : requestedRenderer;
    const preflightContext = {
      packageId:this._package.manifest.packageId,
      contentRoot:this._package.manifest.integrity.contentRoot,
      entityId:entity.id,resourceId:resource.id,
    };
    while (true) {
      const plan = await negotiateP2LRNExecution({
        registry:defaultRendererRegistry,
        representations,entity,resource,
        requestedRenderer:strictRenderer,roleRank,
        excludeRendererIds:[...excluded],
        context:preflightContext,
        requiredCapabilities:capabilityState.requests.filter(item=>item.required).map(item=>item.id),
        isCapabilityAvailable:(id)=>capabilityState.statuses.some(item=>item.id===id&&item.available),
      });
      const candidate = plan.candidate;
      if (!candidate) {
        dispatchRuntimeEvent(this,'p2lrn:executionblocked',plan.report,preflightContext,{adapter:this._adapter});
        const last=plan.report.diagnostics.at(-1);
        this.#stopActivityLoading(stage, waiting);
        this.#stageMessage(stage,last?.message??playerUiText('Este reproductor web todavía no tiene un renderer instalado compatible con las representaciones de esta actividad.'));
        return null;
      }

      const rep = candidate.representation;
      const context = {
        packageId: this._package.manifest.packageId,
        contentRoot: this._package.manifest.integrity.contentRoot,
        entityId: entity.id,
        resourceId: resource.id,
        representationId: rep.id,
        rendererId: candidate.descriptor.id,
      };
      try {
        // Preflight is diagnostic only. The trusted registry re-checks
        // permissions and dependencies when the renderer is actually loaded.
        dispatchRuntimeEvent(this,'p2lrn:executionpreflight',plan.report,context,{adapter:this._adapter});
        const module = await defaultRendererRegistry.load(candidate, context);
        this.#ensureRendererStyles(module.stylesheets ?? []);
        const remoteLocation = rep.location?.type === 'remote';
        if (remoteLocation && module.acceptsRemoteLocation !== true) {
          const error = new Error('Selected renderer does not accept trusted remote P2LRN resources.');
          error.code = 'P2LRN_RENDERER_INCOMPATIBLE';
          throw error;
        }
        const payload = remoteLocation ? null : await representationPayload(this._package, rep);
        const bytes = remoteLocation || module.acceptsPayload === true ? null : await payload.read();
        const runtime = await module.render({
          container: stage,
          bytes,
          payload,
          representation: rep,
          entity,
          resource,
          package: this._package,
          decodeJson,
          eventTarget: this,
          adapter: this._adapter,
          capabilities: capabilityState.statuses,
          invokeCapability: async (id, operation, input = {}) => {
            const capabilityId = String(id ?? '');
            if (!declaredCapabilityIds.has(capabilityId)) {
              const error = new Error('P2LRN activity attempted to use an undeclared host capability: ' + capabilityId);
              error.code = 'P2LRN_CAPABILITY_UNDECLARED';
              throw error;
            }
            if (!capabilityOperationAllowed(capabilityState.requests, capabilityId, operation)) {
              const error = new Error('P2LRN activity attempted to use an undeclared host capability operation: ' + capabilityId + '.' + String(operation ?? ''));
              error.code = 'P2LRN_CAPABILITY_OPERATION_UNDECLARED';
              throw error;
            }
            if (!this._capabilityBroker) {
              const error = new Error('P2LRN host capability broker is unavailable: ' + capabilityId);
              error.code = 'P2LRN_CAPABILITY_UNAVAILABLE';
              throw error;
            }
            const request=capabilityState.requests.find((item)=>item.id===capabilityId);
            let capabilityContext=Object.freeze({});
            if(this._capabilityContextResolver && request?.context?.length){
              const supplied=await this._capabilityContextResolver(Object.freeze({
                capabilityId, operation:String(operation ?? ''), requested:Object.freeze([...request.context]),
                systemContext:Object.freeze({...context}), input:Object.freeze(structuredClone(input ?? {})),
              }));
              capabilityContext=projectCapabilityContext(request,supplied);
            }
            return this._capabilityBroker.invoke(capabilityId, operation, input, Object.freeze({...context,capabilityContext}));
          },
          componentRegistry: defaultComponentRegistry,
          rendererRegistry: defaultRendererRegistry,
          context,
          runtimeBaseUrl: this.runtimeBaseUrl,
          resolveResourceUrl: (request) => this.#resolveResourceUrl({...request, representationId: rep.id}, context),
          renderActivity: async (childId, childStage) => {
            const child = this._package.entities.get(String(childId));
            if (!child || child.type !== 'activity') throw new Error(`Composite child is not an Activity: ${childId}`);
            return this.#renderEntity(child, childStage, {requestedRenderer: ''});
          },
        }) ?? null;
        if (runtime) this._runtimeByContainer.set(stage, runtime);
        // External runtimes may return their iframe handle before the
        // learner content is actually initialized. A rendered event is not
        // equivalent to p2lrn:activityready.
        if(!['h5p', 'scorm', 'external-package'].includes(runtime?.kind))
          this.#stopActivityLoading(stage, waiting);
        dispatchRuntimeEvent(this, 'p2lrn:rendered', {
          rendererId: candidate.descriptor.id,
          representationId: rep.id,
          entityId: entity.id,
        }, context);
        dispatchRuntimeEvent(this, 'p2lrn:interaction', {
          action:'resource-open',
          resourceId:resource.id,
          representationId:rep.id,
          mediaType:rep.mediaType??null,
          rendererId:candidate.descriptor.id,
        }, context, {adapter:this._adapter});
        return runtime;
      } catch (error) {
        const canFallback = candidate.selection?.required !== true && [
          'P2LRN_RENDERER_INCOMPATIBLE',
          'P2LRN_DEPENDENCY_UNAVAILABLE',
          'P2LRN_PERMISSION_DENIED',
          'P2LRN_TIMING_UNSUPPORTED',
          'P2LRN_COMPONENT_UNAVAILABLE',
          'P2LRN_COMPONENT_VERSION_UNAVAILABLE',
          'P2LRN_COMPONENT_CONTRACT_MISMATCH',
          'P2LRN_COMPONENT_MIGRATION_UNAVAILABLE',
          'P2LRN_COMPONENT_MIGRATION_FAILED',
          'P2LRN_COMPONENT_DATA_INVALID',
          'P2LRN_COMPONENT_RENDERER_UNAVAILABLE',
          'P2LRN_COMPONENT_RUNTIME_UNAVAILABLE',
          'P2LRN_REMOTE_RESOURCE_UNAVAILABLE',
          'P2LRN_REMOTE_RESOURCE_UNVERIFIED',
        ].includes(error?.code);
        if (!canFallback){this.#stopActivityLoading(stage,waiting);throw error;}
        excluded.add(candidate.descriptor.id);
        this.#cleanupRuntime(stage);
        stage.replaceChildren();
      }
    }
  }

  async #resolveResourceUrl(request, context) {
    const normalized = {...(request ?? {})};
    if (normalized.path) {
      const payload = this._package.payload(normalized.path);
      normalized.path = payload.path;
      normalized.mediaType = normalized.mediaType ?? payload.mediaType;
      normalized.size = normalized.size ?? payload.size;
      normalized.byteDigest = normalized.byteDigest ?? payload.byteDigest;
      normalized.contentDigest = normalized.contentDigest ?? payload.contentDigest;
      normalized.seekable = normalized.seekable ?? payload.seekable;
      normalized.compressionMethod = normalized.compressionMethod ?? payload.compressionMethod;
      normalized.rangeIntegrity = normalized.rangeIntegrity ?? await payload.rangeIntegrity();
    }
    normalized.sourceUrl = this._package.sourceUrl;

    let result = null;
    if (this._resourceResolver && normalized.expectedDigest) {
      result = await this._resourceResolver(Object.freeze(normalized), Object.freeze({...context}));
    }
    if (result == null && this._adapter?.resolveResourceUrl) {
      result = await this._adapter.resolveResourceUrl(Object.freeze(normalized), Object.freeze({...context}));
    } else if (result == null && !this._adapter?.resolveResourceUrl) {
      if (!this._staticResourceBridge) this._staticResourceBridge = createStaticResourceBridge(this._package);
      result = await this._staticResourceBridge.resolve(Object.freeze(normalized), Object.freeze({...context}));
    }
    if (result == null) return null;
    if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.url !== 'string' || !result.url) {
      throw new Error('P2LRN resource bridge must return null or {url, verified, seekable?}.');
    }
    if (result.verified !== true) {
      const error = new Error('P2LRN virtual resource URL was not declared as integrity-verified.');
      error.code = 'P2LRN_VIRTUAL_RESOURCE_UNVERIFIED';
      throw error;
    }
    if (normalized.path) this._package.verification.hostVerifiedPaths.add(normalized.path);
    return Object.freeze({url: result.url, verified: true, seekable: result.seekable === true});
  }

  #stageMessage(stage, text) { const box = document.createElement('div'); box.className = 'p2lrn-message'; box.textContent = text; stage.append(box); }

  #packageContext() {
    if (!this._package) return {};
    return {
      packageId: this._package.manifest?.packageId ?? null,
      contentRoot: this._package.manifest?.integrity?.contentRoot ?? null,
    };
  }

  #cleanupRuntime(container = null) {
    for(const [stage,waiting] of [...this._activityLoading.entries()]){
      const matches=!container||stage===container||
        (typeof container.contains==='function'&&container.contains(stage));
      if(matches)this.#stopActivityLoading(stage,waiting);
    }
    const entries = [...this._runtimeByContainer.entries()];
    for (const [stage, runtime] of entries) {
      const matches = !container || stage === container || (typeof container.contains === 'function' && container.contains(stage));
      if (!matches) continue;
      try { runtime?.destroy?.(); } catch {}
      this._runtimeByContainer.delete(stage);
    }
    if (!container) {
      for (const link of this._rendererStyleLinks) link.remove();
      this._rendererStyleLinks = [];
      this._rendererStyles = new Set();
    }
  }

  disconnectedCallback() { this.#cleanupRuntime(); this.stopActivityTracking(); this.stopLearningEventTracking(); this._resultRecorder?.stop(); }
}

// Authoring uses the same bundled 3D engine as the learner, loaded only
// when the teacher opens a 3D assembly. No parallel renderer or CDN service.
export async function create3DAuthoringScene(canvas,options={}) {
  const {createThreeGameScene}=await import('./game-3d/three-runtime.js');
  return createThreeGameScene(canvas,{...options,physics:'none',authoring:true});
}

export async function mountP2LRN(target, options = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new Error('P2LRN mount target not found.');
  const existing = host instanceof P2LRNPlayerElement;
  const player = existing ? host : document.createElement('p2lrn-player');
  player._suppressAutoReload = true;
  try {
    if (options.adapter) player.adapter = options.adapter;
    if (options.capabilityBroker) player.capabilityBroker = options.capabilityBroker;
    if (options.capabilityContextResolver) player.capabilityContextResolver = options.capabilityContextResolver;
    if (options.packageCache) player.packageCache = options.packageCache;
    if (options.resourceResolver) player.resourceResolver = options.resourceResolver;
    if (options.src) player.setAttribute('src', options.src);
    if (options.node) player.setAttribute('node', options.node);
    if (options.renderer) player.setAttribute('renderer', options.renderer);
    if (Object.prototype.hasOwnProperty.call(options, 'runtimeBaseUrl')) player.runtimeBaseUrl = options.runtimeBaseUrl;
    if (!existing) host.replaceChildren(player);
    if (options.resultIdentity) player.startResultCapture({identity:options.resultIdentity,courseId:options.courseId,courseTitle:options.courseTitle});
    if (options.activityTracking) player.startActivityTracking(options.activityTracking === true ? {} : options.activityTracking);
    if (options.learningEvents) player.startLearningEventTracking(options.learningEvents === true ? {} : options.learningEvents);
  } finally {
    player._suppressAutoReload = false;
  }
  if (player.isConnected) await player.reload();
  return player;
}

function p2lrnVersionConflict(found, surface = 'runtime') {
  const error = new Error(`P2LRN version conflict on ${surface}: this runtime is ${P2LRN_WEB_SDK_VERSION}, found ${found || 'an unversioned P2LRN runtime'}.`);
  error.code = 'P2LRN_VERSION_CONFLICT';
  return error;
}

const existingP2LRNApi = globalThis.P2LRN ?? null;
if (existingP2LRNApi && existingP2LRNApi.version !== P2LRN_WEB_SDK_VERSION) {
  throw p2lrnVersionConflict(existingP2LRNApi.version, 'globalThis.P2LRN');
}

if (globalThis.customElements) {
  const existingPlayerElement = globalThis.customElements.get('p2lrn-player');
  if (existingPlayerElement && existingPlayerElement !== P2LRNPlayerElement) {
    if (existingPlayerElement.p2lrnVersion !== P2LRN_WEB_SDK_VERSION) {
      throw p2lrnVersionConflict(existingPlayerElement.p2lrnVersion, 'custom element p2lrn-player');
    }
  } else if (!existingPlayerElement) {
    globalThis.customElements.define('p2lrn-player', P2LRNPlayerElement);
  }

  // Backward-compatible tag for pre-rename embeds. A distinct subclass is required by Custom Elements.
  const existingLegacyElement = globalThis.customElements.get('p2lrn-player');
  if (!existingLegacyElement) {
    class LegacyP2RLNPlayerElement extends P2LRNPlayerElement {}
    globalThis.customElements.define('p2lrn-player', LegacyP2RLNPlayerElement);
  } else if (existingLegacyElement.p2rlnVersion !== P2LRN_WEB_SDK_VERSION) {
    throw p2lrnVersionConflict(existingLegacyElement.p2rlnVersion, 'legacy custom element p2lrn-player');
  }
}

if (!existingP2LRNApi) {
  globalThis.P2LRN = Object.freeze({
    version: P2LRN_WEB_SDK_VERSION,
    toolkitVersion: P2LRN_TOOLKIT_VERSION,
    coreVersion: P2LRN_CORE_VERSION,
    mount: mountP2LRN,
    PlayerElement: P2LRNPlayerElement,
    openPackageBytes: openP2LRNPackageBytes,
    openPackageURL: openP2LRNPackageURL,
    registerRenderer: (descriptor) => defaultRendererRegistry.register(descriptor),
    unregisterRenderer: (id) => defaultRendererRegistry.unregister(id),
    renderers: () => defaultRendererRegistry.list(),
    negotiateExecution: (options = {}) => negotiateP2LRNExecution({...options,registry:defaultRendererRegistry}),
    inspectPackageExecution: (pkg,options = {}) => inspectP2LRNPackageExecution(pkg,{...options,registry:defaultRendererRegistry}),
    executionPlanSchema:P2LRN_EXECUTION_PLAN_SCHEMA,
    executionPlanVersion:P2LRN_EXECUTION_PLAN_VERSION,
    registerComponent: (descriptor) => defaultComponentRegistry.register(descriptor),
    unregisterComponent: (id, componentVersion) => defaultComponentRegistry.unregister(id, componentVersion),
    components: () => defaultComponentRegistry.list(),
    registerDependency: (descriptor) => defaultDependencyRegistry.register(descriptor),
    dependencies: () => defaultDependencyRegistry.list(),
    setPermissionPolicy: (policy) => defaultRendererRegistry.setPermissionPolicy(policy),
    createHostAdapter,
    createResultRecorder,
    createCapabilityBroker,
    createToolCapabilityProvider,
    createMcpCapabilityProvider,
    createOfflineHostAdapter,
    createMemoryOfflineStore,
    createIndexedDbOfflineStore,
    createOfflineSyncController,
    createActivityTracker,
    createLearningEvent,
    createLearningEventStream,
    observeLearningEvents,
    learningEventCategory,
    createMemoryResourceLibrary,
    createCacheStorageResourceLibrary,
    createResourceLibraryResolver,
    createResourceLibraryCapabilityProvider,
    createMemoryCollaborationHub,
    createHttpCollaborationProvider,
    COLLABORATION_CAPABILITY,
    COLLABORATION_OPERATIONS,
    COLLABORATION_HTTP_VERSION,
    COLLABORATION_HTTP_MEDIA_TYPE,
    createMemorySharedResourceStore,
    createMemoryPackageCache,
    createCacheStoragePackageCache,
    cachePackageURL: cacheP2LRNPackageURL,
    openCachedPackage: openCachedP2LRNPackage,
    DEFAULT_PACKAGE_CACHE_NAME,
    HOST_CAPABILITY_EXTENSION,
    DEFAULT_OFFLINE_DB_NAME,
    RESOURCE_LIBRARY_CAPABILITY_ID,
    DEFAULT_RESOURCE_LIBRARY_CACHE,
    LEARNING_EVENT_SCHEMA,
    LEARNING_EVENT_MODEL_VERSION,
    DEFAULT_ACTIVITY_IDLE_AFTER_MS,
    configureRuntimeHost,
    getRuntimeHostConfig,
    installServiceWorker: installP2LRNServiceWorker,
    create3DAuthoringScene,
  });
}

// Read-only compatibility alias for applications that loaded the pre-rename global API.
if (globalThis.P2RLN == null) globalThis.P2RLN = globalThis.P2LRN;
