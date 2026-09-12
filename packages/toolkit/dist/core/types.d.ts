export interface EntryPoint {
    id: string;
    type: string;
    role: string;
}
export interface ProfileDeclaration {
    id: string;
    version: string;
    requirement: 'required' | 'optional' | string;
}
export interface DigestDescriptor {
    path: string;
    mediaType: string;
    size: number;
    byteDigest: string;
    contentDigest: string;
    schema?: string;
}
export interface Manifest {
    format: string;
    formatVersion: string;
    packageId: string;
    entrypoints: EntryPoint[];
    graph: DigestDescriptor & {
        schema: string;
    };
    profiles: ProfileDeclaration[];
    files: DigestDescriptor[];
    integrity: {
        algorithm: string;
        contentRoot: string;
    };
    [key: string]: unknown;
}
export interface Representation {
    id: string;
    role?: string;
    mediaType?: string;
    profile?: string;
    location?: Record<string, unknown>;
    extensions?: Record<string, unknown>;
    [key: string]: unknown;
}
export interface GraphEntity {
    id: string;
    type: string;
    title?: Record<string, string>;
    children?: string[];
    resource?: string;
    resources?: string[];
    objectives?: string[];
    representations?: Representation[];
    extensions?: Record<string, unknown>;
    [key: string]: unknown;
}
export interface GraphDocument {
    graphVersion: string;
    entities: GraphEntity[];
    relations: Array<{
        source: string;
        target: string;
        [key: string]: unknown;
    }>;
    extensions?: Record<string, unknown>;
    [key: string]: unknown;
}
export interface ValidationSummary {
    format: string;
    formatVersion: string;
    packageId: string;
    contentRoot: string;
    entities: number;
    files: number;
    unknownRequiredProfiles: string[];
}
