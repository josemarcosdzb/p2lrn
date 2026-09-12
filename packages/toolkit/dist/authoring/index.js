import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ProjectError } from '../core/errors.js';
import { FORMAT_VERSION } from '../core/constants.js';
import { buildProject } from '../creator/builder.js';
import { openPackageAsProject } from '../creator/import-project.js';
import { loadProject, newProject, projectPath, saveProject, upgradeProjectWorkspace, validateProject } from '../creator/project.js';
/** Stable public contract consumed by P2LRN Studio and other authoring hosts. */
export const AUTHORING_API_VERSION = '1';
/** Current editable workspace schema written by the Node/TypeScript Creator. */
export const AUTHORING_PROJECT_VERSION = '0.3.0';
export const AUTHORING_FORMAT_VERSION = FORMAT_VERSION;
function clone(value) { return structuredClone(value); }
function ensureReplaceableDirectory(root, force = false) {
    if (!existsSync(root)) {
        mkdirSync(root, { recursive: true });
        return;
    }
    if (readdirSync(root).length === 0)
        return;
    if (!force)
        throw new ProjectError(`authoring workspace is not empty: ${root}; use force to replace it`);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
}
export class P2LRNAuthoringWorkspace {
    root;
    projectFile;
    #project;
    constructor(root, projectFile, project) { this.root = root; this.projectFile = projectFile; this.#project = clone(project); }
    static create(root, options) {
        const target = resolve(root);
        ensureReplaceableDirectory(target, options.force);
        const project = newProject(options.title, options.language ?? 'es', options.description);
        const file = projectPath(target);
        saveProject(file, project);
        return new P2LRNAuthoringWorkspace(target, file, project);
    }
    static open(packagePath, root, options = {}) {
        openPackageAsProject(packagePath, root, options);
        return P2LRNAuthoringWorkspace.load(root);
    }
    static load(root) {
        const loaded = loadProject(root);
        return new P2LRNAuthoringWorkspace(resolve(dirname(loaded.path)), loaded.path, loaded.project);
    }
    get project() { return clone(this.#project); }
    summary() {
        const p = this.#project;
        return { apiVersion: AUTHORING_API_VERSION, projectVersion: p.projectVersion, targetFormatVersion: p.targetFormatVersion, projectId: p.projectId, projectFile: this.projectFile, root: this.root, ...(p.sourcePackage ? { sourcePackage: clone(p.sourcePackage) } : {}), counts: { units: p.units.length, resources: p.resources.length, activities: p.activities.length, objectives: p.objectives.length, relations: p.relations.length, preservedFiles: (p.preservedFiles ?? []).length } };
    }
    reload() { const loaded = loadProject(this.projectFile); this.#project = clone(loaded.project); return this.project; }
    upgrade() { const result = upgradeProjectWorkspace(this.root); this.#project = clone(result.project); return this.project; }
    replace(project) {
        const next = clone(project);
        validateProject(next);
        saveProject(this.projectFile, next);
        this.#project = next;
        return this.project;
    }
    update(mutator) {
        const draft = this.project;
        mutator(draft);
        return this.replace(draft);
    }
    save() { saveProject(this.projectFile, this.#project); }
    build(output, options = {}) { return buildProject(this.root, output, options.strictProfiles ?? false); }
}
export function createAuthoringWorkspace(root, options) { return P2LRNAuthoringWorkspace.create(root, options); }
export function openAuthoringWorkspace(packagePath, root, options = {}) { return P2LRNAuthoringWorkspace.open(packagePath, root, options); }
export function loadAuthoringWorkspace(root) { return P2LRNAuthoringWorkspace.load(root); }
