import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { ProjectError } from '../core/errors.js';
import { uuid5, URL_NAMESPACE } from '../core/uuid.js';
import { NATIVE, PROFILE, identifierIs, canonicalIdentifier } from '../core/constants.js';
import { NATIVE_QUESTIONNAIRE_MEDIA_TYPE, NATIVE_QUESTIONNAIRE_PROFILE, validateQuestionnaire } from '../core/native-questionnaire.js';
import { NATIVE_COMPONENT_ACTIVITY_TYPE, NATIVE_COMPONENT_MEDIA_TYPE, NATIVE_COMPONENT_PROFILE, validateComponentInstance } from '../core/native-component.js';
import { NATIVE_COMPOSITE_ACTIVITY_TYPE, NATIVE_COMPOSITE_MEDIA_TYPE, NATIVE_COMPOSITE_PROFILE, NATIVE_COMPOSITE_SCHEMA, validateComposite } from '../core/native-composite.js';
import { KEY_RE, entityByKey, validateProject } from './project-model.js';
export function appendChild(project, parentKey, childKey) {
    const parent = entityByKey(project, parentKey);
    let allowed = parent === project.course || project.units.includes(parent);
    if (project.activities.includes(parent) && identifierIs(parent.activityType, NATIVE.compositeActivityType))
        allowed = true;
    if (!allowed)
        throw new ProjectError('children can only be attached to course, unit, or native composite activity entities');
    if (project.activities.includes(parent) && !project.activities.includes(entityByKey(project, childKey)))
        throw new ProjectError('native composite children must be activities');
    parent.children ??= [];
    if (!parent.children.includes(childKey))
        parent.children.push(childKey);
    // Imported workspaces preserve their original entityOrder; newly authored entities
    // must be appended without reordering or dropping previously imported entities.
    if (Array.isArray(project.entityOrder)) {
        const orderedKeys = [project.course.key, ...['units', 'resources', 'activities', 'objectives'].flatMap((group) => (project[group] ?? []).map((entity) => entity.key))];
        const seen = new Set(project.entityOrder);
        for (const key of orderedKeys)
            if (!seen.has(key)) {
                project.entityOrder.push(key);
                seen.add(key);
            }
    }
}
function declareImportedNativeProfile(project, profile) {
    // Round-tripped imported manifests retain their original profiles verbatim.
    // Only newly authored native representations add their missing declaration.
    if (project.profilePolicy !== 'preserve')
        return;
    const canonical = canonicalIdentifier(profile);
    project.profiles ??= [];
    if (!project.profiles.some((p) => canonicalIdentifier(p.id) === canonical)) {
        project.profiles.push({ id: canonical, version: project.targetFormatVersion, requirement: 'optional' });
    }
}
function assertUnused(project, key) { try {
    entityByKey(project, key);
}
catch {
    return;
} throw new ProjectError(`project key already exists: ${key}`); }
export function addUnit(project, key, title, language = 'es', role = 'module', parent = 'course') { if (!KEY_RE.test(key))
    throw new ProjectError(`invalid key: ${JSON.stringify(key)}`); assertUnused(project, key); const unit = { key, role, title: { [language]: title.trim() || key }, children: [] }; project.units.push(unit); appendChild(project, parent, key); validateProject(project); return unit; }
function inside(root, path) { const r = resolve(root), p = resolve(path), rel = relative(r, p); if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep)))
    return rel.replaceAll(sep, '/'); throw new ProjectError('source must be inside the project unless copy is used'); }
function copyIntoProject(root, source, key) { mkdirSync(join(root, 'assets'), { recursive: true }); const suffix = extname(source).toLowerCase(); let dest = join(root, 'assets', `${key}${suffix}`); if (existsSync(dest) && resolve(source) !== resolve(dest)) {
    const digest = uuid5(URL_NAMESPACE, resolve(source)).replaceAll('-', '').slice(0, 8);
    dest = join(root, 'assets', `${key}-${digest}${suffix}`);
} if (resolve(source) !== resolve(dest))
    copyFileSync(source, dest); return inside(root, dest); }
