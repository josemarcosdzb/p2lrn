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
export function validateProgressionGraph(graph, manifest) {
  const declaration = manifest?.profiles?.find((profile) =>
    String(profile?.id ?? '').replace('https://p2rln.org/', 'https://p2lrn.org/') === PROGRESSION_PROFILE
  );
  const entities = new Map((graph?.entities ?? []).map((entity) => [entity.id, entity]));
  const dependencies = new Map();
  const addDependency = (from, to) => {
    if (!dependencies.has(from)) dependencies.set(from, new Set());
    dependencies.get(from).add(to);
  };
  let used = false;
  let hasNavigationSemantics = false;
  const validStatus = new Set(PROGRESSION_REQUIREMENTS);
  for (const entity of graph?.entities ?? []) {
    const rule = extension(entity);
    if (!rule) continue;
    used = true;
    if (!['course','unit','activity'].includes(entity.type)) throw new Error(`Progression is only valid on course, unit or activity entities: ${entity.id}`);
    for (const key of Object.keys(rule)) {
      if (!['required','gateFollowing','completionRequirement','minScore','unlockWhen'].includes(key)) throw new Error(`Unsupported progression property on ${entity.id}: ${key}`);
    }
    if (rule.required !== undefined && typeof rule.required !== 'boolean') throw new Error(`progression.required must be boolean: ${entity.id}`);
    if (rule.gateFollowing !== undefined && typeof rule.gateFollowing !== 'boolean') throw new Error(`progression.gateFollowing must be boolean: ${entity.id}`);
    if (rule.completionRequirement !== undefined && !validStatus.has(rule.completionRequirement)) throw new Error(`Invalid progression completionRequirement: ${entity.id}`);
    if (rule.minScore !== undefined) {
      if (entity.type !== 'activity') throw new Error(`progression.minScore is only valid on activities: ${entity.id}`);
      if (typeof rule.minScore !== 'number' || !Number.isFinite(rule.minScore) || rule.minScore < 0 || rule.minScore > 100) throw new Error(`progression.minScore must be 0..100: ${entity.id}`);
    }
    if (entity.type === 'course' && rule.gateFollowing === true) throw new Error('progression.gateFollowing is not valid on the root course entity');
    if (rule.unlockWhen !== undefined) {
      hasNavigationSemantics = true;
      const unlock = record(rule.unlockWhen);
      if (!unlock) throw new Error(`progression.unlockWhen must be an object: ${entity.id}`);
      const keys = Object.keys(unlock);
      if (keys.some((key) => !['all','any'].includes(key))) throw new Error(`Unsupported progression.unlockWhen property: ${entity.id}`);
      const hasAll = Array.isArray(unlock.all), hasAny = Array.isArray(unlock.any);
      if (hasAll === hasAny) throw new Error(`progression.unlockWhen must contain exactly one of all or any: ${entity.id}`);
      const list = hasAll ? unlock.all : unlock.any;
      if (!list.length) throw new Error(`progression.unlockWhen must not be empty: ${entity.id}`);
      for (const condition of list) {
        const item = record(condition);
        if (!item || typeof item.entity !== 'string') throw new Error(`Invalid progression prerequisite: ${entity.id}`);
        const target = entities.get(item.entity);
        if (!target || !['activity','unit'].includes(target.type)) throw new Error(`Progression prerequisite does not resolve to activity/unit: ${item.entity}`);
        if (item.status !== undefined && !validStatus.has(item.status)) throw new Error(`Invalid progression prerequisite status: ${entity.id}`);
        if (item.minScore !== undefined && (typeof item.minScore !== 'number' || !Number.isFinite(item.minScore) || item.minScore < 0 || item.minScore > 100)) throw new Error(`Invalid progression prerequisite minScore: ${entity.id}`);
        addDependency(entity.id, item.entity);
      }
    }
    if (rule.gateFollowing === true) hasNavigationSemantics = true;
  }
  if (used && !declaration) throw new Error('Progression extensions require the progression profile declaration.');
  if (hasNavigationSemantics && declaration?.requirement === 'optional') throw new Error('Navigation-gating progression rules require manifest requirement "required".');
  for (const parent of graph?.entities ?? []) {
    const children = parent.children ?? [];
    for (let i = 0; i < children.length; i += 1) {
      const source = entities.get(children[i]);
      if (extension(source)?.gateFollowing !== true) continue;
      for (let j = i + 1; j < children.length; j += 1) addDependency(children[j], children[i]);
    }
  }
  const state = new Map();
  const visit = (id, trail) => {
    const current = state.get(id) ?? 0;
    if (current === 1) throw new Error(`Progression dependency cycle: ${[...trail, id].join(' -> ')}`);
    if (current === 2) return;
    state.set(id, 1);
    for (const dependency of dependencies.get(id) ?? []) visit(dependency, [...trail, id]);
    state.set(id, 2);
  };
  for (const id of dependencies.keys()) visit(id, []);
  return true;
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
