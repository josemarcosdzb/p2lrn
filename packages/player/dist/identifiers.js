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
    for (const [key, item] of Object.entries(value)) out[canonicalIdentifier(key)] = canonicalizeIdentifiers(item);
    return out;
  }
  return value;
}
export function extensionValue(extensions, canonicalKey) {
  for (const [key, value] of Object.entries(extensions ?? {})) if (identifierIs(key, canonicalKey)) return value;
  return undefined;
}
