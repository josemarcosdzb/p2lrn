export const PROGRESSION_PROFILE = 'https://p2lrn.org/profile/progression';
export const PROGRESSION_STATE_VERSION = 'p2lrn-progression-state/1';
export const PROGRESSION_REQUIREMENTS = Object.freeze(['viewed', 'completed', 'passed']);

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function extension(entity) {
  const extensions = record(entity?.extensions) ?? {};
  for (const [key, value] of Object.entries(extensions)) {
    if (String(key).replace('https://p2rln.org/', 'https://p2lrn.org/') === PROGRESSION_PROFILE) return record(value);
  }
  return null;
}
function scorePercent(value) {
  const source = record(value?.score) ?? record(value) ?? {};
  const normalized = Number(source.normalized);
  if (Number.isFinite(normalized)) return Math.max(0, Math.min(100, normalized * 100));
  const raw = Number(source.raw), max = Number(source.max);
  if (Number.isFinite(raw) && Number.isFinite(max) && max > 0) return Math.max(0, Math.min(100, raw / max * 100));
  if (typeof value?.simpleMatchCorrect === 'boolean') return value.simpleMatchCorrect ? 100 : 0;
  return null;
}
function passedValue(value) {
  const source = record(value?.score) ?? record(value) ?? {};
  if (typeof source.passed === 'boolean') return source.passed;
  if (typeof value?.simpleMatchCorrect === 'boolean') return value.simpleMatchCorrect;
  return null;
}
function completedValue(value) {
  const source = record(value?.score) ?? record(value) ?? {};
  if (typeof source.completed === 'boolean') return source.completed;
  if (record(value?.state) && typeof value.state.completed === 'boolean') return value.state.completed;
  return null;
}
function cloneState(value) {
  const raw = record(value);
  const entities = record(raw?.entities) ?? {};
  const out = {};
  for (const [id, state] of Object.entries(entities)) {
    const item = record(state);
    if (!item) continue;
    out[id] = {
      viewed:item.viewed === true,
      completed:item.completed === true,
      passed:typeof item.passed === 'boolean' ? item.passed : null,
      scorePercent:Number.isFinite(Number(item.scorePercent)) ? Math.max(0, Math.min(100, Number(item.scorePercent))) : null,
      updatedAt:typeof item.updatedAt === 'string' ? item.updatedAt : null,
    };
  }
  return {version:PROGRESSION_STATE_VERSION, entities:out};
}
export function normalizeProgressionState(value) {
  return cloneState(value);
}
export function progressionRule(entity) {
  return extension(entity);
}
export function progressionEnabled(manifest) {
  return Boolean(manifest?.profiles?.some((profile) =>
    String(profile?.id ?? '').replace('https://p2rln.org/', 'https://p2lrn.org/') === PROGRESSION_PROFILE
  ));
}
export function progressionContext(pkg, rootId) {
  return Object.freeze({
    packageId:pkg?.manifest?.packageId ?? null,
    contentRoot:pkg?.manifest?.integrity?.contentRoot ?? null,
    entityId:String(rootId ?? ''),
    profile:PROGRESSION_PROFILE,
    runtime:'progression',
  });
}
export function updateProgressionState(state, event) {
  const current = normalizeProgressionState(state);
  const detail = record(event?.detail) ?? {};
  const context = record(detail.context) ?? record(detail.event?.context) ?? {};
  const entityId = typeof context.entityId === 'string' ? context.entityId : null;
  if (!entityId) return {state:current, changed:false, entityId:null};
  const previous = current.entities[entityId] ?? {viewed:false, completed:false, passed:null, scorePercent:null, updatedAt:null};
  const next = {...previous};
  if (event.type === 'p2lrn:rendered') next.viewed = true;
  if (event.type === 'p2lrn:complete') {
    next.viewed = true;
    next.completed = true;
  }
  const completed = completedValue(detail);
  if (completed === true) { next.viewed = true; next.completed = true; }
  const passed = passedValue(detail);
  if (typeof passed === 'boolean') next.passed = passed;
  const percent = scorePercent(detail);
  if (percent != null) next.scorePercent = Math.round(percent * 1000000) / 1000000;
  const changed = JSON.stringify({...previous,updatedAt:null}) !== JSON.stringify({...next,updatedAt:null});
  if (!changed) return {state:current, changed:false, entityId};
  next.updatedAt = new Date().toISOString();
  current.entities[entityId] = next;
  return {state:current, changed:true, entityId};
}
function descendantActivities(entityId, entities, seen = new Set()) {
  if (seen.has(entityId)) return [];
  seen.add(entityId);
  const entity = entities.get(entityId);
  if (!entity) return [];
  if (entity.type === 'activity') return [entity];
  const out = [];
  for (const child of entity.children ?? []) out.push(...descendantActivities(child, entities, seen));
  return out;
}
function requirementFor(entity, overrideStatus = null) {
  return overrideStatus ?? progressionRule(entity)?.completionRequirement ?? 'completed';
}
function activitySatisfied(entity, state, {status = null, minScore = null} = {}) {
  const item = state.entities[entity.id] ?? {};
  const requirement = requirementFor(entity, status);
  const threshold = minScore ?? progressionRule(entity)?.minScore ?? null;
  let ok = false;
  if (requirement === 'viewed') ok = item.viewed === true || item.completed === true;
  else if (requirement === 'completed') ok = item.completed === true;
  else if (requirement === 'passed') {
    ok = item.passed === true;
    if (item.passed == null && threshold != null && Number.isFinite(item.scorePercent)) ok = item.scorePercent >= threshold;
  }
  if (ok && threshold != null) ok = Number.isFinite(item.scorePercent) && item.scorePercent >= threshold;
  return ok;
}
export function entitySatisfied(entityId, entities, rawState, override = {}) {
  const state = normalizeProgressionState(rawState);
  const entity = entities.get(entityId);
  if (!entity) return false;
  if (entity.type === 'activity') return activitySatisfied(entity, state, override);
  if (!['unit','course'].includes(entity.type)) return false;
  const descendants = descendantActivities(entity.id, entities);
  if (!descendants.length) return true;
  const explicitlyRequired = descendants.filter((item) => progressionRule(item)?.required === true);
  const selected = explicitlyRequired.length ? explicitlyRequired : descendants;
  const status = override.status ?? null;
  return selected.every((item) => activitySatisfied(item, state, status ? {status, minScore:override.minScore ?? null} : {}));
}
function unlockConditions(entity) {
  const rule = progressionRule(entity);
  const unlock = record(rule?.unlockWhen);
  if (!unlock) return null;
  if (Array.isArray(unlock.all)) return {mode:'all', conditions:unlock.all};
  if (Array.isArray(unlock.any)) return {mode:'any', conditions:unlock.any};
  return null;
}
function conditionSatisfied(condition, entities, state) {
  const value = record(condition);
  if (!value || typeof value.entity !== 'string') return false;
  return entitySatisfied(value.entity, entities, state, {
    status:typeof value.status === 'string' ? value.status : 'completed',
    minScore:Number.isFinite(Number(value.minScore)) ? Number(value.minScore) : null,
  });
}
function explicitUnlockSatisfied(entity, entities, state) {
  const unlock = unlockConditions(entity);
  if (!unlock) return true;
  const results = unlock.conditions.map((condition) => conditionSatisfied(condition, entities, state));
  return unlock.mode === 'all' ? results.every(Boolean) : results.some(Boolean);
}
export function createProgressionModel(rootId, entitiesInput) {
  const entities = entitiesInput instanceof Map ? entitiesInput : new Map((entitiesInput ?? []).map((entity) => [entity.id, entity]));
  const parent = new Map();
  for (const entity of entities.values()) for (const child of entity.children ?? []) if (!parent.has(child)) parent.set(child, entity.id);
  const pathTo = (entityId) => {
    const out = [];
    let current = entityId;
    const seen = new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      out.unshift(current);
      if (current === rootId) break;
      current = parent.get(current);
    }
    return out;
  };
  const lockReasons = (entityId, rawState) => {
    const state = normalizeProgressionState(rawState);
    const path = pathTo(entityId);
    const reasons = [];
    for (const id of path) {
      const entity = entities.get(id);
      if (!entity) continue;
      const unlock = unlockConditions(entity);
      if (unlock && !explicitUnlockSatisfied(entity, entities, state)) {
        reasons.push({kind:'unlockWhen', entityId:id, conditions:unlock.conditions, mode:unlock.mode});
      }
      const parentId = parent.get(id);
      const parentEntity = parentId ? entities.get(parentId) : null;
      if (!parentEntity) continue;
      const siblings = parentEntity.children ?? [];
      const index = siblings.indexOf(id);
      for (let i = 0; i < index; i += 1) {
        const sibling = entities.get(siblings[i]);
        const rule = progressionRule(sibling);
        if (rule?.gateFollowing === true && !entitySatisfied(sibling.id, entities, state)) {
          reasons.push({
            kind:'gateFollowing',
            entityId:sibling.id,
            status:rule.completionRequirement ?? 'completed',
            minScore:Number.isFinite(Number(rule.minScore)) ? Number(rule.minScore) : null,
          });
        }
      }
    }
    return reasons;
  };
  return Object.freeze({
    rootId,
    entities,
    parent,
    isLocked:(entityId,state)=>lockReasons(entityId,state).length > 0,
    lockReasons,
    isRequired:(entityId)=>progressionRule(entities.get(entityId))?.required === true,
    isSatisfied:(entityId,state)=>entitySatisfied(entityId,entities,state),
  });
}
