import { type ValidatedPackage, type ValidateOptions } from '../core/validator.js';
import type { GraphEntity, Representation } from '../core/types.js';
export declare class CapabilitySet {
    readonly profiles: ReadonlyMap<string, ReadonlySet<string>>;
    constructor(profiles: ReadonlyMap<string, ReadonlySet<string>>);
    static fromDocument(obj: any): CapabilitySet;
    static fromPath(path: string): CapabilitySet;
    static permissiveReader(profiles: Iterable<string>): CapabilitySet;
    supports(profile: string | undefined, mode: string): boolean;
}
export declare class P2LRNReader {
    readonly package: ValidatedPackage;
    readonly entities: Map<string, GraphEntity>;
    readonly representations: Map<string, {
        resourceId: string;
        representation: Representation;
    }>;
    readonly entrypoints: any[];
    readonly declaredProfiles: Map<string, any>;
    constructor(source: string | Uint8Array, options?: ValidateOptions);
    summary(path?: string): Record<string, unknown>;
    entity(id: string): GraphEntity;
    primaryEntrypoint(): any;
    private displayTitle;
    tree(entrypointId?: string, langs?: string[]): Record<string, unknown>;
    representationCandidates(resourceId: string): Representation[];
    chooseRepresentation(resourceId: string, capabilities: CapabilitySet, mode?: string, preferEmbedded?: boolean): Representation | undefined;
    private profileExtension;
    representationPlan(rep: Representation): Record<string, unknown>;
    activityPlan(activityId: string, capabilities: CapabilitySet, mode?: string): Record<string, unknown>;
    courseReadPlan(capabilities: CapabilitySet, entrypointId?: string, mode?: string): Record<string, unknown>;
    resourceImportPlan(resourceId: string, capabilities: CapabilitySet): Record<string, unknown>;
    importPlan(capabilities: CapabilitySet, entrypointId?: string): Record<string, unknown>;
    readEmbeddedFile(path: string, maxBytes?: number): Uint8Array;
    readPackageMember(packagePath: string, member: string, maxBytes?: number): Uint8Array;
    transformationReport(): Record<string, unknown> | null;
}
export declare function openReaderFile(path: string, options?: ValidateOptions): P2LRNReader;
export { P2LRNReadingSystem, ReaderSystemError, b64u, b64uDecode, guessReaderMediaType } from './system.js';
export { ReaderServer } from './server.js';
