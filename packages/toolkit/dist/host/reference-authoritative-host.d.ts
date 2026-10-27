export declare const REFERENCE_AUTHORITATIVE_HOST_VERSION: "1";
type JsonObject = Record<string, any>;
export interface AuthoritativeHostSnapshot {
    version: typeof REFERENCE_AUTHORITATIVE_HOST_VERSION;
    states: Record<string, {
        value: any;
        updatedAt: string;
    }>;
    scores: Record<string, {
        reported: any;
        authoritative: any;
        updatedAt: string;
    }>;
    events: Array<{
        scopeKey: string;
        event: any;
        context: any;
        receivedAt: string;
        offlineDeliveryId: string | null;
    }>;
    deliveries: Record<string, {
        kind: string;
        receivedAt: string;
    }>;
}
export interface AuthoritativeHostStore {
    load(): Promise<AuthoritativeHostSnapshot>;
    save(snapshot: AuthoritativeHostSnapshot): Promise<void>;
}
export declare function createMemoryAuthoritativeHostStore(initial?: Partial<AuthoritativeHostSnapshot>): AuthoritativeHostStore;
export declare function createJsonFileAuthoritativeHostStore(filePath: string): AuthoritativeHostStore;
export interface ReferenceAuthoritativeHostOptions {
    partitionKey: (context: JsonObject) => string | Promise<string>;
    store?: AuthoritativeHostStore;
    grade?: (input: {
        reportedScore: any;
        context: JsonObject;
        state: any;
        events: any[];
    }) => any | Promise<any>;
    stateConflictPolicy?: 'last-write' | 'server-wins';
    mergeState?: (input: {
        current: any;
        incoming: any;
        context: JsonObject;
    }) => any | Promise<any>;
    resolveResourceUrl?: (request: any, context: JsonObject) => any | Promise<any>;
    now?: () => string;
}
export declare function createReferenceAuthoritativeHost(options: ReferenceAuthoritativeHostOptions): Readonly<{
    version: "1";
    adapter: Readonly<{
        version: "1";
        loadState(context?: JsonObject): Promise<any>;
        saveState(state: any, context?: JsonObject): Promise<void>;
        reportScore(score: any, context?: JsonObject): Promise<any>;
        emitEvent(event: any, context?: JsonObject): Promise<void>;
        resolveResourceUrl(request: any, context?: JsonObject): Promise<any>;
    }>;
    store: AuthoritativeHostStore;
    snapshot(): Promise<AuthoritativeHostSnapshot>;
    state(context?: JsonObject): Promise<{
        value: any;
        updatedAt: string;
    } | null>;
    score(context?: JsonObject): Promise<{
        reported: any;
        authoritative: any;
        updatedAt: string;
    } | null>;
    events(context?: JsonObject): Promise<{
        scopeKey: string;
        event: any;
        context: any;
        receivedAt: string;
        offlineDeliveryId: string | null;
    }[]>;
}>;
export {};
