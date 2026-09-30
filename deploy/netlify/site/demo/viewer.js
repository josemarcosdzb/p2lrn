(() => {
  const player = document.getElementById('demo-player');
  const sample = document.querySelector('[data-sample]');
  const urlInput = document.querySelector('[data-package-url]');
  const loadButton = document.querySelector('[data-load]');
  const reloadButton = document.querySelector('[data-reload]');
  const clearButton = document.querySelector('[data-clear-log]');
  const log = document.querySelector('[data-event-log]');
  const state = document.querySelector('[data-runtime-state]');
  const status = document.querySelector('[data-viewer-status]');
  const label = document.querySelector('[data-package-label]');
  const copyButton = document.querySelector('[data-copy-demo]');
  const menu = document.querySelector('[data-menu]');
  const nav = document.getElementById('nav');

  const write = (name, detail) => {
    const time = new Date().toLocaleTimeString();
    let suffix = '';
    if (detail !== undefined) {
      try { suffix = ' ' + JSON.stringify(detail, null, 2); }
      catch { suffix = ' ' + String(detail); }
    }
    log.textContent += '\n[' + time + '] ' + name + suffix;
    log.scrollTop = log.scrollHeight;
  };

  const setState = (value, text) => {
    state.textContent = value;
    state.dataset.state = value.toLowerCase();
    if (status) status.textContent = text || value;
  };

  const load = () => {
    const value = urlInput.value.trim();
    if (!value) return;
    setState('LOADING', 'Cargando paquete');
    label.textContent = value.split('/').filter(Boolean).at(-1) || value;
    write('load', {src:value});
    player.setAttribute('src', value);
  };

  if (sample && urlInput) {
    sample.addEventListener('change', () => {
      urlInput.value = sample.value;
      load();
    });
  }
  loadButton?.addEventListener('click', load);
  urlInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      load();
    }
  });
  reloadButton?.addEventListener('click', () => {
    setState('LOADING', 'Recargando');
    write('reload');
    if (typeof player.reload === 'function') player.reload();
    else player.setAttribute('src', player.getAttribute('src') || '');
  });
  clearButton?.addEventListener('click', () => {
    log.textContent = '[viewer] log limpiado';
  });

  const events = [
    'p2lrn:ready',
    'p2lrn:rendered',
    'p2lrn:activity',
    'p2lrn:progress',
    'p2lrn:state',
    'p2lrn:score',
    'p2lrn:completion',
    'p2lrn:error',
  ];
  for (const name of events) {
    player.addEventListener(name, (event) => {
      write(name, event.detail);
      if (name === 'p2lrn:ready') setState('READY', 'Player preparado');
      if (name === 'p2lrn:rendered') setState('RENDERED', 'Contenido renderizado');
      if (name === 'p2lrn:error') setState('ERROR', 'Error de reproducción');
    });
  }

  window.P2LRNReady?.then?.(() => {
    write('runtime', {status:'registered'});
    if (state.textContent === 'LOADING') setState('PLAYER', 'Runtime registrado');
  }).catch?.((error) => {
    write('runtime-error', {message:error?.message || String(error)});
    setState('ERROR', 'Error de runtime');
  });

  copyButton?.addEventListener('click', async () => {
    const code = copyButton.closest('.codebox')?.querySelector('code')?.innerText || '';
    try {
      await navigator.clipboard.writeText(code);
      const before = copyButton.textContent;
      copyButton.textContent = 'Copiado';
      setTimeout(() => { copyButton.textContent = before; }, 1200);
    } catch {}
  });

  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', String(open));
      menu.textContent = open ? 'Cerrar' : 'Menú';
    });
  }
})();
