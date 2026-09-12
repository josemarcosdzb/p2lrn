import {openNestedPackage} from '../package-member.js';
import {dispatchRuntimeEvent} from '../runtime-events.js';
import {resolveH5pRuntimeUrl} from '../runtime-host-config.js';
import {encodeH5PSession, inspectH5PPackage} from '../h5p-package.js';

export const acceptsPayload = true;
const H5P_PROFILE = 'https://p2rln.org/profile/h5p';
const PROTOCOL = 'p2rln-h5p-runtime/1';
const MAX_PREVIOUS_STATE_JSON_BYTES = 2 * 1024 * 1024;

function extensionFor(rep) {
  const value = rep?.extensions?.[H5P_PROFILE];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function nestedH5P(pkg, representation, payload) {
  if (payload?.nested?.archive && payload.nested.names?.().includes('h5p.json')) return payload.nested;
  if (representation?.location?.type === 'embedded') return openNestedPackage(pkg, representation.location.path);
  const error = new Error('H5P runtime requires an embedded .h5p package.');
  error.code = 'P2RLN_H5P_PACKAGE_UNAVAILABLE';
  throw error;
}


function boundedState(value) {
  if (value == null) return null;
  let text;
  try { text = JSON.stringify(value); }
  catch (error) { const failure = new Error(`H5P previous state is not serializable: ${error?.message ?? String(error)}`); failure.code = 'P2RLN_H5P_STATE_INVALID'; throw failure; }
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_PREVIOUS_STATE_JSON_BYTES) { const error = new Error(`H5P previous state exceeds ${MAX_PREVIOUS_STATE_JSON_BYTES} UTF-8 bytes.`); error.code = 'P2RLN_H5P_STATE_TOO_LARGE'; throw error; }
  return JSON.parse(text);
}

function chooseEmbedType(embedTypes) {
  const allowed = new Set((Array.isArray(embedTypes) ? embedTypes : []).map((value) => String(value).toLowerCase()));
  if (allowed.has('iframe')) return 'iframe';
  if (allowed.has('div')) return 'div';
  return 'iframe';
}

function scoreFromXapi(statement) {
  const result = statement?.result;
  const score = result?.score;
  if (!score && result?.success == null && result?.completion == null) return null;
  const raw = Number(score?.raw);
  const max = Number(score?.max);
  const scaled = Number(score?.scaled);
  return {
    graded:Boolean(score || result?.success != null),
    raw:Number.isFinite(raw) ? raw : null,
    max:Number.isFinite(max) ? max : null,
    normalized:Number.isFinite(scaled) ? Math.max(-1, Math.min(1, scaled)) : null,
    passed:typeof result?.success === 'boolean' ? result.success : null,
    completed:typeof result?.completion === 'boolean' ? result.completion : null,
  };
}