export function addFile(root, project, source, key, title, options = {}) { if (!existsSync(source) || !statSync(source).isFile())
    throw new ProjectError(`source file not found: ${source}`); const rk = `res-${key}`, ak = `act-${key}`; assertUnused(project, rk); assertUnused(project, ak); const rel = options.copyFile === false ? inside(root, source) : copyIntoProject(root, source, key); const rep = { key: 'primary', role: options.role ?? 'primary', source: { type: 'file', path: rel } }; if (options.mediaType)
    rep.mediaType = options.mediaType; if (options.profile)
    rep.profile = canonicalIdentifier(options.profile); const lang = options.language ?? 'es', resource = { key: rk, title: { [lang]: title.trim() || key }, representations: [rep] }, activity = { key: ak, activityType: canonicalIdentifier(options.activityType ?? 'https://p2lrn.org/type/resource'), title: { [lang]: title.trim() || key }, resource: rk }; project.resources.push(resource); project.activities.push(activity); appendChild(project, options.parent ?? 'course', ak); validateProject(project); return [resource, activity]; }
export function addUrl(project, url, key, title, options = {}) { const rk = `res-${key}`, ak = `act-${key}`; assertUnused(project, rk); assertUnused(project, ak); try {
    new URL(url);
}
catch {
    throw new ProjectError(`invalid URL: ${url}`);
} const lang = options.language ?? 'es', rep = { key: 'primary', role: options.role ?? 'primary', mediaType: options.mediaType ?? 'text/html', source: { type: 'remote', href: url } }; if (options.profile)
    rep.profile = canonicalIdentifier(options.profile); const resource = { key: rk, title: { [lang]: title.trim() || key }, representations: [rep] }, activity = { key: ak, activityType: canonicalIdentifier(options.activityType ?? 'https://p2lrn.org/type/resource'), title: { [lang]: title.trim() || key }, resource: rk }; project.resources.push(resource); project.activities.push(activity); appendChild(project, options.parent ?? 'course', ak); validateProject(project); return [resource, activity]; }
const RENDERER_HINT_EXTENSION = 'https://p2lrn.org/ext/renderer-preference/1';
function cloneProject(project) { return structuredClone(project); }
function replaceProject(target, source) { for (const key of Object.keys(target))
    delete target[key]; Object.assign(target, source); }
