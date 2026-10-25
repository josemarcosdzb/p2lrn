export const version: "0.5.0-alpha.11";
export const toolkitVersion: "0.5.0-alpha.11";
export const coreVersion: "0.4.0";
export const HOST_ADAPTER_VERSION: "1";

export interface P2LRNResourceUrlRequest {
  kind?: string;
  path?: string;
  mediaType?: string;
  size?: number;
  byteDigest?: string;
  contentDigest?: string;
  seekable?: boolean;
  compressionMethod?: number;
  sourceUrl?: string | null;
  representationId?: string;
  logicalDirectory?: string;
  rangeIntegrity?: unknown;
  [key: string]: unknown;
}

export interface P2LRNResolvedResourceUrl {
  url: string;
  verified: true;
  seekable?: boolean;
}

export interface P2LRNHostContext {
  packageId?: string | null;
  contentRoot?: string | null;
  entityId?: string;
  resourceId?: string;
  representationId?: string;
  [key: string]: unknown;
}

export interface P2LRNHostAdapterImplementation {
  loadState?(context: Readonly<P2LRNHostContext>): unknown | Promise<unknown>;
  saveState?(state: unknown, context: Readonly<P2LRNHostContext>): void | Promise<void>;
  reportScore?(score: unknown, context: Readonly<P2LRNHostContext>): void | Promise<void>;
  emitEvent?(event: unknown, context: Readonly<P2LRNHostContext>): void | Promise<void>;
  resolveResourceUrl?(request: Readonly<P2LRNResourceUrlRequest>, context: Readonly<P2LRNHostContext>): P2LRNResolvedResourceUrl | null | Promise<P2LRNResolvedResourceUrl | null>;
}

export interface P2LRNHostAdapter extends P2LRNHostAdapterImplementation {
  readonly version: "1";
}
export interface P2LRNHostCapabilityRequest {
  id: string;
  required?: boolean;
  operations?: string[];
  context?: string[];
  description?: string | null;
  fallback?: string | null;
}
export interface P2LRNCapabilityStatus {
  id: string;
  required: boolean;
  available: boolean;
  provider: string | null;
  operations: readonly string[];
  fallback: string | null;
}
export interface P2LRNCapabilityProvider {
  id: string;
  operations?: string[];
  replace?: boolean;
  supports?(operation: string, context: Readonly<Record<string, unknown>>): boolean | Promise<boolean>;
  available?(context: Readonly<Record<string, unknown>>): boolean | Promise<boolean>;
  invoke(operation: string, input: unknown, context: Readonly<Record<string, unknown>>): unknown | Promise<unknown>;
  describe?(): unknown | Promise<unknown>;
}
export interface P2LRNToolCapabilityProviderOptions {
  id: string;
  tools: Record<string,string>;
  callTool(tool: string, input: unknown, context: Readonly<Record<string,unknown>>, mapping: Readonly<{capabilityId:string; operation:string}>): unknown | Promise<unknown>;
  available?(context: Readonly<Record<string,unknown>>): boolean | Promise<boolean>;
  describe?(): unknown | Promise<unknown>;
}
export interface P2LRNCapabilityBrokerOptions {
  providers?: P2LRNCapabilityProvider[];
  authorize?(request: Readonly<{capabilityId:string; operation:string; input:unknown; context:unknown}>): boolean | Promise<boolean>;
}
export class CapabilityBroker {
  constructor(options?: P2LRNCapabilityBrokerOptions);
  register(provider: P2LRNCapabilityProvider): P2LRNCapabilityProvider;
  unregister(id: string): boolean;
  list(): readonly P2LRNCapabilityProvider[];
  negotiate(requests?: P2LRNHostCapabilityRequest[], context?: Record<string, unknown>): Promise<readonly P2LRNCapabilityStatus[]>;
  invoke(id: string, operation: string, input?: unknown, context?: Record<string, unknown>): Promise<unknown>;
}
export const HOST_CAPABILITY_EXTENSION: "https://p2lrn.org/ext/host-capabilities/1";
export const HOST_CAPABILITY_CONTRACT_VERSION: "1";
export function capabilityRequirements(entity: unknown): readonly P2LRNHostCapabilityRequest[];
export function mergeCapabilityRequirements(...groups: Array<readonly P2LRNHostCapabilityRequest[]>): readonly P2LRNHostCapabilityRequest[];
export function capabilityOperationAllowed(requests: readonly P2LRNHostCapabilityRequest[], id: string, operation: string): boolean;
export function validateCapabilityGraph(graph: unknown): true;
export function createCapabilityBroker(options?: P2LRNCapabilityBrokerOptions): CapabilityBroker;
export function createToolCapabilityProvider(options: P2LRNToolCapabilityProviderOptions): P2LRNCapabilityProvider;
export const COLLABORATION_CAPABILITY: "collaboration.room";
export const COLLABORATION_OPERATIONS: readonly ["join","send","listen","snapshot","leave"];
export interface P2LRNMemoryCollaborationHub {
  provider(options?: {participantId?: string | null}): P2LRNCapabilityProvider;
  inspect(): readonly unknown[];
}
export function createMemoryCollaborationHub(options?: {maxEvents?: number; clock?(): number}): P2LRNMemoryCollaborationHub;

