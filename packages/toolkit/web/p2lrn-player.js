import {createDefaultDependencyRegistry} from './dependency-registry.js';
import {RendererRegistry} from './renderer-registry.js';
import {registerBuiltInRenderers} from './built-in-renderers.js';
import {createDefaultComponentRegistry} from './component-registry.js';
import {dispatchRuntimeEvent} from './runtime-events.js';
import {createHostAdapter, normalizeHostAdapter} from './host-adapter.js';
import {BufferZipArchive, openRemoteZipArchive, safeZipPath} from './zip-source.js';
import {verifiedBinaryBlob, verifiedBinaryStream} from './stream-integrity.js';
import {WEB_CONTENT_PROFILE, webContentMapping} from './web-content-core.js';
import {rangeIntegrityPointer, validateRangeIntegrityIndex, RANGE_INTEGRITY_MEDIA_TYPE} from './range-integrity-core.js';
import {createStaticResourceBridge, installP2LRNServiceWorker} from './static-resource-bridge.js';
import {representationPayload} from './package-member.js';
import {configureRuntimeHost, getRuntimeHostConfig} from './runtime-host-config.js';
import {canonicalIdentifier, canonicalizeIdentifiers, identifierIs} from './identifiers.js';
import {XAPI_PROFILE,normalizeXapiActivityDeclaration} from './xapi-intent.js';

export const P2LRN_WEB_SDK_VERSION = '0.5.0-alpha.1';
export const P2LRN_TOOLKIT_VERSION = '0.5.0-alpha.1';
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
const textDecoder = new TextDecoder('utf-8', {fatal: true});
const textEncoder = new TextEncoder();

