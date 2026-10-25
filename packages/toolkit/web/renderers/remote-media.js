import {dispatchRuntimeEvent} from '../runtime-events.js';
export const acceptsRemoteLocation = true;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function render({container, representation, resolveResourceUrl, eventTarget, adapter, context = {}}) {
  const media = String(representation?.mediaType ?? '').split(';', 1)[0].trim().toLowerCase();
  const location = representation?.location;
  if (!/^(image|audio|video)\//.test(media)) throw fail('P2LRN_RENDERER_INCOMPATIBLE', `Remote media renderer does not support ${representation?.mediaType ?? 'missing media type'}.`);
  if (location?.type !== 'remote' || typeof location.href !== 'string' || !location.href) throw fail('P2LRN_RENDERER_INCOMPATIBLE', 'Remote media renderer requires a remote representation.');
  if (typeof location.expectedDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(location.expectedDigest)) {
    throw fail('P2LRN_REMOTE_RESOURCE_UNVERIFIED', 'Remote P2LRN media requires expectedDigest before a host may resolve it.');
  }
  if (typeof resolveResourceUrl !== 'function') throw fail('P2LRN_REMOTE_RESOURCE_UNAVAILABLE', 'Remote P2LRN media requires a trusted host resource resolver.');
  let resolved;
  try {
    resolved = await resolveResourceUrl({
      kind: 'remote',
      purpose: media.startsWith('audio/') || media.startsWith('video/') ? 'seekable-media' : 'media',
      href: location.href,
      expectedDigest: location.expectedDigest,
      mediaType: representation.mediaType,
      requireSeekable: media.startsWith('audio/') || media.startsWith('video/'),
    });
  } catch (cause) {
    const error = fail('P2LRN_REMOTE_RESOURCE_UNAVAILABLE', 'The trusted host resolver failed for this remote P2LRN resource.');
    error.cause = cause;
    throw error;
  }
  if (!resolved?.url) throw fail('P2LRN_REMOTE_RESOURCE_UNAVAILABLE', 'The host did not provide a verified URL for this remote P2LRN resource.');
  if (resolved.verified !== true) throw fail('P2LRN_REMOTE_RESOURCE_UNVERIFIED', 'The host did not attest integrity verification for this remote P2LRN resource.');
  if ((media.startsWith('audio/') || media.startsWith('video/')) && resolved.seekable !== true) {
    throw fail('P2LRN_REMOTE_RESOURCE_UNAVAILABLE', 'The host did not provide seekable verified delivery for this remote media resource.');
  }

  let node;
  if (media.startsWith('image/')) {
    node = document.createElement('img');
    node.alt = representation.title ?? '';
  } else if (media.startsWith('audio/')) {
    node = document.createElement('audio');
    node.controls = true;
    node.preload = 'metadata';
  } else {
    node = document.createElement('video');
    node.controls = true;
    node.preload = 'metadata';
  }
  node.className = 'p2lrn-media';
  node.referrerPolicy = 'no-referrer';
  node.src = resolved.url;
  if (media.startsWith('audio/') || media.startsWith('video/')) {
    let lastTime=0;
    const emit=(action,extra={})=>dispatchRuntimeEvent(eventTarget,'p2lrn:interaction',{action,mediaType:media,currentTime:Number.isFinite(node.currentTime)?Math.round(node.currentTime*10)/10:null,duration:Number.isFinite(node.duration)?Math.round(node.duration*10)/10:null,...extra},context,{adapter});
    node.addEventListener('play',()=>emit('media-play'));
    node.addEventListener('pause',()=>{if(!node.ended)emit('media-pause');});
    node.addEventListener('seeking',()=>emit('media-seek',{fromTime:Math.round(lastTime*10)/10}));
    node.addEventListener('timeupdate',()=>{lastTime=node.currentTime;});
    node.addEventListener('ended',()=>emit('media-ended'));
  }
  container.append(node);
  return {destroy() { node.removeAttribute('src'); node.load?.(); container.replaceChildren(); }};
}