function safeWebEntrypoint(value) { const raw = String(value ?? '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, ''); const parts = raw ? raw.split('/') : []; if (!parts.length || parts.some((x) => !x || x === '.' || x === '..'))
    throw new ProjectError('web entrypoint must be a safe relative path'); return parts.join('/'); }
function relativeDirectorySource(root, source) { if (!existsSync(source) || !statSync(source).isDirectory())
    throw new ProjectError(`source directory not found: ${source}`); const rel = inside(root, source); if (rel === '')
    throw new ProjectError(`web directory is outside project workspace: ${source}`); return rel; }
function copyTreeNoSymlinks(source, target) { if (lstatSync(source).isSymbolicLink())
    throw new ProjectError(`web content symbolic links are not allowed: ${source}`); if (existsSync(target))
    throw new ProjectError(`web content target already exists: ${target}`); mkdirSync(target, { recursive: true }); const walk = (src, dst) => { for (const e of readdirSync(src, { withFileTypes: true })) {
    const a = join(src, e.name), b = join(dst, e.name);
    if (e.isSymbolicLink())
        throw new ProjectError(`web content symbolic links are not allowed: ${a}`);
    if (e.isDirectory()) {
        mkdirSync(b, { recursive: true });
        walk(a, b);
    }
    else if (e.isFile())
        copyFileSync(a, b);
} }; walk(source, target); }
function copyDirectoryIntoProject(root, source, key) { const r = resolve(root), src = resolve(source), target = join(r, 'assets', `${key}-web`); mkdirSync(join(r, 'assets'), { recursive: true }); copyTreeNoSymlinks(src, target); return inside(r, target); }
export function addWebContent(root, project, sourceDir, entrypoint, key, title, options = {}) { if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory())
    throw new ProjectError(`source directory not found: ${sourceDir}`); entrypoint = safeWebEntrypoint(entrypoint); const entry = join(sourceDir, ...entrypoint.split('/')); if (!existsSync(entry) || !statSync(entry).isFile())
    throw new ProjectError(`web entrypoint not found: ${entrypoint}`); const candidate = cloneProject(project), rk = `res-${key}`, ak = `act-${key}`; assertUnused(candidate, rk); assertUnused(candidate, ak); const sourcePath = options.copyDirectory === false ? relativeDirectorySource(root, sourceDir) : `assets/${key}-web`; const language = options.language ?? 'es'; const resource = { key: rk, title: { [language]: title.trim() || key }, representations: [{ key: 'primary', role: 'primary', mediaType: 'text/html', profile: PROFILE.webContent, source: { type: 'web-directory', path: sourcePath, entrypoint } }] }, activity = { key: ak, activityType: 'https://p2lrn.org/type/resource', title: { [language]: title.trim() || key }, resource: rk }; candidate.resources.push(resource); candidate.activities.push(activity); appendChild(candidate, options.parent ?? 'course', ak); validateProject(candidate); if (options.copyDirectory !== false) {
    const actual = copyDirectoryIntoProject(root, sourceDir, key);
    candidate.resources.find((x) => x.key === rk).representations[0].source.path = actual;
} replaceProject(project, candidate); return [entityByKey(project, rk), entityByKey(project, ak)]; }
function parseJsonFile(source, label) { if (!existsSync(source) || !statSync(source).isFile())
    throw new ProjectError(`source file not found: ${source}`); try {
    return JSON.parse(new TextDecoder().decode(readFileSync(source)));
}
catch (e) {
    throw new ProjectError(`invalid ${label} JSON: ${e instanceof Error ? e.message : String(e)}`);
} }
export function addQuestionnaire(root, project, source, key, title, options = {}) { let payload; try {
    payload = validateQuestionnaire(parseJsonFile(source, 'native questionnaire'));
}
catch (e) {
    if (e instanceof ProjectError)
        throw e;
    throw new ProjectError(`invalid native questionnaire: ${e instanceof Error ? e.message : String(e)}`);
} let renderer = options.renderer, rendererVersion = options.rendererVersion; if (renderer) {
    renderer = renderer.trim();
    let parsed;
    try {
        parsed = new URL(renderer);
    }
    catch {
        throw new ProjectError('renderer must be an absolute https: or urn: identifier');
    }
    if (!['https:', 'urn:'].includes(parsed.protocol))
        throw new ProjectError('renderer must be an absolute https: or urn: identifier');
    if (rendererVersion !== undefined) {
        rendererVersion = rendererVersion.trim();
        if (!rendererVersion || rendererVersion.length > 64)
            throw new ProjectError('renderer_version must be a non-empty value up to 64 characters');
    }
}
else if (rendererVersion !== undefined)
    throw new ProjectError('renderer_version requires renderer'); const resolved = (title ?? String(payload.title ?? '')).trim() || key; const [resource, activity] = addFile(root, project, source, key, resolved, { language: options.language ?? 'es', parent: options.parent ?? 'course', mediaType: NATIVE_QUESTIONNAIRE_MEDIA_TYPE, profile: NATIVE_QUESTIONNAIRE_PROFILE, role: 'primary', activityType: 'https://p2lrn.org/type/assessment', copyFile: options.copyFile !== false }); declareImportedNativeProfile(project, NATIVE_QUESTIONNAIRE_PROFILE); if (renderer) {
    const hint = { preferred: renderer, required: false };
    if (rendererVersion)
        hint.version = rendererVersion;
    activity.extensions ??= {};
    activity.extensions[RENDERER_HINT_EXTENSION] = hint;
    validateProject(project);
} return [resource, activity]; }
export function addComponent(root, project, source, key, title, options = {}) { let payload; try {
    payload = validateComponentInstance(parseJsonFile(source, 'native component'));
}
catch (e) {
    if (e instanceof ProjectError)
        throw e;
    throw new ProjectError(`invalid native component: ${e instanceof Error ? e.message : String(e)}`);
} const candidate = cloneProject(project), resolved = (title ?? String(payload.title ?? '')).trim() || key, rk = `res-${key}`, ak = `act-${key}`; assertUnused(candidate, rk); assertUnused(candidate, ak); const copy = options.copyFile !== false, rel = copy ? `assets/${key}${extname(source).toLowerCase()}` : inside(root, source), language = options.language ?? 'es'; const resource = { key: rk, title: { [language]: resolved }, representations: [{ key: 'primary', role: 'primary', mediaType: NATIVE_COMPONENT_MEDIA_TYPE, profile: NATIVE_COMPONENT_PROFILE, source: { type: 'file', path: rel } }] }, activity = { key: ak, activityType: NATIVE_COMPONENT_ACTIVITY_TYPE, title: { [language]: resolved }, resource: rk }; candidate.resources.push(resource); candidate.activities.push(activity); appendChild(candidate, options.parent ?? 'course', ak); declareImportedNativeProfile(candidate, NATIVE_COMPONENT_PROFILE); validateProject(candidate); if (copy) {
    const actual = copyIntoProject(root, source, key);
    candidate.resources.find((x) => x.key === rk).representations[0].source.path = actual;
} replaceProject(project, candidate); return [entityByKey(project, rk), entityByKey(project, ak)]; }
function detachChild(project, child, except) { for (const e of [project.course, ...project.units, ...project.activities])
    if (e.key !== except && Array.isArray(e.children) && e.children.includes(child))
        e.children = e.children.filter((x) => x !== child); }
