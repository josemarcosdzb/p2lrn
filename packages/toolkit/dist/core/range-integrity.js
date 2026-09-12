import { ValidationError } from './errors.js';
import { sha256 } from './integrity.js';
import { identifierIs } from './constants.js';
export const RANGE_INTEGRITY_EXTENSION = 'org.p2lrn.rangeIntegrity';
export const LEGACY_RANGE_INTEGRITY_EXTENSION = 'org.p2rln.rangeIntegrity';
export const RANGE_INTEGRITY_VERSION = '1';
export const RANGE_INTEGRITY_MEDIA_TYPE = 'application/vnd.p2lrn.range-integrity+json';
export const LEGACY_RANGE_INTEGRITY_MEDIA_TYPE = 'application/vnd.p2rln.range-integrity+json';
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;
export const MIN_CHUNK_SIZE = 64 * 1024;
export const MAX_CHUNK_SIZE = 8 * 1024 * 1024;
export function chunkDigests(data, chunkSize = DEFAULT_CHUNK_SIZE) {
    if (!Number.isInteger(chunkSize) || chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE)
        throw new ValidationError(`chunkSize must be between ${MIN_CHUNK_SIZE} and ${MAX_CHUNK_SIZE} bytes`);
    const out = [];
    for (let offset = 0; offset < data.byteLength; offset += chunkSize)
        out.push(sha256(data.slice(offset, Math.min(offset + chunkSize, data.byteLength))));
    return out;
}
export function buildRangeIntegrityMap(payloads, paths, chunkSize = DEFAULT_CHUNK_SIZE) {
    const get = (p) => payloads instanceof Map ? payloads.get(p) : payloads[p];
    const entries = {};
    for (const path of [...new Set(paths)].sort()) {
        const data = get(path);
        if (!data)
            throw new ValidationError(`range-integrity payload is missing: ${path}`);
        entries[path] = { size: data.byteLength, byteDigest: sha256(data), chunks: chunkDigests(data, chunkSize) };
    }
    return { version: RANGE_INTEGRITY_VERSION, algorithm: 'sha256', chunkSize, entries };
}
export function validateRangeIntegrityMap(index, inventory) {
    if (!index || typeof index !== 'object' || Array.isArray(index))
        throw new ValidationError('range-integrity map must be an object');
    if (index.version !== RANGE_INTEGRITY_VERSION)
        throw new ValidationError(`unsupported range-integrity version: ${JSON.stringify(index.version)}`);
    if (index.algorithm !== 'sha256')
        throw new ValidationError('range-integrity algorithm must be sha256');
    const chunkSize = index.chunkSize;
    if (!Number.isInteger(chunkSize) || chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE)
        throw new ValidationError('range-integrity chunkSize is outside the supported bounds');
    const entries = index.entries;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries) || !Object.keys(entries).length)
        throw new ValidationError('range-integrity entries must be a non-empty object');
    for (const [path, entry] of Object.entries(entries)) {
        if (!path)
            throw new ValidationError('range-integrity entry path must be a non-empty string');
        if (inventory && !inventory.has(path))
            throw new ValidationError(`range-integrity entry is not inventoried: ${path}`);
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            throw new ValidationError(`range-integrity entry must be an object: ${path}`);
        if (!Number.isInteger(entry.size) || entry.size < 0)
            throw new ValidationError(`invalid range-integrity size: ${path}`);
        if (typeof entry.byteDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(entry.byteDigest))
            throw new ValidationError(`invalid range-integrity byteDigest: ${path}`);
        if (!Array.isArray(entry.chunks))
            throw new ValidationError(`range-integrity chunks must be an array: ${path}`);
        const expected = entry.size ? Math.ceil(entry.size / chunkSize) : 0;
        if (entry.chunks.length !== expected)
            throw new ValidationError(`range-integrity chunk count mismatch for ${path}: expected ${expected}, got ${entry.chunks.length}`);
        for (const chunk of entry.chunks)
            if (typeof chunk !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(chunk))
                throw new ValidationError(`invalid range-integrity chunk digest: ${path}`);
    }
    return index;
}
export function isRangeIntegrityExtension(value) { return identifierIs(value, RANGE_INTEGRITY_EXTENSION); }
export function isRangeIntegrityMediaType(value) { return identifierIs(value, RANGE_INTEGRITY_MEDIA_TYPE); }
//# sourceMappingURL=range-integrity.js.map