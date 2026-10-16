(() => {
  const SUPABASE_URL = 'https://yurtnmtesugykrqtujdx.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cmC0leUeJtwzXrZb7nUn1Q_xdYoAKfH';

  const GLOBAL_NAV = [
    {
      label: 'Documentación',
      active: ['/docs/','/docs/empezar/','/docs/que-usar/','/docs/conceptos/','/docs/formato/'],
      items: [
        ['/docs/','Inicio'],
        ['/docs/empezar/','Antes de empezar'],
        ['/docs/que-usar/','Mapa de componentes'],
        ['/docs/conceptos/','Conceptos'],
        ['/docs/formato/','Formato P2LRN'],
      ],
    },
    {
      label: 'Instalar',
      active: ['/docs/instalar/','/docs/npm/','/docs/npm/*','/docs/cdn/','/docs/cdn/*'],
      items: [
        ['/docs/instalar/','Elegir instalación'],
        ['/docs/npm/','NPM'],
        ['/docs/npm/studio/','Studio con NPM'],
        ['/docs/cdn/','CDN'],
        ['/docs/cdn/studio/','Studio mediante CDN'],
      ],
    },
    {
      label: 'Crear',
      active: ['/studio/','/docs/studio/','/docs/paquetes/*','/docs/toolkit/','/docs/cli/'],
      items: [
        ['/studio/','Abrir Studio'],
        ['/docs/studio/','Guía de Studio'],
        ['/docs/paquetes/','Crear paquetes'],
        ['/docs/paquetes/multipart/','Multipart'],
        ['/docs/toolkit/','Toolkit'],
        ['/docs/cli/','CLI'],
      ],
    },
    {
      label: 'Reproducir',
      active: ['/docs/player/','/demo/','/docs/questionnaires/*','/docs/juegos-3d/','/docs/ejemplos/'],
      wide: true,
      items: [
        ['/docs/player/','Player'],
        ['/demo/','Visor'],
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
        ['/docs/ejemplos/','Ejemplos'],
      ],
    },
    {
      label: 'Integrar',
      active: ['/docs/integracion/','/docs/eventos/'],
      items: [
        ['/docs/integracion/','Integración'],
        ['/docs/eventos/','Eventos'],
      ],
    },
    {
      label: 'Seguimiento',
      active: ['/docs/progresion/','/docs/metricas/'],
      items: [
        ['/docs/progresion/','Progresión'],
        ['/docs/metricas/','Métricas y analítica'],
      ],
    },
    {
      label: 'Referencia',
      active: ['/docs/compatibilidad/','/docs/recetas/','/docs/glosario/','/docs/referencia/','/docs/troubleshooting/'],
      items: [
        ['/docs/compatibilidad/','Compatibilidad'],
        ['/docs/recetas/','Recetas'],
        ['/docs/glosario/','Glosario'],
        ['/docs/referencia/','Referencia técnica'],
        ['/docs/troubleshooting/','Solución de problemas'],
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
      ['/docs/','Documentación'],
      ['/docs/empezar/','Antes de empezar'],
    ]],
    ['INSTALAR', [
      ['/docs/instalar/','Elegir instalación'],
      ['/docs/npm/','NPM'],
      ['/docs/npm/studio/','Studio con NPM'],
      ['/docs/cdn/','CDN'],
      ['/docs/cdn/studio/','Studio mediante CDN'],
    ]],
    ['CREAR', [
      ['/docs/studio/','Studio visual'],
      ['/docs/paquetes/','Crear paquetes'],
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
      ['/docs/integracion/','Integración'],
      ['/docs/eventos/','Eventos'],
    ]],
    ['SEGUIMIENTO', [
      ['/docs/progresion/','Progresión'],
      ['/docs/metricas/','Métricas y analítica'],
    ]],
    ['REFERENCIA', [
      ['/docs/compatibilidad/','Compatibilidad'],
      ['/docs/recetas/','Recetas'],
      ['/docs/glosario/','Glosario'],
      ['/docs/referencia/','Referencia técnica'],
      ['/docs/troubleshooting/','Solución de problemas'],
    ]],
    ['RECURSOS', [
      ['/studio/','Abrir Studio ↗'],
      ['/demo/','Visor ↗'],
      ['/examples/catalog.json','Catálogo de ejemplos ↗'],
      ['/index.json','Índice CDN ↗'],
      ['/health.json','Estado del CDN ↗'],
    ]],
  ];

  const DOC_SIDEBAR_CHILDREN = new Map([
    ['/docs/empezar/',[
      ['/docs/que-usar/','Mapa de componentes'],
      ['/docs/conceptos/','Conceptos fundamentales'],
      ['/docs/formato/','Formato P2LRN'],
    ]],
    ['/docs/questionnaires/',[
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
    ]],
  ]);

  const DOC_SECTION_LABELS = Object.freeze({
    EMPEZAR:'Empezar',
    INSTALAR:'Instalar',
    CREAR:'Crear',
    REPRODUCIR:'Reproducir',
    INTEGRAR:'Integrar',
    SEGUIMIENTO:'Seguimiento',
    REFERENCIA:'Referencia',
  });
  const DOC_BREADCRUMB_PARENTS = new Map([
    ['/docs/que-usar/',['/docs/empezar/','Antes de empezar']],
    ['/docs/conceptos/',['/docs/empezar/','Antes de empezar']],
    ['/docs/formato/',['/docs/empezar/','Antes de empezar']],
    ['/docs/npm/studio/',['/docs/npm/','NPM']],
    ['/docs/cdn/studio/',['/docs/cdn/','CDN']],
    ['/docs/paquetes/multipart/',['/docs/paquetes/','Crear paquetes']],
  ]);
  const sidebarLocation = (current) => {
    for (const [section,items] of GLOBAL_SIDEBAR) {
      for (const [href,label] of items) {
        const normalized=normalizePath(href);
        if (current===normalized) return {section,href,label};
        const children=DOC_SIDEBAR_CHILDREN.get(href) || [];
        if (children.some(([childHref])=>current===normalizePath(childHref))) {
          return {section,href,label,child:true};
        }
      }
    }
    return null;
  };

  const sidebar = document.querySelector('.doc-sidebar');
  if (sidebar) {
    const current = normalizePath(window.location.pathname);
    const fragment = document.createDocumentFragment();
    for (const [section,items] of GLOBAL_SIDEBAR) {
      const label=document.createElement('span');
      label.textContent=section;
      fragment.append(label);
      for (const [href,textValue] of items) {
        const normalized=normalizePath(href);
        const children=DOC_SIDEBAR_CHILDREN.get(href) || [];
        const currentChild=children.find(([childHref])=>current===normalizePath(childHref));
        const a=document.createElement('a');
        a.href=href;
        a.textContent=textValue;
        if (current===normalized) a.setAttribute('aria-current','page');
        else if (currentChild) a.setAttribute('aria-current','location');
        fragment.append(a);

        if (current===normalized || currentChild) {
          const childNav=document.createElement('nav');
          childNav.className='doc-child-subnav';
          childNav.setAttribute('aria-label',textValue);
          for (const [childHref,childLabel] of children) {
            const childLink=document.createElement('a');
            childLink.href=childHref;
            childLink.textContent=childLabel;
            if (current===normalizePath(childHref)) childLink.setAttribute('aria-current','page');
            childNav.append(childLink);
          }
          fragment.append(childNav);
        }
      }
    }
    sidebar.replaceChildren(fragment);
  }
  if (sidebar) {
    const search = document.createElement('div');
    search.className = 'docs-search';
    search.innerHTML = '<label for="docs-search-input">Buscar en docs</label><input id="docs-search-input" type="search" placeholder="NPM, CDN, Studio, multipart…" autocomplete="off"><div class="docs-search-results" hidden></div>';
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


  if (sidebar) {
    sidebar.id = 'docs-sidebar';
    const main = sidebar.closest('.doc-main');
    const currentLink = sidebar.querySelector('a[aria-current="page"]');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'docs-sidebar-toggle';
    toggle.setAttribute('aria-controls','docs-sidebar');
    toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML = '<span>Índice de documentación</span><strong></strong>';
    toggle.querySelector('strong').textContent = currentLink?.textContent || 'Abrir';
    main?.insertBefore(toggle, sidebar);
    const media = window.matchMedia('(min-width: 901px)');
    const syncToggleHeight = () => {
      main?.style.setProperty('--docs-index-toggle-height',toggle.offsetHeight+'px');
    };
    const revealCurrent = () => {
      const target=sidebar.querySelector('a[aria-current="page"]') || sidebar.querySelector('a[aria-current="location"]');
      if (!target) return;
      const targetTop=target.offsetTop;
      sidebar.scrollTop=Math.max(0,targetTop-Math.max(70,sidebar.clientHeight*.28));
    };
    const setOpen = (open) => {
      syncToggleHeight();
      sidebar.classList.toggle('is-open',open);
      toggle.setAttribute('aria-expanded',String(open));
      toggle.querySelector('span').textContent = open ? 'Cerrar índice' : 'Índice de documentación';
      if (open && !media.matches) requestAnimationFrame(revealCurrent);
    };
    toggle.addEventListener('click',()=>setOpen(!sidebar.classList.contains('is-open')));
    sidebar.addEventListener('click',(event)=>{
      if (!media.matches && event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown',(event)=>{
      if (event.key==='Escape' && !media.matches && sidebar.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    const syncSidebar = () => {
      if (media.matches) {
        sidebar.classList.remove('is-open');
        toggle.setAttribute('aria-expanded','false');
      } else {
        setOpen(false);
      }
    };
    media.addEventListener?.('change',syncSidebar);
    window.addEventListener('resize',()=>{
      if (!media.matches && sidebar.classList.contains('is-open')) syncToggleHeight();
    },{passive:true});
    syncSidebar();
  }

  const docArticle = document.querySelector('.doc-content');
  if (docArticle) {
    const headings = [...docArticle.querySelectorAll('.doc-section > h2')];
    const slugify = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    const used = new Set();
    headings.forEach((heading,index) => {
      if (heading.id) { used.add(heading.id); return; }
      const base = slugify(heading.textContent) || 'seccion-'+(index+1);
      let id=base,n=2; while(used.has(id))id=base+'-'+n++;
      used.add(id); heading.id=id;
    });

    const pageTitle = docArticle.querySelector('.doc-hero h1')?.textContent?.trim() || document.title.split('—')[0].trim() || 'Esta página';
    const mobileIndexCurrent=document.querySelector('.docs-sidebar-toggle strong');
    if (mobileIndexCurrent) {
      mobileIndexCurrent.textContent=pageTitle;
      mobileIndexCurrent.title=pageTitle;
    }
    const currentPath=normalizePath(window.location.pathname);
    if (currentPath!=='/docs/' && !docArticle.querySelector('.doc-breadcrumbs')) {
      const location=sidebarLocation(currentPath);
      const breadcrumb=document.createElement('nav');
      breadcrumb.className='doc-breadcrumbs';
      breadcrumb.setAttribute('aria-label','Migas de pan');
      const list=document.createElement('ol');
      const addLink=(href,label)=>{
        const li=document.createElement('li');
        const a=document.createElement('a');
        a.href=href;a.textContent=label;li.append(a);list.append(li);
      };
      const addText=(label,current=false)=>{
        const li=document.createElement('li');
        const span=document.createElement('span');
        span.textContent=label;
        if (current) span.setAttribute('aria-current','page');
        li.append(span);list.append(li);
      };
      addLink('/docs/','Documentación');
      if (location?.section && DOC_SECTION_LABELS[location.section]) addText(DOC_SECTION_LABELS[location.section]);
      const explicitParent=DOC_BREADCRUMB_PARENTS.get(currentPath);
      if (explicitParent) addLink(explicitParent[0],explicitParent[1]);
      else if (location?.href==='/docs/questionnaires/' && currentPath!==normalizePath(location.href)) addLink(location.href,location.label);
      addText(pageTitle,true);
      breadcrumb.append(list);
      docArticle.querySelector('.doc-hero')?.before(breadcrumb);
    }
    if (headings.length >= 5 && !docArticle.querySelector('.doc-toc')) {
      const toc=document.createElement('nav');
      toc.className='doc-toc';
      toc.setAttribute('aria-label','En esta página');
      const title=document.createElement('strong'); title.textContent='En esta página'; toc.append(title);
      const list=document.createElement('ol');
      headings.forEach((heading)=>{const li=document.createElement('li');const a=document.createElement('a');a.href='#'+heading.id;a.textContent=heading.textContent;li.append(a);list.append(li);});
      toc.append(list);
      docArticle.querySelector('.doc-hero')?.after(toc);
    }
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
    if (node) node.textContent = health.ok && release.webSdkVersion === version ? 'CDN disponible' : 'CDN';
  }).catch(() => {});
})();
