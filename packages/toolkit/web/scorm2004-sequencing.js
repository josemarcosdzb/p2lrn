import {attr, children, descendants, firstChild, parseXmlLite, textContent} from './xml-lite.js';

export const SCORM_2004_NAV_REQUESTS = Object.freeze([
  'continue', 'previous', 'exit', 'exitAll', 'abandon', 'abandonAll', 'suspendAll', '_none',
]);

const SEQUENCING_STATE_SCHEMA = 'https://p2lrn.org/schema/scorm2004-sequencing-state/1';

export function parseScormManifest(xml) {
  const root = parseXmlLite(xml);
  if (root.localName !== 'manifest') throw new Error('SCORM imsmanifest.xml must have a <manifest> root.');
  const metadata = firstChild(root, 'metadata');
  const resourcesNode = firstChild(root, 'resources');
  const organizationsNode = firstChild(root, 'organizations');
  const organizationNodes = children(organizationsNode, 'organization');
  const resources = children(resourcesNode, 'resource').map(parseResource);
  const resourceById = new Map(resources.map((resource) => [resource.identifier, resource]));
  const organizations = organizationNodes.flatMap((organization) =>
    children(organization, 'item').map((item) => parseItem(item, resourceById)),
  );
  const title = textContent(firstChild(organizationNodes[0], 'title')) || 'SCORM package';
  return Object.freeze({
    version: detectVersion(root, metadata),
    title,
    organizations,
    resources,
    defaultOrganization: attr(organizationsNode, 'default') ?? null,
    organizationIdentifiers: organizationNodes.map((organization) => attr(organization, 'identifier')).filter(Boolean),
    sequencingCollection: descendants(root, 'sequencingCollection').map(parseSequencing),
  });
}

/**
 * Inspect supported SCORM 2004 rules before launching a SCO. This prevents
 * quietly claiming normative sequencing for rules the reference engine does
 * not implement. This analysis does not execute SCO code or infer LMS state.
 */
export function inspectScorm2004SequencingSupport(manifest,{maxItems=10000,maxRules=20000}={}){
  if(!manifest||!Array.isArray(manifest.organizations))
    throw new TypeError('A parsed SCORM manifest is required.');
  if(!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>100000||
     !Number.isSafeInteger(maxRules)||maxRules<1||maxRules>100000)
    throw new TypeError('Invalid SCORM inspection bounds.');
  const issues=[],knownConditions=new Set([
    'always','attempted','completed','activityProgressKnown',
    'satisfied','objectiveStatusKnown','objectiveMeasureKnown',
    'objectiveMeasureGreaterThan','objectiveMeasureLessThan',
    'attemptLimitExceeded',
  ]);
  const allowedActions={
    preCondition:new Set(['skip','disabled','hiddenFromChoice']),
    postCondition:new Set(['exitParent','continue','exitAll','retry','retryAll','previous']),
    exitCondition:new Set(['exit']),
    rollup:new Set(['completed','incomplete','satisfied','notSatisfied']),
  };
  const allowedSets=new Set(['all','any','none','atLeastCount','atLeastPercent']);
  let itemCount=0,ruleCount=0;
  const record=(code,item,detail)=>{
    if(issues.length<256)issues.push(Object.freeze({
      code,itemIdentifier:String(item?.identifier??'').slice(0,128),
      detail:String(detail??'').slice(0,160),
    }));
  };
  const examineRule=(rule,item,group)=>{
    if(++ruleCount>maxRules){
      const error=new Error('SCORM 2004 rules exceed inspection safety limit.');
      error.code='P2LRN_SCORM2004_INSPECTION_LIMIT';throw error;
    }
    const type=group??rule?.type;
    if(!Object.hasOwn(allowedActions,type)||!allowedActions[type].has(rule?.action))
      record('P2LRN_SCORM2004_RULE_ACTION_UNSUPPORTED',item,type+': '+rule?.action);
    if(!['all','any',undefined,null].includes(rule?.conditionCombination))
      record('P2LRN_SCORM2004_CONDITION_COMBINATION_UNSUPPORTED',item,rule.conditionCombination);
    if(type==='rollup'&&!allowedSets.has(rule?.childActivitySet??'all'))
      record('P2LRN_SCORM2004_CHILD_SET_UNSUPPORTED',item,rule.childActivitySet);
    for(const condition of rule?.conditions??[]){
      if(!knownConditions.has(condition?.condition))
        record('P2LRN_SCORM2004_RULE_CONDITION_UNSUPPORTED',item,condition?.condition);
      if(!['noOp','not',null,undefined].includes(condition?.operator))
        record('P2LRN_SCORM2004_RULE_OPERATOR_UNSUPPORTED',item,condition.operator);
    }
  };
  const visit=(item,depth)=>{
    if(++itemCount>maxItems||depth>200){
      const error=new Error('SCORM 2004 activity tree exceeds inspection safety limit.');
      error.code='P2LRN_SCORM2004_INSPECTION_LIMIT';throw error;
    }
    const seq=item?.raw?.sequencing??{};
    for(const rule of seq.rules??[])examineRule(rule,item);
    for(const rule of seq.rollupRules??[])examineRule(rule,item,'rollup');
    const control=seq.controlMode??{};
    // These are normative navigation controls that the bounded reference
    // sequencer does not currently enforce in every situation.
    for(const [key,value] of Object.entries(control)){
      if(['flow','choice','choiceExit','forwardOnly'].includes(key)&&
        String(value).toLowerCase()==='false'&&key!=='forwardOnly')
        record('P2LRN_SCORM2004_CONTROL_MODE_UNSUPPORTED',item,key+'='+value);
      if(key==='forwardOnly'&&String(value).toLowerCase()==='true')
        record('P2LRN_SCORM2004_CONTROL_MODE_UNSUPPORTED',item,key+'='+value);
    }
    for(const child of item?.children??[])visit(child,depth+1);
  };
  for(const item of manifest.organizations)visit(item,0);
  if((manifest.sequencingCollection??[]).length)
    record('P2LRN_SCORM2004_SHARED_SEQUENCING_REFERENCES_UNVERIFIED',
      null,'sequencingCollection requires shared-reference validation');
  return Object.freeze({
    version:'1',standard:'SCORM 2004',
    scope:'bounded-sequencing-subset',
    status:issues.length?'unsupported-semantics':'conditional',
    fullyConformant:false,
    inspectedItems:itemCount,
    inspectedRules:ruleCount,
    issues:Object.freeze(issues),
  });
}