export interface P2LRNOfflineStore {
  getState(key: string): Promise<unknown>;
  setState(key: string, state: unknown): Promise<void>;
  enqueue(item: unknown): Promise<void>;
  listOutbox(): Promise<unknown[]>;
  removeOutbox(id: string): Promise<void>;
  removeByCoalesceKey(key: string): Promise<void>;
  hasCoalesceKey(key: string): Promise<boolean>;
  clear(): Promise<void>;
}
export interface P2LRNOfflineSyncResult { attempted:number; acked:number; pending:number; online:boolean; }
export interface P2LRNOfflineHostAdapter extends P2LRNHostAdapterImplementation {
  readonly version: "1";
  readonly store: P2LRNOfflineStore;
  pending(): Promise<unknown[]>;
  clearLocal(): Promise<void>;
  sync(): Promise<P2LRNOfflineSyncResult>;
}
export interface P2LRNOfflineHostAdapterOptions {
  remote?: P2LRNHostAdapter | P2LRNHostAdapterImplementation | null;
  store?: P2LRNOfflineStore | null;
  online?(): boolean | Promise<boolean>;
  conflictResolver?(value: {local:unknown; remote:unknown; context:unknown; direction:'load'|'push'}): unknown | Promise<unknown>;
  storageNamespace?: string | null;
  dbName?: string;
}
export const OFFLINE_HOST_ADAPTER_VERSION: "1";
export const DEFAULT_OFFLINE_DB_NAME: "p2lrn-runtime-v1";
export function createMemoryOfflineStore(): P2LRNOfflineStore;
export function createIndexedDbOfflineStore(options: {namespace:string; name?:string}): P2LRNOfflineStore;
export function createOfflineHostAdapter(options?: P2LRNOfflineHostAdapterOptions): P2LRNOfflineHostAdapter;

export interface P2LRNActivitySnapshot { active:boolean; visible:boolean; focused:boolean; idle:boolean; totalActiveMs:number; idleAfterMs?:number; reason?:string; }
export interface P2LRNActivityTrackerOptions {
  target?: EventTarget | null;
  focusTarget?: EventTarget | null;
  interactionTarget?: EventTarget | null;
  idleAfterMs?: number;
  now?(): number;
  onEvent?(type:string, payload:Readonly<P2LRNActivitySnapshot>): void;
}
export interface P2LRNActivityTracker {
  snapshot(): Readonly<P2LRNActivitySnapshot>;
  markInteraction(): void;
  stop(): Readonly<P2LRNActivitySnapshot>;
}
export const DEFAULT_ACTIVITY_IDLE_AFTER_MS: 60000;
export function createActivityTracker(options?: P2LRNActivityTrackerOptions): P2LRNActivityTracker;


export interface P2LRNPackageCacheEntry {
  readonly sourceUrl: string;
  readonly contentRoot: string;
  readonly packageId: string;
  readonly bytes: ArrayBuffer;
  readonly size: number;
  readonly cachedAt: string;
}
export interface P2LRNPackageCacheMetadata {
  readonly sourceUrl: string;
  readonly contentRoot: string;
  readonly packageId: string;
  readonly size: number | null;
  readonly cachedAt: string | null;
}
export interface P2LRNPackageCache {
  put(entry: {sourceUrl:string;contentRoot:string;packageId:string;bytes:ArrayBuffer|ArrayBufferView;cachedAt?:string}): Promise<P2LRNPackageCacheEntry>;
  getByUrl(url:string): Promise<P2LRNPackageCacheEntry | null>;
  getByContentRoot(contentRoot:string): Promise<P2LRNPackageCacheEntry | null>;
  list(): Promise<readonly P2LRNPackageCacheMetadata[]>;
  deleteByUrl(url:string): Promise<boolean>;
  deleteByContentRoot(contentRoot:string): Promise<boolean>;
  clear?(): Promise<unknown>;
}
export const PACKAGE_CACHE_VERSION: '1';
export const DEFAULT_PACKAGE_CACHE_NAME: 'p2lrn-package-cache-v1';
export function createMemoryPackageCache(): P2LRNPackageCache;
export function createCacheStoragePackageCache(options?: {name?:string;cacheStorage?:CacheStorage}): P2LRNPackageCache;
export function createPackageCacheFetch(options: {store:P2LRNPackageCache;networkFetch?:typeof fetch|null;networkFirst?:boolean}): typeof fetch;
export function cacheP2LRNPackageURL(url:string, options?: {store?:P2LRNPackageCache;packageCache?:P2LRNPackageCache;fetchImpl?:typeof fetch;fetchOptions?:RequestInit;limits?:Readonly<Record<string,number>>}): Promise<P2LRNPackageCacheMetadata>;
export function openCachedP2LRNPackage(contentRoot:string, options?: {store?:P2LRNPackageCache;packageCache?:P2LRNPackageCache;limits?:Readonly<Record<string,number>>}): Promise<unknown>;

