import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { ProjectError } from '../core/errors.js';
import { FORMAT_VERSION, FORMAT, PROFILE, canonicalIdentifier, canonicalizeJsonIdentifiers, profileIs } from '../core/constants.js';
import { baseMediaType, computeContentRoot, contentDigest, sha256 } from '../core/integrity.js';
import { buildRangeIntegrityMap, RANGE_INTEGRITY_EXTENSION, RANGE_INTEGRITY_MEDIA_TYPE } from '../core/range-integrity.js';
import { portableUrn, uuidNamespace } from '../core/uuid.js';
import { prefersStored, writeZip } from '../core/zip.js';
import { validatePackageBytes } from '../core/validator.js';
import { loadProject, validateProject } from './project.js';
const WEB_CONTENT_MAPPING_EXTENSION = 'https://p2lrn.org/extension/web-content-bundle';
export const RANGE_INTEGRITY_PATH = 'integrity/range-integrity.json';
const te = new TextEncoder();
function jsonBytes(obj) { return te.encode(JSON.stringify(obj, null, 2) + '\n'); }
function descriptor(path, data, mediaType, schema) { const out = { path, mediaType, size: data.byteLength, byteDigest: sha256(data), contentDigest: contentDigest(data, mediaType, path) }; if (schema)
    out.schema = schema; return out; }
function assetPath(data) { const h = sha256(data).slice(7); return `assets/sha256/${h.slice(0, 2)}/${h.slice(2, 4)}/${h}`; }
function copyFields(source, target, names) { for (const name of names)
    if (Object.prototype.hasOwnProperty.call(source, name))
        target[name] = source[name]; }
function within(root, path) { const rel = relative(resolve(root), resolve(path)); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep)); }
function resolveProjectFile(root, rel) { if (rel.includes('\\'))
    throw new ProjectError(`backslash not allowed in project source path: ${rel}`); const p = resolve(root, rel); if (!within(root, p))
    throw new ProjectError(`project source escapes workspace: ${rel}`); if (!existsSync(p) || !statSync(p).isFile())
    throw new ProjectError(`project source file not found: ${rel}`); return p; }
function resolveProjectDirectory(root, rel) { if (rel.includes('\\'))
    throw new ProjectError(`backslash not allowed in project source path: ${rel}`); const p = resolve(root, rel); if (!within(root, p))
    throw new ProjectError(`project source escapes workspace: ${rel}`); if (!existsSync(p) || !statSync(p).isDirectory())
    throw new ProjectError(`project source directory not found: ${rel}`); return p; }
function safeLogicalWebPath(path) { if (!path || path.includes('\\') || path.startsWith('/'))
    throw new ProjectError(`unsafe web-content path: ${JSON.stringify(path)}`); const parts = path.split('/'); if (parts.some((p) => !p || p === '.' || p === '..'))
    throw new ProjectError(`unsafe web-content path: ${JSON.stringify(path)}`); return parts.join('/'); }
function walkFiles(root) { const out = []; const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink())
        throw new ProjectError(`web-content symbolic links are not allowed: ${p}`);
    if (e.isDirectory())
        walk(p);
    else if (e.isFile())
        out.push(p);
} }; walk(root); return out.sort(); }
const MIME = { '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.md': 'text/markdown', '.pdf': 'application/pdf', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.zip': 'application/zip', '.wasm': 'application/wasm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.csv': 'text/csv', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.odt': 'application/vnd.oasis.opendocument.text', '.ods': 'application/vnd.oasis.opendocument.spreadsheet', '.odp': 'application/vnd.oasis.opendocument.presentation' };
export function guessMediaType(path) { return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'; }
function putPayload(payloads, media, path, data, mediaType, logical) { const old = media.get(path); if (payloads.has(path) && old !== mediaType)
    throw new ProjectError(`same content-addressed ${logical ? 'web ' : ''}asset declared with conflicting media types: ${logical ?? path}`); payloads.set(path, data); media.set(path, mediaType); }
function compileWebDirectory(projectRoot, source, explicitMedia, payloads, payloadMedia) { const root = resolveProjectDirectory(projectRoot, source.path), entry = safeLogicalWebPath(source.entrypoint); const map = {}; const files = walkFiles(root); if (files.length > 5000)
    throw new ProjectError('web-content directory contains more than 5000 files'); for (const file of files) {
    if (lstatSync(file).isSymbolicLink())
        throw new ProjectError(`web-content symbolic links are not allowed: ${file}`);
    if (!within(root, file))
        throw new ProjectError(`web-content file escapes source directory: ${file}`);
    const logical = safeLogicalWebPath(relative(root, file).split(sep).join('/')), data = readFileSync(file), mt = guessMediaType(logical), target = assetPath(data);
    putPayload(payloads, payloadMedia, target, data, mt, logical);
    map[logical] = target;
} if (!map[entry])
    throw new ProjectError(`web-content entrypoint is not a regular file in the directory: ${entry}`); const mt = explicitMedia ?? guessMediaType(entry); if (baseMediaType(mt) !== 'text/html')
    throw new ProjectError('web-directory entrypoint must use media type text/html'); return [map[entry], mt, { version: '1', entrypoint: entry, assets: Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) }]; }
