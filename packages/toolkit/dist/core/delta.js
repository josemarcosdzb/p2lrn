import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ValidationError } from './errors.js';
import { computeContentRoot, contentDigest, sha256 } from './integrity.js';
import { parseIJson } from './ijson.js';
import { validateSchema } from './json-schema.js';
import { safeZipPath, ZipArchive, writeZip } from './zip.js';
import { validatePackageBytes, validatePackageFile } from './validator.js';
import { NS, LEGACY_FORMAT, legacyIdentifier, canonicalIdentifier } from './constants.js';
export const DELTA_SCHEMA_ID = `${NS}schema/delta/0.1`;
export const DELTA_MANIFEST = 'META-INF/delta.json';
export const TARGET_MANIFEST = 'target/META-INF/manifest.json';
export const TARGET_GRAPH = 'target/content/graph.json';
export class DeltaError extends ValidationError {
}
const te = new TextEncoder();
function jsonBytes(v) { return te.encode(JSON.stringify(sortObject(v)) + '\n'); }
function sortObject(v) { if (Array.isArray(v))
    return v.map(sortObject); if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort())
        o[k] = sortObject(v[k]);
    return o;
} return v; }
function temp(output) { mkdirSync(dirname(output), { recursive: true }); return `${output}.${randomUUID()}.tmp`; }
function discard(p) { try {
    unlinkSync(p);
}
catch { } }
function packageManifest(path) { try {
    return validatePackageFile(path).manifest;
}
catch (e) {
    throw new DeltaError(`invalid P2LRN package ${path}: ${e instanceof Error ? e.message : String(e)}`);
} }
function byDigest(m) { const out = new Map(); for (const d of m.files) {
    const a = out.get(d.byteDigest) ?? [];
    a.push(d);
    out.set(d.byteDigest, a);
} return out; }
function validateDocument(doc) { try {
    const schema = typeof doc?.schema === 'string' && canonicalIdentifier(doc.schema) === DELTA_SCHEMA_ID ? doc.schema : DELTA_SCHEMA_ID;
    validateSchema(schema, doc, 'delta manifest');
}
catch (e) {
    throw new DeltaError(e instanceof Error ? e.message : String(e));
} const paths = doc.payloads.map((x) => x.path), delta = doc.payloads.map((x) => x.deltaPath); if (new Set(paths).size !== paths.length)
    throw new DeltaError('delta manifest declares the same target payload path more than once'); if (new Set(delta).size !== delta.length)
    throw new DeltaError('delta manifest declares the same delta payload path more than once'); for (const x of doc.payloads) {
    safeZipPath(x.path);
    safeZipPath(x.deltaPath);
    const expected = `payloads/${x.path}`;
    if (x.deltaPath !== expected)
        throw new DeltaError(`deltaPath must be the canonical payloads/<target-path> form: ${x.deltaPath}`);
} return doc; }
function openDeltaBytes(bytes) { let a; try {
    a = ZipArchive.open(bytes, { entries: 5000, entryBytes: 1024 * 1024 * 1024, totalUncompressedBytes: 4 * 1024 * 1024 * 1024, centralDirectoryBytes: 64 * 1024 * 1024, compressionRatio: 250 });
}
catch (e) {
    throw new DeltaError(`invalid delta ZIP: ${e instanceof Error ? e.message : String(e)}`);
} const names = new Set(a.names()); for (const req of [DELTA_MANIFEST, TARGET_MANIFEST, TARGET_GRAPH])
    if (!names.has(req))
        throw new DeltaError(`delta is missing required entry: ${req}`); let doc; try {
    doc = validateDocument(parseIJson(a.read(DELTA_MANIFEST), 'delta manifest'));
}
catch (e) {
    throw new DeltaError(e instanceof Error ? e.message : String(e));
} const expected = new Set([DELTA_MANIFEST, TARGET_MANIFEST, TARGET_GRAPH, ...doc.payloads.map((x) => x.deltaPath)]), extra = [...names].filter((x) => !expected.has(x)), missing = [...expected].filter((x) => !names.has(x)); if (extra.length)
    throw new DeltaError(`uninventoried delta payload: ${extra.sort().join(', ')}`); if (missing.length)
    throw new DeltaError(`delta declares missing payload: ${missing.sort().join(', ')}`); return { archive: a, document: doc }; }