export interface P2LRNRuntimeHostConfig {
  readonly baseUrl: string | null;
}

export interface P2LRNRuntimeHostOptions {
  baseUrl?: string | null;
}

export interface P2LRNMountOptions {
  src?: string;
  node?: string;
  renderer?: string;
  runtimeBaseUrl?: string | null;
  adapter?: P2LRNHostAdapter | P2LRNHostAdapterImplementation | null;
  capabilityBroker?: CapabilityBroker | null;
  packageCache?: P2LRNPackageCache | null;
  activityTracking?: boolean | P2LRNActivityTrackerOptions;
}

export interface P2LRNServiceWorkerOptions {
  url?: string;
  scope?: string;
}

export interface P2LRNPublicAPI {
  readonly version: "0.5.0-alpha.11";
  readonly toolkitVersion: "0.5.0-alpha.11";
  readonly coreVersion: "0.4.0";
  readonly mount: typeof mountP2LRN;
  readonly PlayerElement: typeof P2LRNPlayerElement;
  readonly openPackageBytes: typeof openP2LRNPackageBytes;
  readonly openPackageURL: typeof openP2LRNPackageURL;
  readonly registerRenderer: typeof registerRenderer;
  readonly unregisterRenderer: typeof unregisterRenderer;
  readonly renderers: typeof renderers;
  readonly registerComponent: typeof registerComponent;
  readonly unregisterComponent: typeof unregisterComponent;
  readonly components: typeof components;
  readonly registerDependency: typeof registerDependency;
  readonly dependencies: typeof dependencies;
  readonly setPermissionPolicy: typeof setPermissionPolicy;
  readonly createHostAdapter: typeof createHostAdapter;
  readonly createCapabilityBroker: typeof createCapabilityBroker;
  readonly createToolCapabilityProvider: typeof createToolCapabilityProvider;
  readonly createMemoryCollaborationHub: typeof createMemoryCollaborationHub;
  readonly COLLABORATION_CAPABILITY: typeof COLLABORATION_CAPABILITY;
  readonly COLLABORATION_OPERATIONS: typeof COLLABORATION_OPERATIONS;
  readonly createOfflineHostAdapter: typeof createOfflineHostAdapter;
  readonly createMemoryOfflineStore: typeof createMemoryOfflineStore;
  readonly createIndexedDbOfflineStore: typeof createIndexedDbOfflineStore;
  readonly createActivityTracker: typeof createActivityTracker;
  readonly createMemoryPackageCache: typeof createMemoryPackageCache;
  readonly createCacheStoragePackageCache: typeof createCacheStoragePackageCache;
  readonly cachePackageURL: typeof cacheP2LRNPackageURL;
  readonly openCachedPackage: typeof openCachedP2LRNPackage;
  readonly DEFAULT_PACKAGE_CACHE_NAME: typeof DEFAULT_PACKAGE_CACHE_NAME;
  readonly HOST_CAPABILITY_EXTENSION: typeof HOST_CAPABILITY_EXTENSION;
  readonly DEFAULT_OFFLINE_DB_NAME: typeof DEFAULT_OFFLINE_DB_NAME;
  readonly DEFAULT_ACTIVITY_IDLE_AFTER_MS: typeof DEFAULT_ACTIVITY_IDLE_AFTER_MS;
  readonly configureRuntimeHost: typeof configureRuntimeHost;
  readonly getRuntimeHostConfig: typeof getRuntimeHostConfig;
  readonly installServiceWorker: typeof installP2LRNServiceWorker;
}

