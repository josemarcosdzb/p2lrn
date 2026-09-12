import { ValidationError } from './errors.js';
import { NATIVE, PROFILE, NS, canonicalIdentifier } from './constants.js';
export const NATIVE_COMPONENT_PROFILE = PROFILE.nativeComponent;
export const NATIVE_COMPONENT_MEDIA_TYPE = NATIVE.componentMediaType;
export const NATIVE_COMPONENT_SCHEMA = `${NS}schema/native-component/0.1`;
export const NATIVE_COMPONENT_ACTIVITY_TYPE = NATIVE.componentActivityType;
export const RUNTIME_CONTRACT_VERSION = '1';
const VERSION = /^[A-Za-z0-9._+\-]+$/;
function object(v, label) { if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new ValidationError(`${label} must be an object`); return v; }
function allowed(o, keys, label) { for (const k of Object.keys(o))
    if (!keys.includes(k))
        throw new ValidationError(`${label} has unsupported property: ${k}`); }
function text(v, label, min, max) { if (typeof v !== 'string' || v.length < min || v.length > max)
    throw new ValidationError(`${label} must be a string of length ${min}..${max}`); return v; }
function uri(v, label) { const s = text(v, label, 3, 500); try {
    new URL(s);
}
catch {
    throw new ValidationError(`${label} must be an absolute URI`);
} }
export function validateComponentInstance(payload) { const p = object(payload, 'component instance'); allowed(p, ['schema', 'version', 'component', 'data', 'schemas', 'title', 'description', 'language', 'extensions'], 'component instance'); if (canonicalIdentifier(String(p.schema ?? '')) !== NATIVE_COMPONENT_SCHEMA || p.version !== '0.1')
    throw new ValidationError('invalid native component schema/version'); const c = object(p.component, 'component'); allowed(c, ['id', 'componentVersion', 'dataVersion', 'runtimeContractVersion'], 'component'); uri(c.id, 'component.id'); for (const k of ['componentVersion', 'dataVersion', 'runtimeContractVersion']) {
    const s = text(c[k], `component.${k}`, 1, 64);
    if (!VERSION.test(s))
        throw new ValidationError(`component.${k} has invalid version syntax`);
} object(p.data, 'component data'); if (p.schemas !== undefined) {
    const s = object(p.schemas, 'schemas');
    allowed(s, ['data', 'editor', 'state'], 'schemas');
    for (const [k, v] of Object.entries(s))
        uri(v, `schemas.${k}`);
} if (p.title !== undefined)
    text(p.title, 'title', 1, 500); if (p.description !== undefined)
    text(p.description, 'description', 0, 5000); if (p.language !== undefined)
    text(p.language, 'language', 1, 64); if (p.extensions !== undefined) {
    const e = object(p.extensions, 'extensions');
    for (const k of Object.keys(e))
        uri(k, `extensions.${k}`);
} return payload; }
export function requireRuntimeContract(payload, expected = RUNTIME_CONTRACT_VERSION) { const p = validateComponentInstance(payload); if (p.component.runtimeContractVersion !== expected)
    throw new ValidationError(`runtimeContractVersion ${JSON.stringify(p.component.runtimeContractVersion)} is not supported by this runtime; expected ${JSON.stringify(expected)}`); return p; }
//# sourceMappingURL=native-component.js.map