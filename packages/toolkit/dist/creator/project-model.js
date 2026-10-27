import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { ProjectError } from '../core/errors.js';
import { newUrnUuid } from '../core/uuid.js';
import { COURSE_RIGHTS_EXTENSION, newCourseCreationDate } from '../core/course-rights.js';
import { NATIVE, FORMAT_VERSION, identifierIs } from '../core/constants.js';
import { validateSchema } from '../core/json-schema.js';
export const PROJECT_FILE = 'p2lrn.project.json';
export const LEGACY_PROJECT_FILE = 'p2rln.project.json';
export const CURRENT_PROJECT_VERSION = '0.3.0';
export const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function langMap(text, language) { if (text == null)
    return undefined; const v = text.trim(); return v ? { [language]: v } : undefined; }
export function newProject(title, language = 'es', description) { const course = { key: 'course', revision: 1, title: { [language]: title.trim() || 'Untitled course' }, languages: [language], children: [], extensions: { [COURSE_RIGHTS_EXTENSION]: { createdAt: newCourseCreationDate() } } }; const d = langMap(description, language); if (d)
    course.description = d; return { projectVersion: CURRENT_PROJECT_VERSION, targetFormatVersion: FORMAT_VERSION, projectId: newUrnUuid(), profilePolicy: 'derive', graphPolicy: 'derive', course, units: [], resources: [], activities: [], objectives: [], relations: [], profiles: [], preservedFiles: [] }; }
export function projectPath(root) { try {
    if (existsSync(root) && statSync(root).isDirectory()) {
        const current = join(root, PROJECT_FILE), legacy = join(root, LEGACY_PROJECT_FILE);
        return existsSync(current) ? current : existsSync(legacy) ? legacy : current;
    }
}
catch { } return extname(root) ? root : join(root, PROJECT_FILE); }
export function loadProject(root) { const path = projectPath(root); if (!existsSync(path))
    throw new ProjectError(`project file not found: ${path}`); let p; try {
    p = JSON.parse(new TextDecoder().decode(readFileSync(path)));
}
catch (e) {
    throw new ProjectError(`invalid project JSON: ${e instanceof Error ? e.message : String(e)}`);
} validateProject(p); return { path, project: p }; }
export function saveProject(path, project) { validateProject(project); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(project, null, 2) + '\n'); }
export function upgradeProject(project) { validateProject(project); const next = structuredClone(project); if (next.projectVersion === CURRENT_PROJECT_VERSION)
    return next; if (!['0.1.0', '0.2.0'].includes(next.projectVersion))
    throw new ProjectError(`cannot upgrade unsupported projectVersion: ${next.projectVersion}`); const previousVersion = String(next.projectVersion); next.projectVersion = CURRENT_PROJECT_VERSION; if (next.creatorMetadataVersion === undefined)
    next.creatorMetadataVersion = previousVersion; if (next.profilePolicy === undefined)
    next.profilePolicy = 'derive'; if (next.graphPolicy === undefined)
    next.graphPolicy = 'derive'; if (next.preservedFiles === undefined)
    next.preservedFiles = []; validateProject(next); return next; }
export function upgradeProjectWorkspace(root) { const loaded = loadProject(root), fromVersion = String(loaded.project.projectVersion), project = upgradeProject(loaded.project), workspace = dirname(loaded.path), target = join(workspace, PROJECT_FILE), legacy = join(workspace, LEGACY_PROJECT_FILE), changed = fromVersion !== project.projectVersion || resolve(loaded.path) !== resolve(target) || existsSync(legacy); saveProject(target, project); if (resolve(legacy) !== resolve(target) && existsSync(legacy))
    rmSync(legacy); return { sourcePath: loaded.path, projectPath: target, fromVersion, toVersion: project.projectVersion, changed, project }; }
export function entityByKey(project, key) { if (project.course?.key === key)
    return project.course; for (const group of ['units', 'resources', 'activities', 'objectives'])
    for (const e of project[group] ?? [])
        if (e.key === key)
            return e; throw new ProjectError(`unknown entity key: ${key}`); }
function keyKind(project) { const out = new Map([[project.course.key, 'course']]); for (const [group, kind] of [['units', 'unit'], ['resources', 'resource'], ['activities', 'activity'], ['objectives', 'objective']])
    for (const e of project[group] ?? [])
        out.set(e.key, kind); return out; }
