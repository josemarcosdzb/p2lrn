export class DependencyRegistry {
  constructor() {
    this.entries = new Map();
  }

  register(descriptor) {
    if (!descriptor || typeof descriptor !== 'object') throw new TypeError('Dependency descriptor must be an object.');
    const id = String(descriptor.id ?? '').trim();
    if (!id) throw new TypeError('Dependency descriptor requires id.');
    if (this.entries.has(id) && descriptor.replace !== true) throw new Error(`Dependency already registered: ${id}`);
    const normalized = Object.freeze({
      id,
      version: String(descriptor.version ?? '1'),
      optional: descriptor.optional === true,
      detect: typeof descriptor.detect === 'function' ? descriptor.detect : () => true,
      load: typeof descriptor.load === 'function' ? descriptor.load : null,
    });
    this.entries.set(id, normalized);
    return normalized;
  }

  get(id) { return this.entries.get(id) ?? null; }

  async resolve(ids = [], context = {}) {
    const resolved = new Map();
    for (const requested of ids) {
      const request = typeof requested === 'string' ? {id: requested, optional: false} : requested;
      const descriptor = this.get(request.id);
      if (!descriptor) {
        if (request.optional) continue;
        const error = new Error(`Required runtime dependency is not registered: ${request.id}`); error.code = 'P2RLN_DEPENDENCY_UNAVAILABLE'; throw error;
      }
      let available = false;
      try { available = Boolean(await descriptor.detect(context)); }
      catch { available = false; }
      let value = null;
      if (!available && descriptor.load) {
        value = await descriptor.load(context);
        try { available = Boolean(await descriptor.detect({...context, loaded: value})); }
        catch { available = Boolean(value); }
      }
      if (!available) {
        if (request.optional || descriptor.optional) continue;
        const error = new Error(`Required runtime dependency is unavailable: ${request.id}`); error.code = 'P2RLN_DEPENDENCY_UNAVAILABLE'; throw error;
      }
      resolved.set(request.id, value ?? true);
    }
    return resolved;
  }

  list() { return [...this.entries.values()]; }
}

export const DOM_DEPENDENCY = 'https://p2rln.org/runtime/dependency/dom';
export const CANVAS2D_DEPENDENCY = 'https://p2rln.org/runtime/dependency/canvas2d';
export const WEBGL2_DEPENDENCY = 'https://p2rln.org/runtime/dependency/webgl2';

export function createDefaultDependencyRegistry() {
  const registry = new DependencyRegistry();
  registry.register({id: DOM_DEPENDENCY, detect: () => typeof document !== 'undefined' && typeof HTMLElement !== 'undefined'});
  registry.register({
    id: CANVAS2D_DEPENDENCY,
    detect: () => {
      if (typeof document === 'undefined') return false;
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext?.('2d'));
    },
  });
  registry.register({
    id: WEBGL2_DEPENDENCY,
    detect: () => {
      if (typeof document === 'undefined') return false;
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext?.('webgl2', {failIfMajorPerformanceCaveat: true}));
    },
  });
  return registry;
}
