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
    const hoverOpenTimers = new WeakMap();
    const hoverCloseTimers = new WeakMap();
    const clearHoverOpen = (group) => {
      const timer=hoverOpenTimers.get(group);
      if (timer) window.clearTimeout(timer);
      hoverOpenTimers.delete(group);
    };
    const clearHoverClose = (group) => {
      const timer=hoverCloseTimers.get(group);
      if (timer) window.clearTimeout(timer);
      hoverCloseTimers.delete(group);
    };
    const openHoverGroup = (currentGroup) => {
      nav.querySelectorAll('.nav-group[open]').forEach((group)=>{
        if (group!==currentGroup) {
          clearHoverOpen(group);
          clearHoverClose(group);
          group.open=false;
        }
      });
      currentGroup.open=true;
    };
    nav.querySelectorAll('.nav-group').forEach((group) => {
      if (hoverCapable) {
        group.addEventListener('pointerenter',()=>{
          clearHoverOpen(group);
          clearHoverClose(group);
          if (group.open) return;
          const anotherOpen=[...nav.querySelectorAll('.nav-group[open]')].some((item)=>item!==group);
          if (!anotherOpen) {
            openHoverGroup(group);
            return;
          }
          hoverOpenTimers.set(group,window.setTimeout(()=>{
            hoverOpenTimers.delete(group);
            openHoverGroup(group);
          },140));
        });
        group.addEventListener('pointerleave',()=>{
          clearHoverOpen(group);
          if (!group.open) return;
          clearHoverClose(group);
          hoverCloseTimers.set(group,window.setTimeout(()=>{
            hoverCloseTimers.delete(group);
            group.open=false;
          },240));
        });
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
      ['/docs/empezar-facil/','Empezar fácil'],
    ]],
    ['INSTALAR', [
      ['/docs/instalar/','Instalación'],
      ['/docs/cdn/','CDN'],
      ['/docs/cdn/studio/','Studio mediante CDN'],
      ['/docs/npm/','NPM'],
      ['/docs/npm/studio/','Studio con NPM'],
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
    const docMain=docArticle.closest('.doc-main');
    const legacyToc=docArticle.querySelector('.doc-toc');
    legacyToc?.remove();
    if (headings.length >= 2 && docMain && !docMain.querySelector('.doc-page-toc')) {
      const aside=document.createElement('aside');
      aside.className='doc-page-toc';
      aside.setAttribute('aria-label','En esta página');

      const toggle=document.createElement('button');
      toggle.type='button';
      toggle.className='doc-page-toc-toggle';
      toggle.setAttribute('aria-expanded','false');
      toggle.innerHTML='<span>En esta página</span><strong></strong>';
      toggle.querySelector('strong').textContent=headings[0]?.textContent || '';

      const nav=document.createElement('nav');
      nav.className='doc-page-toc-nav';
      nav.setAttribute('aria-label','En esta página');
      const title=document.createElement('strong');
      title.textContent='En esta página';
      const list=document.createElement('ol');
      const links=[];

      headings.forEach((heading,index)=>{
        const li=document.createElement('li');
        const a=document.createElement('a');
        a.href='#'+heading.id;
        a.textContent=heading.textContent;
        a.dataset.targetId=heading.id;
        if (index===0) a.setAttribute('aria-current','location');
        li.append(a);
        list.append(li);
        links.push(a);
      });

      nav.append(title,list);
      aside.append(toggle,nav);
      docArticle.after(aside);

      const setActive=(heading)=>{
        if (!heading) return;
        links.forEach((link)=>{
          const active=link.dataset.targetId===heading.id;
          if (active) link.setAttribute('aria-current','location');
          else link.removeAttribute('aria-current');
        });
        toggle.querySelector('strong').textContent=heading.textContent;
      };

      let frame=0;
      const syncActive=()=>{
        frame=0;
        const line=Math.max(104,window.innerHeight*.2);
        let active=headings[0];
        for (const heading of headings) {
          if (heading.getBoundingClientRect().top<=line) active=heading;
          else break;
        }
        setActive(active);
      };
      const requestSync=()=>{
        if (frame) return;
        frame=requestAnimationFrame(syncActive);
      };

      window.addEventListener('scroll',requestSync,{passive:true});
      window.addEventListener('resize',requestSync,{passive:true});
      links.forEach((link)=>link.addEventListener('click',()=>{
        const target=document.getElementById(link.dataset.targetId);
        if (target) setActive(target);
        if (window.matchMedia('(max-width: 1180px)').matches) {
          aside.classList.remove('is-open');
          toggle.setAttribute('aria-expanded','false');
        }
      }));

      const setTocOpen=(open)=>{
        aside.classList.toggle('is-open',open);
        toggle.setAttribute('aria-expanded',String(open));
      };
      toggle.addEventListener('click',()=>setTocOpen(!aside.classList.contains('is-open')));
      document.addEventListener('keydown',(event)=>{
        if (event.key==='Escape' && aside.classList.contains('is-open')) {
          setTocOpen(false);
          toggle.focus();
        }
      });
      const desktop=window.matchMedia('(min-width: 1181px)');
      const syncMode=()=>{
        if (desktop.matches) setTocOpen(false);
      };
      desktop.addEventListener?.('change',syncMode);
      syncMode();
      syncActive();
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



// P2LRN homepage media carousel
(()=>{
  const root=document.querySelector('[data-hero-carousel-root]');
  if(!root)return;
  const slides=[...root.querySelectorAll('[data-hero-slide]')];
  const viewport=root.querySelector('[data-hero-viewport]');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let index=Math.min(2,slides.length-1);
  let locked=false;
  let unlockTimer=null;
  let startX=null;

  slides.forEach(slide=>{
    slide.querySelectorAll('img').forEach(img=>{img.draggable=false});
  });
  root.addEventListener('dragstart',event=>event.preventDefault());
  root.addEventListener('selectstart',event=>event.preventDefault());

  const normalizeDistance=(value)=>{
    const n=slides.length;
    let d=value;
    while(d>n/2)d-=n;
    while(d<-n/2)d+=n;
    return d;
  };
  const slotFor=(d)=>{
    if(d===0)return 'center';
    if(d===-1)return 'left1';
    if(d===1)return 'right1';
    if(d===-2)return 'left2';
    if(d===2)return 'right2';
    return d<0?'left3':'right3';
  };
  const syncVideo=()=>{
    slides.forEach((slide,i)=>{
      const video=slide.querySelector('video');
      if(!video)return;
      const centered=i===index;
      video.controls=centered;
      if(!centered){
        video.pause();
        try{video.currentTime=0}catch{}
      }
    });
  };
  const render=()=>{
    slides.forEach((slide,i)=>{
      const slot=slotFor(normalizeDistance(i-index));
      slide.dataset.slot=slot;
      slide.classList.toggle('is-active',slot==='center');
      slide.setAttribute('aria-hidden','false');
      slide.style.pointerEvents='auto';
    });
    syncVideo();
  };
  const unlock=()=>{
    locked=false;
    root.classList.remove('is-moving');
    slides.forEach(s=>s.classList.remove('is-moving'));
  };
  const goTo=(targetIndex)=>{
    if(locked||targetIndex===index)return;
    locked=true;
    root.classList.add('is-moving');
    slides.forEach(s=>s.classList.add('is-moving'));
    index=(targetIndex+slides.length)%slides.length;
    render();
    if(unlockTimer)clearTimeout(unlockTimer);
    unlockTimer=setTimeout(unlock,reduce?40:620);
  };
  const move=(direction)=>{
    if(!direction)return;
    goTo(index+direction);
  };

  slides.forEach((slide,i)=>{
    slide.addEventListener('click',(event)=>{
      if(locked||i===index)return;
      goTo(i);
    });
  });

  root.addEventListener('keydown',(event)=>{
    if(event.key==='ArrowLeft'){event.preventDefault();move(-1)}
    if(event.key==='ArrowRight'){event.preventDefault();move(1)}
  });

  viewport?.addEventListener('pointerdown',(event)=>{
    if(locked)return;
    startX=event.clientX;
  });
  viewport?.addEventListener('pointerup',(event)=>{
    if(startX===null||locked)return;
    const delta=event.clientX-startX;
    startX=null;
    if(Math.abs(delta)>48)move(delta<0?1:-1);
  });
  viewport?.addEventListener('pointercancel',()=>{startX=null});

  root.tabIndex=0;
  render();
})();


// Scroll reveal for the integrated-formats section
(()=>{
  const items=[...document.querySelectorAll('[data-scroll-reveal] .reveal-item')];
  if(!items.length)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce||!('IntersectionObserver' in window)){
    items.forEach(item=>item.classList.add('is-visible'));
    return;
  }

  const bridgeBottomMargin=(item)=>{
    if(!item.closest('.platform-bridge'))return 18;
    const order=Number.parseInt(getComputedStyle(item).getPropertyValue('--reveal-order'),10)||0;
    if(order<=1)return 18;
    if(order===2)return 28;
    if(order===3)return 60;
    return 30;
  };

  items.forEach(item=>{
    const bottom=bridgeBottomMargin(item);
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        entry.target.classList.toggle('is-visible',entry.isIntersecting);
      });
    },{
      threshold:.01,
      rootMargin:'-7% 0px -'+bottom+'% 0px'
    });
    observer.observe(item);
  });
})();
