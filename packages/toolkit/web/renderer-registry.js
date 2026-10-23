import {canonicalIdentifier, extensionValue} from './identifiers.js';
export const RENDERER_HINT_EXTENSION = 'https://p2lrn.org/ext/renderer-preference/1';
export const COMPOSITE_RENDERER = 'https://p2lrn.org/renderer/composite/standard';
export const COMPONENT_ROUTER_RENDERER = 'https://p2lrn.org/renderer/component/router';
export const CALLOUT_COMPONENT_RENDERER = 'https://p2lrn.org/renderer/component/callout';
export const TIMELINE_COMPONENT_RENDERER = 'https://p2lrn.org/renderer/component/timeline';
export const CAPABILITY_ACTION_COMPONENT_RENDERER = 'https://p2lrn.org/renderer/component/capability-action';
export const STANDARD_QUESTIONNAIRE_RENDERER = 'https://p2lrn.org/renderer/questionnaire/standard';
export const MEMORY_RENDERER = 'https://p2lrn.org/renderer/questionnaire/memory';
export const MATCHING_RENDERER = 'https://p2lrn.org/renderer/questionnaire/matching';
export const ORDERING_RENDERER = 'https://p2lrn.org/renderer/questionnaire/ordering';
export const CLASSIFICATION_RENDERER = 'https://p2lrn.org/renderer/questionnaire/classification';
export const TRUE_FALSE_RENDERER = 'https://p2lrn.org/renderer/questionnaire/true-false';
export const FILL_BLANKS_RENDERER = 'https://p2lrn.org/renderer/questionnaire/fill-blanks';
export const WORD_SEARCH_RENDERER = 'https://p2lrn.org/renderer/questionnaire/word-search';
export const CROSSWORD_RENDERER = 'https://p2lrn.org/renderer/questionnaire/crossword';
export const ROSCO_RENDERER = 'https://p2lrn.org/renderer/questionnaire/rosco';
export const THREE_D_RENDERER = 'https://p2lrn.org/renderer/questionnaire/3d-order-match';
export const REMOTE_MEDIA_RENDERER = 'https://p2lrn.org/renderer/passive/remote-media';

function strings(value) {
  return Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
}

function normalizeMediaType(value) {
  return String(value ?? '').split(';', 1)[0].trim().toLowerCase();
}

function hintFromEntity(entity) {
  const hint = extensionValue(entity?.extensions, RENDERER_HINT_EXTENSION);
  if (typeof hint === 'string') return {preferred: hint, alternatives: [], required: false};
  if (!hint || typeof hint !== 'object' || Array.isArray(hint)) return null;
  return {
    preferred: typeof hint.preferred === 'string' ? hint.preferred : null,
    alternatives: Array.isArray(hint.alternatives) ? hint.alternatives.filter((item) => typeof item === 'string') : [],
    version: typeof hint.version === 'string' && hint.version.trim() ? hint.version.trim() : null,
    required: hint.required === true,
  };
}

export class RendererRegistry {
  constructor({dependencies, permissionPolicy} = {}) {
    this.entries = new Map();
    this.dependencies = dependencies ?? null;
    this.permissionPolicy = typeof permissionPolicy === 'function' ? permissionPolicy : () => false;
  }

  setPermissionPolicy(policy) {
    if (typeof policy !== 'function') throw new TypeError('Permission policy must be a function.');
    this.permissionPolicy = policy;
  }

  register(descriptor) {
    if (!descriptor || typeof descriptor !== 'object') throw new TypeError('Renderer descriptor must be an object.');
    const id = canonicalIdentifier(String(descriptor.id ?? '').trim());
    if (!id) throw new TypeError('Renderer descriptor requires id.');
    if (this.entries.has(id) && descriptor.replace !== true) throw new Error(`Renderer already registered: ${id}`);
    if (typeof descriptor.load !== 'function') throw new TypeError(`Renderer ${id} requires a lazy load() function.`);
    const normalized = Object.freeze({
      id,
      version: String(descriptor.version ?? '1'),
      priority: Number(descriptor.priority ?? 0),
      profiles: Object.freeze(strings(descriptor.profiles).map(canonicalIdentifier)),
      mediaTypes: Object.freeze(strings(descriptor.mediaTypes).map(normalizeMediaType)),
      roles: Object.freeze(strings(descriptor.roles)),
      dependencies: Object.freeze(Array.isArray(descriptor.dependencies) ? descriptor.dependencies : []),
      permissions: Object.freeze(strings(descriptor.permissions)),
      selectable: descriptor.selectable !== false,
      presentation: String(descriptor.presentation ?? 'generic'),
      acceptsRemoteLocation: descriptor.acceptsRemoteLocation === true,
      supports: typeof descriptor.supports === 'function' ? descriptor.supports : null,
      load: descriptor.load,
    });
    this.entries.set(id, normalized);
    return normalized;
  }

