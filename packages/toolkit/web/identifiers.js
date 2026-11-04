const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// JSON is data, never a source of object prototypes or executable configuration.
export function parseP2LRNUntrustedJson(source) {
  return JSON.parse(source, (key, value) => {
    if (FORBIDDEN_JSON_KEYS.has(key)) throw new Error('Forbidden JSON object key: ' + key);
    return value;
  });
}
export const P2LRN_NS = 'https://p2lrn.org/';
export const LEGACY_P2RLN_NS = 'https://p2rln.org/';
export function canonicalIdentifier(value) {
  if (typeof value !== 'string') return value;
  return value
    .replaceAll(LEGACY_P2RLN_NS, P2LRN_NS)
    .replaceAll('urn:p2rln:', 'urn:p2lrn:')
    .replaceAll('application/vnd.p2rln', 'application/vnd.p2lrn')
    .replaceAll('org.p2rln.', 'org.p2lrn.')
    .replaceAll('p2rlnVersions', 'p2lrnVersions')
    .replaceAll('p2rln:', 'p2lrn:')
    .replaceAll('p2rln.', 'p2lrn.')
    .replaceAll('p2rln_', 'p2lrn_')
    .replaceAll('p2rln-', 'p2lrn-');
}
export function identifierIs(value, canonical) { return typeof value === 'string' && canonicalIdentifier(value) === canonicalIdentifier(canonical); }
export function canonicalizeIdentifiers(value) {
  if (typeof value === 'string') return canonicalIdentifier(value);
  if (Array.isArray(value)) return value.map(canonicalizeIdentifiers);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = canonicalIdentifier(key);
      if (FORBIDDEN_JSON_KEYS.has(normalized)) throw new Error('Forbidden graph key: ' + normalized);
      Object.defineProperty(out, normalized, {
        value: canonicalizeIdentifiers(item), enumerable:true, writable:true, configurable:true,
      });
    }
    return out;
  }
  return value;
}
export function extensionValue(extensions, canonicalKey) {
  for (const [key, value] of Object.entries(extensions ?? {})) if (identifierIs(key, canonicalKey)) return value;
  return undefined;
}
