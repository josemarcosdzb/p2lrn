import { validatePackageBytes } from '../core/validator.js';
import type { Manifest } from '../core/types.js';
import { type CreatorProject } from './project.js';
export declare const RANGE_INTEGRITY_PATH = "integrity/range-integrity.json";
export interface CompiledProject {
    manifest: Manifest;
    payloads: Map<string, Uint8Array>;
    mediaByPath: Map<string, string>;
    graph: Record<string, unknown>;
}
export interface BuildResult {
    project: string;
    output: string;
    formatVersion: string;
    packageId: string;
    contentRoot: string;
    entities: number;
    files: number;
    validation: ReturnType<typeof validatePackageBytes>;
}
export declare function guessMediaType(path: string): string;
export declare function compileProject(projectRoot: string, project: CreatorProject): CompiledProject;
export declare function buildProject(projectRoot: string, output: string, strictProfiles?: boolean): BuildResult;
