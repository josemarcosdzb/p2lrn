import {identifierIs} from './identifiers.js';
export const NATIVE_COMPONENT_SCHEMA = 'https://p2lrn.org/schema/native-component/0.1';
export const NATIVE_COMPONENT_VERSION = '0.1';
export const NATIVE_COMPONENT_PROFILE = 'https://p2lrn.org/profile/native-component';
export const NATIVE_COMPONENT_MEDIA_TYPE = 'application/vnd.p2lrn.component+json';
export const NATIVE_COMPONENT_ACTIVITY_TYPE = 'https://p2lrn.org/type/component';

const VERSION_RE = /^[A-Za-z0-9._+\-]+$/;

function validUri(value) {
  if (typeof value !== 'string' || value.length < 3 || value.length > 500) return false;
  try { return Boolean(new URL(value).protocol); } catch { return /^urn:[^\s]+$/i.test(value); }
}

export function validateNativeComponent(instance) {
  if (!instance || typeof instance !== 'object' || Array.isArray(instance)) throw new Error('Native component instance must be an object.');
  const allowed = new Set(['schema', 'version', 'component', 'data', 'schemas', 'title', 'description', 'language', 'extensions']);
  for (const key of Object.keys(instance)) if (!allowed.has(key)) throw new Error(`Unknown native component field: ${key}`);
  if (!identifierIs(instance.schema, NATIVE_COMPONENT_SCHEMA) || instance.version !== NATIVE_COMPONENT_VERSION) throw new Error('Unsupported native component schema/version.');
  const component = instance.component;
  if (!component || typeof component !== 'object' || Array.isArray(component)) throw new Error('Native component descriptor is required.');
  const componentKeys = new Set(['id', 'componentVersion', 'dataVersion', 'runtimeContractVersion']);
  for (const key of Object.keys(component)) if (!componentKeys.has(key)) throw new Error(`Unknown native component descriptor field: ${key}`);
  for (const key of componentKeys) {
    const value = component[key];
    if (typeof value !== 'string' || !value || value.length > 64 && key !== 'id') throw new Error(`Invalid native component ${key}.`);
    if (key === 'id') {
      if (!validUri(value)) throw new Error('Native component id must be an absolute URI.');
    } else if (!VERSION_RE.test(value)) throw new Error(`Invalid native component ${key}.`);
  }
  if (!instance.data || typeof instance.data !== 'object' || Array.isArray(instance.data)) throw new Error('Native component data must be an object.');
  if (instance.title !== undefined && (typeof instance.title !== 'string' || !instance.title.trim() || instance.title.length > 500)) throw new Error('Invalid native component title.');
  if (instance.description !== undefined && (typeof instance.description !== 'string' || instance.description.length > 5000)) throw new Error('Invalid native component description.');
  if (instance.schemas !== undefined) {
    if (!instance.schemas || typeof instance.schemas !== 'object' || Array.isArray(instance.schemas)) throw new Error('Native component schemas must be an object.');
    for (const [key, value] of Object.entries(instance.schemas)) {
      if (!['data', 'editor', 'state'].includes(key) || !validUri(value)) throw new Error(`Invalid native component schema reference: ${key}`);
    }
  }
  return instance;
}
