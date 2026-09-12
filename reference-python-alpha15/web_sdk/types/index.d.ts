export const version: "0.4.0-alpha.15";
export const toolkitVersion: "0.4.0a15";
export const coreVersion: "0.4.0";
export const HOST_ADAPTER_VERSION: "1";

export interface P2RLNResourceUrlRequest {
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

export interface P2RLNResolvedResourceUrl {
  url: string;
  verified: true;
  seekable?: boolean;
}

export interface P2RLNHostContext {
  packageId?: string | null;
  contentRoot?: string | null;
  entityId?: string;
  resourceId?: string;
  representationId?: string;
  [key: string]: unknown;
}

export interface P2RLNHostAdapterImplementation {
  loadState?(context: Readonly<P2RLNHostContext>): unknown | Promise<unknown>;
  saveState?(state: unknown, context: Readonly<P2RLNHostContext>): void | Promise<void>;
  reportScore?(score: unknown, context: Readonly<P2RLNHostContext>): void | Promise<void>;
  emitEvent?(event: unknown, context: Readonly<P2RLNHostContext>): void | Promise<void>;
  resolveResourceUrl?(request: Readonly<P2RLNResourceUrlRequest>, context: Readonly<P2RLNHostContext>): P2RLNResolvedResourceUrl | null | Promise<P2RLNResolvedResourceUrl | null>;
}

export interface P2RLNHostAdapter extends P2RLNHostAdapterImplementation {
  readonly version: "1";
}

export interface P2RLNRuntimeHostConfig {
  readonly baseUrl: string | null;
}

export interface P2RLNRuntimeHostOptions {
  baseUrl?: string | null;
}

export interface P2RLNMountOptions {
  src?: string;
  node?: string;
  renderer?: string;
  runtimeBaseUrl?: string | null;
  adapter?: P2RLNHostAdapter | P2RLNHostAdapterImplementation | null;
}

export interface P2RLNServiceWorkerOptions {
  url?: string;
  scope?: string;
}

export interface P2RLNPublicAPI {
  readonly version: "0.4.0-alpha.15";
  readonly toolkitVersion: "0.4.0a15";
  readonly coreVersion: "0.4.0";
  readonly mount: typeof mountP2RLN;
  readonly PlayerElement: typeof P2RLNPlayerElement;
  readonly openPackageBytes: typeof openP2RLNPackageBytes;
  readonly openPackageURL: typeof openP2RLNPackageURL;
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
  readonly installServiceWorker: typeof installP2RLNServiceWorker;
}

export class P2RLNPlayerElement extends HTMLElement {
  static readonly p2rlnVersion: "0.4.0-alpha.15";
  adapter: P2RLNHostAdapter | null;
  runtimeBaseUrl: string | null;
  reload(): Promise<void>;
}

export const DEFAULT_LIMITS: Readonly<Record<string, number>>;
export function createHostAdapter(implementation?: P2RLNHostAdapterImplementation): P2RLNHostAdapter;
export function configureRuntimeHost(options?: P2RLNRuntimeHostOptions): P2RLNRuntimeHostConfig;
export function getRuntimeHostConfig(): P2RLNRuntimeHostConfig;
export function normalizeRuntimeBaseUrl(value: string | null | undefined, options?: {baseUrl?: string}): string | null;
export function resolveScormRuntimeUrl(value?: string | null, options?: {applicationOrigin?: string | null}): string | null;
export function resolveH5pRuntimeUrl(value?: string | null, options?: {applicationOrigin?: string | null}): string | null;
export function mountP2RLN(target: string | Element, options?: P2RLNMountOptions): Promise<P2RLNPlayerElement>;
export function openP2RLNPackageBytes(buffer: ArrayBuffer, limits?: Readonly<Record<string, number>>): Promise<unknown>;
export function openP2RLNPackageURL(url: string, options?: Record<string, unknown>): Promise<unknown>;
export interface P2RLNServiceWorkerReady { readonly ok: true; readonly protocol: string; readonly scope?: string; }
export function installP2RLNServiceWorker(options?: P2RLNServiceWorkerOptions): Promise<P2RLNServiceWorkerReady>;
export function registerRenderer(descriptor: unknown): unknown;
export function unregisterRenderer(id: string): unknown;
export function renderers(): readonly unknown[];
export function registerComponent(descriptor: unknown): unknown;
export function unregisterComponent(id: string, componentVersion?: string): unknown;
export function components(): readonly unknown[];
export function registerDependency(descriptor: unknown): unknown;
export function dependencies(): readonly unknown[];
export function setPermissionPolicy(policy: unknown): unknown;

declare global {
  interface HTMLElementTagNameMap {
    'p2rln-player': P2RLNPlayerElement;
  }
  var P2RLN: P2RLNPublicAPI | undefined;
  var P2RLNReady: Promise<P2RLNPublicAPI> | undefined;
}

declare const api: P2RLNPublicAPI;
export default api;