export function createScorm2004Sequencer(manifest, options = {}) {
  const tree = flatten(manifest?.organizations ?? []);
  const byId = new Map(tree.map((item) => [item.identifier, item]));
  const childrenByParent = new Map();
  for (const item of tree) {
    const key = item.parentIdentifier ?? null;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(item);
  }
  const resourceById = new Map((manifest?.resources ?? []).map((resource) => [resource.identifier, resource]));
  const restored = normalizeSequencingState(options.sequencingState, tree);
  const tracking = new Map(tree.map((item) => [item.identifier, restored.tracking[item.identifier] ?? defaultTracking()]));
  let suspendedActivityIdentifier = restored.suspendedActivityIdentifier;
  let current = resolveCurrentItem(tree, {
    itemIdentifier: restored.currentItemIdentifier ?? options.currentItemIdentifier,
    scoIdentifier: options.currentScoIdentifier,
    launchMember: options.launchMember,
    resourceById,
  });

  function parentOf(item) {
    return item?.parentIdentifier ? byId.get(item.parentIdentifier) ?? null : null;
  }

  function ancestorsOf(item) {
    const out = [];
    let cursor = parentOf(item);
    while (cursor) {
      out.unshift(cursor);
      cursor = parentOf(cursor);
    }
    return out;
  }

  function descendantsOf(item) {
    if (!item) return [];
    const out = [];
    const visit = (parent) => {
      for (const child of childrenByParent.get(parent.identifier) ?? []) {
        out.push(child);
        visit(child);
      }
    };
    visit(item);
    return out;
  }

  function targetFor(item) {
    if (!item) return null;
    const resource = resourceById.get(item.resourceIdentifier);
    const member = normalizeMember(resource?.href ?? item.resourceHref ?? '');
    return {item, resource: resource ?? null, member: member || null};
  }

  function isLaunchable(item) {
    return Boolean(targetFor(item)?.member);
  }

  function stateFor(item) {
    if (!item) return defaultTracking();
    if (!tracking.has(item.identifier)) tracking.set(item.identifier, defaultTracking());
    return tracking.get(item.identifier);
  }

  function sequencingFor(item) {
    return item?.raw?.sequencing ?? {};
  }

  function preAction(item) {
    for (const rule of sequencingFor(item).rules ?? []) {
      if (rule.type !== 'preCondition') continue;
      if (evaluateRule(rule, stateFor(item), sequencingFor(item).limitConditions) === true) return rule.action;
    }
    return null;
  }

  function isDisabled(item) {
    return preAction(item) === 'disabled';
  }

  function isSkipped(item) {
    return preAction(item) === 'skip';
  }

  function hiddenFromChoice(item) {
    return preAction(item) === 'hiddenFromChoice';
  }

  function availableForFlow(item) {
    if (!item || isHidden(item) || isDisabled(item) || isSkipped(item)) return false;
    return isLaunchable(item);
  }

  function availableForChoice(item) {
    if (!item || isHidden(item) || isDisabled(item) || hiddenFromChoice(item)) return false;
    return isLaunchable(item);
  }

  function beginAttempt(item, {resume = false} = {}) {
    if (!item) return;
    const path = [...ancestorsOf(item), item];
    for (const activity of path) {
      const state = stateFor(activity);
      if (state.active) continue;
      if (state.suspended || resume) {
        state.active = true;
        state.suspended = false;
        continue;
      }
      if (state.attemptCount > 0) {
        state.previousAttempt = snapshotAttempt(state);
      }
      state.attemptCount += 1;
      state.active = true;
      state.suspended = false;
      resetCurrentAttempt(state);
    }
  }

  function suspendActivePath(item = current) {
    if (!item) return;
    const path = [...ancestorsOf(item), item];
    for (const activity of path) {
      const state = stateFor(activity);
      if (!state.active) continue;
      state.active = false;
      state.suspended = true;
    }
    suspendedActivityIdentifier = item.identifier;
  }

  function closeActivity(item, {abandon = false} = {}) {
    if (!item) return;
    const state = stateFor(item);
    if (abandon) {
      state.active = false;
      state.suspended = false;
      resetCurrentAttempt(state);
      return;
    }
    state.active = false;
    state.suspended = false;
  }

  function closeSubtree(item, options = {}) {
    for (const child of descendantsOf(item).reverse()) {
      const state = stateFor(child);
      if (state.active || state.suspended) closeActivity(child, options);
    }
    closeActivity(item, options);
  }

  function updateTracking(item, runtimeState = {}) {
    if (!item) return;
    const values = runtimeState?.values && typeof runtimeState.values === 'object' ? runtimeState.values : runtimeState;
    if (!values || typeof values !== 'object') return;
    const state = stateFor(item);
    const completion = String(values['cmi.completion_status'] ?? '').trim();
    const progress = finite(values['cmi.progress_measure']);
    const success = String(values['cmi.success_status'] ?? '').trim();
    const scaled = finite(values['cmi.score.scaled']);
    if (completion === 'completed' || completion === 'incomplete') {
      state.attemptProgressStatus = true;
      state.attemptCompletionStatus = completion === 'completed';
    }
    if (progress !== null && progress >= 0 && progress <= 1) {
      state.attemptProgressStatus = true;
      state.attemptCompletionAmount = progress;
      if (progress >= 1) state.attemptCompletionStatus = true;
    }
    if (success === 'passed' || success === 'failed') {
      state.objectiveProgressStatus = true;
      state.objectiveSatisfiedStatus = success === 'passed';
    }
    if (scaled !== null && scaled >= -1 && scaled <= 1) {
      state.objectiveMeasureStatus = true;
      state.objectiveNormalizedMeasure = scaled;
    }
  }

  function rollupSource(child, parent) {
    const state = stateFor(child);
    const mode = sequencingFor(parent).controlMode ?? {};
    const useCurrentProgress = boolAttr(mode.useCurrentAttemptProgressInfo, true);
    const useCurrentObjective = boolAttr(mode.useCurrentAttemptObjectiveInfo, true);
    const previous = state.previousAttempt ?? null;
    return {
      ...state,
      attemptProgressStatus: state.attemptProgressStatus || (!useCurrentProgress && Boolean(previous?.attemptProgressStatus)),
      attemptCompletionStatus: state.attemptProgressStatus
        ? state.attemptCompletionStatus
        : (!useCurrentProgress && previous?.attemptProgressStatus ? Boolean(previous.attemptCompletionStatus) : state.attemptCompletionStatus),
      attemptCompletionAmount: state.attemptProgressStatus
        ? state.attemptCompletionAmount
        : (!useCurrentProgress && previous?.attemptProgressStatus ? previous.attemptCompletionAmount : state.attemptCompletionAmount),
      objectiveProgressStatus: state.objectiveProgressStatus || (!useCurrentObjective && Boolean(previous?.objectiveProgressStatus)),
      objectiveSatisfiedStatus: state.objectiveProgressStatus
        ? state.objectiveSatisfiedStatus
        : (!useCurrentObjective && previous?.objectiveProgressStatus ? Boolean(previous.objectiveSatisfiedStatus) : state.objectiveSatisfiedStatus),
      objectiveMeasureStatus: state.objectiveMeasureStatus || (!useCurrentObjective && Boolean(previous?.objectiveMeasureStatus)),
      objectiveNormalizedMeasure: state.objectiveMeasureStatus
        ? state.objectiveNormalizedMeasure
        : (!useCurrentObjective && previous?.objectiveMeasureStatus ? previous.objectiveNormalizedMeasure : state.objectiveNormalizedMeasure),
    };
  }

  function applyRollup(item) {
    if (!item) return;
    const children = childrenByParent.get(item.identifier) ?? [];
    if (!children.length) return;
    const sequencing = sequencingFor(item);
    const own = stateFor(item);
    const rules = sequencing.rollupRules ?? [];
    if (!rules.length) {
      const sources = children.map((child) => rollupSource(child, item));
      if (sources.length && sources.every((source) => source.attemptProgressStatus)) {
        own.attemptProgressStatus = true;
        own.attemptCompletionStatus = sources.every((source) => source.attemptCompletionStatus);
        const amounts = sources.map((source) => source.attemptCompletionAmount).filter((value) => Number.isFinite(value));
        if (amounts.length === sources.length) own.attemptCompletionAmount = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
      }
      if (sources.length && sources.every((source) => source.objectiveProgressStatus)) {
        own.objectiveProgressStatus = true;
        own.objectiveSatisfiedStatus = sources.every((source) => source.objectiveSatisfiedStatus);
      }
      return;
    }
    for (const rule of rules) {
      const matching = children.filter((child) => {
        const source = rollupSource(child, item);
        return evaluateConditionSet(rule.conditions, rule.conditionCombination, source, sequencingFor(child).limitConditions) === true;
      }).length;
      const set = String(rule.childActivitySet ?? 'all');
      const total = children.length;
      let fires = false;
      if (set === 'all') fires = total > 0 && matching === total;
      else if (set === 'any') fires = matching > 0;
      else if (set === 'none') fires = matching === 0;
      else if (set === 'atLeastCount') fires = matching >= Math.max(0, Number(rule.minimumCount ?? 0));
      else if (set === 'atLeastPercent') fires = total > 0 && (matching / total) >= Math.max(0, Math.min(1, Number(rule.minimumPercent ?? 0)));
      if (!fires) continue;
      if (rule.action === 'completed' || rule.action === 'incomplete') {
        own.attemptProgressStatus = true;
        own.attemptCompletionStatus = rule.action === 'completed';
      } else if (rule.action === 'satisfied' || rule.action === 'notSatisfied') {
        own.objectiveProgressStatus = true;
        own.objectiveSatisfiedStatus = rule.action === 'satisfied';
      }
    }
  }

  function rollupAncestors(from) {
    let cursor = parentOf(from);
    while (cursor) {
      applyRollup(cursor);
      cursor = parentOf(cursor);
    }
  }

  function postAction(item) {
    for (const rule of sequencingFor(item).rules ?? []) {
      if (rule.type !== 'postCondition') continue;
      if (evaluateRule(rule, stateFor(item), sequencingFor(item).limitConditions) === true) return rule.action;
    }
    return null;
  }

  function exitAction(item) {
    for (const rule of sequencingFor(item).rules ?? []) {
      if (rule.type !== 'exitCondition') continue;
      if (evaluateRule(rule, stateFor(item), sequencingFor(item).limitConditions) === true) return rule.action;
    }
    return null;
  }

  function terminateForNavigation(runtimeState = null) {
    if (!current) return {action:null, anchor:null};
    updateTracking(current, runtimeState ?? {});
    const leaf = current;
    closeActivity(leaf);
    rollupAncestors(leaf);
    let action = postAction(leaf);
    let anchor = leaf;

    if (action === 'exitParent') {
      let cluster = parentOf(leaf);
      if (cluster) {
        closeSubtree(cluster);
        applyRollup(cluster);
        rollupAncestors(cluster);
        anchor = cluster;
        // An exitParent closes exactly this cluster. The virtual organization
        // above top-level activities is deliberately not represented/closed.
        const clusterPost = postAction(cluster);
        if (clusterPost) action = clusterPost;
        else action = 'continue';
      } else {
        action = 'continue';
      }
    }

    // Exit-condition rules are evaluated on ancestor clusters after descendant
    // termination. Their only standard action is exit; bubble one cluster at a time.
    let ancestor = parentOf(anchor);
    while (ancestor && exitAction(ancestor) === 'exit') {
      closeSubtree(ancestor);
      applyRollup(ancestor);
      rollupAncestors(ancestor);
      anchor = ancestor;
      const parentPost = postAction(ancestor);
      if (parentPost) action = parentPost;
      ancestor = parentOf(ancestor);
    }
    return {action, anchor};
  }

  function nextAvailable(from = current) {
    const start = from ? subtreeEndIndex(tree, from, byId) + 1 : 0;
    for (let index = start; index < tree.length; index += 1) {
      const candidate = tree[index];
      if (availableForFlow(candidate)) return candidate;
    }
    return undefined;
  }

  function previousAvailable(from = current) {
    if (!from) return undefined;
    const index = tree.findIndex((item) => item.identifier === from.identifier);
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = tree[cursor];
      if (availableForFlow(candidate)) return candidate;
    }
    return undefined;
  }

  function firstAvailableWithin(item) {
    if (!item) return tree.find((candidate) => availableForFlow(candidate));
    if (availableForFlow(item)) return item;
    return descendantsOf(item).find((candidate) => availableForFlow(candidate));
  }

  function choiceAvailable(identifier) {
    const target = byId.get(identifier);
    if (!target || !availableForChoice(target)) return undefined;
    return target;
  }

  function requestValid(key) {
    const value = String(key ?? '');
    if (value === 'adl.nav.request_valid.continue') return nextAvailable() ? 'true' : 'false';
    if (value === 'adl.nav.request_valid.previous') return previousAvailable() ? 'true' : 'false';
    let match = /^adl\.nav\.request_valid\.choice\.\{target=(.+)\}$/.exec(value);
    if (match) return choiceAvailable(match[1]) ? 'true' : 'false';
    match = /^adl\.nav\.request_valid\.jump\.\{target=(.+)\}$/.exec(value);
    if (match) return choiceAvailable(match[1]) ? 'true' : 'false';
    return 'unknown';
  }

  function resolveActionTarget(action, anchor, parsed) {
    if (action === 'continue') return nextAvailable(anchor ?? current);
    if (action === 'previous') return previousAvailable(anchor ?? current);
    if (action === 'retry') return firstAvailableWithin(anchor ?? current);
    if (action === 'retryAll') return tree.find((item) => availableForFlow(item));
    if (parsed.request === 'continue') return nextAvailable(anchor ?? current);
    if (parsed.request === 'previous') return previousAvailable(anchor ?? current);
    if (parsed.request === 'choice' || parsed.request === 'jump') return choiceAvailable(parsed.target);
    return undefined;
  }

  function navigate(rawRequest, runtimeState = null) {
    const parsed = parseNavigationRequest(rawRequest);
    let request = parsed.request;
    if (request === 'invalid') return blockedResult(request, current, 'Invalid SCORM 2004 navigation request.');

    if (request === 'suspendAll') {
      updateTracking(current, runtimeState ?? {});
      suspendActivePath(current);
      return {request, currentItemIdentifier:current?.identifier ?? null, targetItemIdentifier:null, targetMember:null, terminal:true, suspended:true, blocked:false};
    }

    if (['exit','exitAll','abandon','abandonAll'].includes(request)) {
      updateTracking(current, runtimeState ?? {});
      if (request === 'abandon' || request === 'abandonAll') closeActivity(current, {abandon:true});
      else closeActivity(current);
      if (request.endsWith('All')) {
        for (const item of tree) {
          const state = stateFor(item);
          if (state.active || state.suspended) closeActivity(item, {abandon:request.startsWith('abandon')});
        }
      }
      rollupAncestors(current);
      suspendedActivityIdentifier = null;
      return {request, currentItemIdentifier:current?.identifier ?? null, targetItemIdentifier:null, targetMember:null, terminal:true, blocked:false};
    }

    let anchor = current;
    let action = null;
    if (runtimeState && current) {
      const terminated = terminateForNavigation(runtimeState);
      action = terminated.action;
      anchor = terminated.anchor ?? current;
    }

    if (action === 'exitAll') request = 'exitAll';
    if (request === 'exitAll') {
      for (const item of tree) if (stateFor(item).active || stateFor(item).suspended) closeActivity(item);
      suspendedActivityIdentifier = null;
      return {request:'exitAll', ruleAction:action, currentItemIdentifier:current?.identifier ?? null, targetItemIdentifier:null, targetMember:null, terminal:true, blocked:false};
    }

    if (action === 'retryAll') {
      for (const item of tree) {
        const state = stateFor(item);
        if (state.active || state.suspended) closeActivity(item);
      }
    }

    if (request === '_none' && !action && runtimeState) {
      suspendedActivityIdentifier = null;
      return {request, currentItemIdentifier:current?.identifier ?? null, targetItemIdentifier:null, targetMember:null, terminal:true, blocked:false};
    }

    let target;
    if (request === '_none' && !runtimeState) target = current;
    else target = resolveActionTarget(action, anchor, parsed);
    if (!target) return blockedResult(action ?? request, current, 'No navigable SCORM target.');
    const resolved = targetFor(target);
    if (!resolved?.member) return blockedResult(action ?? request, current, 'SCORM target has no launchable resource href.', target.identifier);

    const previous = current;
    current = target;
    const resume = suspendedActivityIdentifier === target.identifier || stateFor(target).suspended;
    beginAttempt(target, {resume});
    if (resume) suspendedActivityIdentifier = null;
    return {
      request,
      ruleAction:action,
      currentItemIdentifier:previous?.identifier ?? null,
      targetItemIdentifier:target.identifier,
      targetMember:resolved.member,
      blocked:false,
      terminal:false,
      resumed:resume,
    };
  }

  function serialize() {
    const out = {};
    for (const item of tree) out[item.identifier] = cloneTracking(stateFor(item));
    return {
      schema: SEQUENCING_STATE_SCHEMA,
      version: '1',
      currentItemIdentifier: current?.identifier ?? null,
      suspendedActivityIdentifier: suspendedActivityIdentifier ?? null,
      tracking: out,
    };
  }

  function state() {
    const choices = {};
    for (const item of tree) {
      const valid = choiceAvailable(item.identifier) ? 'true' : 'false';
      choices[`adl.nav.request_valid.choice.{target=${item.identifier}}`] = valid;
      choices[`adl.nav.request_valid.jump.{target=${item.identifier}}`] = valid;
    }
    return Object.freeze({
      currentItemIdentifier: current?.identifier ?? null,
      suspendedActivityIdentifier: suspendedActivityIdentifier ?? null,
      canContinue: Boolean(nextAvailable()),
      canPrevious: Boolean(previousAvailable()),
      requestValid: Object.freeze({
        'adl.nav.request_valid.continue': requestValid('adl.nav.request_valid.continue'),
        'adl.nav.request_valid.previous': requestValid('adl.nav.request_valid.previous'),
        ...choices,
      }),
      tracking: serialize().tracking,
      tree: stripTree(manifest?.organizations ?? []),
    });
  }

  const resume = Boolean(suspendedActivityIdentifier && current?.identifier === suspendedActivityIdentifier);
  beginAttempt(current, {resume});
  if (resume) suspendedActivityIdentifier = null;
  rollupAncestors(current);

  return Object.freeze({
    navigate,
    requestValid,
    state,
    serialize,
    updateTracking: (runtimeState, itemIdentifier = current?.identifier) => {
      const item = byId.get(itemIdentifier);
      updateTracking(item, runtimeState);
      rollupAncestors(item);
      return state();
    },
    get currentItemIdentifier() { return current?.identifier ?? null; },
  });
}

