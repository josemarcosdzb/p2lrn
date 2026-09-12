import type {IncomingMessage, Server, ServerResponse} from 'node:http';

export interface P2RLNRuntimeHostOptions {
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

export interface P2RLNRuntimeServerOptions extends P2RLNRuntimeHostOptions {
  host?: string;
  port?: number;
}

export type P2RLNRuntimeHandler = (req: IncomingMessage, res: ServerResponse, next?: () => void) => void;

export interface P2RLNStartedRuntimeHost {
  readonly server: Server;
  readonly origin: string;
  readonly baseUrl: string;
  close(): Promise<void>;
}

export function createP2RLNRuntimeHandler(options?: P2RLNRuntimeHostOptions): P2RLNRuntimeHandler;
export function startP2RLNRuntimeHost(options?: P2RLNRuntimeServerOptions): Promise<P2RLNStartedRuntimeHost>;
