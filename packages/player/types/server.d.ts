export interface P2LRNRuntimeHostOptions {
  basePath?: string;
  allowedParentOrigins?: string[];
  h5pStandaloneDir?: string;
  h5pLibrariesDir?: string;
  maxH5pUploadBytes?: number;
  maxH5pFiles?: number;
  maxH5pPackageBytes?: number;
  h5pSessionTtlMs?: number;
  maxH5pSessions?: number;
  maxH5pSessionBytesTotal?: number;
}

export interface P2LRNRuntimeServerOptions extends P2LRNRuntimeHostOptions {
  host?: string;
  port?: number;
}

/** Minimal structural request shape used by the runtime handler. Compatible with Node IncomingMessage and Express-style middleware. */
export interface P2LRNRuntimeRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: string, listener: (...args: any[]) => void): unknown;
  destroy?(): unknown;
}

/** Minimal structural response shape used by the runtime handler. Compatible with Node ServerResponse and Express-style middleware. */
export interface P2LRNRuntimeResponse {
  statusCode: number;
  setHeader(name: string, value: string | number | readonly string[]): unknown;
  end(data?: unknown): unknown;
}

export type P2LRNRuntimeHandler = (req: P2LRNRuntimeRequest, res: P2LRNRuntimeResponse, next?: () => void) => void;

export interface P2LRNRuntimeServer {
  close(callback?: (error?: Error) => void): unknown;
  address(): unknown;
}

export interface P2LRNStartedRuntimeHost {
  readonly server: P2LRNRuntimeServer;
  readonly origin: string;
  readonly baseUrl: string;
  close(): Promise<void>;
}

export function createP2LRNRuntimeHandler(options?: P2LRNRuntimeHostOptions): P2LRNRuntimeHandler;
export function startP2LRNRuntimeHost(options?: P2LRNRuntimeServerOptions): Promise<P2LRNStartedRuntimeHost>;

/** @deprecated Alpha15 compatibility aliases. */
export type P2RLNRuntimeHostOptions = P2LRNRuntimeHostOptions;
export type P2RLNRuntimeServerOptions = P2LRNRuntimeServerOptions;
export type P2RLNRuntimeRequest = P2LRNRuntimeRequest;
export type P2RLNRuntimeResponse = P2LRNRuntimeResponse;
export type P2RLNRuntimeHandler = P2LRNRuntimeHandler;
export type P2RLNRuntimeServer = P2LRNRuntimeServer;
export type P2RLNStartedRuntimeHost = P2LRNStartedRuntimeHost;
export const createP2RLNRuntimeHandler: typeof createP2LRNRuntimeHandler;
export const startP2RLNRuntimeHost: typeof startP2LRNRuntimeHost;