export function parseNavigationRequest(raw) {
  const value = String(raw ?? '').trim();
  if (SCORM_2004_NAV_REQUESTS.includes(value)) return {request:value, target:null};
  let match = /^choice\{target=(.+)\}$/.exec(value);
  if (match) return {request:'choice', target:match[1]};
  match = /^jump\{target=(.+)\}$/.exec(value);
  if (match) return {request:'jump', target:match[1]};
  if (value === 'choice' || value === 'jump') return {request:value, target:null};
  return {request:'invalid', target:null};
}

function detectVersion(root, metadata) {
  const schemaVersion = [textContent(firstChild(metadata, 'schemaversion')), textContent(firstChild(metadata, 'schemaVersion')), attr(root, 'version')].join(' ').toLowerCase();
  if (schemaVersion.includes('2004')) return '2004';
  const has2004Namespace = Object.values(root.attributes).some((value) => String(value).includes('scorm.org/xsd') || String(value).includes('imsss'));
  return has2004Namespace ? '2004' : '1.2';
}

function parseItem(node, resourceById) {
  const resourceIdentifier = attr(node, 'identifierref');
  const resource = resourceIdentifier ? resourceById.get(resourceIdentifier) : undefined;
  const title = textContent(firstChild(node, 'title')) || attr(node, 'identifier') || resourceIdentifier || 'SCO';
  const sequencing = firstChild(node, 'sequencing');
  const presentation = firstChild(node, 'presentation') ?? descendants(node, 'presentation')[0];
  const hideLmsUi = descendants(presentation, 'hideLMSUI').map((entry) => textContent(entry)).filter(Boolean);
  return {
    identifier: attr(node, 'identifier') ?? resourceIdentifier ?? title,
    title,
    resourceIdentifier: resourceIdentifier ?? null,
    children: children(node, 'item').map((child) => parseItem(child, resourceById)),
    raw: {
      attributes: {...node.attributes}, resourceHref:resource?.href ?? null,
      sequencing: sequencing ? parseSequencing(sequencing) : undefined,
      navigation:{hideLmsUi}, parameters:attr(node, 'parameters') ?? null, isvisible:attr(node, 'isvisible') ?? null,
    },
  };
}

