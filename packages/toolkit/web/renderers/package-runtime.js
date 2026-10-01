import {openNestedPackage, openPayloadPackage} from '../package-member.js';
import {dispatchRuntimeEvent} from '../runtime-events.js';
import {resolvePackageRuntimeUrl} from '../runtime-host-config.js';

export const acceptsPayload = true;
const PROTOCOL = 'p2lrn-package-runtime/1';
const MULTIPART_PROFILE = 'https://p2lrn.org/profile/multipart';
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
  const runtimeUrl = resolvePackageRuntimeUrl(runtimeBaseUrl, {applicationOrigin:globalThis.location?.origin ?? null});
  if (!runtimeUrl || !new URL(runtimeUrl).pathname.endsWith('/package.html')) {
    const error = new Error('This package renderer requires the static isolated P2LRN CDN runtime.');
    error.code = 'P2LRN_PACKAGE_RUNTIME_HOST_REQUIRED';
    throw error;
  }
  const runtimeOrigin = new URL(runtimeUrl).origin;
  const transferred = await runtimeFiles(nested);
  const iframe = document.createElement('iframe');
  iframe.className = 'p2lrn-package-runtime';
  iframe.title = 'External package';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads');
  iframe.setAttribute('allow', 'fullscreen');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.style.cssText = 'display:block;width:100%;height:clamp(520px,68vh,760px);min-height:420px;max-width:100%;border:0;background:#fff';

  let destroyed = false;
  let port = null;
  let connected = false;
  const onMessage = (event) => {
    if (destroyed || event.source !== iframe.contentWindow || event.origin !== runtimeOrigin) return;
    const data = event.data;
    if (!data || data.protocol !== PROTOCOL || data.action !== 'shell-ready' || connected) return;
    connected = true;
    const channel = new MessageChannel();
    port = channel.port1;
    let initialized = false;
    port.onmessage = (portEvent) => {
      const message = portEvent.data;
      if (!message || message.protocol !== PROTOCOL) return;
      if (!initialized && message.action === 'connected') {
        initialized = true;
        port.postMessage({
          protocol:PROTOCOL,
          action:'init',
          launchMember:launch.path,
          launchSuffix:launch.suffix,
          profile:representation.profile ?? null,
          files:transferred.files,
        }, transferred.transfers);
        return;
      }
      if (message.action === 'resize') {
        const height = Number(message.height);
        if (Number.isFinite(height)) iframe.style.height = `${Math.max(420, Math.min(760, Math.ceil(height)))}px`;
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
    iframe.contentWindow.postMessage({protocol:PROTOCOL, action:'connect'}, runtimeOrigin, [channel.port2]);
  };
  window.addEventListener('message', onMessage);
  iframe.src = runtimeUrl;
  container.replaceChildren(iframe);

  return Object.freeze({
    kind:'external-package',
    launchMember:launch.reference,
    destroy() {
      destroyed = true;
      window.removeEventListener('message', onMessage);
      try { port?.close?.(); } catch {}
      iframe.remove();
    },
  });
}
