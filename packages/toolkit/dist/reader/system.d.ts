import { P2LRNReader, CapabilitySet } from './index.js';
export declare function guessReaderMediaType(path: string): string;
export declare function b64u(value: string): string;
export declare function b64uDecode(value: string): string;
export declare class ReaderSystemError extends Error {
    constructor(message: string);
}
export interface ViewTarget {
    status: string;
    entityId: string;
    resourceId?: string;
    representationId?: string;
    kind?: string;
    url?: string;
    mediaType?: string;
    runtime?: string;
    reason?: string;
    metadata: Record<string, unknown>;
}
export declare class P2LRNReadingSystem {
    readonly reader: P2LRNReader;
    readonly packagePath: string;
    readonly capabilityDocument: any;
    readonly capabilities: CapabilitySet;
    readonly componentCapabilityDocument: any;
    readonly componentCapabilities: Map<string, any>;
    readonly manifestFiles: Map<string, any>;
    private validatedIdentity;
    constructor(packagePath: string, options?: {
        validateProfilePayloads?: boolean;
    });
    summary(): any;
    tree(): any;
    entity(id: string): any;
    readPlan(): any;
    importPlan(): any;
    private entityResource;
    viewTarget(entityId: string, token: string): ViewTarget;
    assertPackageUnchanged(): void;
    resolveWebAsset(representationId: string, logicalPath: string): string;
    virtualOuterInfo(path: string): any;
    readOuter(path: string, maxBytes?: number): [Uint8Array, string];
    readPackageMember(packagePath: string, member: string, maxBytes?: number): [Uint8Array, string];
}