  unregister(id) { return this.entries.delete(canonicalIdentifier(id)); }
  get(id) { return this.entries.get(canonicalIdentifier(id)) ?? null; }
  list() { return [...this.entries.values()]; }

  descriptorMatches(descriptor, representation) {
    const profile = canonicalIdentifier(representation?.profile ?? null);
    const mediaType = normalizeMediaType(representation?.mediaType);
    if (representation?.location?.type === 'remote' && descriptor.acceptsRemoteLocation !== true) return false;
    if (descriptor.profiles.length && !descriptor.profiles.includes(profile)) return false;
    if (descriptor.mediaTypes.length && !descriptor.mediaTypes.some((item) => item === mediaType || (item.endsWith('/*') && mediaType.startsWith(item.slice(0, -1))))) return false;
    if (descriptor.roles.length && !descriptor.roles.includes(String(representation?.role ?? ''))) return false;
    return true;
  }

  async supports(descriptor, candidate) {
    if (!this.descriptorMatches(descriptor, candidate.representation)) return false;
    if (!descriptor.supports) return true;
    try { return Boolean(await descriptor.supports(candidate)); }
    catch { return false; }
  }

  async select({representations, entity, resource, requestedRenderer, roleRank = () => 0, excludeRendererIds = []}) {
    const reps = [...(representations ?? [])].sort((a, b) => roleRank(b) - roleRank(a) || String(a.id).localeCompare(String(b.id)));
    const hint = hintFromEntity(entity) ?? hintFromEntity(resource);
    const requested = canonicalIdentifier(String(requestedRenderer ?? '').trim()) || null;
    const excluded = new Set((excludeRendererIds ?? []).map(canonicalIdentifier));
    const preferences = [
      ...(requested ? [{id: requested, source: 'requested', required: true}] : []),
      ...(hint?.preferred ? [{id: canonicalIdentifier(hint.preferred), version: hint.version, source: 'hint', required: hint.required === true}] : []),
      ...(hint?.alternatives ?? []).map((id) => ({id: canonicalIdentifier(id), source: 'alternative', required: false})),
    ];
    const seen = new Set();

    for (const preference of preferences) {
      const id = preference.id;
      if (seen.has(id) || excluded.has(id)) continue;
      seen.add(id);
      const descriptor = this.get(id);
      if (!descriptor) {
        if (preference.required) throw new Error(`Requested P2LRN renderer is not installed: ${id}`);
        continue;
      }
      if (!descriptor.selectable) {
        if (preference.required) {
          const error = new Error(`Renderer ${id} is internal and cannot be selected by package or embed preferences.`);
          error.code = 'P2LRN_RENDERER_NOT_SELECTABLE';
          throw error;
        }
        continue;
      }
      if (preference.version && descriptor.version !== preference.version) {
        if (preference.required) throw new Error(`Renderer ${id} version ${preference.version} is required but ${descriptor.version} is installed.`);
        continue;
      }
      for (const representation of reps) {
        const candidate = {descriptor, representation, entity, resource, selection: Object.freeze({...preference})};
        if (await this.supports(descriptor, candidate)) return candidate;
      }
      if (preference.required) throw new Error(`Renderer ${id} cannot reproduce this representation.`);
    }

    const descriptors = this.list().sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    for (const representation of reps) {
      for (const descriptor of descriptors) {
        if (seen.has(descriptor.id) || excluded.has(descriptor.id)) continue;
        if (!descriptor.selectable) continue;
        const candidate = {descriptor, representation, entity, resource, selection: Object.freeze({source: 'automatic', required: false})};
        if (await this.supports(descriptor, candidate)) return candidate;
      }
    }
    return null;
  }

  async load(candidate, context = {}) {
    if (!candidate) throw new Error('Renderer candidate is required.');
    for (const permission of candidate.descriptor.permissions) {
      let allowed = false;
      try { allowed = Boolean(await this.permissionPolicy(permission, {...context, candidate})); } catch { allowed = false; }
      if (!allowed) { const error = new Error(`Runtime permission denied for renderer ${candidate.descriptor.id}: ${permission}`); error.code = 'P2LRN_PERMISSION_DENIED'; throw error; }
    }
    if (this.dependencies) await this.dependencies.resolve(candidate.descriptor.dependencies, {...context, candidate});
    const module = await candidate.descriptor.load();
    if (!module || typeof module.render !== 'function') throw new Error(`Renderer module ${candidate.descriptor.id} does not export render().`);
    return module;
  }
}
