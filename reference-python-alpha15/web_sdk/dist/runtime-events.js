export const RUNTIME_EVENT_SCHEMA = 'https://p2rln.org/schema/runtime-event/1';
export const RUNTIME_EVENT_VERSION = '1';

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
  const eventType = String(type ?? '').trim();
  if (!/^p2rln:[a-z][a-z0-9-]*$/.test(eventType)) throw new TypeError(`Invalid P2RLN runtime event type: ${eventType}`);
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

function forwardToHost(target, event, explicitAdapter = null) {
  const adapter = explicitAdapter ?? target?.adapter;
  if (!adapter || typeof adapter.emitEvent !== 'function' || typeof adapter !== 'object') return;
  const previous = forwardQueues.get(adapter) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => adapter.emitEvent(event, event.context)).catch((error) => {
    if (event.type === 'p2rln:error') return;
    dispatchRuntimeEvent(target, 'p2rln:error', {
      phase: 'emitEvent',
      sourceEventType: event.type,
      error: String(error?.message ?? error),
    }, event.context, {forward: false});
  });
  forwardQueues.set(adapter, next);
}

export function dispatchRuntimeEvent(target, type, payload = {}, context = {}, options = {}) {
  const event = createRuntimeEvent(type, payload, context, options);
  if (target?.dispatchEvent && typeof CustomEvent !== 'undefined') {
    const detail = Object.freeze({...event.payload, context: event.context, event});
    target.dispatchEvent(new CustomEvent(type, {detail, bubbles: true, composed: true}));
  }
  if (options.forward !== false) forwardToHost(target, event, options.adapter ?? null);
  return event;
}
