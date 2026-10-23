import {extensionValue} from './identifiers.js';

export const HOST_CAPABILITY_EXTENSION = 'https://p2lrn.org/ext/host-capabilities/1';
export const HOST_CAPABILITY_CONTRACT_VERSION = '1';
export const MAX_HOST_CAPABILITY_REQUESTS = 128;
export const MAX_HOST_CAPABILITY_OPERATIONS = 64;
export const MAX_HOST_CAPABILITY_CONTEXT_KEYS = 64;
export const MAX_HOST_CAPABILITY_TOKEN_LENGTH = 128;
export const MAX_HOST_CAPABILITY_DESCRIPTION_LENGTH = 2048;
const SEMANTIC_TOKEN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function nonEmpty(value, label, maxLength = 4096) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required.`);
  if (text.length > maxLength) throw new TypeError(`${label} is too long.`);
  return text;
}

function semanticToken(value, label) {
  const text = nonEmpty(value, label, MAX_HOST_CAPABILITY_TOKEN_LENGTH);
  if (!SEMANTIC_TOKEN.test(text)) throw new TypeError(`${label} must be a semantic identifier, not a URL or transport address.`);
  return text;
}

function strings(value, label, {limit = MAX_HOST_CAPABILITY_OPERATIONS, semantic = true} = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  if (value.length > limit) throw new TypeError(`${label} exceeds the supported item limit.`);
  const out = [];
  for (const item of value) {
    const text = semantic ? semanticToken(item, label) : nonEmpty(item, label, MAX_HOST_CAPABILITY_TOKEN_LENGTH);
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

function normalizeRequirement(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Capability request must be an object.');
  const id = semanticToken(value.id, 'capability.id');
  const operations = strings(value.operations, `capability ${id} operations`, {limit:MAX_HOST_CAPABILITY_OPERATIONS});
  const context = strings(value.context, `capability ${id} context`, {limit:MAX_HOST_CAPABILITY_CONTEXT_KEYS});
  const description = value.description == null ? null : nonEmpty(value.description, `capability ${id} description`, MAX_HOST_CAPABILITY_DESCRIPTION_LENGTH);
  const fallback = value.fallback == null ? null : semanticToken(value.fallback, `capability ${id} fallback`);
  return Object.freeze({id, required: value.required === true, operations: Object.freeze(operations), context: Object.freeze(context), description, fallback});
}

export function capabilityRequirements(entity) {
  const raw = extensionValue(entity?.extensions, HOST_CAPABILITY_EXTENSION);
  if (raw == null) return Object.freeze([]);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('P2LRN host capability extension must be an object.');
  if (String(raw.version ?? '') !== HOST_CAPABILITY_CONTRACT_VERSION) throw new TypeError(`Unsupported P2LRN host capability extension version: ${raw.version ?? '(missing)'}`);
  if (!Array.isArray(raw.requests)) throw new TypeError('P2LRN host capability extension requests must be an array.');
  if (raw.requests.length > MAX_HOST_CAPABILITY_REQUESTS) throw new TypeError('P2LRN host capability extension contains too many requests.');
  const requests = raw.requests.map(normalizeRequirement);
  const ids = new Set();
  for (const request of requests) {
    if (ids.has(request.id)) throw new TypeError(`Duplicate P2LRN host capability request: ${request.id}`);
    ids.add(request.id);
  }
  return Object.freeze(requests);
}

export function validateCapabilityGraph(graph) {
  for (const entity of graph?.entities ?? []) {
    const declared=extensionValue(entity?.extensions, HOST_CAPABILITY_EXTENSION);
    if (declared !== undefined) {
      if (!['course','activity','resource'].includes(entity?.type)) throw new TypeError('Host capabilities are only valid on course, activity or resource entities: ' + String(entity?.id ?? '(unknown)'));
      capabilityRequirements(entity);
    }
    if (entity?.type === 'resource') {
      for (const representation of entity.representations ?? []) {
        if (extensionValue(representation?.extensions, HOST_CAPABILITY_EXTENSION) !== undefined) throw new TypeError('Host capabilities are not valid on resource representations: ' + String(representation?.id ?? entity.id));
      }
    }
  }
  for (const relation of graph?.relations ?? []) {
    if (extensionValue(relation?.extensions, HOST_CAPABILITY_EXTENSION) !== undefined) throw new TypeError('Host capabilities are not valid on graph relations.');
  }
  return true;
}

export function capabilityOperationAllowed(requests, id, operation) {
  const capabilityId=semanticToken(id,'capability id');
  const operationId=semanticToken(operation,'capability operation');
  const request=(requests??[]).find((item)=>String(item?.id)===capabilityId);
  if(!request)return false;
  const operations=Array.isArray(request.operations)?request.operations.map(String):[];
  return operations.includes(operationId);
}

export function mergeCapabilityRequirements(...groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const request of group ?? []) {
      const current = merged.get(request.id);
      if (!current) {
        merged.set(request.id, normalizeRequirement(request));
        continue;
      }
      const operations = [...new Set([...current.operations, ...(request.operations ?? [])])];
      const context = [...new Set([...current.context, ...(request.context ?? [])])];
      merged.set(request.id, normalizeRequirement({
        id: request.id,
        required: current.required || request.required === true,
        operations,
        context,
        description: request.description ?? current.description ?? null,
        fallback: request.fallback ?? current.fallback ?? null,
      }));
    }
  }
  return Object.freeze([...merged.values()]);
}

function normalizeProvider(provider) {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) throw new TypeError('Capability provider must be an object.');
  const id = semanticToken(provider.id, 'provider.id');
  const operations = strings(provider.operations, `provider ${id} operations`, {limit:MAX_HOST_CAPABILITY_OPERATIONS});
  if (!operations.length && typeof provider.supports !== 'function') throw new TypeError(`Capability provider ${id} requires operations or supports().`);
  if (typeof provider.invoke !== 'function') throw new TypeError(`Capability provider ${id} requires invoke().`);
  return Object.freeze({
    id,
    operations: Object.freeze(operations),
    supports: typeof provider.supports === 'function' ? provider.supports.bind(provider) : null,
    available: typeof provider.available === 'function' ? provider.available.bind(provider) : null,
    invoke: provider.invoke.bind(provider),
    describe: typeof provider.describe === 'function' ? provider.describe.bind(provider) : null,
  });
}

export function createToolCapabilityProvider({id, tools, callTool, available = null, describe = null} = {}) {
  const capabilityId=semanticToken(id,'provider.id');
  if (!tools || typeof tools !== 'object' || Array.isArray(tools)) throw new TypeError('Tool capability provider tools must be an object.');
  if (typeof callTool !== 'function') throw new TypeError('Tool capability provider requires callTool().');
  if (available != null && typeof available !== 'function') throw new TypeError('Tool capability provider available must be a function.');
  if (describe != null && typeof describe !== 'function') throw new TypeError('Tool capability provider describe must be a function.');
  const mapping=new Map();
  for (const [operation,tool] of Object.entries(tools)) {
    const operationId=semanticToken(operation,'tool capability operation');
    const toolId=nonEmpty(tool,'tool capability mapping');
    mapping.set(operationId,toolId);
  }
  if (!mapping.size) throw new TypeError('Tool capability provider requires at least one operation mapping.');
  return Object.freeze({
    id:capabilityId,
    operations:Object.freeze([...mapping.keys()]),
    available:available ?? undefined,
    describe:describe ?? undefined,
    async invoke(operation,input,context) {
      const operationId=semanticToken(operation,'capability operation');
      const tool=mapping.get(operationId);
      if (!tool) {
        const error=new Error('P2LRN tool capability operation is not mapped: '+capabilityId+'.'+operationId);
        error.code='P2LRN_CAPABILITY_UNAVAILABLE';
        throw error;
      }
      return callTool(tool,cloneJson(input),Object.freeze({...context}),Object.freeze({capabilityId,operation:operationId}));
    },
  });
}

export class CapabilityBroker {
  constructor({providers = [], authorize = null} = {}) {
    if (authorize != null && typeof authorize !== 'function') throw new TypeError('Capability broker authorize must be a function.');
    this.providers = new Map();
    this.authorize = authorize ?? (() => false);
    for (const provider of providers) this.register(provider);
  }

  register(provider) {
    const normalized = normalizeProvider(provider);
    if (this.providers.has(normalized.id) && provider.replace !== true) throw new Error(`Capability provider already registered: ${normalized.id}`);
    this.providers.set(normalized.id, normalized);
    return normalized;
  }

  unregister(id) { return this.providers.delete(String(id)); }
  list() { return [...this.providers.values()]; }

  async #supports(provider, operation, context) {
    if (!provider) return false;
    if (provider.operations.includes(operation)) return true;
    if (!provider.supports) return false;
    try { return Boolean(await provider.supports(operation, Object.freeze({...context}))); }
    catch { return false; }
  }

  async #available(provider, context) {
    if (!provider) return false;
    if (!provider.available) return true;
    try { return Boolean(await provider.available(Object.freeze({...context}))); }
    catch { return false; }
  }

  async negotiate(requests = [], context = {}) {
    const result = [];
    for (const request of requests) {
      const normalized = normalizeRequirement(request);
      const provider = this.providers.get(normalized.id) ?? null;
      const available = await this.#available(provider, context);
      const supportedOperations = [];
      if (provider && available) {
        const desired = normalized.operations.length ? normalized.operations : provider.operations;
        for (const operation of desired) if (await this.#supports(provider, operation, context)) supportedOperations.push(operation);
      }
      const complete = Boolean(provider && available && (!normalized.operations.length || supportedOperations.length === normalized.operations.length));
      result.push(Object.freeze({
        id: normalized.id,
        required: normalized.required,
        available: complete,
        provider: complete ? normalized.id : null,
        operations: Object.freeze(supportedOperations),
        fallback: normalized.fallback,
      }));
    }
    return Object.freeze(result);
  }

  async invoke(id, operation, input = {}, context = {}) {
    const capabilityId = semanticToken(id, 'capability id');
    const operationId = semanticToken(operation, 'capability operation');
    const provider = this.providers.get(capabilityId);
    if (!provider || !(await this.#available(provider, context)) || !(await this.#supports(provider, operationId, context))) {
      const error = new Error(`P2LRN host capability is unavailable: ${capabilityId}.${operationId}`);
      error.code = 'P2LRN_CAPABILITY_UNAVAILABLE';
      throw error;
    }
    let allowed = false;
    try { allowed = Boolean(await this.authorize(Object.freeze({capabilityId, operation:operationId, input:cloneJson(input), context:cloneJson(context)}))); }
    catch { allowed = false; }
    if (!allowed) {
      const error = new Error(`P2LRN host capability permission denied: ${capabilityId}.${operationId}`);
      error.code = 'P2LRN_CAPABILITY_DENIED';
      throw error;
    }
    const result = await provider.invoke(operationId, cloneJson(input), Object.freeze({...context}));
    return cloneJson(result);
  }
}

export function createCapabilityBroker(options = {}) { return new CapabilityBroker(options); }
export function normalizeCapabilityBroker(value) {
  if (value == null) return null;
  if (value instanceof CapabilityBroker) return value;
  if (typeof value === 'object' && typeof value.negotiate === 'function' && typeof value.invoke === 'function') return value;
  throw new TypeError('P2LRN capability broker must expose negotiate() and invoke().');
}