export interface OpenPackageProjectOptions {
    force?: boolean;
}
export interface OpenPackageProjectResult {
    package: string;
    project: string;
    sourceFormat: string;
    sourcePackageId: string;
    sourceContentRoot: string;
    entities: number;
    files: number;
    preservedFiles: number;
    canonicalMigration: boolean;
}
export declare function workspacePath(packagePath: string): string;
export declare function openPackageAsProject(packagePath: string, projectRoot: string, options?: OpenPackageProjectOptions): OpenPackageProjectResult;