const PLAYER_STYLESHEET = new URL('./p2lrn-player.css', import.meta.url).href;
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
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
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
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${[...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
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
  if (!Array.isArray(manifest.profiles) || !Array.isArray(manifest.files)) throw new Error('Manifest profile/file inventory is invalid.');
  if (!manifest.integrity?.contentRoot?.startsWith('sha256:')) throw new Error('Manifest has no valid contentRoot.');
}

function ensureGraphShape(graph, manifest) {
  if (!graph || graph.graphVersion !== '0.4.0' || !Array.isArray(graph.entities) || !Array.isArray(graph.relations)) throw new Error('Invalid P2LRN graph structure.');
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

  const graphBytes = await readVerified(manifest.graph.path);
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
  const zip = await openRemoteZipArchive(url, limits, {
    fetchImpl: options.fetchImpl,
    fetchOptions: options.fetchOptions,
  });
  const eager = zip.transport !== 'range';
  return openP2LRNArchive(zip, {eagerPayloadVerification: eager, sourceUrl: String(url)});
}

function titleOf(entity) {
  const title = entity?.title ?? {};
  return title.es ?? title.en ?? title.und ?? Object.values(title)[0] ?? entity?.id ?? 'P2LRN';
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
  static get observedAttributes() { return ['src', 'node', 'renderer', 'runtime-base-url']; }

  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._adapter = null;
    this._package = null;
    this._runtimeByContainer = new Map();
    this._loadGeneration = 0;
    this._rendererStyleLinks = [];
    this._rendererStyles = new Set();
    this._suppressAutoReload = false;
    this._staticResourceBridge = null;
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
  set adapter(value) { this._adapter = normalizeHostAdapter(value); }
  get adapter() { return this._adapter; }
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
      this._package = await openP2LRNPackageURL(src);
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
    const message = document.createElement('div'); message.className = 'p2lrn-message'; message.textContent = 'Cargando contenido educativo.';
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
    if (!root) throw new Error(`No existe el nodo solicitado: ${entrypoint.id}`);

    const shell = this.#base();
    const head = document.createElement('div'); head.className = 'p2lrn-head';
    const strong = document.createElement('strong'); strong.textContent = titleOf(root);
    const status = document.createElement('span');
    status.className = 'p2lrn-status';
    const integrityLabel = pkg.verification?.mode === 'lazy' ? 'Manifest/grafo verificados · payload bajo demanda' : 'Integridad válida';
    const transportLabel = pkg.verification?.transport === 'range' ? ' · HTTP Range' : '';
    const zip64Label = pkg.verification?.zip64 ? ' · ZIP64' : '';
    status.textContent = `${integrityLabel} · ${pkg.manifest.formatVersion}${transportLabel}${zip64Label}`;
    head.append(strong, status); shell.append(head);

    if (root.type === 'activity' || root.type === 'resource') {
      const stage = document.createElement('main'); stage.className = 'p2lrn-stage'; shell.append(stage);
      await this.#renderEntity(root, stage);
      return;
    }

    const layout = document.createElement('div'); layout.className = 'p2lrn-layout';
    const nav = document.createElement('nav'); nav.className = 'p2lrn-nav'; nav.setAttribute('aria-label', 'Contenido P2LRN');
    const stage = document.createElement('main'); stage.className = 'p2lrn-stage';
    layout.append(nav, stage); shell.append(layout);
    const activities = [];
    const seen = new Set();
    const walk = (entity, depth = 0) => {
      if (!entity || seen.has(entity.id)) return;
      seen.add(entity.id);
      if (entity.type === 'activity') activities.push(entity);
      if (entity.type !== 'course') {
        const button = document.createElement('button');
        button.type = 'button'; button.className = `depth-${Math.min(depth, 3)}`; button.textContent = titleOf(entity);
        button.disabled = entity.type !== 'activity';
        if (entity.type === 'activity') button.addEventListener('click', async () => {
          nav.querySelectorAll('[aria-current="true"]').forEach((item) => item.removeAttribute('aria-current'));
          button.setAttribute('aria-current', 'true');
          await this.#renderEntity(entity, stage);
        });
        nav.append(button);
      }
      if (!(entity.type === 'activity' && entity.activityType === NATIVE_COMPOSITE_ACTIVITY_TYPE)) {
        for (const childId of entity.children ?? []) walk(pkg.entities.get(childId), depth + 1);
      }
    };
    walk(root, 0);
    if (activities.length) {
      const firstButton = [...nav.querySelectorAll('button')].find((button) => !button.disabled);
      firstButton?.setAttribute('aria-current', 'true');
      await this.#renderEntity(activities[0], stage);
    } else {
      const message = document.createElement('div'); message.className = 'p2lrn-message'; message.textContent = 'Este nodo no contiene actividades reproducibles.'; stage.append(message);
    }
  }

  async #renderEntity(entity, stage, {requestedRenderer = undefined} = {}) {
    this.#cleanupRuntime(stage);
    stage.replaceChildren();
    let resource = entity;
    if (entity.type === 'activity') {
      if (!entity.resource) { this.#stageMessage(stage, 'La actividad no tiene un recurso directo.'); return null; }
      resource = this._package.entities.get(entity.resource);
    }
    if (!resource || resource.type !== 'resource') { this.#stageMessage(stage, 'El recurso no existe o no es reproducible.'); return null; }

    const allRepresentations = [...(resource.representations ?? [])];
    const representations = allRepresentations.filter((candidate) => ['embedded', 'package-member'].includes(candidate.location?.type) || (candidate.location?.type === 'remote' && ['https://p2lrn.org/profile/cmi5','https://p2lrn.org/profile/lti'].includes(canonicalIdentifier(candidate.profile))));
    if (!representations.length) {
      this.#stageMessage(stage, allRepresentations.length ? 'El reproductor web no abre representaciones remotas sin un adaptador compatible.' : 'El recurso no contiene representaciones.');
      return null;
    }

    const excluded = new Set();
    const strictRenderer = requestedRenderer === undefined ? this.getAttribute('renderer') : requestedRenderer;
    while (true) {
      const candidate = await defaultRendererRegistry.select({
        representations,
        entity,
        resource,
        requestedRenderer: strictRenderer,
        roleRank,
        excludeRendererIds: [...excluded],
      });
      if (!candidate) {
        this.#stageMessage(stage, 'Este reproductor web todavía no tiene un renderer instalado compatible con las representaciones de esta actividad.');
        return null;
      }

      const rep = candidate.representation;
      const xapi = normalizeXapiActivityDeclaration(entity.extensions?.[XAPI_PROFILE] ?? null);
      const context = {
        packageId: this._package.manifest.packageId,
        contentRoot: this._package.manifest.integrity.contentRoot,
        entityId: entity.id,
        resourceId: resource.id,
        representationId: rep.id,
        rendererId: candidate.descriptor.id,
        ...(xapi ? {xapi} : {}),
      };
      try {
        const module = await defaultRendererRegistry.load(candidate, context);
        this.#ensureRendererStyles(module.stylesheets ?? []);
        let payload = null;
        let bytes = null;
        if (rep.location?.type === 'remote') {
          if (module.acceptsRemote !== true) {
            const error = new Error(`Renderer ${candidate.descriptor.id} does not accept remote representations.`);
            error.code = 'P2LRN_RENDERER_INCOMPATIBLE';
            throw error;
          }
        } else {
          payload = await representationPayload(this._package, rep);
          bytes = module.acceptsPayload === true ? null : await payload.read();
        }
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
        dispatchRuntimeEvent(this, 'p2lrn:rendered', {
          rendererId: candidate.descriptor.id,
          representationId: rep.id,
          entityId: entity.id,
        }, context);
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
        ].includes(error?.code);
        if (!canFallback) throw error;
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
    if (this._adapter?.resolveResourceUrl) {
      result = await this._adapter.resolveResourceUrl(Object.freeze(normalized), Object.freeze({...context}));
    } else {
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

  disconnectedCallback() { this.#cleanupRuntime(); }
}

export async function mountP2LRN(target, options = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new Error('P2LRN mount target not found.');
  const existing = host instanceof P2LRNPlayerElement;
  const player = existing ? host : document.createElement('p2lrn-player');
  player._suppressAutoReload = true;
  try {
    if (options.adapter) player.adapter = options.adapter;
    if (options.src) player.setAttribute('src', options.src);
    if (options.node) player.setAttribute('node', options.node);
    if (options.renderer) player.setAttribute('renderer', options.renderer);
    if (Object.prototype.hasOwnProperty.call(options, 'runtimeBaseUrl')) player.runtimeBaseUrl = options.runtimeBaseUrl;
    if (!existing) host.replaceChildren(player);
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
    registerComponent: (descriptor) => defaultComponentRegistry.register(descriptor),
    unregisterComponent: (id, componentVersion) => defaultComponentRegistry.unregister(id, componentVersion),
    components: () => defaultComponentRegistry.list(),
    registerDependency: (descriptor) => defaultDependencyRegistry.register(descriptor),
    dependencies: () => defaultDependencyRegistry.list(),
    setPermissionPolicy: (policy) => defaultRendererRegistry.setPermissionPolicy(policy),
    createHostAdapter,
    configureRuntimeHost,
    getRuntimeHostConfig,
    installServiceWorker: installP2LRNServiceWorker,
  });
}

// Read-only compatibility alias for applications that loaded the pre-rename global API.
if (globalThis.P2RLN == null) globalThis.P2RLN = globalThis.P2LRN;
