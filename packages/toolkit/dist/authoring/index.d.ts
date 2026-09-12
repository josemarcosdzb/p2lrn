import { type BuildResult } from '../creator/builder.js';
import { type OpenPackageProjectOptions } from '../creator/import-project.js';
import { type CreatorProject } from '../creator/project.js';
/** Stable public contract consumed by P2LRN Studio and other authoring hosts. */
export declare const AUTHORING_API_VERSION: "1";
/** Current editable workspace schema written by the Node/TypeScript Creator. */
export declare const AUTHORING_PROJECT_VERSION: "0.3.0";
export declare const AUTHORING_FORMAT_VERSION: "0.4.0";
export interface AuthoringCreateOptions { title: string; language?: string; description?: string; force?: boolean; }
export interface AuthoringBuildOptions { strictProfiles?: boolean; }
export interface AuthoringWorkspaceSummary { apiVersion: typeof AUTHORING_API_VERSION; projectVersion: string; targetFormatVersion: string; projectId: string; projectFile: string; root: string; sourcePackage?: CreatorProject['sourcePackage']; counts: { units: number; resources: number; activities: number; objectives: number; relations: number; preservedFiles: number; }; }
export declare class P2LRNAuthoringWorkspace { #private; readonly root: string; readonly projectFile: string; private constructor(); static create(root: string, options: AuthoringCreateOptions): P2LRNAuthoringWorkspace; static open(packagePath: string, root: string, options?: OpenPackageProjectOptions): P2LRNAuthoringWorkspace; static load(root: string): P2LRNAuthoringWorkspace; get project(): CreatorProject; summary(): AuthoringWorkspaceSummary; reload(): CreatorProject; upgrade(): CreatorProject; replace(project: CreatorProject): CreatorProject; update(mutator: (draft: CreatorProject) => void): CreatorProject; save(): void; build(output: string, options?: AuthoringBuildOptions): BuildResult; }
export declare function createAuthoringWorkspace(root: string, options: AuthoringCreateOptions): P2LRNAuthoringWorkspace;
export declare function openAuthoringWorkspace(packagePath: string, root: string, options?: OpenPackageProjectOptions): P2LRNAuthoringWorkspace;
export declare function loadAuthoringWorkspace(root: string): P2LRNAuthoringWorkspace;
