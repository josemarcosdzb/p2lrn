export const RANGE_INTEGRITY_EXTENSION = 'org.p2rln.rangeIntegrity';
export const RANGE_INTEGRITY_VERSION = '1';
export const RANGE_INTEGRITY_MEDIA_TYPE = 'application/vnd.p2rln.range-integrity+json';
export const MIN_CHUNK_SIZE = 64 * 1024;
export const MAX_CHUNK_SIZE = 8 * 1024 * 1024;

const DIGEST = /^sha256:[0-9a-f]{64}$/;

export function rangeIntegrityPointer(graph, inventory = null) {
  const raw = graph?.extensions?.[RANGE_INTEGRITY_EXTENSION];
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('range-integrity extension must be an object.');
  if (raw.version !== RANGE_INTEGRITY_VERSION) throw new Error(`Unsupported range-integrity extension version: ${raw.version}`);
  if (typeof raw.indexPath !== 'string' || !raw.indexPath) throw new Error('range-integrity indexPath must be a non-empty string.');
  if (inventory && !inventory.has(raw.indexPath)) throw new Error(`range-integrity index is not inventoried: ${raw.indexPath}`);
  return Object.freeze({version: raw.version, indexPath: raw.indexPath});
}

export function validateRangeIntegrityIndex(index, inventory = null) {
  if (!index || typeof index !== 'object' || Array.isArray(index)) throw new Error('range-integrity map must be an object.');
  if (index.version !== RANGE_INTEGRITY_VERSION) throw new Error(`Unsupported range-integrity map version: ${index.version}`);
  if (index.algorithm !== 'sha256') throw new Error('range-integrity algorithm must be sha256.');
  if (!Number.isSafeInteger(index.chunkSize) || index.chunkSize < MIN_CHUNK_SIZE || index.chunkSize > MAX_CHUNK_SIZE) throw new Error('range-integrity chunkSize is outside supported bounds.');
  if (!index.entries || typeof index.entries !== 'object' || Array.isArray(index.entries) || !Object.keys(index.entries).length) throw new Error('range-integrity entries must be a non-empty object.');
  const entries = {};
  for (const [path, raw] of Object.entries(index.entries)) {
    if (!path || (inventory && !inventory.has(path))) throw new Error(`range-integrity target is not inventoried: ${path}`);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`range-integrity entry must be an object: ${path}`);
    if (!Number.isSafeInteger(raw.size) || raw.size < 0) throw new Error(`range-integrity size is invalid: ${path}`);
    if (!DIGEST.test(String(raw.byteDigest ?? ''))) throw new Error(`range-integrity byteDigest is invalid: ${path}`);
    if (!Array.isArray(raw.chunks)) throw new Error(`range-integrity chunks must be an array: ${path}`);
    const expected = raw.size === 0 ? 0 : Math.ceil(raw.size / index.chunkSize);
    if (raw.chunks.length !== expected || raw.chunks.some((value) => !DIGEST.test(String(value)))) throw new Error(`range-integrity chunk list is invalid: ${path}`);
    entries[path] = Object.freeze({size: raw.size, byteDigest: raw.byteDigest, chunks: Object.freeze([...raw.chunks])});
  }
  return Object.freeze({version: index.version, algorithm: index.algorithm, chunkSize: index.chunkSize, entries: Object.freeze(entries)});
}
