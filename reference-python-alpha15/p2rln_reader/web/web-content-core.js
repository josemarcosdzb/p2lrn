export const WEB_CONTENT_PROFILE = 'https://p2rln.org/profile/web-content';
export const WEB_CONTENT_MAPPING_EXTENSION = 'https://p2rln.org/extension/web-content-bundle';
export const WEB_CONTENT_MAPPING_VERSION = '1';

export function safeWebLogicalPath(value) {
  const text = String(value ?? '');
  if (!text || text.startsWith('/') || text.includes('\\') || text.includes('\0')) throw new Error(`Unsafe web-content logical path: ${JSON.stringify(text)}`);
  const parts = text.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe web-content logical path: ${JSON.stringify(text)}`);
  return parts.join('/');
}

export function webContentMapping(representation, inventory = null) {
  const raw = representation?.extensions?.[WEB_CONTENT_MAPPING_EXTENSION];
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('web-content bundle extension must be an object.');
  if (raw.version !== WEB_CONTENT_MAPPING_VERSION) throw new Error(`Unsupported web-content mapping version: ${raw.version}`);
  const entrypoint = safeWebLogicalPath(raw.entrypoint);
  if (!raw.assets || typeof raw.assets !== 'object' || Array.isArray(raw.assets) || !Object.keys(raw.assets).length) throw new Error('web-content assets mapping must be a non-empty object.');
  if (Object.keys(raw.assets).length > 5000) throw new Error('web-content assets mapping exceeds 5000 entries.');
  const assets = {};
  for (const [logical, embedded] of Object.entries(raw.assets)) {
    const normalized = safeWebLogicalPath(logical);
    if (normalized !== logical) throw new Error(`web-content logical path is not canonical: ${logical}`);
    if (typeof embedded !== 'string' || !embedded) throw new Error(`web-content asset path is invalid: ${logical}`);
    if (inventory && !inventory.has(embedded)) throw new Error(`web-content asset is not inventoried: ${logical}`);
    assets[logical] = embedded;
  }
  if (!Object.hasOwn(assets, entrypoint)) throw new Error('web-content entrypoint is absent from assets mapping.');
  if (representation?.location?.type !== 'embedded' || representation.location.path !== assets[entrypoint]) throw new Error('web-content representation location does not match mapped entrypoint.');
  return Object.freeze({version: WEB_CONTENT_MAPPING_VERSION, entrypoint, assets: Object.freeze(assets)});
}

export function webEntrypointDirectory(mapping) {
  if (!mapping) return '';
  const index = mapping.entrypoint.lastIndexOf('/');
  return index < 0 ? '' : mapping.entrypoint.slice(0, index + 1);
}
