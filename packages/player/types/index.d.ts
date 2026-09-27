export const version: "0.5.0-alpha.1";
export const toolkitVersion: "0.5.0-alpha.1";
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

export interface P2LRNRuntimeLaunchRequest {
  runtime: string;
  profile?: string;
  source?: {type?: string; href?: string; package?: string; member?: string; path?: string; [key: string]: unknown};
  sourceAuId?: string | null;
  moveOn?: string | null;
  masteryScore?: string | number | null;
  launchMethod?: string | null;
  launchParameters?: string | null;
  entitlementKey?: string | null;
  [key: string]: unknown;
}

export interface P2LRNResolvedRuntimeLaunch {
  url: string;
  launchMethod?: 'AnyWindow' | 'OwnWindow' | string;
  sessionId?: string;
  expiresAt?: string;
  completion?: Promise<unknown>;
  [key: string]: unknown;
}

export interface P2LRNXapiStatementIntent {
  schema: "https://p2lrn.org/schema/xapi-statement-intent/1";
  version: "1";
  timestamp: string;
  verb: {id: string; display?: Record<string,string>};
  object: {objectType: "Activity"; id: string};
  result?: Record<string,unknown>;
  profileId?: string;
  source?: Record<string,unknown>;
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
  emitXapiStatementIntent?(intent: Readonly<P2LRNXapiStatementIntent>, context: Readonly<P2LRNHostContext>): void | Promise<void>;
  resolveResourceUrl?(request: Readonly<P2LRNResourceUrlRequest>, context: Readonly<P2LRNHostContext>): P2LRNResolvedResourceUrl | null | Promise<P2LRNResolvedResourceUrl | null>;
  resolveRuntimeLaunch?(request: Readonly<P2LRNRuntimeLaunchRequest>, context: Readonly<P2LRNHostContext>): P2LRNResolvedRuntimeLaunch | null | Promise<P2LRNResolvedRuntimeLaunch | null>;
}

export interface P2LRNHostAdapter extends P2LRNHostAdapterImplementation {
  readonly version: "1";
}

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
  representationRole?: string | null;
  adapter?: P2LRNHostAdapter | P2LRNHostAdapterImplementation | null;
}

export interface P2LRNServiceWorkerOptions {
  url?: string;
  scope?: string;
}

export interface P2LRNPublicAPI {
  readonly version: "0.5.0-alpha.1";
  readonly toolkitVersion: "0.5.0-alpha.1";
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
  readonly configureRuntimeHost: typeof configureRuntimeHost;
  readonly getRuntimeHostConfig: typeof getRuntimeHostConfig;
  readonly installServiceWorker: typeof installP2LRNServiceWorker;
}

export class P2LRNPlayerElement extends HTMLElement {
  static readonly p2lrnVersion: "0.5.0-alpha.1";
  /** @deprecated Compatibility alias for Alpha15 integrations. */
  static readonly p2rlnVersion: "0.5.0-alpha.1";
  adapter: P2LRNHostAdapter | null;
  runtimeBaseUrl: string | null;
  preferredRepresentationRole: string | null;
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
export function openP2LRNPackageURL(url: string, options?: Record<string, unknown>): Promise<unknown>;
export function representationRoleRank(representation: {role?: string} | null | undefined, preferredRole?: string | null): number;
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
