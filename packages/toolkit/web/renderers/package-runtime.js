import {startPackageRuntime} from '../package-runtime-shell.js';
import {openNestedPackage, openPayloadPackage} from '../package-member.js';
import {dispatchRuntimeEvent} from '../runtime-events.js';
import {isSafeRuntimeMessage} from '../runtime-message-security.js';
import {resolvePackageRuntimeUrl} from '../runtime-host-config.js';

export const acceptsPayload = true;
const PROTOCOL = 'p2lrn-package-runtime/1';
const MULTIPART_PROFILE = 'https://p2lrn.org/profile/multipart';
const CMI5_PROFILE = 'https://p2lrn.org/profile/cmi5';
const PROFILE_KEYS = [
  'https://p2lrn.org/profile/cmi5',
  'https://p2lrn.org/profile/tincan-package',
  'https://p2lrn.org/profile/common-cartridge',
  'https://p2lrn.org/profile/ims-content-package',
  'https://p2lrn.org/profile/qti',
];

function extensionFor(representation) {
  for (const profile of PROFILE_KEYS) {
    const value = representation?.extensions?.[profile];
    if (value && typeof value === 'object' && !Array.isArray(value)) return {profile, value};
  }
  return {profile:representation?.profile ?? null, value:{}};
}
export function packageLaunchMember(representation) {
  const location = representation?.location;
  if (location?.type === 'package-member' && location.member) return String(location.member);
  const multipartMember = representation?.extensions?.[MULTIPART_PROFILE]?.member;
  if (typeof multipartMember === 'string' && multipartMember) return multipartMember;
  const {value} = extensionFor(representation);
  const candidate = value.member ?? value.href ?? value.url ?? value.launch ?? value.launchUrl;
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(candidate) || candidate.startsWith('//')) return null;
  return candidate.replace(/^\.\//, '');
}
export function supportsPackageRuntime(representation) {
  const launch = packageLaunchMember(representation);
  if (!launch || !/\.(?:html?|xhtml)(?:[?#].*)?$/iu.test(launch)) return false;
  return ['embedded', 'package-member'].includes(representation?.location?.type);
}
export function splitPackageMemberReference(value) {
  const raw = String(value ?? '').trim().replace(/^\.\//u, '');
  const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/u.exec(raw);
  const path = String(match?.[1] ?? '').replace(/^\//u, '');
  const suffix = String(match?.[2] ?? '') + String(match?.[3] ?? '');
  return {path, suffix, reference:path + suffix};
}
function runtimeUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function cmi5RuntimeConfig(representation, context) {
  const {profile, value} = extensionFor(representation);
  if (profile !== CMI5_PROFILE && representation?.profile !== CMI5_PROFILE) return null;
  const registration = runtimeUuid();
  const sessionId = runtimeUuid();
  const endpoint = 'https://p2lrn.invalid/cmi5/xapi';
  const fetchUrl = 'https://p2lrn.invalid/cmi5/fetch';
  const activityId = String(value.auId ?? context?.entityId ?? `urn:p2lrn:activity:${registration}`);
  const actor = {
    objectType:'Agent',
    account:{homePage:'https://p2lrn.org/runtime-preview', name:'p2lrn-preview-learner'},
    name:'P2LRN Preview Learner',
  };
  const launchUrl = new URL('https://p2lrn.invalid/cmi5/launch');
  launchUrl.searchParams.set('endpoint', endpoint);
  launchUrl.searchParams.set('fetch', fetchUrl);
  launchUrl.searchParams.set('actor', JSON.stringify(actor));
  launchUrl.searchParams.set('registration', registration);
  launchUrl.searchParams.set('activityId', activityId);
  const launchData = {
    launchMode:'Normal',
    moveOn:String(value.moveOn ?? 'NotApplicable'),
    contextTemplate:{
      contextActivities:{grouping:[{id:String(context?.packageId ?? 'https://p2lrn.org/runtime-preview')}]},
      extensions:{'https://w3id.org/xapi/cmi5/context/extensions/sessionid':sessionId},
    },
  };
  const masteryScore = Number(value.masteryScore);
  if (Number.isFinite(masteryScore)) launchData.masteryScore = masteryScore;
  if (typeof value.launchParameters === 'string' && value.launchParameters) launchData.launchParameters = value.launchParameters;
  return Object.freeze({
    protocol:'p2lrn-cmi5-preview/1',
    syntheticOrigin:'https://p2lrn.invalid',
    endpoint,
    fetchUrl,
    launchUrl:launchUrl.href,
    activityId,
    registration,
    actor,
    launchData,
  });
}
function scoreFromCmi5Statement(statement) {
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

function boundedPreviewState(value) {
  const json = JSON.stringify(value ?? null);
  if (new TextEncoder().encode(json).byteLength > 2 * 1024 * 1024) throw new Error('cmi5 preview state exceeds 2 MiB.');
  return JSON.parse(json);
}

function mediaTypeForPath(path) {
  const ext = String(path).toLowerCase().split(/[?#]/, 1)[0].split('.').pop();
  return ({
    html:'text/html',htm:'text/html',xhtml:'application/xhtml+xml',css:'text/css',js:'text/javascript',mjs:'text/javascript',
    json:'application/json',xml:'application/xml',txt:'text/plain',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
    gif:'image/gif',webp:'image/webp',ico:'image/x-icon',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',
    pdf:'application/pdf',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',
  })[ext] ?? 'application/octet-stream';
}
async function nestedPackage(pkg, representation, payload) {
  if (payload?.nested?.archive) return payload.nested;
  if (payload?.multipart === true) return openPayloadPackage(payload);
  if (representation?.location?.type === 'embedded') return openNestedPackage(pkg, representation.location.path);
  const error = new Error('External package runtime requires an embedded package or package-member representation.');
  error.code = 'P2LRN_PACKAGE_RUNTIME_PAYLOAD_UNAVAILABLE';
  throw error;
}
async function runtimeFiles(nested) {
  const names = nested.names?.() ?? [];
  if (names.length > 10000) throw new Error(`External package contains too many files (${names.length}).`);
  const files = [], transfers = [];
  let total = 0;
  for (const path of names) {
    const bytes = await nested.read(path);
    total += bytes.byteLength;
    if (total > 512 * 1024 * 1024) throw new Error('External package runtime payload exceeds 512 MiB.');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    files.push({path, mediaType:mediaTypeForPath(path), buffer});
    transfers.push(buffer);
  }
  return {files, transfers};
}

export async function render({container, payload, representation, package:pkg, eventTarget, adapter, context, runtimeBaseUrl}) {
  const launch = splitPackageMemberReference(payload?.member ?? packageLaunchMember(representation));
  if (!launch.path) {
    const error = new Error('External package has no local HTML launch member.');
    error.code = 'P2LRN_PACKAGE_RUNTIME_LAUNCH_MISSING';
    throw error;
  }
  const nested = await nestedPackage(pkg, representation, payload);
  if (!nested.names().includes(launch.path)) {
    const error = new Error(`External package launch member is missing: ${launch.reference || launch.path}`);
    error.code = 'P2LRN_PACKAGE_RUNTIME_LAUNCH_MISSING';
    throw error;
  }
  let runtimeUrl = null;
  try { runtimeUrl = resolvePackageRuntimeUrl(runtimeBaseUrl); }
  catch (error) { if (error?.code !== 'P2LRN_PACKAGE_RUNTIME_ORIGIN_NOT_ISOLATED') throw error; }
  const opaqueMode = !runtimeUrl;
  if (runtimeUrl && !new URL(runtimeUrl).pathname.endsWith('/package.html')) {
    const error = new Error('This package renderer requires the static isolated P2LRN CDN runtime.');
    error.code = 'P2LRN_PACKAGE_RUNTIME_HOST_REQUIRED';
    throw error;
  }
  const runtimeOrigin = opaqueMode ? 'null' : new URL(runtimeUrl).origin;
  const transferred = await runtimeFiles(nested);
  const cmi5 = cmi5RuntimeConfig(representation, context);
  const stateContext = Object.freeze({...context, runtime:'cmi5'});
  const previous = cmi5 && adapter?.loadState ? boundedPreviewState(await adapter.loadState(stateContext)) : null;
  const states = new Map(previous?.protocol === 'p2lrn-cmi5-preview-state/1' ? Object.entries(previous.states ?? {}) : []);
  let saveQueue = Promise.resolve();
  const iframe = document.createElement('iframe');
  iframe.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; clipboard-read 'none'; clipboard-write 'none'; fullscreen");
  iframe.className = 'p2lrn-package-runtime';
  iframe.title = 'External package';
  iframe.setAttribute('sandbox', opaqueMode ? 'allow-scripts' : 'allow-scripts allow-same-origin');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.style.cssText = 'display:block;width:100%;height:clamp(520px,68vh,760px);min-height:420px;max-width:100%;border:0;background:#fff';

  let destroyed = false;
  let port = null;
  let connected = false;
  const onMessage = (event) => {
    if (destroyed || event.source !== iframe.contentWindow || event.origin !== runtimeOrigin) return;
    const data = event.data;
    if (!isSafeRuntimeMessage(data) || data.protocol !== PROTOCOL || data.action !== 'shell-ready' || connected) return;
    connected = true;
    const channel = new MessageChannel();
    port = channel.port1;
    let initialized = false;
    port.onmessage = (portEvent) => {
      const message = portEvent.data;
      if (!isSafeRuntimeMessage(message) || message.protocol !== PROTOCOL) return;
      if (!initialized && message.action === 'connected') {
        initialized = true;
        port.postMessage({
          protocol:PROTOCOL,
          action:'init',
          launchMember:launch.path,
          launchSuffix:launch.suffix,
          profile:representation.profile ?? null,
          cmi5:cmi5 ? {...cmi5, initialStates:Object.fromEntries(states)} : null,
          files:transferred.files,
        }, transferred.transfers);
        return;
      }
      if (message.action === 'resize') {
        const height = Number(message.height);
        if (Number.isFinite(height)) iframe.style.height = `${Math.max(420, Math.min(760, Math.ceil(height)))}px`;
        return;
      }
      if (message.action === 'cmi5-state' && cmi5) {
        try {
          const key = String(message.stateId ?? '');
          if (!key || key.length > 1024 || key === 'LMS.LaunchData') return;
          const candidate = new Map(states);
          if (message.value == null) candidate.delete(key);
          else candidate.set(key, boundedPreviewState(message.value));
          const snapshot = boundedPreviewState({protocol:'p2lrn-cmi5-preview-state/1',states:Object.fromEntries(candidate)});
          states.clear();
          for (const [name, value] of candidate) states.set(name, value);
          saveQueue = saveQueue.then(() => adapter?.saveState?.(snapshot, stateContext)).catch(error => {
            dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {phase:'cmi5-save-state',error:String(error?.message ?? error)}, context, {adapter});
          });
          dispatchRuntimeEvent(eventTarget, 'p2lrn:statechange', {runtime:'cmi5',state:snapshot,authoritative:false}, context, {adapter});
        } catch (error) {
          dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {phase:'cmi5-state',error:String(error?.message ?? error)}, context, {adapter});
        }
        return;
      }
      if (message.action === 'cmi5-statement') {
        const statements = Array.isArray(message.statements) ? message.statements : [message.statement].filter(Boolean);
        for (const statement of statements) {
          dispatchRuntimeEvent(eventTarget, 'p2lrn:xapi', {
            runtime:'cmi5', statement, authoritative:false, source:'portable-preview-runtime',
          }, context, {adapter});
          const score = scoreFromCmi5Statement(statement);
          if (score) {
            dispatchRuntimeEvent(eventTarget, 'p2lrn:score', {...score, runtime:'cmi5', authoritative:false}, context, {adapter});
            if (adapter?.reportScore) Promise.resolve(adapter.reportScore({...score, runtime:'cmi5', authoritative:false}, context)).catch((error) => {
              dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {phase:'cmi5-report-score', error:String(error?.message ?? error)}, context, {adapter});
            });
          }
          const verb = String(statement?.verb?.id ?? '');
          if (verb.endsWith('/completed') || verb.endsWith('/passed') || verb.endsWith('/failed')) {
            dispatchRuntimeEvent(eventTarget, 'p2lrn:complete', {runtime:'cmi5', statement, score, authoritative:false}, context, {adapter});
          }
        }
        return;
      }
      if (message.action === 'cmi5-exit') {
        dispatchRuntimeEvent(eventTarget, 'p2lrn:navigation', {
          runtime:'cmi5', exit:true, reason:message.reason ?? 'course-request', returnURL:message.returnURL ?? null,
        }, context, {adapter});
        try { port?.close?.(); } catch {}
        port = null;
        iframe.remove();
        const closed = document.createElement('div');
        closed.className = 'p2lrn-message';
        closed.textContent = 'Actividad cerrada.';
        container.replaceChildren(closed);
        return;
      }
      if (message.action === 'ready' || message.action === 'initialized') {
        dispatchRuntimeEvent(eventTarget, 'p2lrn:activityready', {
          runtime:'external-package',
          profile:representation.profile ?? null,
          launchMember:(message.member ?? launch.path) + (message.suffix ?? launch.suffix),
        }, context, {adapter});
      } else if (message.action === 'blocked-navigation') {
        dispatchRuntimeEvent(eventTarget, 'p2lrn:navigation', {
          runtime:'external-package', blocked:true, href:message.href ?? null, member:message.member ?? null,
        }, context, {adapter});
      } else if (message.action === 'error') {
        dispatchRuntimeEvent(eventTarget, 'p2lrn:error', {
          phase:'external-package-runtime', error:String(message.message ?? 'External package runtime error'),
        }, context, {adapter});
      }
    };
    port.start?.();
    iframe.contentWindow.postMessage({protocol:PROTOCOL, action:'connect'}, opaqueMode ? '*' : runtimeOrigin, [channel.port2]);
  };
  window.addEventListener('message', onMessage);
  // A srcdoc frame inherits the embedding page's CSP. Bootstrapping with
  // inline JavaScript therefore fails on strict sites, even if a meta CSP
  // inside the frame tries to allow it. Use a first-party blob script instead.
  const opaqueBootstrapUrl = opaqueMode
    ? URL.createObjectURL(new Blob([`(${startPackageRuntime.toString()})({opaqueRuntime:true});`], {type:'text/javascript'}))
    : null;
  if (opaqueMode) iframe.srcdoc = createOpaquePackageRuntimeDocument(opaqueBootstrapUrl);
  else iframe.src = runtimeUrl;
  container.replaceChildren(iframe);

  return Object.freeze({
    kind:'external-package',
    flush:() => saveQueue,
    launchMember:launch.reference,
    destroy() {
      destroyed = true;
      window.removeEventListener('message', onMessage);
      try { port?.close?.(); } catch {}
      if (opaqueBootstrapUrl) URL.revokeObjectURL(opaqueBootstrapUrl);
      iframe.remove();
    },
  });
}


export function createOpaquePackageRuntimeDocument(bootstrapUrl=null) {
  const bootstrap = bootstrapUrl
    ? `<script src="${String(bootstrapUrl).replaceAll('&','&amp;').replaceAll('"','&quot;')}"></script>`
    : `<script>(${startPackageRuntime.toString()})({opaqueRuntime:true});</script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline' blob:; img-src blob: data:; media-src blob: data:; font-src blob: data:; frame-src about: blob: data:; connect-src blob:; form-action 'none'; base-uri 'none'; object-src 'none'"></head><body><div id="stage"></div>${bootstrap}</body></html>`;
}
