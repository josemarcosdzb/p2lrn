import { ZipArchive } from './zip.js';
import type { GraphDocument, GraphEntity, Manifest, ValidationSummary } from './types.js';
export interface ValidatedPackage {
    summary: ValidationSummary;
    manifest: Manifest;
    graph: GraphDocument;
    archive: ZipArchive;
    entities: Map<string, GraphEntity>;
}
export interface ValidateOptions {
    strictProfiles?: boolean;
    validateProfilePayloads?: boolean;
}
export declare function validateGraphSemantics(graph: GraphDocument, manifest: Manifest): Map<string, GraphEntity>;
export declare function validatePackageBytes(bytes: Uint8Array, options?: ValidateOptions): ValidatedPackage;
export declare function validatePackageFile(path: string, options?: ValidateOptions): ValidatedPackage;
