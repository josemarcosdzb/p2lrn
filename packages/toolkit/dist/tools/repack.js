#!/usr/bin/env node
// @ts-nocheck
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validatePackageBytes, validatePackageFile } from '../core/validator.js';
import { contentDigest, computeContentRoot, sha256 } from '../core/integrity.js';
import { canonicalizeJsonIdentifiers, FORMAT } from '../core/constants.js';
import { writeZip } from '../core/zip.js';
import { parse, flag, printJson, req, fail, CliExit, isMain } from '../cli/util.js';
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
function compactJson(value) { return enc.encode(JSON.stringify(value) + '\n'); }
function jsonMediaType(mediaType) { const m = String(mediaType ?? '').split(';', 1)[0].trim().toLowerCase(); return m === 'application/json' || m.endsWith('+json'); }
function contentAddressedPath(path, digest) {
    const match = /^(.*\/sha256\/)[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}$/.exec(path);
    if (!match)
        return path;
    const hex = digest.replace(/^sha256:/, '');
    return `${match[1]}${hex.slice(0, 2)}/${hex.slice(2, 4)}/${hex}`;
}
function replacePathRefs(value, map) {
    if (typeof value === 'string')
        return map.get(value) ?? value;
    if (Array.isArray(value))
        return value.map((item) => replacePathRefs(item, map));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value))
            out[map.get(key) ?? key] = replacePathRefs(item, map);
        return out;
    }
    return value;
}
export function repackPackage(source, output, newPackageId = false, canonicalizeIdentifiers = false) {
    const before = validatePackageFile(source, { strictProfiles: true, validateProfilePayloads: true });
    let manifest = structuredClone(before.manifest), graph = structuredClone(before.graph);
    const originalDescriptors = before.manifest.files.map((d) => structuredClone(d));
    if (canonicalizeIdentifiers) {
        manifest = canonicalizeJsonIdentifiers(manifest);
        graph = canonicalizeJsonIdentifiers(graph);
        manifest.format = FORMAT;
    }
    const payloads = manifest.files.map((descriptor, index) => {
        const originalPath = originalDescriptors[index].path;
        const raw = before.archive.read(originalPath);
        let json = null;
        if (canonicalizeIdentifiers && jsonMediaType(descriptor.mediaType)) {
            try {
                json = canonicalizeJsonIdentifiers(JSON.parse(dec.decode(raw)));
            }
            catch { /* validation below remains authoritative */ }
        }
        const method = before.archive.entries.get(originalPath)?.method ?? 8;
        return { descriptor, originalPath, currentPath: descriptor.path, raw, json, data: raw, method };
    });
    const pathMap = new Map();
    if (canonicalizeIdentifiers) {
        // JSON normalization can change content-addressed paths. Iterate until every
        // JSON payload, its path and every graph/payload reference agree on the same hash.
        for (let round = 0; round < 16; round++) {
            let changed = false;
            graph = replacePathRefs(graph, pathMap);
            for (const item of payloads) {
                if (item.json !== null)
                    item.json = replacePathRefs(item.json, pathMap);
                item.data = item.json !== null ? compactJson(item.json) : item.raw;
                const digest = sha256(item.data), nextPath = contentAddressedPath(item.currentPath, digest);
                if (nextPath !== item.currentPath) {
                    pathMap.set(item.currentPath, nextPath);
                    pathMap.set(item.originalPath, nextPath);
                    item.currentPath = nextPath;
                    changed = true;
                }
            }
            if (!changed)
                break;
            if (round === 15)
                throw new Error('content-addressed path migration did not converge');
        }
        graph = replacePathRefs(graph, pathMap);
        for (const item of payloads)
            if (item.json !== null) {
                item.json = replacePathRefs(item.json, pathMap);
                item.data = compactJson(item.json);
            }
    }
    for (const item of payloads) {
        item.descriptor.path = item.currentPath;
        item.descriptor.size = item.data.byteLength;
        item.descriptor.byteDigest = sha256(item.data);
        item.descriptor.contentDigest = contentDigest(item.data, item.descriptor.mediaType, item.descriptor.path);
    }
    const graphBytes = compactJson(graph);
    manifest.graph.size = graphBytes.byteLength;
    manifest.graph.byteDigest = sha256(graphBytes);
    manifest.graph.contentDigest = contentDigest(graphBytes, 'application/json', 'graph');
    if (newPackageId)
        manifest.packageId = 'urn:uuid:' + randomUUID();
    manifest.integrity.contentRoot = computeContentRoot(manifest);
    const manifestBytes = compactJson(manifest), entries = [
        { path: 'META-INF/manifest.json', data: manifestBytes, mediaType: 'application/json', method: 8 },
        { path: 'content/graph.json', data: graphBytes, mediaType: 'application/json', method: 8 },
        ...payloads.sort((a, b) => a.descriptor.path.localeCompare(b.descriptor.path)).map(({ descriptor, data, method }) => ({ path: descriptor.path, data, mediaType: descriptor.mediaType, method })),
    ];
    mkdirSync(dirname(output), { recursive: true });
    const bytes = writeZip(entries);
    writeFileSync(output, bytes);
    const after = validatePackageBytes(bytes, { strictProfiles: true, validateProfilePayloads: true });
    if (!canonicalizeIdentifiers && before.summary.contentRoot !== after.summary.contentRoot)
        throw new Error('logical contentRoot changed during neutral repack');
    return { source, output, canonicalized: canonicalizeIdentifiers, before: before.summary, after: after.summary, sameContentRoot: before.summary.contentRoot === after.summary.contentRoot };
}
export function main(argv = process.argv.slice(2)) { try {
    const p = parse(argv);
    if (flag(p, 'help')) {
        process.stdout.write('Usage: p2lrn-repack <source> <output> [--new-package-id] [--canonicalize-identifiers]\n');
        return;
    }
    printJson(repackPackage(req(p.positional[0], 'source'), req(p.positional[1], 'output'), flag(p, 'new-package-id'), flag(p, 'canonicalize-identifiers')));
}
catch (e) {
    if (e instanceof CliExit)
        return;
    fail('P2LRN Repack error', e);
} }
if (isMain(import.meta.url))
    main();
//# sourceMappingURL=repack.js.map