export async function render({container, payload, representation, package:pkg, eventTarget, adapter, context, runtimeBaseUrl}) {
  const nested = await nestedH5P(pkg, representation, payload);
  const inspection = await inspectH5PPackage(nested);
  const declared = extensionFor(representation);
  if (declared.mainLibrary && declared.mainLibrary !== inspection.mainLibrary) {
    const error = new Error(`H5P mainLibrary mismatch: P2RLN metadata declares ${declared.mainLibrary}, package declares ${inspection.mainLibrary}.`);
    error.code = 'P2RLN_H5P_METADATA_MISMATCH';
    throw error;
  }
  if (declared.dependencyMode && declared.dependencyMode !== inspection.dependencyMode) {
    const error = new Error(`H5P dependencyMode mismatch: P2RLN metadata declares ${declared.dependencyMode}, package resolves as ${inspection.dependencyMode}.`);
    error.code = 'P2RLN_H5P_METADATA_MISMATCH';
    throw error;
  }

  const runtimeUrl = resolveH5pRuntimeUrl(runtimeBaseUrl, {applicationOrigin:globalThis.location?.origin ?? null});
  if (!runtimeUrl) {
    const error = new Error('H5P playback requires an isolated P2RLN runtime host.');
    error.code = 'P2RLN_H5P_RUNTIME_HOST_REQUIRED';
    throw error;
  }
  const runtimeOrigin = new URL(runtimeUrl).origin;
  const sessionEndpoint = new URL('session', runtimeUrl).href;
  const body = await encodeH5PSession(nested, inspection);
  const response = await fetch(sessionEndpoint, {
    method:'POST',
    mode:'cors',
    credentials:'omit',
    headers:{'Content-Type':'application/vnd.p2rln.h5p-session'},
    body,
  });
  let session;
  try { session = await response.json(); } catch { session = null; }
  if (!response.ok || !session?.ok || typeof session.sessionUrl !== 'string') {
    const missing = inspection.missing.map((dep) => `${dep.machineName} ${dep.majorVersion}.${dep.minorVersion}`).join(', ');
    const error = new Error(session?.error || `H5P runtime session could not be created${missing ? `; missing libraries: ${missing}` : ''}.`);
    error.code = session?.code || 'P2RLN_H5P_SESSION_FAILED';
    error.details = session;
    throw error;
  }
  const resolvedSession = Object.freeze({
    sessionUrl:new URL(session.sessionUrl, runtimeUrl).href,
    contentUrl:new URL(session.contentUrl ?? 'content/', new URL(session.sessionUrl, runtimeUrl)).href,
    librariesUrl:new URL(session.librariesUrl ?? session.sessionUrl, runtimeUrl).href,
    runtimeAssetsUrl:new URL(session.runtimeAssetsUrl ?? 'assets/', runtimeUrl).href,
  });

  let previousState = null;
  if (adapter?.loadState) previousState = boundedState(await adapter.loadState(Object.freeze({...context, runtime:'h5p'})));
  const iframe = document.createElement('iframe');
  iframe.className = 'p2rln-h5p-frame';
  iframe.title = inspection.title || 'H5P';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox');
  iframe.setAttribute('allow', 'fullscreen');
  iframe.style.width = '100%';
  iframe.style.minHeight = '480px';
  iframe.style.border = '0';

  let port = null;
  let destroyed = false;
  let didConnect = false;
  let saveQueue = Promise.resolve();
  const process = (message) => {
    if (!message || message.protocol !== PROTOCOL) return;
    if (message.action === 'ready') {
      dispatchRuntimeEvent(eventTarget, 'p2rln:activityready', {
        runtime:'h5p', mainLibrary:inspection.mainLibrary, dependencyMode:inspection.dependencyMode,
        libraryCount:inspection.libraryCount,
      }, context, {adapter});
      return;
    }
    if (message.action === 'state') {
      saveQueue = saveQueue.then(async () => {
        if (adapter?.saveState) await adapter.saveState(message.state ?? null, Object.freeze({...context, runtime:'h5p', reason:message.reason ?? 'runtime'}));
      }).catch((error) => dispatchRuntimeEvent(eventTarget, 'p2rln:error', {phase:'h5p-save-state', error:String(error?.message ?? error)}, context, {adapter}));
      dispatchRuntimeEvent(eventTarget, 'p2rln:statechange', {runtime:'h5p', state:message.state ?? null, reason:message.reason ?? 'runtime'}, context, {adapter});
      return;
    }
    if (message.action === 'xapi') {
      const statement = message.statement ?? null;
      dispatchRuntimeEvent(eventTarget, 'p2rln:xapi', {runtime:'h5p', statement, authoritative:false, source:'content-runtime'}, context, {adapter});
      const score = scoreFromXapi(statement);
      if (score) dispatchRuntimeEvent(eventTarget, 'p2rln:score', {...score, runtime:'h5p', authoritative:false}, context, {adapter});
      const verb = String(statement?.verb?.id ?? '');
      const terminal = verb.endsWith('/completed') || verb.endsWith('/passed') || verb.endsWith('/failed');
      if (terminal) {
        if (score && adapter?.reportScore) {
          saveQueue = saveQueue.catch(() => undefined).then(() => adapter.reportScore({...score, runtime:'h5p', authoritative:false}, context)).catch((error) => dispatchRuntimeEvent(eventTarget, 'p2rln:error', {phase:'h5p-report-score', error:String(error?.message ?? error)}, context, {adapter}));
        }
        dispatchRuntimeEvent(eventTarget, 'p2rln:complete', {runtime:'h5p', statement, score, authoritative:false}, context, {adapter});
      }
      return;
    }
    if (message.action === 'resize') {
      const height = Number(message.height);
      if (Number.isFinite(height) && height >= 100 && height <= 20000) iframe.style.height = `${Math.ceil(height)}px`;
      return;
    }
    if (message.action === 'error') {
      dispatchRuntimeEvent(eventTarget, 'p2rln:error', {phase:'h5p-runtime', error:String(message.error ?? 'H5P runtime error')}, context, {adapter});
    }
  };

  const onMessage = (event) => {
    if (destroyed || event.source !== iframe.contentWindow || event.origin !== runtimeOrigin) return;
    const data = event.data;
    if (!data || data.protocol !== PROTOCOL || data.action !== 'shell-ready' || didConnect) return;
    didConnect = true;
    const channel = new MessageChannel();
    port = channel.port1;
    let initialized = false;
    port.onmessage = (portEvent) => {
      const message = portEvent.data;
      if (!initialized && message?.protocol === PROTOCOL && message?.action === 'connected') {
        initialized = true;
        port.postMessage({
          protocol:PROTOCOL, action:'init', sessionUrl:resolvedSession.sessionUrl,
          contentUrl:resolvedSession.contentUrl, librariesUrl:resolvedSession.librariesUrl,
          runtimeAssetsUrl:resolvedSession.runtimeAssetsUrl,
          title:inspection.title, mainLibrary:inspection.mainLibrary, embedType:chooseEmbedType(inspection.embedTypes),
          previousState:previousState ?? null,
          xAPIObjectIRI:`urn:p2rln:${encodeURIComponent(String(context?.packageId ?? 'package'))}:${encodeURIComponent(String(context?.entityId ?? 'activity'))}`,
        });
        return;
      }
      process(message);
    };
    port.start?.();
    iframe.contentWindow.postMessage({protocol:PROTOCOL, action:'connect'}, runtimeOrigin, [channel.port2]);
  };
  window.addEventListener('message', onMessage);
  iframe.src = runtimeUrl;
  container.replaceChildren(iframe);

  return Object.freeze({
    kind:'h5p', inspection,
    flush:() => saveQueue,
    destroy() {
      destroyed = true;
      window.removeEventListener('message', onMessage);
      try { port?.postMessage({protocol:PROTOCOL, action:'flush'}); } catch {}
      try { port?.close?.(); } catch {}
      try { fetch(resolvedSession.sessionUrl, {method:'DELETE', mode:'cors', credentials:'omit'}).catch(() => {}); } catch {}
      iframe.remove();
    },
  });
}
