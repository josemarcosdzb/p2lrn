export const acceptsPayload = true;

export async function render({container, bytes, payload, representation, resolveResourceUrl}) {
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
  node.className = 'p2rln-media';
  node.src = url;
  container.append(node);
  return {destroy() { if (revoke) URL.revokeObjectURL(url); node.removeAttribute('src'); node.load?.(); container.replaceChildren(); }};
}