export function addComposite(root, project, key, title, options = {}) { if (!KEY_RE.test(key))
    throw new ProjectError(`invalid key: ${JSON.stringify(key)}`); const rk = `res-${key}`, ak = `act-${key}`; assertUnused(project, rk); assertUnused(project, ak); const children = [...new Set(options.children ?? [])]; if (!children.length)
    throw new ProjectError('native composite requires at least one child activity'); for (const child of children)
    if (!project.activities.includes(entityByKey(project, child)))
        throw new ProjectError(`native composite child is not an activity: ${child}`); const candidate = cloneProject(project); let payload = { schema: NATIVE_COMPOSITE_SCHEMA, version: '0.1', mode: options.mode ?? 'sequence', completion: options.completion ?? 'all', title: title.trim() || key }; if (options.navigation)
    payload.navigation = options.navigation; try {
    payload = validateComposite(payload);
}
catch (e) {
    throw new ProjectError(`invalid native composite: ${e instanceof Error ? e.message : String(e)}`);
} const rel = `assets/${key}.composite.json`, language = options.language ?? 'es', resource = { key: rk, title: { [language]: title.trim() || key }, representations: [{ key: 'primary', role: 'primary', mediaType: NATIVE_COMPOSITE_MEDIA_TYPE, profile: NATIVE_COMPOSITE_PROFILE, source: { type: 'file', path: rel } }] }, activity = { key: ak, activityType: NATIVE_COMPOSITE_ACTIVITY_TYPE, title: { [language]: title.trim() || key }, resource: rk, children }; candidate.resources.push(resource); candidate.activities.push(activity); if (options.moveChildren !== false)
    for (const child of children)
        detachChild(candidate, child, ak); appendChild(candidate, options.parent ?? 'course', ak); declareImportedNativeProfile(candidate, NATIVE_COMPOSITE_PROFILE); validateProject(candidate); const dir = join(root, 'assets'); mkdirSync(dir, { recursive: true }); const out = join(dir, `${key}.composite.json`), tmp = join(dir, `.${key}.composite.json.tmp`); writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n'); renameSync(tmp, out); replaceProject(project, candidate); return [entityByKey(project, rk), entityByKey(project, ak)]; }
//# sourceMappingURL=project-edit.js.map