function parseResource(node) {
  const identifier = attr(node, 'identifier');
  if (!identifier) throw new Error('SCORM resource is missing identifier.');
  return {
    identifier,
    href: attr(node, 'href') ?? null,
    scormType: attr(node, 'adlcp:scormType', 'scormType') ?? null,
    files: children(node, 'file').map((file) => attr(file, 'href')).filter(Boolean),
    dependencies: children(node, 'dependency').map((dep) => attr(dep, 'identifierref')).filter(Boolean),
    raw:{attributes:{...node.attributes}},
  };
}

function parseSequencing(node) {
  const controlMode = firstChild(node, 'controlMode');
  const deliveryControls = firstChild(node, 'deliveryControls');
  const limitConditions = firstChild(node, 'limitConditions');
  const rollupRulesNode = firstChild(node, 'rollupRules');
  const rollupConsiderations = firstChild(node, 'rollupConsiderations');
  const rules = [];
  for (const ruleNode of descendants(node, 'preConditionRule')) rules.push(parseRule('preCondition', ruleNode));
  for (const ruleNode of descendants(node, 'postConditionRule')) rules.push(parseRule('postCondition', ruleNode));
  for (const ruleNode of descendants(node, 'exitConditionRule')) rules.push(parseRule('exitCondition', ruleNode));
  return {
    controlMode: controlMode ? {...controlMode.attributes} : undefined,
    deliveryControls: deliveryControls ? {...deliveryControls.attributes} : undefined,
    limitConditions: limitConditions ? {...limitConditions.attributes} : undefined,
    rollupControls: rollupRulesNode ? {...rollupRulesNode.attributes} : undefined,
    rollupConsiderations: rollupConsiderations ? {...rollupConsiderations.attributes} : undefined,
    rollupRules: children(rollupRulesNode, 'rollupRule').map(parseRollupRule),
    rules,
  };
}

