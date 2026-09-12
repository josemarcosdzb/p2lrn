import { readFileSync } from 'node:fs';
import { ReadError } from '../core/errors.js';
import { PROFILE, canonicalIdentifier, canonicalProfileId } from '../core/constants.js';
import { validatePackageFile, validatePackageBytes } from '../core/validator.js';
import { ZipArchive, DEFAULT_ZIP_LIMITS, safeZipPath } from '../core/zip.js';
const ROLE_SCORE = { primary: 40, rendered: 35, accessible: 34, fallback: 20, source: 10, 'original-package': 5 };
const MODE_SCORE = { deliver: 100, read: 70, preserve: 10 };
export class CapabilitySet {
    profiles;
    constructor(profiles) {
        this.profiles = profiles;
    }
    static fromDocument(obj) { const p = new Map(); for (const item of obj?.profiles ?? [])
        p.set(canonicalIdentifier(item.id), new Set(item.modes ?? [])); return new CapabilitySet(p); }
    static fromPath(path) { return CapabilitySet.fromDocument(JSON.parse(new TextDecoder().decode(readFileSync(path)))); }
    static permissiveReader(profiles) { return new CapabilitySet(new Map([...profiles].map((id) => [canonicalIdentifier(id), new Set(['validate', 'read', 'preserve', 'deliver'])]))); }
    supports(profile, mode) { return profile == null || this.profiles.get(canonicalIdentifier(profile))?.has(mode) === true; }
}
export class P2LRNReader {
    package;
    entities;
    representations = new Map();
    entrypoints;
    declaredProfiles;
    constructor(source, options = { strictProfiles: true }) { try {
        this.package = typeof source === 'string' ? validatePackageFile(source, options) : validatePackageBytes(source, options);
    }
    catch (error) {
        throw new ReadError(error instanceof Error ? error.message : String(error), { cause: error });
    } this.entities = this.package.entities; for (const e of this.entities.values())
        if (e.type === 'resource')
            for (const rep of e.representations ?? []) {
                if (this.representations.has(rep.id))
                    throw new ReadError(`duplicate representation id: ${rep.id}`);
                this.representations.set(rep.id, { resourceId: e.id, representation: rep });
            } this.entrypoints = [...this.package.manifest.entrypoints]; this.declaredProfiles = new Map(this.package.manifest.profiles.map((p) => [canonicalIdentifier(p.id), p])); }
    summary(path) { const counts = {}; for (const e of this.entities.values())
        counts[e.type] = (counts[e.type] ?? 0) + 1; return { ...(path ? { path } : {}), format: this.package.manifest.format, formatVersion: this.package.manifest.formatVersion, packageId: this.package.manifest.packageId, contentRoot: this.package.manifest.integrity.contentRoot, entrypoints: this.entrypoints, profiles: [...this.package.manifest.profiles], entityCounts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))), fileCount: this.package.manifest.files.length }; }
    entity(id) { const e = this.entities.get(id); if (!e)
        throw new ReadError(`unknown entity: ${id}`); return e; }
    primaryEntrypoint() { return this.entrypoints.find((e) => e.role === 'primary') ?? this.entrypoints[0] ?? (() => { throw new ReadError('package has no entrypoint'); })(); }
    displayTitle(e, langs) { const t = e.title ?? {}; for (const l of langs)
        if (t[l])
            return t[l]; for (const [l, v] of Object.entries(t))
        if (l !== 'und')
            return v; return t.und ?? e.id; }
    tree(entrypointId, langs = ['es', 'en', 'und']) { const root = entrypointId ?? this.primaryEntrypoint().id, visiting = new Set(); const build = (id) => { if (visiting.has(id))
        throw new ReadError(`cycle while reading hierarchy at ${id}`); const e = this.entity(id); visiting.add(id); const out = { id, type: e.type, title: this.displayTitle(e, langs) }; if (e.type === 'unit')
        out.role = e.role; if (e.type === 'activity') {
        out.activityType = e.activityType;
        if (e.resource)
            out.resource = e.resource;
    } if (e.children?.length)
        out.children = e.children.map(build); visiting.delete(id); return out; }; return build(root); }
    representationCandidates(resourceId) { const e = this.entity(resourceId); if (e.type !== 'resource')
        throw new ReadError(`entity is not a resource: ${resourceId}`); return [...(e.representations ?? [])]; }
    chooseRepresentation(resourceId, capabilities, mode = 'deliver', preferEmbedded = true) { if (!(mode in MODE_SCORE))
        throw new ReadError(`unsupported negotiation mode: ${mode}`); const candidates = this.representationCandidates(resourceId), semantic = new Set(['primary', 'rendered', 'accessible', 'fallback']), hasSemantic = candidates.some((r) => semantic.has(String(r.role))); const ranked = []; for (const rep of candidates) {
        if ((mode === 'read' || mode === 'deliver') && hasSemantic && !semantic.has(String(rep.role)))
            continue;
        if (!capabilities.supports(rep.profile, mode))
            continue;
        let score = MODE_SCORE[mode] + (ROLE_SCORE[String(rep.role)] ?? 0);
        if (preferEmbedded && rep.location?.type === 'embedded')
            score += 3;
        ranked.push([score, rep.id, rep]);
    } ranked.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1])); return ranked[0]?.[2]; }
    profileExtension(rep) { const profile = canonicalProfileId(rep.profile); if (!profile)
        return {}; for (const [key, value] of Object.entries(rep.extensions ?? {}))
        if (canonicalIdentifier(key) === profile)
            return value; return {}; }
    representationPlan(rep) { const rawProfile = rep.profile, profile = canonicalProfileId(rawProfile), loc = (rep.location ?? {}), ext = this.profileExtension(rep), base = { representationId: rep.id, profile: rawProfile, canonicalProfile: profile, role: rep.role, mediaType: rep.mediaType }; if (profile === PROFILE.nativeComposite) {
        if (loc.type !== 'embedded')
            throw new ReadError('native composite representation must be embedded');
        return { ...base, kind: 'native-composite', path: loc.path, runtime: 'p2lrn-native-composite', metadata: ext };
    } if (profile === PROFILE.nativeComponent) {
        if (loc.type !== 'embedded')
            throw new ReadError('native component representation must be embedded');
        return { ...base, kind: 'native-component', path: loc.path, runtime: 'p2lrn-native-component', metadata: ext };
    } if (profile === PROFILE.nativeQuestionnaire) {
        if (loc.type !== 'embedded')
            throw new ReadError('native questionnaire representation must be embedded');
        return { ...base, kind: 'native-questionnaire', path: loc.path, runtime: 'p2lrn-native-questionnaire', metadata: ext };
    } if (loc.type === 'package-member') {
        const runtime = { [PROFILE.scorm]: 'scorm', [PROFILE.cmi5]: 'cmi5', [PROFILE.commonCartridge]: 'common-cartridge', [PROFILE.qti]: 'qti', [PROFILE.webContent]: 'passive', [PROFILE.tincan]: 'xapi-legacy' };
        return { ...base, kind: 'package-member', packagePath: loc.package, member: loc.member, runtime: runtime[profile ?? ''] ?? 'profile-defined', metadata: ext };
    } if (profile === PROFILE.scorm)
        return ext.href ? { ...base, kind: 'package-member', packagePath: loc.path, member: ext.href, runtime: 'scorm', metadata: ext } : { ...base, kind: 'package', packagePath: loc.path, runtime: 'scorm', metadata: ext }; if (profile === PROFILE.cmi5) {
        const launch = ext.url;
        if (launch)
            return isAbsoluteUri(launch) ? { ...base, kind: 'remote', href: launch, runtime: 'cmi5', networkRequired: true, metadata: ext } : { ...base, kind: 'package-member', packagePath: loc.path, member: launch, runtime: 'cmi5', metadata: ext };
        return { ...base, kind: 'package', packagePath: loc.path, runtime: 'cmi5', metadata: ext };
    } if (profile === PROFILE.h5p)
        return { ...base, kind: 'package', packagePath: loc.path, runtime: 'h5p', metadata: ext }; if (profile === PROFILE.tincan) {
        const launch = ext.launch;
        if (launch)
            return isAbsoluteUri(launch) ? { ...base, kind: 'remote', href: launch, runtime: 'xapi-legacy', networkRequired: true, metadata: ext } : { ...base, kind: 'package-member', packagePath: loc.path, member: launch, runtime: 'xapi-legacy', metadata: ext };
        return { ...base, kind: 'package', packagePath: loc.path, runtime: 'xapi-legacy', metadata: ext };
    } if (profile === PROFILE.commonCartridge) {
        const member = ext.href ?? ext.member;
        return member ? { ...base, kind: 'package-member', packagePath: loc.path, member, runtime: 'passive', metadata: ext } : { ...base, kind: 'package', packagePath: loc.path, runtime: 'common-cartridge', metadata: ext };
    } if (profile === PROFILE.qti) {
        const member = ext.member ?? ext.href;
        return member ? { ...base, kind: 'package-member', packagePath: loc.path, member, runtime: 'qti', metadata: ext } : { ...base, kind: 'package', packagePath: loc.path, runtime: 'qti', metadata: ext };
    } if (profile === PROFILE.lti)
        return { ...base, kind: 'external-tool', runtime: 'lti', rebindRequired: ext.rebindRequired ?? true, targetLinkUri: ext.targetLinkUri ?? ext.launchUrl, metadata: ext }; if (loc.type === 'embedded')
        return { ...base, kind: 'embedded-file', path: loc.path }; if (loc.type === 'remote')
        return { ...base, kind: 'remote', href: loc.href, networkRequired: true }; throw new ReadError(`unsupported representation location: ${rep.id}`); }
    activityPlan(activityId, capabilities, mode = 'deliver') { const a = this.entity(activityId); if (a.type !== 'activity')
        throw new ReadError(`entity is not an activity: ${activityId}`); if (!a.resource)
        return { activityId, status: 'no-resource' }; const rep = this.chooseRepresentation(a.resource, capabilities, mode); if (!rep)
        return { activityId, resourceId: a.resource, status: 'unsupported', availableProfiles: this.representationCandidates(a.resource).map((r) => r.profile) }; return { activityId, resourceId: a.resource, status: 'ready', plan: this.representationPlan(rep) }; }
    courseReadPlan(capabilities, entrypointId, mode = 'deliver') { const root = entrypointId ?? this.primaryEntrypoint().id, activities = [], visited = new Set(); const walk = (id) => { if (visited.has(id))
        return; visited.add(id); const e = this.entity(id); if (e.type === 'activity')
        activities.push(this.activityPlan(id, capabilities, mode)); for (const c of e.children ?? [])
        walk(c); }; walk(root); return { entrypoint: root, mode, activities, summary: { total: activities.length, ready: activities.filter((p) => p.status === 'ready').length, unsupported: activities.filter((p) => p.status === 'unsupported').length } }; }
    resourceImportPlan(resourceId, capabilities) { const e = this.entity(resourceId); if (e.type !== 'resource')
        throw new ReadError(`entity is not a resource: ${resourceId}`); let rep = this.chooseRepresentation(resourceId, capabilities, 'read'); if (rep)
        return { resourceId, status: 'interpretable', handling: 'interpret', plan: this.representationPlan(rep) }; rep = this.chooseRepresentation(resourceId, capabilities, 'preserve'); if (rep)
        return { resourceId, status: 'preservable', handling: 'preserve-opaque', plan: this.representationPlan(rep) }; return { resourceId, status: 'unsupported', handling: 'reject-or-lossy', availableProfiles: this.representationCandidates(resourceId).map((r) => r.profile) }; }
    importPlan(capabilities, entrypointId) { const root = entrypointId ?? this.primaryEntrypoint().id, reachable = [], seen = new Set(); const walk = (id) => { if (seen.has(id))
        return; seen.add(id); reachable.push(id); for (const c of this.entity(id).children ?? [])
        walk(c); }; walk(root); const structural = [], resources = new Set(); for (const id of reachable) {
        const e = this.entity(id);
        if (['course', 'unit', 'activity', 'objective'].includes(e.type)) {
            const out = {};
            for (const k of ['id', 'type', 'title', 'description', 'revision', 'languages', 'role', 'activityType', 'children', 'resource', 'resources', 'objectives', 'extensions'])
                if (e[k] !== undefined)
                    out[k] = e[k];
            structural.push(out);
        }
        if (e.resource)
            resources.add(e.resource);
        for (const r of e.resources ?? [])
            resources.add(r);
    } for (const e of this.entities.values())
        if (e.type === 'resource')
            resources.add(e.id); const plans = [...resources].sort().map((id) => this.resourceImportPlan(id, capabilities)); const report = this.transformationReport(); return { entrypoint: root, portableIdMapRequired: true, transactionRecommended: true, structuralObjects: structural, resources: plans, summary: { structuralObjects: structural.length, resources: plans.length, interpretable: plans.filter((p) => p.status === 'interpretable').length, preservableOpaque: plans.filter((p) => p.status === 'preservable').length, unsupported: plans.filter((p) => p.status === 'unsupported').length }, sourceRecovery: { available: Boolean(report?.source?.preservedPath), preservation: report?.source?.preservation ?? null } }; }
    readEmbeddedFile(path, maxBytes = 64 * 1024 * 1024) { safeZipPath(path); const e = this.package.archive.entries.get(path); if (!e)
        throw new ReadError(`embedded file not found: ${path}`); if (e.uncompressedSize > maxBytes)
        throw new ReadError(`embedded file exceeds read limit (${e.uncompressedSize} > ${maxBytes})`); return this.package.archive.read(path); }
    readPackageMember(packagePath, member, maxBytes = 64 * 1024 * 1024) { safeZipPath(member); const nested = ZipArchive.open(this.readEmbeddedFile(packagePath, maxBytes * 4), { ...DEFAULT_ZIP_LIMITS, entryBytes: maxBytes, totalUncompressedBytes: maxBytes * 4, entries: 20000, compressionRatio: 500 }); const e = nested.entries.get(member); if (!e)
        throw new ReadError(`nested member not found: ${member}`); if (e.uncompressedSize > maxBytes)
        throw new ReadError(`nested member exceeds read limit (${e.uncompressedSize} > ${maxBytes})`); return nested.read(member); }
    transformationReport() { let ext = null; for (const [key, value] of Object.entries(this.package.graph.extensions ?? {}))
        if (canonicalIdentifier(key) === 'org.p2lrn.transform') {
            ext = value;
            break;
        } if (!ext)
        return null; if (!ext.report)
        return ext; return JSON.parse(new TextDecoder().decode(this.readEmbeddedFile(ext.report))); }
}
function isAbsoluteUri(value) { try {
    return Boolean(new URL(value).protocol);
}
catch {
    return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
} }
export function openReaderFile(path, options = { strictProfiles: true }) { return new P2LRNReader(path, options); }
export { P2LRNReadingSystem, ReaderSystemError, b64u, b64uDecode, guessReaderMediaType } from './system.js';
export { ReaderServer } from './server.js';
//# sourceMappingURL=index.js.map