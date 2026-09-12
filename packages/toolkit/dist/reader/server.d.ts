import { P2LRNReadingSystem } from './system.js';
export declare class ReaderServer {
    readonly system: P2LRNReadingSystem;
    readonly host: string;
    readonly verbose: boolean;
    readonly token: string;
    private server;
    port: number;
    constructor(system: P2LRNReadingSystem, host?: string, port?: number, verbose?: boolean);
    get url(): string;
    private headers;
    private json;
    private bytes;
    private auth;
    private hostOk;
    private staticFile;
    private packageResponse;
    private virtualResponse;
    start(): Promise<string>;
    stop(): Promise<void>;
}
