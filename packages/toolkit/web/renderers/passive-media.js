import {dispatchRuntimeEvent} from '../runtime-events.js';
export const acceptsPayload = true;

function resourceTitle(resource,representation){
  if(typeof representation?.title==='string'&&representation.title.trim())return representation.title.trim();
  const title=resource?.title;
  if(typeof title==='string')return title;
  if(title&&typeof title==='object')return title.es??title.en??title.und??Object.values(title).find((value)=>typeof value==='string')??'';
  return '';
}

export async function render({container, bytes, payload, representation, resource, resolveResourceUrl, eventTarget, adapter, context = {}}) {
  const media = String(representation.mediaType ?? 'application/octet-stream').split(';', 1)[0].trim().toLowerCase();
  if (!/^(image|audio|video)\//.test(media)) throw new Error(`Representación multimedia no soportada: ${representation.mediaType}`);

  let url = null;
  let revoke = false;
  if (payload && typeof resolveResourceUrl === 'function') {
    const direct = await resolveResourceUrl({
      kind: 'embedded',
      purpose: media.startsWith('video/') || media.startsWith('audio/') ? 'seekable-media' : 'media',
      path: payload.path,
      requireSeekable: media.startsWith('video/') || media.startsWith('audio/'),
    });
    if (direct && (!(media.startsWith('video/') || media.startsWith('audio/')) || direct.seekable)) url = direct.url;
  }
  if (!url) {
    const blob = payload ? await payload.blob(media) : new Blob([bytes], {type: media});
    url = URL.createObjectURL(blob);
    revoke = true;
  }

  let node;
  if (media.startsWith('image/')) {
    node = document.createElement('img');
    node.alt = resourceTitle(resource,representation);
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
  node.src = url;
  if (media.startsWith('audio/') || media.startsWith('video/')) {
    let lastTime = 0;
    const emit=(action,extra={})=>dispatchRuntimeEvent(eventTarget,'p2lrn:interaction',{action,mediaType:media,currentTime:Number.isFinite(node.currentTime)?Math.round(node.currentTime*10)/10:null,duration:Number.isFinite(node.duration)?Math.round(node.duration*10)/10:null,...extra},context,{adapter});
    node.addEventListener('play',()=>emit('media-play'));
    node.addEventListener('pause',()=>{if(!node.ended)emit('media-pause');});
    node.addEventListener('seeking',()=>emit('media-seek',{fromTime:Math.round(lastTime*10)/10}));
    node.addEventListener('timeupdate',()=>{lastTime=node.currentTime;});
    node.addEventListener('ended',()=>emit('media-ended'));
  }
  container.append(node);
  return {destroy() { if (revoke) URL.revokeObjectURL(url); node.removeAttribute('src'); node.load?.(); container.replaceChildren(); }};
}
