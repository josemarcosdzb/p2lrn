export const version: "0.5.0-alpha.13";
export const toolkitVersion: "0.5.0-alpha.13";
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


export type P2LRNResultIdentity =
  | {mode:'platform';issuer:string;subjectId:string;label?:string}
  | {mode:'code';code:string;issuer?:string;label?:string};
export interface P2LRNResultRecorder {
  readonly identity:P2LRNResultIdentity;
  readonly attemptId:string;
  readonly count:number;
  record(event:{type:string;detail?:unknown}):void;
  checkpoint():Promise<Record<string,unknown>>;
  restore(previous:Record<string,unknown>):Promise<{attemptId:string;restoredEvents:number}>;
  finish():Promise<Record<string,unknown>>;
  download(filename?:string):Promise<Record<string,unknown>>;
  stop():void;
}
export interface P2LRNResultOptions {
  identity:P2LRNResultIdentity;
  courseId?:string;
  courseTitle?:string;
  attemptId?:string;
  attemptNumber?:number;
  onResult?:(result:Record<string,unknown>)=>unknown|Promise<unknown>;
}
export declare function createResultRecorder(player:EventTarget,options:P2LRNResultOptions):P2LRNResultRecorder;

export const P2LRN_RESULT_HOST_VERSION: '1';
export interface P2LRNResultHost {
  loadCurrent(context:{courseId:string}):Promise<Record<string,unknown>|null>;
  saveResult(result:Record<string,unknown>):Promise<{saved?:boolean;[key:string]:unknown}>;
}
export interface P2LRNPlayerAnalyticsSession {
  readonly version:'1';
  readonly identity:P2LRNResultIdentity;
  readonly attemptId:string;
  readonly resumed:boolean;
  readonly lastSaveError:Error|null;
  checkpoint():Promise<Record<string,unknown>>;
  finish():Promise<Record<string,unknown>>;
  stop():void;
}
export function createPlayerAnalyticsSession(player:EventTarget,options:{
  identity:P2LRNResultIdentity;
  courseId:string;
  courseTitle?:string;
  host:P2LRNResultHost;
  autoSaveDelayMs?:number;
  onSaveError?:(error:Error)=>void;
}):Promise<P2LRNPlayerAnalyticsSession>;
export function createHttpResultHost(options?:{
  baseUrl?:string;
  fetchImpl?:typeof fetch;
  csrfToken?:string|(()=>string|Promise<string>);
  pageURL?:string;
}):P2LRNResultHost & {version:'1';indexUrl(courseId:string):string};


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
export function createMcpCapabilityProvider(options: P2LRNToolCapabilityProviderOptions): P2LRNCapabilityProvider;
export function projectCapabilityContext(request: P2LRNHostCapabilityRequest, value: Record<string,unknown>): Readonly<Record<string,unknown>>;
export const COLLABORATION_CAPABILITY: "collaboration.room";
export const COLLABORATION_OPERATIONS: readonly ["join","send","listen","snapshot","leave"];
export interface P2LRNMemoryCollaborationHub {
  provider(options?: {participantId?: string | null}): P2LRNCapabilityProvider;
  inspect(): readonly unknown[];
}
export function createMemoryCollaborationHub(options?: {maxEvents?: number; clock?(): number}): P2LRNMemoryCollaborationHub;
export const COLLABORATION_HTTP_VERSION: "1";
export const COLLABORATION_HTTP_MEDIA_TYPE: "application/vnd.p2lrn.collaboration+json";
export interface P2LRNHttpCollaborationProviderOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  credentials?: RequestCredentials;
  getHeaders?(request: Readonly<{operation:string;context:Readonly<Record<string,string>>}>): Record<string,string> | Promise<Record<string,string>>;
  requestTimeoutMs?: number;
  listenTimeoutMs?: number;
}
export function createHttpCollaborationProvider(options?: P2LRNHttpCollaborationProviderOptions): P2LRNCapabilityProvider;
export interface P2LRNSharedResourceRecord { readonly digest:string; readonly mediaType:string; readonly size:number; }
export interface P2LRNMemorySharedResourceStore {
  put(value:ArrayBuffer|ArrayBufferView|string, options?:{mediaType?:string}): Promise<P2LRNSharedResourceRecord & {readonly deduplicated:boolean}>;
  has(digest:string): boolean;
  get(digest:string): (P2LRNSharedResourceRecord & {readonly bytes:Uint8Array}) | null;
  list(): readonly P2LRNSharedResourceRecord[];
  delete(digest:string): boolean;
  clear(): void;
  resolve(request:Readonly<P2LRNResourceUrlRequest>): Promise<P2LRNResolvedResourceUrl|null>;
}
export function createMemorySharedResourceStore(): P2LRNMemorySharedResourceStore;
export interface P2LRNResourceLibraryEntry { readonly digest:string; readonly mediaType:string; readonly bytes:ArrayBuffer; readonly size:number; readonly storedAt:string; readonly href:string|null; }
export interface P2LRNResourceLibraryMetadata { readonly digest:string; readonly mediaType:string; readonly size:number|null; readonly storedAt:string|null; readonly href:string|null; }
export interface P2LRNResourceLibrary {
  put(entry:{digest:string;mediaType?:string;bytes:ArrayBuffer|ArrayBufferView;storedAt?:string;href?:string|null}):Promise<P2LRNResourceLibraryEntry>;
  get(digest:string):Promise<P2LRNResourceLibraryEntry|null>;
  has(digest:string):Promise<boolean>;
  delete(digest:string):Promise<boolean>;
  list():Promise<readonly P2LRNResourceLibraryMetadata[]>;
  clear?():Promise<void>;
}
export interface P2LRNResourceLibraryResolver {
  resolve(request:P2LRNResourceUrlRequest):Promise<P2LRNResolvedResourceUrl|null>;
  prefetch(request:{href:string;expectedDigest:string;mediaType?:string}):Promise<P2LRNResourceLibraryMetadata|null>;
  has(digest:string):Promise<boolean>;
  list():Promise<readonly P2LRNResourceLibraryMetadata[]>;
  destroy():void;
  readonly store:P2LRNResourceLibrary;
}
export const RESOURCE_LIBRARY_VERSION: "1";
export const RESOURCE_LIBRARY_CAPABILITY_ID: "resource.library";
export const DEFAULT_RESOURCE_LIBRARY_CACHE: "p2lrn-resource-library-v1";
export const DEFAULT_RESOURCE_LIBRARY_MAX_BYTES: number;
export function createMemoryResourceLibrary(options?:{maxBytes?:number}):P2LRNResourceLibrary;
export function createCacheStorageResourceLibrary(options?:{name?:string;cacheStorage?:CacheStorage;maxBytes?:number}):P2LRNResourceLibrary;
export function verifyResourceBytes(bytes:ArrayBuffer|ArrayBufferView,expectedDigest:string,options?:{maxBytes?:number}):Promise<Readonly<{bytes:ArrayBuffer;digest:string;size:number}>>;
export function createResourceLibraryResolver(options:{store:P2LRNResourceLibrary;networkFetch?:typeof fetch|null;maxBytes?:number;createObjectUrl?:(blob:Blob)=>string;revokeObjectUrl?:(url:string)=>void}):P2LRNResourceLibraryResolver;
export function createResourceLibraryCapabilityProvider(options:{store:P2LRNResourceLibrary;id?:string}):P2LRNCapabilityProvider;

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
export interface P2LRNOfflineSyncControllerSnapshot { readonly stopped:boolean; readonly running:boolean; readonly attempt:number; readonly lastResult:P2LRNOfflineSyncResult|null; readonly lastError:string|null; }
export interface P2LRNOfflineSyncController { syncNow():Promise<P2LRNOfflineSyncResult|null>; snapshot():P2LRNOfflineSyncControllerSnapshot; stop():void; }
export function createOfflineSyncController(options:{adapter:P2LRNOfflineHostAdapter;target?:EventTarget;baseDelayMs?:number;maxDelayMs?:number;autoStart?:boolean;onState?:(state:P2LRNOfflineSyncControllerSnapshot)=>void}):P2LRNOfflineSyncController;

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
export interface P2LRNLearningEvent { readonly schema:string; readonly version:string; readonly id:string; readonly sequence:number; readonly type:string; readonly category:string; readonly timestamp:string; readonly context:Readonly<Record<string,unknown>>; readonly payload:Readonly<Record<string,unknown>>; readonly sessionId?:string; readonly attemptId?:string; }
export interface P2LRNLearningEventStream { push(runtimeEvent:unknown):P2LRNLearningEvent; setSession(value:string|null):void; setAttempt(value:string|null):void; snapshot():Readonly<{sessionId:string|null;attemptId:string|null;sequence:number}>; }
export const LEARNING_EVENT_MODEL_VERSION: "1";
export const LEARNING_EVENT_SCHEMA: "https://p2lrn.org/schema/learning-event/1";
export const LEARNING_RUNTIME_EVENT_TYPES: readonly string[];
export const LEARNING_EVENT_CATEGORIES: readonly string[];
export function learningEventCategory(type:string,payload?:Record<string,unknown>):string;
export function createLearningEvent(runtimeEvent:unknown,options?:{sessionId?:string|null;attemptId?:string|null;sequence?:number;id?:string|null;category?:string|null}):P2LRNLearningEvent;
export function createLearningEventStream(options?:{sessionId?:string|null;attemptId?:string|null;startSequence?:number;onEvent?:(event:P2LRNLearningEvent)=>void}):P2LRNLearningEventStream;
export function isLearningEvent(value:unknown):boolean;
export function observeLearningEvents(options:{target:EventTarget;sessionId?:string|null;attemptId?:string|null;onEvent?:(event:P2LRNLearningEvent)=>void;types?:readonly string[]}):Readonly<{stream:P2LRNLearningEventStream;stop():void}>;


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
  resultIdentity?:P2LRNResultIdentity;
  courseTitle?:string;
  courseId?:string;
}