function rangeIndex(payloads, paths) { return buildRangeIntegrityMap(payloads, paths); }
export function compileProject(projectRoot, project) {
    validateProject(project);
    if (project.targetFormatVersion !== FORMAT_VERSION)
        throw new ProjectError(`unsupported targetFormatVersion: ${project.targetFormatVersion}`);
    const ns = uuidNamespace(project.projectId), ids = new Map();
    const entityId = (item, kind) => canonicalIdentifier(String(item.portableId ?? portableUrn(ns, kind, item.key)));
    ids.set(project.course.key, entityId(project.course, 'course'));
    for (const [group, kind] of [['units', 'unit'], ['resources', 'resource'], ['activities', 'activity'], ['objectives', 'objective']])
        for (const item of project[group])
            ids.set(item.key, entityId(item, kind));
    const payloads = new Map(), payloadMedia = new Map(), payloadMethods = new Map(), payloadSchemas = new Map(), entities = [];
    const used = new Set([PROFILE.course]);
    const trackExtensionProfiles = (extensions) => { for (const uri of Object.keys(extensions ?? {})) {
        const canonical = canonicalIdentifier(uri);
        if (canonical.startsWith('https://p2lrn.org/profile/'))
            used.add(canonical);
    } };
    const c = project.course;
    const course = { id: ids.get(c.key), type: 'course', revision: c.revision, title: c.title, children: (c.children ?? []).map((k) => ids.get(k)) };
    copyFields(c, course, ['description', 'languages']);
    if (c.extensions) {
        course.extensions = canonicalizeJsonIdentifiers(c.extensions);
        trackExtensionProfiles(c.extensions);
    }
    entities.push(course);
    for (const item of project.units) {
        const out = { id: ids.get(item.key), type: 'unit', role: item.role, title: item.title, children: (item.children ?? []).map((k) => ids.get(k)) };
        copyFields(item, out, ['description']);
        if (item.extensions) {
            out.extensions = canonicalizeJsonIdentifiers(item.extensions);
            trackExtensionProfiles(item.extensions);
        }
        entities.push(out);
    }
    for (const item of project.resources) {
        const out = { id: ids.get(item.key), type: 'resource', representations: [] };
        copyFields(item, out, ['title', 'description']);
        if (item.extensions) {
            out.extensions = canonicalizeJsonIdentifiers(item.extensions);
            trackExtensionProfiles(item.extensions);
        }
        const repKeys = new Set();
        for (const rep of item.representations) {
            if (repKeys.has(rep.key))
                throw new ProjectError(`duplicate representation key in ${item.key}: ${rep.key}`);
            repKeys.add(rep.key);
            const source = rep.source;
            let mt = rep.mediaType;
            const rout = { id: canonicalIdentifier(String(rep.portableId ?? portableUrn(ns, 'representation', `${item.key}:${rep.key}`))), role: rep.role };
            if (source.type === 'file') {
                const src = resolveProjectFile(projectRoot, source.path), data = readFileSync(src);
                mt = mt ?? guessMediaType(src);
                const path = assetPath(data);
                putPayload(payloads, payloadMedia, path, data, mt);
                rout.location = { type: 'embedded', path };
                rout.originalName = rep.originalName ?? basename(src);
            }
            else if (source.type === 'package-file' || source.type === 'package-member') {
                const src = resolveProjectFile(projectRoot, source.path), data = readFileSync(src);
                mt = mt ?? guessMediaType(source.packagePath);
                const path = source.packagePath;
                putPayload(payloads, payloadMedia, path, data, source.packageMediaType ?? mt);
                if (source.method === 0 || source.method === 8)
                    payloadMethods.set(path, source.method);
                if (source.schema)
                    payloadSchemas.set(path, canonicalIdentifier(source.schema));
                rout.location = source.type === 'package-member' ? { type: 'package-member', package: path, member: source.member } : { type: 'embedded', path };
                if (Object.prototype.hasOwnProperty.call(rep, 'originalName'))
                    rout.originalName = rep.originalName;
            }
            else if (source.type === 'web-directory') {
                if (rep.profile != null && !profileIs(rep.profile, 'webContent'))
                    throw new ProjectError('web-directory source requires the web-content profile');
                const [path, m, web] = compileWebDirectory(projectRoot, source, mt, payloads, payloadMedia);
                mt = m;
                rout.location = { type: 'embedded', path };
                rout.originalName = rep.originalName ?? source.entrypoint;
                rout.profile = PROFILE.webContent;
                const ex = { ...(rep.extensions ?? {}) };
                if (Object.prototype.hasOwnProperty.call(ex, WEB_CONTENT_MAPPING_EXTENSION))
                    throw new ProjectError('web-directory source owns the web-content bundle extension');
                ex[WEB_CONTENT_MAPPING_EXTENSION] = web;
                rout.extensions = ex;
                used.add(PROFILE.webContent);
            }
            else if (source.type === 'remote') {
                mt = mt ?? 'application/octet-stream';
                rout.location = { type: 'remote', href: source.href, ...(source.expectedDigest ? { expectedDigest: source.expectedDigest } : {}) };
                if (Object.prototype.hasOwnProperty.call(rep, 'originalName'))
                    rout.originalName = rep.originalName;
            }
            else
                throw new ProjectError(`unsupported representation source type: ${source.type}`);
            rout.mediaType = canonicalIdentifier(String(mt));
            if (source.type !== 'web-directory') {
                if (rep.profile) {
                    rout.profile = canonicalIdentifier(rep.profile);
                    used.add(rout.profile);
                }
                if (rep.extensions) {
                    rout.extensions = canonicalizeJsonIdentifiers(rep.extensions);
                    trackExtensionProfiles(rep.extensions);
                }
            }
            for (const name of ['language', 'accessibility'])
                if (Object.prototype.hasOwnProperty.call(rep, name))
                    rout[name] = rep[name];
            out.representations.push(rout);
        }
        entities.push(out);
    }
    for (const item of project.activities) {
        const out = { id: ids.get(item.key), type: 'activity', activityType: canonicalIdentifier(item.activityType), title: item.title };
        copyFields(item, out, ['description']);
        if (item.extensions)
            out.extensions = canonicalizeJsonIdentifiers(item.extensions);
        if (item.resource)
            out.resource = ids.get(item.resource);
        if (item.resources)
            out.resources = item.resources.map((k) => ids.get(k));
        if (item.objectives)
            out.objectives = item.objectives.map((k) => ids.get(k));
        if (Object.prototype.hasOwnProperty.call(item, 'children'))
            out.children = (item.children ?? []).map((k) => ids.get(k));
        trackExtensionProfiles(item.extensions);
        entities.push(out);
    }
    for (const item of project.objectives) {
        const out = { id: ids.get(item.key), type: 'objective', title: item.title };
        copyFields(item, out, ['description', 'alignments']);
        if (item.extensions) {
            out.extensions = canonicalizeJsonIdentifiers(item.extensions);
            trackExtensionProfiles(item.extensions);
        }
        entities.push(out);
    }
    if (project.entityOrder) {
        const byId = new Map(entities.map((e) => [e.id, e]));
        const ordered = project.entityOrder.map((key) => byId.get(ids.get(key)));
        entities.splice(0, entities.length, ...ordered);
    }
    const relations = project.relations.map((rel) => { trackExtensionProfiles(rel.extensions); return { source: ids.get(rel.source), predicate: canonicalIdentifier(rel.predicate), target: ids.get(rel.target), ...(rel.extensions ? { extensions: canonicalizeJsonIdentifiers(rel.extensions) } : {}) }; });
    const graph = { graphVersion: FORMAT_VERSION, entities, relations };
    if (project.graphPolicy === 'preserve') {
        if (project.graphExtensions !== undefined)
            graph.extensions = canonicalizeJsonIdentifiers(project.graphExtensions);
    }
    else
        graph.extensions = { 'org.p2lrn.creator': { projectVersion: project.creatorMetadataVersion ?? project.projectVersion, projectId: project.projectId } };
    if (project.provenance) {
        const b = jsonBytes(project.provenance);
        payloads.set('provenance/transformation.json', b);
        payloadMedia.set('provenance/transformation.json', 'application/json');
        graph.extensions ??= {};
        graph.extensions['org.p2lrn.creator'] ??= { projectVersion: project.projectVersion, projectId: project.projectId };
        graph.extensions['org.p2lrn.creator'].provenance = 'provenance/transformation.json';
    }
    for (const f of project.preservedFiles ?? []) {
        const src = resolveProjectFile(projectRoot, f.path), data = readFileSync(src), path = f.packagePath, mt = f.mediaType;
        putPayload(payloads, payloadMedia, path, data, mt);
        if (f.method === 0 || f.method === 8)
            payloadMethods.set(path, f.method);
        if (f.schema)
            payloadSchemas.set(path, canonicalIdentifier(f.schema));
    }
    const seekable = [...payloadMedia.entries()].filter(([, mt]) => ['audio/', 'video/'].some((p) => baseMediaType(mt).startsWith(p)) && prefersStored(mt)).map(([p]) => p);
    if (project.graphPolicy !== 'preserve' && seekable.length) {
        const b = jsonBytes(rangeIndex(payloads, seekable));
        payloads.set(RANGE_INTEGRITY_PATH, b);
        payloadMedia.set(RANGE_INTEGRITY_PATH, RANGE_INTEGRITY_MEDIA_TYPE);
        payloadMethods.set(RANGE_INTEGRITY_PATH, 8);
        graph.extensions[RANGE_INTEGRITY_EXTENSION] = { version: '1', indexPath: RANGE_INTEGRITY_PATH };
    }
    const graphBytes = jsonBytes(graph), graphDesc = descriptor('content/graph.json', graphBytes, 'application/json');
    graphDesc.schema = `https://p2lrn.org/schema/graph/${FORMAT_VERSION}`;
    let profiles;
    if (project.profilePolicy === 'preserve')
        profiles = (project.profiles ?? []).map((p) => ({ ...p, id: canonicalIdentifier(p.id) }));
    else {
        const explicit = new Map((project.profiles ?? []).map((p) => { const id = canonicalIdentifier(p.id); return [id, { ...p, id }]; }));
        explicit.set(PROFILE.course, { id: PROFILE.course, version: FORMAT_VERSION, requirement: 'required' });
        for (const p of [...used].sort())
            if (!explicit.has(p))
                explicit.set(p, { id: p, version: FORMAT_VERSION, requirement: 'optional' });
        profiles = [...explicit.values()].sort((a, b) => a.id.localeCompare(b));
    }
    const entrypoints = (project.entrypoints ?? [{ key: c.key, type: 'course', role: 'primary' }]).map((e) => ({ id: ids.get(e.key), type: e.type, role: e.role }));
    const files = [...payloads.keys()].sort().map((p) => descriptor(p, payloads.get(p), payloadMedia.get(p), payloadSchemas.get(p)));
    const manifest = { format: FORMAT, formatVersion: FORMAT_VERSION, packageId: 'urn:uuid:00000000-0000-4000-8000-000000000000', entrypoints, graph: graphDesc, profiles, files, integrity: { algorithm: 'sha256', contentRoot: 'sha256:' + '0'.repeat(64) } };
    manifest.integrity.contentRoot = computeContentRoot(manifest);
    manifest.packageId = portableUrn(ns, 'package', manifest.integrity.contentRoot + `|revision:${c.revision}`);
    const manifestBytes = jsonBytes(manifest);
    payloads.set('META-INF/manifest.json', manifestBytes);
    payloads.set('content/graph.json', graphBytes);
    const mediaByPath = new Map([['META-INF/manifest.json', 'application/json'], ['content/graph.json', 'application/json'], ...payloadMedia.entries()]);
    const methodsByPath = new Map(payloadMethods);
    return { manifest, payloads, mediaByPath, methodsByPath, graph };
}
export function buildProject(projectRoot, output, strictProfiles = false) { const loaded = loadProject(projectRoot), root = resolve(loaded.path, '..'), compiled = compileProject(root, loaded.project); mkdirSync(resolve(output, '..'), { recursive: true }); const entries = [...compiled.payloads.keys()].sort().map((path) => ({ path, data: compiled.payloads.get(path), mediaType: compiled.mediaByPath.get(path), method: compiled.methodsByPath.get(path) })); const bytes = writeZip(entries); writeFileSync(output, bytes); const validation = validatePackageBytes(bytes, { strictProfiles }); return { project: loaded.path, output, formatVersion: compiled.manifest.formatVersion, packageId: compiled.manifest.packageId, contentRoot: compiled.manifest.integrity.contentRoot, entities: validation.summary.entities, files: validation.summary.files, validation }; }
//# sourceMappingURL=builder.js.map