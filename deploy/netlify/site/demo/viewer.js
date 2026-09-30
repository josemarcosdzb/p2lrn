(() => {
  const player = document.getElementById('demo-player');
  const sample = document.querySelector('[data-sample]');
  const urlInput = document.querySelector('[data-package-url]');
  const loadButton = document.querySelector('[data-load]');
  const reloadButton = document.querySelector('[data-reload]');
  const clearButton = document.querySelector('[data-clear-log]');
  const pauseButton = document.querySelector('[data-pause-log]');
  const copyLogButton = document.querySelector('[data-copy-log]');
  const log = document.querySelector('[data-event-log]');
  const state = document.querySelector('[data-runtime-state]');
  const status = document.querySelector('[data-viewer-status]');
  const label = document.querySelector('[data-package-label]');
  const copyButton = document.querySelector('[data-copy-demo]');
  const menu = document.querySelector('[data-menu]');
  const nav = document.getElementById('nav');
  const fields = {
    package: document.querySelector('[data-inspect-package]'),
    format: document.querySelector('[data-inspect-format]'),
    version: document.querySelector('[data-inspect-version]'),
    integrity: document.querySelector('[data-inspect-integrity]'),
    transport: document.querySelector('[data-inspect-transport]'),
    entrypoints: document.querySelector('[data-inspect-entrypoints]'),
    profiles: document.querySelector('[data-inspect-profiles]'),
    renderer: document.querySelector('[data-inspect-renderer]'),
    entity: document.querySelector('[data-inspect-entity]'),
    representation: document.querySelector('[data-inspect-representation]'),
  };

  let paused = false;
  let records = [];
  const MAX_EVENTS = 200;
  const params = new URLSearchParams(location.search);
  const initialSrc = params.get('src');

  function normalizeSource(value) {
    const raw = String(value || '').trim();
    if (!raw) throw new Error('Introduce una URL de paquete.');
    let url;
    try { url = new URL(raw, location.href); }
    catch { throw new Error('La URL no es válida.'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Sólo se admiten URLs http/https.');
    return url.href;
  }

  if (initialSrc && urlInput) {
    try {
      const normalized = normalizeSource(initialSrc);
      urlInput.value = normalized;
      if (sample && [...sample.options].some((option) => new URL(option.value, location.href).href === normalized)) {
        sample.value = [...sample.options].find((option) => new URL(option.value, location.href).href === normalized)?.value || sample.value;
      }
    } catch {}
  }

  const renderLog = () => {
    log.textContent = records.map((item) => '[' + item.time + '] ' + item.name + item.suffix).join('\n') || '[viewer] sin eventos';
    log.scrollTop = log.scrollHeight;
  };

  const write = (name, detail) => {
    if (paused) return;
    let suffix = '';
    if (detail !== undefined) {
      try { suffix = ' ' + JSON.stringify(detail, null, 2); }
      catch { suffix = ' ' + String(detail); }
    }
    records.push({time:new Date().toLocaleTimeString(), name, suffix});
    if (records.length > MAX_EVENTS) records = records.slice(-MAX_EVENTS);
    renderLog();
  };

  const setState = (value, text) => {
    state.textContent = value;
    state.dataset.state = value.toLowerCase();
    if (status) status.textContent = text || value;
  };

  const setField = (key, value) => {
    if (fields[key]) fields[key].textContent = value == null || value === '' ? '—' : String(value);
  };

  async function inspect(src) {
    setField('integrity', 'verificando…');
    try {
      const api = await window.P2LRNReady;
      const pkg = await api.openPackageURL(src);
      const manifest = pkg.manifest || {};
      setField('package', manifest.packageId || src.split('/').filter(Boolean).at(-1));
      setField('format', manifest.format || '—');
      setField('version', manifest.formatVersion || '—');
      setField('integrity', manifest.integrity?.contentRoot ? 'verificada' : 'sin contentRoot');
      setField('transport', pkg.verification?.transport || '—');
      setField('entrypoints', Array.isArray(manifest.entrypoints) ? manifest.entrypoints.length : 0);
      setField('profiles', Array.isArray(manifest.profiles) ? manifest.profiles.map((profile) => profile.id).join(' · ') : '—');
      write('inspect', {
        packageId: manifest.packageId,
        format: manifest.format,
        formatVersion: manifest.formatVersion,
        contentRoot: manifest.integrity?.contentRoot,
        transport: pkg.verification?.transport,
        profiles: manifest.profiles?.map((profile) => profile.id),
      });
    } catch (error) {
      setField('integrity', 'error');
      write('inspect-error', {message:error?.message || String(error)});
      throw error;
    }
  }

  const load = async () => {
    let value;
    try { value = normalizeSource(urlInput.value); }
    catch (error) {
      setState('ERROR', error.message);
      write('url-error', {message:error.message});
      return;
    }
    urlInput.value = value;
    setState('LOADING', 'Cargando paquete');
    label.textContent = new URL(value).pathname.split('/').filter(Boolean).at(-1) || value;
    setField('renderer', '—'); setField('entity', '—'); setField('representation', '—');
    write('load', {src:value});
    try {
      await inspect(value);
      player.setAttribute('src', value);
      const next = new URL(location.href);
      next.searchParams.set('src', value);
      history.replaceState(null, '', next);
    } catch (error) {
      setState('ERROR', 'No se pudo inspeccionar el paquete');
    }
  };

  if (sample && urlInput) {
    sample.addEventListener('change', () => {
      urlInput.value = new URL(sample.value, location.href).href;
      void load();
    });
  }
  loadButton?.addEventListener('click', () => void load());
  urlInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); void load(); }
  });
  reloadButton?.addEventListener('click', () => {
    setState('LOADING', 'Recargando');
    write('reload');
    if (typeof player.reload === 'function') void player.reload();
    else player.setAttribute('src', player.getAttribute('src') || '');
  });
  clearButton?.addEventListener('click', () => { records = []; renderLog(); });
  pauseButton?.addEventListener('click', () => {
    paused = !paused;
    pauseButton.textContent = paused ? 'Reanudar' : 'Pausar';
  });
  copyLogButton?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(log.textContent || '');
      const before = copyLogButton.textContent;
      copyLogButton.textContent = 'Copiado';
      setTimeout(() => { copyLogButton.textContent = before; }, 1200);
    } catch {}
  });

  const events = [
    'p2lrn:ready',
    'p2lrn:rendered',
    'p2lrn:score',
    'p2lrn:statechange',
    'p2lrn:complete',
    'p2lrn:progressionchange',
    'p2lrn:error',
  ];
  for (const name of events) {
    player.addEventListener(name, (event) => {
      write(name, event.detail);
      if (name === 'p2lrn:ready') setState('READY', 'Player preparado');
      if (name === 'p2lrn:rendered') {
        setState('RENDERED', 'Contenido renderizado');
        setField('renderer', event.detail?.rendererId);
        setField('entity', event.detail?.entityId || event.detail?.context?.entityId);
        setField('representation', event.detail?.representationId);
      }
      if (name === 'p2lrn:error') setState('ERROR', 'Error de reproducción');
    });
  }

  async function boot() {
    try {
      await window.P2LRNReady;
      write('runtime', {status:'registered', version:globalThis.P2LRN?.version});
      if (globalThis.P2LRN?.installServiceWorker) {
        setState('BRIDGE', 'Preparando recursos verificados');
        const pageBridge = await globalThis.P2LRN.installServiceWorker({url:'/p2lrn-sw.js', scope:'/'});
        const bridge = await globalThis.P2LRN.installServiceWorker({url:'/p2lrn-sw.js', scope:'/__p2lrn__/'});
        write('virtual-resource-bridge', {
          status:'ready',
          pageScope:pageBridge?.scope ?? '/',
          resourceScope:bridge?.scope ?? '/__p2lrn__/',
          controlled:Boolean(navigator.serviceWorker.controller),
        });
      }
      if (!initialSrc && urlInput) urlInput.value = new URL(urlInput.value, location.href).href;
      await load();
    } catch (error) {
      write('boot-error', {message:error?.message || String(error)});
      setState('ERROR', 'Error preparando el visor');
    }
  }
  void boot();

  copyButton?.addEventListener('click', async () => {
    const code = copyButton.closest('.codebox')?.querySelector('code')?.innerText || '';
    try {
      await navigator.clipboard.writeText(code);
      const before = copyButton.textContent;
      copyButton.textContent = 'Copiado';
      setTimeout(() => { copyButton.textContent = before; }, 1200);
    } catch {}
  });

  const closeMenu = () => {
    nav?.classList.remove('is-open');
    menu?.setAttribute('aria-expanded', 'false');
    if (menu) menu.textContent = 'Menú';
  };
  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', String(open));
      menu.textContent = open ? 'Cerrar' : 'Menú';
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
  }
})();