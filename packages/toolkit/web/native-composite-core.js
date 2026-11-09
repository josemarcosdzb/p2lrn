import {identifierIs} from './identifiers.js';
export const NATIVE_COMPOSITE_PROFILE = 'https://p2lrn.org/profile/native-composite';
export const NATIVE_COMPOSITE_MEDIA_TYPE = 'application/vnd.p2lrn.composite+json';
export const NATIVE_COMPOSITE_SCHEMA = 'https://p2lrn.org/schema/native-composite/0.1';
export const NATIVE_COMPOSITE_STATE_VERSION = 'p2lrn-composite-state/0.1';
export const LEGACY_NATIVE_COMPOSITE_STATE_VERSION = 'p2rln-composite-state/0.1';

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function compositeNavigationForMode(mode) {
  if(mode==='sequence')return 'linear';
  if(mode==='free')return 'open';
  throw new Error('Modo de composite P2LRN no válido.');
}

export function validateNativeComposite(payload) {
  if (!record(payload)) throw new Error('El composite P2LRN debe ser un objeto JSON.');
  if (!identifierIs(payload.schema, NATIVE_COMPOSITE_SCHEMA) || payload.version !== '0.1') throw new Error('Versión de composite P2LRN no soportada.');
  const requiredNavigation = compositeNavigationForMode(payload.mode);
  if (!['all', 'any'].includes(payload.completion)) throw new Error('Política de finalización del composite no válida.');
  if(payload.presentation!=null&&payload.presentation!=='stack')
    throw new Error('Presentaci?n del composite desconocida.');
  if(payload.presentation==='stack'&&payload.mode!=='free')
    throw new Error('Mostrar actividades en la misma p?gina requiere modo libre.');
  const navigation = payload.navigation ?? requiredNavigation;
  if (navigation !== requiredNavigation) throw new Error('El modo '+payload.mode+' requiere navegación '+requiredNavigation+'.');
  return Object.freeze({...payload, navigation});
}

export function resolveCompositeChildren(entity, pkg) {
  const ids = Array.isArray(entity?.children) ? entity.children : [];
  if (!ids.length) throw new Error('El composite no contiene actividades hijas.');
  const seen = new Set();
  const children = ids.map((id) => {
    if (seen.has(id)) throw new Error(`Actividad hija duplicada en composite: ${id}`);
    seen.add(id);
    const child = pkg?.entities?.get?.(id);
    if (!child || child.type !== 'activity') throw new Error(`El hijo del composite no es una Activity válida: ${id}`);
    return child;
  });
  return children;
}

export function sanitizeCompositeState(value, childIds, {mode = 'free'} = {}) {
  const allowed = new Set(childIds);
  const raw = record(value) ? value : {};
  let completedChildren = Array.isArray(raw.completedChildren)
    ? [...new Set(raw.completedChildren.filter((id) => typeof id === 'string' && allowed.has(id)))]
    : [];

  if (mode === 'sequence') {
    const completed = new Set(completedChildren);
    const contiguous = [];
    for (const id of childIds) {
      if (!completed.has(id)) break;
      contiguous.push(id);
    }
    completedChildren = contiguous;
  }

  const scores = {};
  if (record(raw.scores)) {
    for (const [id, score] of Object.entries(raw.scores)) if (allowed.has(id) && record(score)) scores[id] = JSON.parse(JSON.stringify(score));
  }

  let currentChild = typeof raw.currentChild === 'string' && allowed.has(raw.currentChild) ? raw.currentChild : (childIds[0] ?? null);
  if (mode === 'sequence' && childIds.length) {
    const unlockedIndex = Math.min(completedChildren.length, childIds.length - 1);
    const requestedIndex = childIds.indexOf(currentChild);
    if (requestedIndex < 0 || requestedIndex > unlockedIndex) currentChild = childIds[unlockedIndex];
  }

  return {
    version: NATIVE_COMPOSITE_STATE_VERSION,
    currentChild,
    completedChildren,
    completed: Boolean(raw.completed),
    completionReason: typeof raw.completionReason === 'string' ? raw.completionReason : null,
    scores,
  };
}
