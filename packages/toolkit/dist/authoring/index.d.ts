import { type BuildResult } from '../creator/builder.js';
import { type OpenPackageProjectOptions } from '../creator/import-project.js';
import { type CreatorProject } from '../creator/project.js';
/** Stable public contract consumed by P2LRN Studio and other authoring hosts. */
export declare const AUTHORING_API_VERSION: "1";
/** Current editable workspace schema written by the Node/TypeScript Creator. */
export declare const AUTHORING_PROJECT_VERSION: "0.3.0";
export declare const AUTHORING_FORMAT_VERSION: "0.4.0";
export interface AuthoringCreateOptions {
    title: string;
    language?: string;
    description?: string;
    force?: boolean;
}
export interface AuthoringBuildOptions {
    strictProfiles?: boolean;
}
export interface AuthoringTextOptions {
    language?: string;
    title?: string;
    description?: string | null;
}
export interface AuthoringCourseOptions extends AuthoringTextOptions {
    revision?: number;
    incrementRevision?: boolean;
}
export interface AuthoringUnitOptions {
    key: string;
    title: string;
    language?: string;
    role?: string;
    parent?: string;
}
export interface AuthoringFileOptions {
    source: string;
    key: string;
    title: string;
    language?: string;
    parent?: string;
    mediaType?: string;
    profile?: string;
    role?: string;
    activityType?: string;
    copyFile?: boolean;
}
export interface AuthoringUrlOptions {
    url: string;
    key: string;
    title: string;
    language?: string;
    parent?: string;
    mediaType?: string;
    profile?: string;
    role?: string;
    activityType?: string;
}
export interface AuthoringWebContentOptions {
    sourceDirectory: string;
    entrypoint?: string;
    key: string;
    title: string;
    language?: string;
    parent?: string;
    copyDirectory?: boolean;
}
export interface AuthoringQuestionnaireOptions {
    source: string;
    key: string;
    title?: string;
    language?: string;
    parent?: string;
    copyFile?: boolean;
    renderer?: string;
    rendererVersion?: string;
}
export interface AuthoringComponentOptions {
    source: string;
    key: string;
    title?: string;
    language?: string;
    parent?: string;
    copyFile?: boolean;
}
export interface AuthoringCompositeOptions {
    key: string;
    title: string;
    children: string[];
    language?: string;
    parent?: string;
    mode?: 'sequence' | 'free';
    completion?: 'all' | 'any';
    navigation?: 'linear' | 'open';
    moveChildren?: boolean;
}
export interface AuthoringUnitResult {
    unitKey: string;
    parentKey: string;
}
export interface AuthoringResourceActivityResult {
    resourceKey: string;
    activityKey: string;
    parentKey: string;
}
export interface AuthoringEntityTextResult {
    key: string;
    language: string;
}
export interface AuthoringChildrenResult {
    parentKey: string;
    children: string[];
}
export interface AuthoringWorkspaceSummary {
    apiVersion: typeof AUTHORING_API_VERSION;
    projectVersion: string;
    targetFormatVersion: string;
    projectId: string;
    projectFile: string;
    root: string;
    sourcePackage?: CreatorProject['sourcePackage'];
    counts: {
        units: number;
        resources: number;
        activities: number;
        objectives: number;
        relations: number;
        preservedFiles: number;
    };
}
export declare class P2LRNAuthoringWorkspace {
    #private;
    readonly root: string;
    readonly projectFile: string;
    private constructor();
    static create(root: string, options: AuthoringCreateOptions): P2LRNAuthoringWorkspace;
    static open(packagePath: string, root: string, options?: OpenPackageProjectOptions): P2LRNAuthoringWorkspace;
    static load(root: string): P2LRNAuthoringWorkspace;
    /** Detached project snapshot for inspection. Studio should edit through typed methods below. */
    get project(): CreatorProject;
    summary(): AuthoringWorkspaceSummary;
    reload(): CreatorProject;
    upgrade(): CreatorProject;
    /** @deprecated Low-level escape hatch. Studio integrations should use the typed editing methods. */
    replace(project: CreatorProject): CreatorProject;
    /** @deprecated Low-level escape hatch. Studio integrations should use the typed editing methods. */
    update(mutator: (draft: CreatorProject) => void): CreatorProject;
    setCourseMetadata(options: AuthoringCourseOptions): AuthoringEntityTextResult;
    setEntityText(key: string, options: AuthoringTextOptions): AuthoringEntityTextResult;
    setChildren(parentKey: string, children: string[]): AuthoringChildrenResult;
    addUnit(options: AuthoringUnitOptions): AuthoringUnitResult;
    addFile(options: AuthoringFileOptions): AuthoringResourceActivityResult;
    addUrl(options: AuthoringUrlOptions): AuthoringResourceActivityResult;
    addWebContent(options: AuthoringWebContentOptions): AuthoringResourceActivityResult;
    addQuestionnaire(options: AuthoringQuestionnaireOptions): AuthoringResourceActivityResult;
    addComponent(options: AuthoringComponentOptions): AuthoringResourceActivityResult;
    addComposite(options: AuthoringCompositeOptions): AuthoringResourceActivityResult;
    save(): void;
    build(output: string, options?: AuthoringBuildOptions): BuildResult;
}
export declare function createAuthoringWorkspace(root: string, options: AuthoringCreateOptions): P2LRNAuthoringWorkspace;
export declare function openAuthoringWorkspace(packagePath: string, root: string, options?: OpenPackageProjectOptions): P2LRNAuthoringWorkspace;
export declare function loadAuthoringWorkspace(root: string): P2LRNAuthoringWorkspace;
