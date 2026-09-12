import './p2rln-player.js';
import {createHostAdapter} from './host-adapter.js';

const token = new URLSearchParams(location.search).get('t');
const withToken = (url) => url + (url.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(token);
const api = async (url) => {
  const r = await fetch(withToken(url), {cache: 'no-store'});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Reader error');
  return j;
};


const b64u = (value) => {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const readerAdapter = createHostAdapter({
  resolveResourceUrl(request) {
    if (request.kind === 'embedded' && request.path) {
      return {
        url: withToken('/virtual/outer/' + b64u(request.path)),
        verified: true,
        seekable: request.seekable === true,
      };
    }
    if (request.kind === 'web-base' && request.representationId) {
      const directory = String(request.logicalDirectory ?? '');
      const suffix = directory ? directory.split('/').map(encodeURIComponent).join('/') : '';
      return {
        url: '/virtual/web/' + b64u(request.representationId) + '/' + suffix,
        verified: true,
        seekable: true,
      };
    }
    return null;
  },
});

let nativePlayer = null;

const titleOf = (e) => {
  const t = e.title || {};
  return t.es || t.en || t.und || Object.values(t)[0] || e.id;
};

function renderNode(node, parent) {
  const wrap = document.createElement('div');
  wrap.className = 'tree-node';
  const b = document.createElement('button');
  b.className = 'tree-button';
  b.innerHTML = `<span class="tree-type"></span><span class="tree-title"></span>`;
  b.querySelector('.tree-type').textContent = node.type;
  b.querySelector('.tree-title').textContent = node.title;
  b.onclick = () => void selectNode(node.id, b);
  wrap.appendChild(b);
  if (node.children?.length) {
    const children = document.createElement('div');
    children.className = 'tree-children';
    node.children.forEach(c => renderNode(c, children));
    wrap.appendChild(children);
  }
  parent.appendChild(wrap);
}

function resetViewer() {
  const iframe = document.getElementById('viewer');
  const native = document.getElementById('native-viewer');
  iframe.hidden = true;
  iframe.removeAttribute('src');
  native.hidden = true;
}

function showNativePlayer(entityId) {
  const native = document.getElementById('native-viewer');
  native.hidden = false;
  if (!nativePlayer) {
    nativePlayer = document.createElement('p2rln-player');
    nativePlayer.adapter = readerAdapter;
    nativePlayer.setAttribute('src', withToken('/package.p2rln'));
    nativePlayer.setAttribute('node', entityId);
    native.replaceChildren(nativePlayer);
    return;
  }
  nativePlayer.setAttribute('node', entityId);
}

async function selectNode(id, button) {
  document.querySelectorAll('.tree-button.active').forEach(x => x.classList.remove('active'));
  button?.classList.add('active');
  const msg = document.getElementById('message');
  try {
    const [entity, target] = await Promise.all([
      api('/api/entity?id=' + encodeURIComponent(id)),
      api('/api/view?id=' + encodeURIComponent(id)),
    ]);
    document.getElementById('empty').hidden = true;
    document.getElementById('detail').hidden = false;
    document.getElementById('entity-type').textContent = entity.type;
    document.getElementById('entity-title').textContent = titleOf(entity);
    document.getElementById('view-status').textContent = target.status;
    msg.hidden = true;
    resetViewer();

    if (target.status === 'ready' && target.url && ['native-questionnaire', 'native-composite', 'native-component'].includes(target.kind)) {
      showNativePlayer(entity.id);
    } else if (target.status === 'ready' && target.url) {
      const iframe = document.getElementById('viewer');
      iframe.src = target.url;
      iframe.hidden = false;
    } else if (target.reason) {
      msg.textContent = target.reason;
      msg.hidden = false;
    }
    document.getElementById('raw').textContent = JSON.stringify({entity, view: target}, null, 2);
  } catch (error) {
    resetViewer();
    msg.textContent = error instanceof Error ? error.message : String(error);
    msg.hidden = false;
    document.getElementById('view-status').textContent = 'error';
  }
}

async function boot() {
  if (!token) throw new Error('Missing reader token');
  const [summary, tree] = await Promise.all([api('/api/summary'), api('/api/tree')]);
  document.getElementById('format').textContent = `${summary.format} ${summary.formatVersion}`;
  document.getElementById('integrity').textContent = 'Integridad válida · sin red automática';
  document.getElementById('course-title').textContent = tree.title;
  document.getElementById('package-meta').textContent = summary.packageId;
  const root = document.getElementById('tree');
  renderNode(tree, root);
}

boot().catch(err => {
  document.getElementById('integrity').textContent = 'Error';
  document.getElementById('empty').innerHTML = `<h1>No se pudo abrir</h1><p></p>`;
  document.querySelector('#empty p').textContent = err.message;
});