export class P2LRNPlayerElement extends HTMLElement {
  static readonly p2lrnVersion: "0.5.0-alpha.11";
  /** @deprecated Compatibility alias for Alpha15 integrations. */
  static readonly p2rlnVersion: "0.5.0-alpha.11";
  adapter: P2LRNHostAdapter | null;
  capabilityBroker: CapabilityBroker | null;
  packageCache: P2LRNPackageCache | null;
  cacheSource(options?: {store?:P2LRNPackageCache;fetchImpl?:typeof fetch;fetchOptions?:RequestInit;limits?:Readonly<Record<string,number>>}): Promise<P2LRNPackageCacheMetadata>;
  loadCachedPackage(contentRoot:string, options?: {store?:P2LRNPackageCache;limits?:Readonly<Record<string,number>>}): Promise<unknown>;
  startActivityTracking(options?: P2LRNActivityTrackerOptions): P2LRNActivityTracker;
  stopActivityTracking(): Readonly<P2LRNActivitySnapshot> | null;
  runtimeBaseUrl: string | null;
  reload(): Promise<void>;
}

export const DEFAULT_LIMITS: Readonly<Record<string, number>>;
export function createHostAdapter(implementation?: P2LRNHostAdapterImplementation): P2LRNHostAdapter;
export function configureRuntimeHost(options?: P2LRNRuntimeHostOptions): P2LRNRuntimeHostConfig;
export function getRuntimeHostConfig(): P2LRNRuntimeHostConfig;
export function normalizeRuntimeBaseUrl(value: string | null | undefined, options?: {baseUrl?: string}): string | null;
export function resolveScormRuntimeUrl(value?: string | null, options?: {applicationOrigin?: string | null}): string | null;
export function resolveH5pRuntimeUrl(value?: string | null, options?: {applicationOrigin?: string | null}): string | null;
export function mountP2LRN(target: string | Element, options?: P2LRNMountOptions): Promise<P2LRNPlayerElement>;
export function openP2LRNPackageBytes(buffer: ArrayBuffer, limits?: Readonly<Record<string, number>>): Promise<unknown>;
export function openP2LRNPackageURL(url: string, options?: {limits?:Readonly<Record<string,number>>;fetchImpl?:typeof fetch;fetchOptions?:RequestInit;packageCache?:P2LRNPackageCache|null;cacheMode?:'cache-only'|string}): Promise<unknown>;
export interface P2LRNServiceWorkerReady { readonly ok: true; readonly protocol: string; readonly scope?: string; }
export function installP2LRNServiceWorker(options?: P2LRNServiceWorkerOptions): Promise<P2LRNServiceWorkerReady>;
export function registerRenderer(descriptor: unknown): unknown;
export function unregisterRenderer(id: string): unknown;
export function renderers(): readonly unknown[];
export function registerComponent(descriptor: unknown): unknown;
export function unregisterComponent(id: string, componentVersion?: string): unknown;
export function components(): readonly unknown[];
export function registerDependency(descriptor: unknown): unknown;
export function dependencies(): readonly unknown[];
export function setPermissionPolicy(policy: unknown): unknown;

/** @deprecated Alpha15 compatibility aliases. */
export type P2RLNResourceUrlRequest = P2LRNResourceUrlRequest;
export type P2RLNResolvedResourceUrl = P2LRNResolvedResourceUrl;
export type P2RLNHostContext = P2LRNHostContext;
export type P2RLNHostAdapterImplementation = P2LRNHostAdapterImplementation;
export type P2RLNHostAdapter = P2LRNHostAdapter;
export type P2RLNRuntimeHostConfig = P2LRNRuntimeHostConfig;
export type P2RLNRuntimeHostOptions = P2LRNRuntimeHostOptions;
export type P2RLNMountOptions = P2LRNMountOptions;
export type P2RLNServiceWorkerOptions = P2LRNServiceWorkerOptions;
export type P2RLNServiceWorkerReady = P2LRNServiceWorkerReady;
export {P2LRNPlayerElement as P2RLNPlayerElement};
export const mountP2RLN: typeof mountP2LRN;
export const openP2RLNPackageBytes: typeof openP2LRNPackageBytes;
export const openP2RLNPackageURL: typeof openP2LRNPackageURL;
export const installP2RLNServiceWorker: typeof installP2LRNServiceWorker;

declare global {
  interface HTMLElementTagNameMap {
    'p2lrn-player': P2LRNPlayerElement;
    'p2rln-player': P2LRNPlayerElement;
  }
  var P2LRN: P2LRNPublicAPI | undefined;
  var P2LRNReady: Promise<P2LRNPublicAPI> | undefined;
  /** @deprecated Alpha15 compatibility global. */
  var P2RLN: P2LRNPublicAPI | undefined;
  /** @deprecated Alpha15 compatibility global. */
  var P2RLNReady: Promise<P2LRNPublicAPI> | undefined;
}

declare const api: P2LRNPublicAPI;
export default api;