export interface P2LRNServiceWorkerOptions {
  url?: string;
  scope?: string;
}

/** An inspection report is not a certificate that SCORM/QTI/H5P fully executes. */
export interface P2LRNExecutionDiagnostic {
  readonly code:string;
  readonly message:string;
  readonly rendererId:string|null;
  readonly representationId:string|null;
}
export interface P2LRNExecutionPlan {
  readonly schema:'https://p2lrn.org/schema/execution-plan/1';
  readonly version:'1';
  readonly status:'ready'|'conditional'|'blocked';
  readonly offline:boolean;
  readonly rendererId:string|null;
  readonly rendererVersion:string|null;
  readonly representationId:string|null;
  readonly profile:string|null;
  readonly kind:string|null;
  readonly conformance:string|null;
  readonly limitations:readonly string[];
  readonly dependencies:readonly Readonly<{id:string;required:boolean;version?:string|null}>[];
  readonly permissions:readonly string[];
  readonly requiredCapabilities:readonly string[];
  readonly diagnostics:readonly P2LRNExecutionDiagnostic[];
}
export interface P2LRNExecutionNegotiationOptions {
  readonly representations?:readonly unknown[];
  readonly entity?:unknown;
  readonly resource?:unknown;
  readonly requestedRenderer?:string|null;
  readonly offline?:boolean;
  readonly roleRank?:(representation:unknown)=>number;
  readonly excludeRendererIds?:readonly string[];
  readonly context?:Readonly<Record<string,unknown>>;
  readonly requiredCapabilities?:readonly string[];
  readonly isCapabilityAvailable?:(id:string,context:Readonly<Record<string,unknown>>)=>boolean|Promise<boolean>;
}
export interface P2LRNPackageExecutionReport {
  readonly schema:'https://p2lrn.org/schema/execution-plan/1';
  readonly version:'1';
  readonly packageId:string|null;
  readonly contentRoot:string|null;
  readonly offline:boolean;
  readonly activities:readonly (P2LRNExecutionPlan & Readonly<{activityId:string;resourceId:string|null}>)[];
  readonly total:number;
  readonly ready:number;
  readonly conditional:number;
  readonly blocked:number;
}
export const executionPlanSchema:'https://p2lrn.org/schema/execution-plan/1';
export const executionPlanVersion:'1';
export function negotiateExecution(options?:P2LRNExecutionNegotiationOptions):
  Promise<Readonly<{candidate:unknown|null;report:P2LRNExecutionPlan}>>;