function parseRule(type, node) {
  const conditionsNode = firstChild(node, 'ruleConditions');
  const actionNode = firstChild(node, 'ruleAction');
  return {
    type,
    action: attr(actionNode, 'action') ?? null,
    conditionCombination: attr(conditionsNode, 'conditionCombination') ?? 'all',
    conditions: children(conditionsNode, 'ruleCondition').map((condition) => ({
      condition:attr(condition, 'condition') ?? null,
      operator:attr(condition, 'operator') ?? 'noOp',
      referencedObjective:attr(condition, 'referencedObjective') ?? null,
      measureThreshold:attr(condition, 'measureThreshold') ?? null,
    })),
  };
}

function parseRollupRule(node) {
  const conditionsNode = firstChild(node, 'rollupConditions');
  const actionNode = firstChild(node, 'rollupAction');
  return {
    childActivitySet: attr(node, 'childActivitySet') ?? 'all',
    minimumCount: nonNegativeInteger(attr(node, 'minimumCount'), 0),
    minimumPercent: clampNumber(attr(node, 'minimumPercent'), 0, 1, 0),
    conditionCombination: attr(conditionsNode, 'conditionCombination') ?? 'any',
    conditions: children(conditionsNode, 'rollupCondition').map((condition) => ({
      condition: attr(condition, 'condition') ?? null,
      operator: attr(condition, 'operator') ?? 'noOp',
    })),
    action: attr(actionNode, 'action') ?? null,
  };
}

