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


export const P2LRN_COLLABORATION_HTTP_VERSION: "1";
export const P2LRN_COLLABORATION_HTTP_MEDIA_TYPE: "application/vnd.p2lrn.collaboration+json";
export const P2LRN_COLLABORATION_OPERATIONS: readonly ["join","send","listen","snapshot","leave"];

export interface P2LRNCollaborationOperationContext {
  actor: unknown;
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  request: P2LRNRuntimeRequest;
}
export interface P2LRNCollaborationService {
  join(value: P2LRNCollaborationOperationContext): unknown | Promise<unknown>;
  send(value: P2LRNCollaborationOperationContext): unknown | Promise<unknown>;
  listen(value: P2LRNCollaborationOperationContext): unknown | Promise<unknown>;
  snapshot(value: P2LRNCollaborationOperationContext): unknown | Promise<unknown>;
  leave(value: P2LRNCollaborationOperationContext): unknown | Promise<unknown>;
}
export interface P2LRNCollaborationHandlerOptions {
  allowedOrigins: string[];
  allowedRequestHeaders?: string[];
  authenticate(request: P2LRNRuntimeRequest): unknown | null | Promise<unknown | null>;
  resolveContext(value: Readonly<{request:P2LRNRuntimeRequest;actor:unknown;operation:string;input:Record<string,unknown>;clientContext:Record<string,unknown>}>): Record<string,unknown> | Promise<Record<string,unknown>>;
  authorize(value: Readonly<{request:P2LRNRuntimeRequest;actor:unknown;operation:string;input:Record<string,unknown>;context:Record<string,unknown>}>): boolean | Promise<boolean>;
  service: P2LRNCollaborationService;
  maxBodyBytes?: number;
  maxRequestsPerMinute?: number;
  rateLimitKey?(actor: unknown): string;
}
export function createP2LRNCollaborationService(implementation: P2LRNCollaborationService): P2LRNCollaborationService;
export function createP2LRNCollaborationHandler(options: P2LRNCollaborationHandlerOptions): (req:P2LRNRuntimeRequest,res:P2LRNRuntimeResponse,next?:()=>void)=>void;
