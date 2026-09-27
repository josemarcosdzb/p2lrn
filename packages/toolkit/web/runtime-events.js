import {runtimeEventToXapiStatementIntent} from './xapi-intent.js';
export const RUNTIME_EVENT_SCHEMA = 'https://p2lrn.org/schema/runtime-event/1';
export const RUNTIME_EVENT_VERSION = '1';
export const LEGACY_RUNTIME_EVENT_PREFIX = 'p2rln:';
export const RUNTIME_EVENT_PREFIX = 'p2lrn:';

const forwardQueues = new WeakMap();

function clone(value) {
  if (value === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return null; }
}

function safeContext(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? clone(value) ?? {} : {};
}

export function createRuntimeEvent(type, payload = {}, context = {}, {clock = () => Date.now()} = {}) {
  const rawType = String(type ?? '').trim();
  const eventType = rawType.startsWith(LEGACY_RUNTIME_EVENT_PREFIX)
    ? RUNTIME_EVENT_PREFIX + rawType.slice(LEGACY_RUNTIME_EVENT_PREFIX.length)
    : rawType;
  if (!/^p2lrn:[a-z][a-z0-9-]*$/.test(eventType)) throw new TypeError(`Invalid P2LRN runtime event type: ${eventType}`);
  const timestampMs = Number(clock());
  if (!Number.isFinite(timestampMs)) throw new TypeError('Runtime event clock must return a finite epoch-millisecond number.');
  return Object.freeze({
    schema: RUNTIME_EVENT_SCHEMA,
    version: RUNTIME_EVENT_VERSION,
    type: eventType,
    timestamp: new Date(timestampMs).toISOString(),
    context: safeContext(context),
    payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? clone(payload) ?? {} : {},
  });
}

function forwardFailure(target,event,phase,error) {
  if (event.type === 'p2lrn:error') return;
  dispatchRuntimeEvent(target, 'p2lrn:error', {
    phase,
    sourceEventType: event.type,
    error: String(error?.message ?? error),
  }, event.context, {forward: false});
}

function forwardToHost(target, event, explicitAdapter = null) {
  const adapter = explicitAdapter ?? target?.adapter;
  if (!adapter || typeof adapter !== 'object') return;
  const hasEvent = typeof adapter.emitEvent === 'function';
  const hasXapi = typeof adapter.emitXapiStatementIntent === 'function';
  if (!hasEvent && !hasXapi) return;
  const previous = forwardQueues.get(adapter) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    if (hasEvent) {
      try { await adapter.emitEvent(event, event.context); }
      catch (error) { forwardFailure(target,event,'emitEvent',error); }
    }
    if (hasXapi) {
      let intent = null;
      try { intent = runtimeEventToXapiStatementIntent(event); }
      catch (error) { forwardFailure(target,event,'xapi-intent',error); return; }
      if (intent) {
        try { await adapter.emitXapiStatementIntent(intent, event.context); }
        catch (error) { forwardFailure(target,event,'emitXapiStatementIntent',error); }
      }
    }
  });
  forwardQueues.set(adapter, next);
}

export function dispatchRuntimeEvent(target, type, payload = {}, context = {}, options = {}) {
  const event = createRuntimeEvent(type, payload, context, options);
  if (target?.dispatchEvent && typeof CustomEvent !== 'undefined') {
    const detail = Object.freeze({...event.payload, context: event.context, event});
    target.dispatchEvent(new CustomEvent(event.type, {detail, bubbles: true, composed: true}));
    const legacyType = event.type.startsWith(RUNTIME_EVENT_PREFIX)
      ? LEGACY_RUNTIME_EVENT_PREFIX + event.type.slice(RUNTIME_EVENT_PREFIX.length)
      : null;
    if (legacyType) target.dispatchEvent(new CustomEvent(legacyType, {detail, bubbles: true, composed: true}));
  }
  if (options.forward !== false) forwardToHost(target, event, options.adapter ?? null);
  return event;
}
