import {canonicalIdentifier} from './identifiers.js';
import {CALLOUT_COMPONENT_RENDERER, TIMELINE_COMPONENT_RENDERER} from './renderer-registry.js';

export const COMPONENT_RUNTIME_CONTRACT_VERSION = '1';
export const CALLOUT_COMPONENT = 'https://p2lrn.org/component/callout';
export const TIMELINE_COMPONENT = 'https://p2lrn.org/component/timeline';

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function fail(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function nonEmpty(value, label) {
  const out = String(value ?? '').trim();
  if (!out) throw new TypeError(`${label} is required.`);
  return out;
}

function normalizeMigration(migration) {
  if (!migration || typeof migration !== 'object') throw new TypeError('Component migration must be an object.');
  const from = nonEmpty(migration.from, 'migration.from');
  const to = nonEmpty(migration.to, 'migration.to');
  if (from === to) throw new TypeError(`Component migration cannot map ${from} to itself.`);
  if (typeof migration.migrate !== 'function') throw new TypeError(`Component migration ${from} -> ${to} requires migrate().`);
  return Object.freeze({from, to, migrate: migration.migrate});
}

function registryKey(id, componentVersion) {
  return `${id}\u0000${componentVersion}`;
}

function normalizeVersionUriMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({});
  const out = {};
  for (const [version, identifier] of Object.entries(value)) {
    const v = String(version ?? '').trim();
    const id = String(identifier ?? '').trim();
    if (v && id) out[v] = id;
  }
  return Object.freeze(out);
}

function validateCalloutV2(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (typeof data.body !== 'string' || !data.body.trim()) return false;
  if (data.heading !== undefined && (typeof data.heading !== 'string' || !data.heading.trim())) return false;
  if (data.tone !== undefined && !['info', 'note', 'warning', 'success'].includes(data.tone)) return false;
  return Object.keys(data).every((key) => ['heading', 'body', 'tone'].includes(key));
}

function validateTimelineV1(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 200) return false;
  if (!Object.keys(data).every((key) => key === 'items')) return false;
  for (const item of data.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    if (!Object.keys(item).every((key) => ['id', 'date', 'title', 'body'].includes(key))) return false;
    if (typeof item.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(item.id) || item.id.length > 128) return false;
    if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500) return false;
    if (item.date !== undefined && (typeof item.date !== 'string' || item.date.length > 100)) return false;
    if (item.body !== undefined && (typeof item.body !== 'string' || item.body.length > 10000)) return false;
  }
  return true;
}

export class ComponentRegistry {
  constructor({runtimeContractVersion = COMPONENT_RUNTIME_CONTRACT_VERSION} = {}) {
    this.runtimeContractVersion = nonEmpty(runtimeContractVersion, 'runtimeContractVersion');
    this.entries = new Map();
  }

  register(descriptor) {
    if (!descriptor || typeof descriptor !== 'object') throw new TypeError('Component descriptor must be an object.');
    const id = canonicalIdentifier(nonEmpty(descriptor.id, 'component id'));
    const componentVersion = nonEmpty(descriptor.componentVersion, 'componentVersion');
    const runtimeContractVersion = nonEmpty(descriptor.runtimeContractVersion ?? this.runtimeContractVersion, 'runtimeContractVersion');
    if (runtimeContractVersion !== this.runtimeContractVersion) {
      throw new TypeError(`Component ${id} runtime contract ${runtimeContractVersion} cannot be registered in a contract-${this.runtimeContractVersion} registry.`);
    }
    const rendererId = canonicalIdentifier(nonEmpty(descriptor.rendererId, 'rendererId'));
    const targetDataVersion = nonEmpty(descriptor.targetDataVersion, 'targetDataVersion');
    const supportedDataVersions = [...new Set((descriptor.supportedDataVersions ?? [targetDataVersion]).map((item) => nonEmpty(item, 'supportedDataVersion')))];
    if (!supportedDataVersions.includes(targetDataVersion)) supportedDataVersions.push(targetDataVersion);
    const migrations = Object.freeze((descriptor.migrations ?? []).map(normalizeMigration));
    const key = registryKey(id, componentVersion);
    if (this.entries.has(key) && descriptor.replace !== true) throw new Error(`Component already registered: ${id} @ ${componentVersion}`);
    const normalized = Object.freeze({
      id,
      componentVersion,
      runtimeContractVersion,
      rendererId,
      targetDataVersion,
      supportedDataVersions: Object.freeze(supportedDataVersions),
      authoringDataVersion: descriptor.authoringDataVersion ? String(descriptor.authoringDataVersion).trim() : null,
      dataSchemas: normalizeVersionUriMap(descriptor.dataSchemas),
      editorSchemas: normalizeVersionUriMap(descriptor.editorSchemas),
      migrations,
      validateData: typeof descriptor.validateData === 'function' ? descriptor.validateData : null,
    });
    this.entries.set(key, normalized);
    return normalized;
  }

  unregister(id, componentVersion) { return this.entries.delete(registryKey(canonicalIdentifier(String(id)), String(componentVersion))); }
  get(id, componentVersion) { return this.entries.get(registryKey(canonicalIdentifier(String(id)), String(componentVersion))) ?? null; }
  list() { return [...this.entries.values()]; }

