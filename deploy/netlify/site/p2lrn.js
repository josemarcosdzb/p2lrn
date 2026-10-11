(() => {
  const SUPABASE_URL = 'https://yurtnmtesugykrqtujdx.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cmC0leUeJtwzXrZb7nUn1Q_xdYoAKfH';

  const GLOBAL_NAV = [
    {
      label: 'Documentación',
      active: ['/docs/','/docs/empezar/','/docs/que-usar/','/docs/conceptos/','/docs/recetas/','/docs/glosario/','/docs/referencia/','/docs/troubleshooting/'],
      items: [
        ['/docs/','Inicio de documentación'],
        ['/docs/empezar/','Quickstart'],
        ['/docs/que-usar/','¿Qué pieza uso?'],
        ['/docs/conceptos/','Conceptos'],
        ['/docs/recetas/','Recetas'],
        ['/docs/glosario/','Glosario'],
        ['/docs/referencia/','Referencia'],
        ['/docs/troubleshooting/','Troubleshooting'],
      ],
    },
    {
      label: 'Formato',
      active: ['/docs/formato/','/docs/paquetes/*','/docs/progresion/'],
      items: [
        ['/docs/formato/','Formato P2LRN'],
        ['/docs/paquetes/','Crear paquetes'],
        ['/docs/progresion/','Progresión'],
        ['/docs/paquetes/multipart/','Multipart'],
      ],
    },
    {
      label: 'Player',
      active: ['/docs/player/','/demo/','/docs/ejemplos/'],
      items: [
        ['/docs/player/','Player web'],
        ['/demo/','Visor real'],
        ['/docs/ejemplos/','Ejemplos'],
      ],
    },
    {label:'Studio',href:'/studio/',active:['/studio/']},
    {
      label: 'Toolkit',
      active: ['/docs/toolkit/','/docs/cli/'],
      items: [
        ['/docs/toolkit/','Toolkit'],
        ['/docs/cli/','CLI'],
      ],
    },
    {
      label: 'Juegos',
      active: ['/docs/questionnaires/*','/docs/juegos-3d/'],
      wide: true,
      items: [
        ['/docs/questionnaires/','Cuestionarios y juegos'],
        ['/docs/questionnaires/standard/','Cuestionario estándar'],
        ['/docs/questionnaires/memory/','Memoria'],
        ['/docs/questionnaires/matching/','Relacionar'],
        ['/docs/questionnaires/ordering/','Ordenar'],
        ['/docs/questionnaires/classification/','Clasificar'],
        ['/docs/questionnaires/true-false/','Verdadero / Falso'],
        ['/docs/questionnaires/word-search/','Sopa de letras'],
        ['/docs/questionnaires/crossword/','Crucigrama'],
        ['/docs/questionnaires/rosco/','Rosco'],
        ['/docs/questionnaires/3d/','Juego 3D'],
        ['/docs/juegos-3d/','Arquitectura 3D'],
      ],
    },
    {
      label: 'Integración',
      active: ['/docs/integracion/','/docs/eventos/','/docs/compatibilidad/'],
      items: [
        ['/docs/integracion/','Integración real'],
        ['/docs/eventos/','Eventos'],
        ['/docs/compatibilidad/','Compatibilidad'],
      ],
    },
  ];

  const normalizePath = (value) => {
    const pathname = String(value || '/').split(/[?#]/, 1)[0].replace(/\/index\.html$/u, '/');
    return pathname.endsWith('/') ? pathname : pathname + '/';
  };

  const renderGlobalNavigation = () => {
    const header = document.querySelector('.site-header');
    if (!header) return;
    let nav = header.querySelector('.nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'nav';
      header.querySelector('.brand')?.after(nav);
    }
    nav.id = 'nav';
    nav.setAttribute('aria-label','Navegación principal');
    const current = normalizePath(window.location.pathname);
    const fragment = document.createDocumentFragment();

    for (const entry of GLOBAL_NAV) {
      const active = (entry.active || []).some((path) => path.endsWith('*') ? current.startsWith(normalizePath(path.slice(0,-1))) : current === normalizePath(path));
      if (entry.href) {
        const link = document.createElement('a');
        link.className = 'nav-direct';
        link.href = entry.href;
        link.textContent = entry.label;
        if (active) link.setAttribute('aria-current','page');
        fragment.append(link);
        continue;
      }
      const group = document.createElement('details');
      group.className = 'nav-group' + (entry.wide ? ' nav-group-wide' : '');
      if (active) group.classList.add('is-active');
      const summary = document.createElement('summary');
      summary.innerHTML = '<span></span><i aria-hidden="true">⌄</i>';
      summary.querySelector('span').textContent = entry.label;
      summary.setAttribute('aria-label',entry.label);
      const dropdown = document.createElement('div');
      dropdown.className = 'nav-dropdown';
      for (const [href,label] of entry.items) {
        const link = document.createElement('a');
        link.href = href;
        link.textContent = label;
        if (current === normalizePath(href)) link.setAttribute('aria-current','page');
        dropdown.append(link);
      }
      group.append(summary,dropdown);
      fragment.append(group);
    }
    nav.replaceChildren(fragment);

    let menuButton = header.querySelector('[data-menu]');
    if (!menuButton) {
      menuButton = document.createElement('button');
      menuButton.className = 'menu';
      menuButton.type = 'button';
      menuButton.dataset.menu = '';
      menuButton.textContent = 'Menú';
      header.append(menuButton);
    }
    menuButton.setAttribute('aria-controls','nav');
    menuButton.setAttribute('aria-expanded','false');

    const hoverCapable = window.matchMedia?.('(hover:hover) and (pointer:fine)').matches;
    nav.querySelectorAll('.nav-group').forEach((group) => {
      if (hoverCapable) {
        group.addEventListener('pointerenter',()=>{group.open=true;});
        group.addEventListener('pointerleave',()=>{group.open=false;});
      }
    });
    document.addEventListener('click',(event)=>{
      if (event.target.closest('.nav-group')) return;
      nav.querySelectorAll('.nav-group[open]').forEach((group)=>{group.open=false;});
    });
  };

  renderGlobalNavigation();

  const menu = document.querySelector('[data-menu]');
  const nav = document.getElementById('nav');

  const closeMenu = () => {
    if (!menu || !nav) return;
    nav.classList.remove('is-open');
    menu.setAttribute('aria-expanded', 'false');
    menu.textContent = 'Menú';
  };

  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', String(open));
      menu.textContent = open ? 'Cerrar' : 'Menú';
    });
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        nav.querySelectorAll('.nav-group[open]').forEach((group)=>{group.open=false;});
        closeMenu();
        menu.focus();
      }
    });
  }

  const announce = (() => {
    const node = document.createElement('span');
    node.className = 'sr-only';
    node.setAttribute('aria-live', 'polite');
    document.body.append(node);
    return (message) => { node.textContent = ''; requestAnimationFrame(() => { node.textContent = message; }); };
  })();

  const copied = (button) => {
    const previous = button.textContent;
    button.textContent = 'Copiado';
    announce('Código copiado al portapapeles');
    window.setTimeout(() => { button.textContent = previous; }, 1200);
  };

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.closest('.codebox')?.querySelector('code')?.innerText || '';
      try { await navigator.clipboard.writeText(code); copied(button); } catch { announce('No se pudo copiar el código'); }
    });
  });

  document.querySelectorAll('[data-copy-inline]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.parentElement?.querySelector('code')?.innerText || '';
      try { await navigator.clipboard.writeText(code); copied(button); } catch { announce('No se pudo copiar el código'); }
    });
  });

  const GLOBAL_SIDEBAR = [
    ['EMPEZAR', [
      ['/docs/','Overview'],
      ['/docs/empezar/','Quickstart'],
      ['/docs/que-usar/','¿Qué uso?'],
      ['/docs/conceptos/','Conceptos'],
    ]],
    ['CREAR', [
      ['/docs/formato/','Formato'],
      ['/docs/paquetes/','Crear paquetes'],
      ['/docs/progresion/','Progresión'],
      ['/docs/paquetes/multipart/','Multipart'],
      ['/docs/toolkit/','Toolkit'],
      ['/docs/cli/','CLI'],
    ]],
    ['REPRODUCIR', [
      ['/docs/player/','Player'],
      ['/docs/questionnaires/','Cuestionarios y juegos'],
      ['/docs/juegos-3d/','Juegos 3D'],
      ['/docs/ejemplos/','Ejemplos'],
    ]],
    ['INTEGRAR', [
      ['/docs/integracion/','Integración real'],
      ['/docs/eventos/','Eventos'],
      ['/docs/compatibilidad/','Compatibilidad'],
    ]],
    ['REFERENCIA', [
      ['/docs/recetas/','Recetas'],
      ['/docs/glosario/','Glosario'],
      ['/docs/referencia/','Referencia'],
      ['/docs/troubleshooting/','Troubleshooting'],
    ]],
    ['RECURSOS', [
      ['/studio/','Studio ↗'],
      ['/demo/','Visor real ↗'],
      ['/examples/catalog.json','Catálogo de ejemplos ↗'],
      ['/index.json','Índice CDN ↗'],
      ['/health.json','Estado del build ↗'],
    ]],
  ];

  const sidebar = document.querySelector('.doc-sidebar');
  if (sidebar) {
    const current = normalizePath(window.location.pathname);
    const fragment = document.createDocumentFragment();
    for (const [section,items] of GLOBAL_SIDEBAR) {
      const label=document.createElement('span');
      label.textContent=section;
      fragment.append(label);
      for (const [href,textValue] of items) {
        const a=document.createElement('a');
        a.href=href;
        a.textContent=textValue;
        if (current===normalizePath(href) || (href==='/docs/questionnaires/' && current.startsWith(normalizePath(href)))) a.setAttribute('aria-current','page');
        fragment.append(a);
      }
    }
    sidebar.replaceChildren(fragment);
  }
  if (sidebar) {
    const search = document.createElement('div');
    search.className = 'docs-search';
    search.innerHTML = '<label for="docs-search-input">Buscar en docs</label><input id="docs-search-input" type="search" placeholder="multipart, addQuestionnaire…" autocomplete="off"><div class="docs-search-results" hidden></div>';
    sidebar.prepend(search);
    const input = search.querySelector('input');
    const results = search.querySelector('.docs-search-results');
    let index = null;
    const ensureIndex = async () => {
      if (index) return index;
      const response = await fetch('/search-index.json', {cache:'no-store'});
      if (!response.ok) throw new Error('search-index');
      index = await response.json();
      return index;
    };
    input.addEventListener('input', async () => {
      const query = input.value.trim().toLocaleLowerCase('es');
      if (query.length < 2) { results.hidden = true; results.replaceChildren(); return; }
      try {
        const docs = await ensureIndex();
        const matches = docs.filter((item) => item.search.includes(query)).slice(0, 8);
        results.replaceChildren(...matches.map((item) => {
          const a = document.createElement('a');
          a.href = item.url;
          a.innerHTML = '<strong></strong><span></span>';
          a.querySelector('strong').textContent = item.title;
          a.querySelector('span').textContent = item.section || item.description || '';
          return a;
        }));
        results.hidden = matches.length === 0;
      } catch {
        results.hidden = true;
      }
    });
  }


  document.querySelectorAll('[data-contact-form]').forEach((form) => {
    const status = form.querySelector('[data-form-status]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (form.elements.company?.value) return;

      const now = Date.now();
      const last = Number(localStorage.getItem('p2lrn-contact-last') || 0);
      if (now - last < 30000) {
        if (status) status.textContent = 'Espera unos segundos antes de enviar otro mensaje.';
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      const payload = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        subject: form.elements.subject.value.trim(),
        message: form.elements.message.value.trim(),
        page: window.location.pathname,
      };

      if (button) button.disabled = true;
      if (status) status.textContent = 'Enviando…';

      try {
        const response = await fetch(SUPABASE_URL + '/rest/v1/contact_messages', {
          method: 'POST',
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('contact_failed');
        localStorage.setItem('p2lrn-contact-last', String(now));
        form.reset();
        if (status) status.textContent = 'Mensaje enviado. Gracias por contactar.';
      } catch {
        if (status) status.textContent = 'No se pudo enviar el mensaje. Inténtalo de nuevo.';
      } finally {
        if (button) button.disabled = false;
      }
    });
  });

  Promise.all([
    fetch('/health.json', {cache:'no-store'}).then((r) => r.ok ? r.json() : Promise.reject()),
    fetch('/index.json', {cache:'no-store'}).then((r) => r.ok ? r.json() : Promise.reject()),
    fetch('/player/current/dist/release.json', {cache:'no-store'}).then((r) => r.ok ? r.json() : Promise.reject()),
  ]).then(([health,index,release]) => {
    const version = release.webSdkVersion || health.playerVersion || index?.player?.version;
    if (version) document.querySelectorAll('[data-player-version],[data-footer-version]').forEach((n) => n.textContent = version);
    const node = document.querySelector('[data-health]');
    if (node) node.textContent = health.ok && release.webSdkVersion === version ? 'Build CDN verificado' : 'Build CDN';
  }).catch(() => {});
})();