export function inspectDelta(path) { return openDeltaBytes(readFileSync(path)).document; }
export function createDelta(base, target, output, force = false) { const bm = packageManifest(base), tm = packageManifest(target); if (bm.formatVersion !== tm.formatVersion)
    throw new DeltaError('base and target formatVersion differ; cross-format deltas are not supported'); if (existsSync(output) && !force)
    throw new DeltaError(`refusing to overwrite existing delta: ${output}`); const by = byDigest(bm), tz = ZipArchive.open(readFileSync(target)), manifestBytes = tz.read('META-INF/manifest.json'), graphBytes = tz.read(tm.graph.path), changed = []; for (const d of tm.files) {
    const reusable = (by.get(d.byteDigest) ?? []).some((x) => x.size === d.size);
    if (!reusable)
        changed.push({ path: d.path, deltaPath: `payloads/${d.path}`, byteDigest: d.byteDigest, size: d.size });
} const doc = validateDocument({ schema: DELTA_SCHEMA_ID, version: '0.1', base: { formatVersion: bm.formatVersion, contentRoot: bm.integrity.contentRoot }, target: { formatVersion: tm.formatVersion, packageId: tm.packageId, contentRoot: tm.integrity.contentRoot, manifestByteDigest: sha256(manifestBytes), graphByteDigest: sha256(graphBytes) }, payloads: changed }); const entries = [{ path: DELTA_MANIFEST, data: jsonBytes(doc) }, { path: TARGET_MANIFEST, data: manifestBytes }, { path: TARGET_GRAPH, data: graphBytes }, ...changed.map((x) => ({ path: x.deltaPath, data: tz.read(x.path) }))]; const outBytes = writeZip(entries), tmp = temp(output); try {
    writeFileSync(tmp, outBytes);
    openDeltaBytes(readFileSync(tmp));
    if (existsSync(output) && force)
        unlinkSync(output);
    renameSync(tmp, output);
}
catch (e) {
    discard(tmp);
    throw e;
} const db = statSync(output).size, tb = statSync(target).size; return { output, baseContentRoot: doc.base.contentRoot, targetContentRoot: doc.target.contentRoot, changedPayloads: changed.length, reusedPayloads: tm.files.length - changed.length, deltaBytes: db, targetBytes: tb, ratio: tb ? db / tb : 0 }; }
export function applyDelta(base, delta, output, force = false) { const bm = packageManifest(base), { archive: dz, document: doc } = openDeltaBytes(readFileSync(delta)); if (doc.base.formatVersion !== bm.formatVersion)
    throw new DeltaError('delta base formatVersion does not match base package'); if (doc.base.contentRoot !== bm.integrity.contentRoot)
    throw new DeltaError('delta base contentRoot does not match base package'); const mb = dz.read(TARGET_MANIFEST), gb = dz.read(TARGET_GRAPH); if (sha256(mb) !== doc.target.manifestByteDigest)
    throw new DeltaError('target manifest byte digest mismatch inside delta'); if (sha256(gb) !== doc.target.graphByteDigest)
    throw new DeltaError('target graph byte digest mismatch inside delta'); const tm = parseIJson(mb, 'target manifest'); validateSchema(tm.format === LEGACY_FORMAT ? legacyIdentifier(`${NS}schema/manifest/0.4.0`) : `${NS}schema/manifest/0.4.0`, tm, 'target manifest'); if (tm.formatVersion !== doc.target.formatVersion)
    throw new DeltaError('target manifest formatVersion mismatch inside delta'); if (tm.packageId !== doc.target.packageId)
    throw new DeltaError('target packageId mismatch inside delta'); if (tm.integrity.contentRoot !== doc.target.contentRoot)
    throw new DeltaError('target contentRoot mismatch inside delta'); if (computeContentRoot(tm) !== doc.target.contentRoot)
    throw new DeltaError('target manifest does not recompute to declared contentRoot'); const gd = tm.graph; if (gd.path !== 'content/graph.json')
    throw new DeltaError('delta target graph path is not Core 0.4.0 content/graph.json'); if (gb.byteLength !== gd.size || sha256(gb) !== gd.byteDigest)
    throw new DeltaError('target graph does not match its manifest descriptor'); if (contentDigest(gb, gd.mediaType, gd.path) !== gd.contentDigest)
    throw new DeltaError('target graph contentDigest mismatch'); const changed = new Map(doc.payloads.map((x) => [x.path, x])), targetDesc = new Map(tm.files.map((x) => [x.path, x])); const unknown = [...changed.keys()].filter((x) => !targetDesc.has(x)); if (unknown.length)
    throw new DeltaError(`delta includes payloads not declared by target manifest: ${unknown.sort().join(', ')}`); if (existsSync(output) && !force)
    throw new DeltaError(`refusing to overwrite existing package: ${output}`); const bz = ZipArchive.open(readFileSync(base)), bd = byDigest(bm), entries = [{ path: 'META-INF/manifest.json', data: mb, mediaType: 'application/json' }, { path: 'content/graph.json', data: gb, mediaType: 'application/json' }]; for (const d of [...tm.files].sort((a, b) => a.path.localeCompare(b.path))) {
    const item = changed.get(d.path);
    let data;
    if (item) {
        data = dz.read(item.deltaPath);
        if (item.byteDigest !== d.byteDigest || item.size !== d.size)
            throw new DeltaError(`delta payload metadata disagrees with target descriptor: ${d.path}`);
    }
    else {
        const candidates = (bd.get(d.byteDigest) ?? []).filter((x) => x.size === d.size);
        if (!candidates.length)
            throw new DeltaError(`target payload is absent from delta and cannot be reused from base: ${d.path}`);
        data = bz.read(candidates[0].path);
    }
    if (data.byteLength !== d.size || sha256(data) !== d.byteDigest)
        throw new DeltaError(`reconstructed payload byte mismatch: ${d.path}`);
    if (contentDigest(data, d.mediaType, d.path) !== d.contentDigest)
        throw new DeltaError(`reconstructed payload contentDigest mismatch: ${d.path}`);
    entries.push({ path: d.path, data, mediaType: d.mediaType });
} const out = writeZip(entries), tmp = temp(output); let validation; try {
    writeFileSync(tmp, out);
    validation = validatePackageBytes(out);
    if (validation.summary.contentRoot !== doc.target.contentRoot)
        throw new DeltaError('reconstructed package contentRoot does not match delta target');
    if (existsSync(output) && force)
        unlinkSync(output);
    renameSync(tmp, output);
}
catch (e) {
    discard(tmp);
    throw e;
} return { output, packageId: validation.summary.packageId, contentRoot: validation.summary.contentRoot, changedPayloads: changed.size, reusedPayloads: tm.files.length - changed.size }; }
//# sourceMappingURL=delta.js.map