export function inspectPackageExecution(pkg:unknown,options?:{
  offline?:boolean;
  isCapabilityAvailable?:(id:string,context:Readonly<Record<string,unknown>>)=>boolean|Promise<boolean>;
}):Promise<P2LRNPackageExecutionReport>;

export interface P2LRNPublicAPI {
  readonly version: "0.5.0-alpha.13";
  readonly toolkitVersion: "0.5.0-alpha.13";
  readonly coreVersion: "0.4.0";
  readonly mount: typeof mountP2LRN;
  readonly createResultRecorder:typeof createResultRecorder;
  readonly PlayerElement: typeof P2LRNPlayerElement;
  readonly openPackageBytes: typeof openP2LRNPackageBytes;
  readonly openPackageURL: typeof openP2LRNPackageURL;
  readonly registerRenderer: typeof registerRenderer;
  readonly unregisterRenderer: typeof unregisterRenderer;
  readonly renderers: typeof renderers;
  readonly negotiateExecution:typeof negotiateExecution;
  readonly inspectPackageExecution:typeof inspectPackageExecution;
  readonly executionPlanSchema:typeof executionPlanSchema;
  readonly executionPlanVersion:typeof executionPlanVersion;
  readonly registerComponent: typeof registerComponent;
  readonly unregisterComponent: typeof unregisterComponent;
  readonly components: typeof components;
  readonly registerDependency: typeof registerDependency;
  readonly dependencies: typeof dependencies;
  readonly setPermissionPolicy: typeof setPermissionPolicy;
  readonly createHostAdapter: typeof createHostAdapter;
  readonly createCapabilityBroker: typeof createCapabilityBroker;
  readonly createToolCapabilityProvider: typeof createToolCapabilityProvider;
  readonly createMcpCapabilityProvider: typeof createMcpCapabilityProvider;
  readonly createMemoryCollaborationHub: typeof createMemoryCollaborationHub;
  readonly createHttpCollaborationProvider: typeof createHttpCollaborationProvider;
  readonly COLLABORATION_HTTP_VERSION: typeof COLLABORATION_HTTP_VERSION;
  readonly COLLABORATION_HTTP_MEDIA_TYPE: typeof COLLABORATION_HTTP_MEDIA_TYPE;
  readonly COLLABORATION_CAPABILITY: typeof COLLABORATION_CAPABILITY;
  readonly COLLABORATION_OPERATIONS: typeof COLLABORATION_OPERATIONS;
  readonly createMemorySharedResourceStore: typeof createMemorySharedResourceStore;
  readonly createMemoryResourceLibrary: typeof createMemoryResourceLibrary;
  readonly createCacheStorageResourceLibrary: typeof createCacheStorageResourceLibrary;
  readonly createResourceLibraryResolver: typeof createResourceLibraryResolver;
  readonly createResourceLibraryCapabilityProvider: typeof createResourceLibraryCapabilityProvider;
  readonly createOfflineHostAdapter: typeof createOfflineHostAdapter;
  readonly createMemoryOfflineStore: typeof createMemoryOfflineStore;
  readonly createIndexedDbOfflineStore: typeof createIndexedDbOfflineStore;
  readonly createOfflineSyncController: typeof createOfflineSyncController;
  readonly createActivityTracker: typeof createActivityTracker;
  readonly createLearningEvent: typeof createLearningEvent;
  readonly createLearningEventStream: typeof createLearningEventStream;
  readonly observeLearningEvents: typeof observeLearningEvents;
  readonly learningEventCategory: typeof learningEventCategory;
  readonly createMemoryPackageCache: typeof createMemoryPackageCache;
  readonly createCacheStoragePackageCache: typeof createCacheStoragePackageCache;
  readonly cachePackageURL: typeof cacheP2LRNPackageURL;
  readonly openCachedPackage: typeof openCachedP2LRNPackage;
  readonly DEFAULT_PACKAGE_CACHE_NAME: typeof DEFAULT_PACKAGE_CACHE_NAME;
  readonly HOST_CAPABILITY_EXTENSION: typeof HOST_CAPABILITY_EXTENSION;
  readonly DEFAULT_OFFLINE_DB_NAME: typeof DEFAULT_OFFLINE_DB_NAME;
  readonly RESOURCE_LIBRARY_CAPABILITY_ID: typeof RESOURCE_LIBRARY_CAPABILITY_ID;
  readonly DEFAULT_RESOURCE_LIBRARY_CACHE: typeof DEFAULT_RESOURCE_LIBRARY_CACHE;
  readonly LEARNING_EVENT_SCHEMA: typeof LEARNING_EVENT_SCHEMA;
  readonly LEARNING_EVENT_MODEL_VERSION: typeof LEARNING_EVENT_MODEL_VERSION;
  readonly DEFAULT_ACTIVITY_IDLE_AFTER_MS: typeof DEFAULT_ACTIVITY_IDLE_AFTER_MS;
  readonly configureRuntimeHost: typeof configureRuntimeHost;
  readonly getRuntimeHostConfig: typeof getRuntimeHostConfig;
  readonly installServiceWorker: typeof installP2LRNServiceWorker;
}

export class P2LRNPlayerElement extends HTMLElement {
  static readonly p2lrnVersion: "0.5.0-alpha.13";
  /** @deprecated Compatibility alias for Alpha15 integrations. */
  static readonly p2rlnVersion: "0.5.0-alpha.13";
  startResultCapture(options:P2LRNResultOptions):P2LRNResultRecorder;
  readonly resultRecorder:P2LRNResultRecorder|null;
  readonly packageId:string|null;
  readonly contentRoot:string|null;
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