  resolve(instance) {
    const component = instance?.component;
    const id = canonicalIdentifier(String(component?.id ?? '').trim());
    const componentVersion = String(component?.componentVersion ?? '').trim();
    const runtimeContractVersion = String(component?.runtimeContractVersion ?? '').trim();
    if (!id || !componentVersion) throw fail('P2LRN_COMPONENT_INVALID', 'Component instance has no component id/version.');
    const descriptor = this.get(id, componentVersion);
    if (!descriptor) {
      const sameId = this.list().filter((entry) => entry.id === id);
      throw fail(
        sameId.length ? 'P2LRN_COMPONENT_VERSION_UNAVAILABLE' : 'P2LRN_COMPONENT_UNAVAILABLE',
        sameId.length
          ? `Component ${id} version ${componentVersion} is not installed.`
          : `Component ${id} is not installed.`,
      );
    }
    if (runtimeContractVersion !== descriptor.runtimeContractVersion || runtimeContractVersion !== this.runtimeContractVersion) {
      throw fail(
        'P2LRN_COMPONENT_CONTRACT_MISMATCH',
        `Component ${id} requires runtime contract ${runtimeContractVersion || '(missing)'}; installed implementation uses ${descriptor.runtimeContractVersion}.`,
      );
    }
    return descriptor;
  }

  #migrationPath(descriptor, from, to) {
    if (from === to) return [];
    const outgoing = new Map();
    for (const migration of descriptor.migrations) {
      const list = outgoing.get(migration.from) ?? [];
      list.push(migration);
      outgoing.set(migration.from, list);
    }
    for (const list of outgoing.values()) list.sort((a, b) => a.to.localeCompare(b.to));
    const queue = [{version: from, path: []}];
    const visited = new Set([from]);
    while (queue.length) {
      const current = queue.shift();
      for (const migration of outgoing.get(current.version) ?? []) {
        const nextPath = [...current.path, migration];
        if (migration.to === to) return nextPath;
        if (visited.has(migration.to)) continue;
        visited.add(migration.to);
        queue.push({version: migration.to, path: nextPath});
      }
    }
    return null;
  }

  async prepare(instance, context = {}) {
    const descriptor = this.resolve(instance);
    const sourceDataVersion = String(instance?.component?.dataVersion ?? '').trim();
    if (!sourceDataVersion) throw fail('P2LRN_COMPONENT_INVALID', 'Component instance has no dataVersion.');
    const target = descriptor.targetDataVersion;
    const path = this.#migrationPath(descriptor, sourceDataVersion, target);
    if (path === null) {
      throw fail(
        'P2LRN_COMPONENT_MIGRATION_UNAVAILABLE',
        `No registered deterministic migration path exists for ${descriptor.id} data ${sourceDataVersion} -> ${target}.`,
      );
    }
    let data = cloneJson(instance.data ?? {});
    let current = sourceDataVersion;
    for (const migration of path) {
      try {
        const result = await migration.migrate(cloneJson(data), Object.freeze({...context, componentId: descriptor.id, componentVersion: descriptor.componentVersion, fromDataVersion: migration.from, toDataVersion: migration.to}));
        if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('migration result must be an object');
        data = cloneJson(result);
        current = migration.to;
      } catch (cause) {
        throw fail('P2LRN_COMPONENT_MIGRATION_FAILED', `Component migration failed for ${descriptor.id}: ${migration.from} -> ${migration.to}.`, cause);
      }
    }
    if (current !== target || !descriptor.supportedDataVersions.includes(current)) {
      throw fail('P2LRN_COMPONENT_MIGRATION_UNAVAILABLE', `Prepared component data version ${current} is not supported by ${descriptor.id}.`);
    }
    if (descriptor.validateData) {
      let valid = false;
      try { valid = Boolean(await descriptor.validateData(cloneJson(data), Object.freeze({...context, dataVersion: current}))); }
      catch { valid = false; }
      if (!valid) throw fail('P2LRN_COMPONENT_DATA_INVALID', `Component data is invalid for ${descriptor.id} data version ${current}.`);
    }
    const prepared = cloneJson(instance);
    prepared.data = data;
    prepared.component.dataVersion = current;
    return Object.freeze({descriptor, instance: prepared, migrated: path.length > 0, sourceDataVersion, dataVersion: current});
  }
}

export function createDefaultComponentRegistry() {
  const registry = new ComponentRegistry();
  registry.register({
    id: CALLOUT_COMPONENT,
    componentVersion: '1',
    runtimeContractVersion: COMPONENT_RUNTIME_CONTRACT_VERSION,
    rendererId: CALLOUT_COMPONENT_RENDERER,
    supportedDataVersions: ['2'],
    targetDataVersion: '2',
    authoringDataVersion: '2',
    dataSchemas: {
      '1': 'https://p2lrn.org/component/callout/schema/data/1',
      '2': 'https://p2lrn.org/component/callout/schema/data/2',
    },
    editorSchemas: {
      '2': 'https://p2lrn.org/component/callout/editor/2',
    },
    migrations: [{
      from: '1',
      to: '2',
      migrate(data) {
        const out = {};
        if (typeof data?.heading === 'string' && data.heading.trim()) out.heading = data.heading;
        out.body = typeof data?.text === 'string' ? data.text : '';
        if (typeof data?.tone === 'string') out.tone = data.tone;
        return out;
      },
    }],
    validateData: validateCalloutV2,
  });
  registry.register({
    id: TIMELINE_COMPONENT,
    componentVersion: '1',
    runtimeContractVersion: COMPONENT_RUNTIME_CONTRACT_VERSION,
    rendererId: TIMELINE_COMPONENT_RENDERER,
    supportedDataVersions: ['1'],
    targetDataVersion: '1',
    authoringDataVersion: '1',
    dataSchemas: {
      '1': 'https://p2lrn.org/component/timeline/schema/data/1',
    },
    editorSchemas: {
      '1': 'https://p2lrn.org/component/timeline/editor/1',
    },
    validateData: validateTimelineV1,
  });
  return registry;
}