function evaluateRule(rule, state, limits) {
  return evaluateConditionSet(rule.conditions, rule.conditionCombination, state, limits);
}

function evaluateConditionSet(conditions = [], combination = 'all', state = {}, limits = {}) {
  if (!conditions.length) return false;
  const values = conditions.map((condition) => evaluateCondition(condition, state, limits));
  const mode = String(combination ?? 'all').toLowerCase();
  if (mode === 'any') {
    if (values.some((value) => value === true)) return true;
    if (values.every((value) => value === false)) return false;
    return null;
  }
  if (values.some((value) => value === false)) return false;
  if (values.every((value) => value === true)) return true;
  return null;
}

function evaluateCondition(definition, state, limits) {
  const name = String(definition?.condition ?? '');
  let value = null;
  if (name === 'always') value = true;
  else if (name === 'attempted') value = Number(state.attemptCount ?? 0) > 0;
  else if (name === 'completed') value = state.attemptProgressStatus ? Boolean(state.attemptCompletionStatus) : null;
  else if (name === 'activityProgressKnown') value = Boolean(state.attemptProgressStatus);
  else if (name === 'satisfied') value = state.objectiveProgressStatus ? Boolean(state.objectiveSatisfiedStatus) : null;
  else if (name === 'objectiveStatusKnown') value = Boolean(state.objectiveProgressStatus);
  else if (name === 'objectiveMeasureKnown') value = Boolean(state.objectiveMeasureStatus);
  else if (name === 'objectiveMeasureGreaterThan') value = state.objectiveMeasureStatus ? Number(state.objectiveNormalizedMeasure) > Number(definition.measureThreshold ?? 0) : null;
  else if (name === 'objectiveMeasureLessThan') value = state.objectiveMeasureStatus ? Number(state.objectiveNormalizedMeasure) < Number(definition.measureThreshold ?? 0) : null;
  else if (name === 'attemptLimitExceeded') {
    const limit = nonNegativeInteger(limits?.attemptLimit, null);
    value = limit === null ? false : Number(state.attemptCount ?? 0) >= limit;
  }
  if (value === null) return null;
  const operator = String(definition?.operator ?? 'noOp').toLowerCase();
  return operator === 'not' ? !value : value;
}

