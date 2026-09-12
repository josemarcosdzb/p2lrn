import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ProjectError } from '../core/errors.js';
import { FORMAT_VERSION } from '../core/constants.js';
import { buildProject } from '../creator/builder.js';
import { openPackageAsProject } from '../creator/import-project.js';
import { addComponent as creatorAddComponent, addComposite as creatorAddComposite, addFile as creatorAddFile, addQuestionnaire as creatorAddQuestionnaire, addUnit as creatorAddUnit, addUrl as creatorAddUrl, addWebContent as creatorAddWebContent, appendChild, entityByKey, loadProject, newProject, projectPath, saveProject, upgradeProjectWorkspace, validateProject, } from '../creator/project.js';
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
function normalizedLanguage(language, project) { return language?.trim() || project.course?.languages?.[0] || 'es'; }
function setLocalizedText(entity, options, language) {
    if (options.title !== undefined) {
        const value = options.title.trim();
        if (!value)
            throw new ProjectError('title must not be empty');
        entity.title ??= {};
        entity.title[language] = value;
    }
    if (options.description !== undefined) {
        entity.description ??= {};
        if (options.description === null || !options.description.trim())
            delete entity.description[language];
        else
            entity.description[language] = options.description.trim();
        if (Object.keys(entity.description).length === 0)
            delete entity.description;
    }
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
    static open(packagePath, root, options = {}) { openPackageAsProject(packagePath, root, options); return P2LRNAuthoringWorkspace.load(root); }
    static load(root) { const loaded = loadProject(root); return new P2LRNAuthoringWorkspace(resolve(dirname(loaded.path)), loaded.path, loaded.project); }
    /** Detached project snapshot for inspection. Studio should edit through typed methods below. */
    get project() { return clone(this.#project); }
    summary() { const p = this.#project; return { apiVersion: AUTHORING_API_VERSION, projectVersion: p.projectVersion, targetFormatVersion: p.targetFormatVersion, projectId: p.projectId, projectFile: this.projectFile, root: this.root, ...(p.sourcePackage ? { sourcePackage: clone(p.sourcePackage) } : {}), counts: { units: p.units.length, resources: p.resources.length, activities: p.activities.length, objectives: p.objectives.length, relations: p.relations.length, preservedFiles: (p.preservedFiles ?? []).length } }; }
    reload() { const loaded = loadProject(this.projectFile); this.#project = clone(loaded.project); return this.project; }
    upgrade() { const result = upgradeProjectWorkspace(this.root); this.#project = clone(result.project); return this.project; }
    /** @deprecated Low-level escape hatch. Studio integrations should use the typed editing methods. */
    replace(project) { const next = clone(project); validateProject(next); saveProject(this.projectFile, next); this.#project = next; return this.project; }
    /** @deprecated Low-level escape hatch. Studio integrations should use the typed editing methods. */
    update(mutator) { const draft = this.project; mutator(draft); return this.replace(draft); }
    #edit(operation) { const draft = clone(this.#project), result = operation(draft); validateProject(draft); saveProject(this.projectFile, draft); this.#project = draft; return result; }
    setCourseMetadata(options) {
        return this.#edit((draft) => { const language = normalizedLanguage(options.language, draft); setLocalizedText(draft.course, options, language); draft.course.languages = [...new Set([...(draft.course.languages ?? []), language])]; if (options.revision !== undefined && options.incrementRevision)
            throw new ProjectError('revision and incrementRevision are mutually exclusive'); if (options.revision !== undefined) {
            if (!Number.isInteger(options.revision) || options.revision < 0)
                throw new ProjectError('course revision must be a non-negative integer');
            draft.course.revision = options.revision;
        }
        else if (options.incrementRevision)
            draft.course.revision = (draft.course.revision ?? 0) + 1; return { key: draft.course.key, language }; });
    }
    setEntityText(key, options) {
        return this.#edit((draft) => { const language = normalizedLanguage(options.language, draft), entity = entityByKey(draft, key); setLocalizedText(entity, options, language); return { key, language }; });
    }
    setChildren(parentKey, children) {
        return this.#edit((draft) => { const unique = [...new Set(children)]; if (unique.length !== children.length)
            throw new ProjectError('children must not contain duplicate keys'); const parent = entityByKey(draft, parentKey); parent.children = []; for (const child of unique)
            appendChild(draft, parentKey, child); return { parentKey, children: [...unique] }; });
    }
    addUnit(options) {
        return this.#edit((draft) => { const parent = options.parent ?? 'course'; creatorAddUnit(draft, options.key, options.title, options.language ?? 'es', options.role ?? 'module', parent); return { unitKey: options.key, parentKey: parent }; });
    }
    addFile(options) {
        return this.#edit((draft) => { const parent = options.parent ?? 'course'; const [resource, activity] = creatorAddFile(this.root, draft, options.source, options.key, options.title, { language: options.language ?? 'es', parent, mediaType: options.mediaType, profile: options.profile, role: options.role ?? 'primary', activityType: options.activityType ?? 'https://p2lrn.org/type/resource', copyFile: options.copyFile !== false }); return { resourceKey: resource.key, activityKey: activity.key, parentKey: parent }; });
    }
    addUrl(options) {
        return this.#edit((draft) => { const parent = options.parent ?? 'course'; const [resource, activity] = creatorAddUrl(draft, options.url, options.key, options.title, { language: options.language ?? 'es', parent, mediaType: options.mediaType ?? 'text/html', profile: options.profile, role: options.role ?? 'primary', activityType: options.activityType ?? 'https://p2lrn.org/type/resource' }); return { resourceKey: resource.key, activityKey: activity.key, parentKey: parent }; });
    }
    addWebContent(options) {
        return this.#edit((draft) => { const parent = options.parent ?? 'course'; const [resource, activity] = creatorAddWebContent(this.root, draft, options.sourceDirectory, options.entrypoint ?? 'index.html', options.key, options.title, { language: options.language ?? 'es', parent, copyDirectory: options.copyDirectory !== false }); return { resourceKey: resource.key, activityKey: activity.key, parentKey: parent }; });
    }
    addQuestionnaire(options) {
        return this.#edit((draft) => { const parent = options.parent ?? 'course'; const [resource, activity] = creatorAddQuestionnaire(this.root, draft, options.source, options.key, options.title, { language: options.language ?? 'es', parent, copyFile: options.copyFile !== false, renderer: options.renderer, rendererVersion: options.rendererVersion }); return { resourceKey: resource.key, activityKey: activity.key, parentKey: parent }; });
    }
    addComponent(options) {
        return this.#edit((draft) => { const parent = options.parent ?? 'course'; const [resource, activity] = creatorAddComponent(this.root, draft, options.source, options.key, options.title, { language: options.language ?? 'es', parent, copyFile: options.copyFile !== false }); return { resourceKey: resource.key, activityKey: activity.key, parentKey: parent }; });
    }
    addComposite(options) {
        return this.#edit((draft) => { const parent = options.parent ?? 'course'; const [resource, activity] = creatorAddComposite(this.root, draft, options.key, options.title, { language: options.language ?? 'es', parent, mode: options.mode ?? 'sequence', completion: options.completion ?? 'all', navigation: options.navigation, children: options.children, moveChildren: options.moveChildren !== false }); return { resourceKey: resource.key, activityKey: activity.key, parentKey: parent }; });
    }
    save() { saveProject(this.projectFile, this.#project); }
    build(output, options = {}) { return buildProject(this.root, output, options.strictProfiles ?? false); }
}
export function createAuthoringWorkspace(root, options) { return P2LRNAuthoringWorkspace.create(root, options); }
export function openAuthoringWorkspace(packagePath, root, options = {}) { return P2LRNAuthoringWorkspace.open(packagePath, root, options); }
export function loadAuthoringWorkspace(root) { return P2LRNAuthoringWorkspace.load(root); }
