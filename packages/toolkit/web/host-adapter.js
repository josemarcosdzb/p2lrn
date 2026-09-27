export const HOST_ADAPTER_VERSION = '1';
const CALLBACKS = ['loadState', 'saveState', 'reportScore', 'emitEvent', 'emitXapiStatementIntent', 'resolveResourceUrl', 'resolveRuntimeLaunch'];

export function createHostAdapter(implementation = {}) {
  if (!implementation || typeof implementation !== 'object' || Array.isArray(implementation)) throw new TypeError('P2LRN host adapter must be an object.');
  const version = implementation.version == null ? HOST_ADAPTER_VERSION : String(implementation.version);
  if (version !== HOST_ADAPTER_VERSION) throw new TypeError(`Unsupported P2LRN host adapter version: ${version}`);
  const adapter = {version};
  for (const name of CALLBACKS) {
    if (implementation[name] == null) continue;
    if (typeof implementation[name] !== 'function') throw new TypeError(`P2LRN host adapter ${name} must be a function.`);
    adapter[name] = implementation[name].bind(implementation);
  }
  return Object.freeze(adapter);
}

export function normalizeHostAdapter(value) {
  if (value == null) return null;
  return createHostAdapter(value);
}