function flatten(items, depth = 0, parentIdentifier = null) {
  const result = [];
  for (const item of items ?? []) {
    result.push({identifier:item.identifier, title:item.title, resourceIdentifier:item.resourceIdentifier, resourceHref:item.raw?.resourceHref, depth, parentIdentifier, raw:item.raw});
    result.push(...flatten(item.children ?? [], depth + 1, item.identifier));
  }
  return result;
}

function resolveCurrentItem(tree, options) {
  const launch = normalizeMember(options.launchMember ?? '');
  return tree.find((item) => item.identifier === options.itemIdentifier)
    ?? tree.find((item) => item.identifier === options.scoIdentifier || item.resourceIdentifier === options.scoIdentifier)
    ?? tree.find((item) => normalizeMember(options.resourceById.get(item.resourceIdentifier)?.href ?? item.resourceHref ?? '') === launch)
    ?? tree.find((item) => !isHidden(item) && normalizeMember(options.resourceById.get(item.resourceIdentifier)?.href ?? item.resourceHref ?? ''))
    ?? tree.find((item) => !isHidden(item))
    ?? tree[0];
}

function defaultTracking() {
  return {
    attemptCount:0,
    active:false,
    suspended:false,
    attemptProgressStatus:false,
    attemptCompletionStatus:false,
    attemptCompletionAmount:null,
    objectiveProgressStatus:false,
    objectiveSatisfiedStatus:false,
    objectiveMeasureStatus:false,
    objectiveNormalizedMeasure:null,
    previousAttempt:null,
  };
}

