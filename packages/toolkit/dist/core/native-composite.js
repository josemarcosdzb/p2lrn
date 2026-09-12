import { ValidationError } from './errors.js';
import { NATIVE, PROFILE, NS, canonicalIdentifier } from './constants.js';
export const NATIVE_COMPOSITE_PROFILE = PROFILE.nativeComposite;
export const NATIVE_COMPOSITE_MEDIA_TYPE = NATIVE.compositeMediaType;
export const NATIVE_COMPOSITE_SCHEMA = `${NS}schema/native-composite/0.1`;
export const NATIVE_COMPOSITE_ACTIVITY_TYPE = NATIVE.compositeActivityType;
export const NATIVE_COMPOSITE_STATE_VERSION = 'p2lrn-composite-state/0.1';
export const LEGACY_NATIVE_COMPOSITE_STATE_VERSION = 'p2rln-composite-state/0.1';
export function validateComposite(payload) { if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new ValidationError('composite payload must be an object'); for (const k of Object.keys(payload))
    if (!['schema', 'version', 'mode', 'completion', 'navigation', 'title', 'description', 'extensions'].includes(k))
        throw new ValidationError(`composite has unsupported property: ${k}`); if (canonicalIdentifier(String(payload.schema ?? '')) !== NATIVE_COMPOSITE_SCHEMA || payload.version !== '0.1')
    throw new ValidationError('invalid native composite schema/version'); if (!['sequence', 'free'].includes(payload.mode))
    throw new ValidationError('invalid native composite mode'); if (!['all', 'any'].includes(payload.completion))
    throw new ValidationError('invalid native composite completion'); if (payload.navigation !== undefined && !['linear', 'open'].includes(payload.navigation))
    throw new ValidationError('invalid native composite navigation'); if (payload.title !== undefined && (typeof payload.title !== 'string' || payload.title.length < 1 || payload.title.length > 500))
    throw new ValidationError('invalid native composite title'); if (payload.description !== undefined && (typeof payload.description !== 'string' || payload.description.length > 5000))
    throw new ValidationError('invalid native composite description'); if (payload.extensions !== undefined && (!payload.extensions || typeof payload.extensions !== 'object' || Array.isArray(payload.extensions)))
    throw new ValidationError('native composite extensions must be an object'); const value = { ...payload }; if (value.mode === 'sequence') {
    if (value.navigation != null && value.navigation !== 'linear')
        throw new ValidationError('sequence mode requires linear navigation');
    value.navigation ??= 'linear';
}
else {
    if (value.navigation != null && value.navigation !== 'open')
        throw new ValidationError('free mode requires open navigation');
    value.navigation ??= 'open';
} return value; }
//# sourceMappingURL=native-composite.js.map