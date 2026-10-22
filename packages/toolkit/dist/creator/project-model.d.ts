export declare const PROJECT_FILE = "p2lrn.project.json";
export declare const LEGACY_PROJECT_FILE = "p2rln.project.json";
export declare const CURRENT_PROJECT_VERSION = "0.3.0";
export declare const KEY_RE: RegExp;
export type CreatorProject = Record<string, any>;
export declare function newProject(title: string, language?: string, description?: string): CreatorProject;
export declare function projectPath(root: string): string;
export declare function loadProject(root: string): {
    path: string;
    project: CreatorProject;
};
export declare function saveProject(path: string, project: CreatorProject): void;
export declare function upgradeProject(project: CreatorProject): CreatorProject;
export declare function upgradeProjectWorkspace(root: string): {
    sourcePath: string;
    projectPath: string;
    fromVersion: string;
    toVersion: string;
    changed: boolean;
    project: CreatorProject;
};
export declare function entityByKey(project: CreatorProject, key: string): any;
export declare function validateProject(project: CreatorProject): void;