function resetCurrentAttempt(state) {
  state.attemptProgressStatus = false;
  state.attemptCompletionStatus = false;
  state.attemptCompletionAmount = null;
  state.objectiveProgressStatus = false;
  state.objectiveSatisfiedStatus = false;
  state.objectiveMeasureStatus = false;
  state.objectiveNormalizedMeasure = null;
}

function snapshotAttempt(state) {
  return {
    attemptProgressStatus:Boolean(state.attemptProgressStatus),
    attemptCompletionStatus:Boolean(state.attemptCompletionStatus),
    attemptCompletionAmount:Number.isFinite(state.attemptCompletionAmount) ? state.attemptCompletionAmount : null,
    objectiveProgressStatus:Boolean(state.objectiveProgressStatus),
    objectiveSatisfiedStatus:Boolean(state.objectiveSatisfiedStatus),
    objectiveMeasureStatus:Boolean(state.objectiveMeasureStatus),
    objectiveNormalizedMeasure:Number.isFinite(state.objectiveNormalizedMeasure) ? state.objectiveNormalizedMeasure : null,
  };
}

function cloneTracking(state) {
  return JSON.parse(JSON.stringify(state ?? defaultTracking()));
}

function normalizeSequencingState(value, tree) {
  const known = new Set(tree.map((item) => item.identifier));
  const out = {currentItemIdentifier:null, suspendedActivityIdentifier:null, tracking:{}};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  if (known.has(value.currentItemIdentifier)) out.currentItemIdentifier = value.currentItemIdentifier;
  if (known.has(value.suspendedActivityIdentifier)) out.suspendedActivityIdentifier = value.suspendedActivityIdentifier;
  const input = value.tracking && typeof value.tracking === 'object' && !Array.isArray(value.tracking) ? value.tracking : {};
  for (const item of tree) {
    const candidate = input[item.identifier];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const state = defaultTracking();
    state.attemptCount = nonNegativeInteger(candidate.attemptCount, 0);
    for (const key of ['active','suspended','attemptProgressStatus','attemptCompletionStatus','objectiveProgressStatus','objectiveSatisfiedStatus','objectiveMeasureStatus']) {
      state[key] = Boolean(candidate[key]);
    }
    state.attemptCompletionAmount = boundedOrNull(candidate.attemptCompletionAmount, 0, 1);
    state.objectiveNormalizedMeasure = boundedOrNull(candidate.objectiveNormalizedMeasure, -1, 1);
    if (candidate.previousAttempt && typeof candidate.previousAttempt === 'object' && !Array.isArray(candidate.previousAttempt)) {
      state.previousAttempt = snapshotAttempt(candidate.previousAttempt);
    }
    out.tracking[item.identifier] = state;
  }
  return out;
}

function subtreeEndIndex(tree, item, byId) {
  const index = tree.findIndex((candidate) => candidate.identifier === item?.identifier);
  if (index < 0) return -1;
  let last = index;
  for (let cursor = index + 1; cursor < tree.length; cursor += 1) {
    let parent = tree[cursor].parentIdentifier ? byId.get(tree[cursor].parentIdentifier) : null;
    let inside = false;
    while (parent) {
      if (parent.identifier === item.identifier) { inside = true; break; }
      parent = parent.parentIdentifier ? byId.get(parent.parentIdentifier) : null;
    }
    if (!inside) break;
    last = cursor;
  }
  return last;
}

function blockedResult(request, current, reason, targetItemIdentifier = null) {
  return {request, currentItemIdentifier:current?.identifier ?? null, targetItemIdentifier, targetMember:null, blocked:true, reason};
}

function boolAttr(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() !== 'false';
}

function finite(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function boundedOrNull(value, min, max) {
  const number = finite(value);
  return number !== null && number >= min && number <= max ? number : null;
}

function isHidden(item) { return String(item?.raw?.isvisible ?? 'true').toLowerCase() === 'false'; }
function normalizeMember(value) { return String(value ?? '').replace(/^\.\//, '').split(/[?#]/, 1)[0]; }
function stripTree(items) {
  return (items ?? []).map((item) => ({identifier:item.identifier, title:item.title, resourceIdentifier:item.resourceIdentifier, navigation:item.raw?.navigation, sequencing:item.raw?.sequencing, children:stripTree(item.children ?? [])}));
}