export function validateProject(project) {
    if (!project || typeof project !== 'object' || Array.isArray(project))
        throw new ProjectError('invalid P2LRN creator project: project must be an object');
    const schemaId = project.projectVersion === '0.3.0' ? 'https://p2lrn.org/schema/creator-project/0.3.0' : 'https://p2lrn.org/schema/creator-project/0.2.0';
    try {
        validateSchema(schemaId, project, 'P2LRN creator project');
    }
    catch (e) {
        throw new ProjectError(e instanceof Error ? e.message : String(e));
    }
    if (!['0.1.0', '0.2.0', '0.3.0'].includes(project.projectVersion))
        throw new ProjectError(`unsupported projectVersion: ${project.projectVersion}`);
    if (project.targetFormatVersion !== FORMAT_VERSION)
        throw new ProjectError(`unsupported targetFormatVersion: ${project.targetFormatVersion}`);
    if (typeof project.projectId !== 'string' || !project.projectId)
        throw new ProjectError('projectId is required');
    if (!project.course || typeof project.course !== 'object')
        throw new ProjectError('course is required');
    for (const group of ['units', 'resources', 'activities', 'objectives', 'relations', 'profiles'])
        if (!Array.isArray(project[group]))
            throw new ProjectError(`${group} must be an array`);
    const keys = [project.course.key, ...['units', 'resources', 'activities', 'objectives'].flatMap((g) => (project[g] ?? []).map((e) => e.key))];
    if (keys.some((k) => typeof k !== 'string' || !KEY_RE.test(k)))
        throw new ProjectError('invalid project entity key');
    if (new Set(keys).size !== keys.length)
        throw new ProjectError('project entity keys must be globally unique');
    const known = new Set(keys), kind = keyKind(project), hierarchy = [project.course, ...project.units, ...project.activities];
    for (const e of hierarchy) {
        for (const child of e.children ?? [])
            if (!known.has(child))
                throw new ProjectError(`unknown child key ${JSON.stringify(child)} in ${e.key}`);
        if (project.activities.includes(e)) {
            const children = e.children ?? [];
            if (identifierIs(e.activityType, NATIVE.compositeActivityType)) {
                if (!children.length)
                    throw new ProjectError(`native composite must contain at least one child activity: ${e.key}`);
                for (const child of children)
                    if (kind.get(child) !== 'activity')
                        throw new ProjectError(`native composite children must be activities: ${e.key} -> ${child}`);
            }
        }
    }
    const map = new Map(hierarchy.map((e) => [e.key, e.children ?? []])), visiting = new Set(), visited = new Set();
    const visit = (key, trail) => { if (visiting.has(key))
        throw new ProjectError(`project hierarchy cycle: ${[...trail, key].join(' -> ')}`); if (visited.has(key) || !map.has(key))
        return; visiting.add(key); for (const c of map.get(key))
        visit(c, [...trail, key]); visiting.delete(key); visited.add(key); };
    for (const key of map.keys())
        visit(key, []);
    if (project.projectVersion === '0.3.0') {
        const portable = [];
        for (const e of [project.course, ...project.units, ...project.resources, ...project.activities, ...project.objectives])
            if (e.portableId !== undefined)
                portable.push(String(e.portableId));
        for (const r of project.resources)
            for (const rep of r.representations ?? [])
                if (rep.portableId !== undefined)
                    portable.push(String(rep.portableId));
        if (new Set(portable).size !== portable.length)
            throw new ProjectError('portableId values must be globally unique');
        if (project.entityOrder) {
            if (project.entityOrder.length !== keys.length || new Set(project.entityOrder).size !== keys.length || project.entityOrder.some((k) => !known.has(k)))
                throw new ProjectError('entityOrder must contain every entity key exactly once');
        }
        for (const ep of project.entrypoints ?? [])
            if (!known.has(ep.key))
                throw new ProjectError(`unknown entrypoint key: ${JSON.stringify(ep.key)}`);
        const preservedPaths = new Set();
        for (const f of project.preservedFiles ?? []) {
            if (preservedPaths.has(f.packagePath))
                throw new ProjectError(`duplicate preserved package path: ${f.packagePath}`);
            preservedPaths.add(f.packagePath);
        }
        const representationPaths = new Map();
        for (const r of project.resources)
            for (const rep of r.representations ?? []) {
                const src = rep.source;
                if (src?.type !== 'package-file' && src?.type !== 'package-member')
                    continue;
                if (preservedPaths.has(src.packagePath))
                    throw new ProjectError(`package path is declared both as preserved file and representation payload: ${src.packagePath}`);
                const signature = JSON.stringify({ path: src.path, mediaType: src.packageMediaType ?? rep.mediaType ?? null, method: src.method ?? null, schema: src.schema ?? null });
                const previous = representationPaths.get(src.packagePath);
                if (previous !== undefined && previous !== signature)
                    throw new ProjectError(`representation payload path has conflicting source declarations: ${src.packagePath}`);
                representationPaths.set(src.packagePath, signature);
            }
    }
    for (const a of project.activities) {
        if (a.resource && !known.has(a.resource))
            throw new ProjectError(`unknown resource key ${JSON.stringify(a.resource)} in ${a.key}`);
        for (const r of a.resources ?? [])
            if (!known.has(r))
                throw new ProjectError(`unknown resource key ${JSON.stringify(r)} in ${a.key}`);
        for (const o of a.objectives ?? [])
            if (!known.has(o))
                throw new ProjectError(`unknown objective key ${JSON.stringify(o)} in ${a.key}`);
    }
    for (const rel of project.relations)
        for (const side of ['source', 'target'])
            if (!known.has(rel[side]))
                throw new ProjectError(`unknown relation ${side} key: ${JSON.stringify(rel[side])}`);
    for (const r of project.resources) {
        if (!Array.isArray(r.representations) || !r.representations.length)
            throw new ProjectError(`resource requires representations: ${r.key}`);
        const repKeys = new Set();
        for (const rep of r.representations) {
            if (typeof rep.key !== 'string' || !KEY_RE.test(rep.key))
                throw new ProjectError(`invalid representation key in ${r.key}`);
            if (repKeys.has(rep.key))
                throw new ProjectError(`duplicate representation key in ${r.key}: ${rep.key}`);
            repKeys.add(rep.key);
            if (!rep.source || !['file', 'remote', 'web-directory', 'package-file', 'package-member'].includes(rep.source.type))
                throw new ProjectError(`invalid representation source in ${r.key}`);
        }
    }
}
//# sourceMappingURL=project-model.js.map