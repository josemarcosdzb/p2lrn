(() => {
  const SUPABASE_URL = 'https://yurtnmtesugykrqtujdx.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cmC0leUeJtwzXrZb7nUn1Q_xdYoAKfH';

  const removeInjectedNetlifyBranding = () => {
    const removeCandidate = (node) => {
      if (!(node instanceof Element)) return;
      const tag = node.tagName.toLowerCase();
      const id = String(node.id || '').toLowerCase();
      const cls = String(node.className || '').toLowerCase();
      const aria = String(node.getAttribute?.('aria-label') || '').toLowerCase();
      const title = String(node.getAttribute?.('title') || '').toLowerCase();
      const src = String(node.getAttribute?.('src') || '').toLowerCase();
      const marker = tag === 'netlify-toolbar' || id === 'netlify-toolbar' || node.hasAttribute?.('data-netlify-toolbar');
      const netlifyFrame = tag === 'iframe' && (title.includes('netlify') || src.includes('netlify'));
      const toolbarLike = (id.includes('netlify') || cls.includes('netlify') || aria.includes('netlify')) && (() => {
        const style = window.getComputedStyle(node);
        return style.position === 'fixed' || style.position === 'sticky';
      })();
      if (marker || netlifyFrame || toolbarLike) {
        node.remove();
        return;
      }
      const ownText = String(node.textContent || '').replace(/\s+/g,' ').trim();
      if (ownText === 'Powered by Netlify') {
        let target = node;
        for (let i=0;i<5 && target.parentElement;i++) {
          const parent = target.parentElement;
          const style = window.getComputedStyle(parent);
          const rect = parent.getBoundingClientRect();
          target = parent;
          if ((style.position === 'fixed' || style.position === 'sticky') && rect.width < 360 && rect.height < 140) break;
        }
        target.remove();
      }
    };
    document.querySelectorAll('netlify-toolbar,#netlify-toolbar,[data-netlify-toolbar],iframe,[aria-label*="Netlify" i],[id*="netlify" i],[class*="netlify" i]').forEach(removeCandidate);
    document.querySelectorAll('a,button,div,span').forEach((node) => {
      if (String(node.textContent || '').replace(/\s+/g,' ').trim() === 'Powered by Netlify') removeCandidate(node);
    });
  };

  removeInjectedNetlifyBranding();
  const netlifyBrandingObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        removeInjectedNetlifyBranding();
        return;
      }
    }
  });
  netlifyBrandingObserver.observe(document.documentElement,{childList:true,subtree:true});

  const cleanProductionChrome = () => {
    // Keep functional Studio controls; remove only obsolete decorative release metadata.
    document.querySelectorAll('.header-meta').forEach((node)=>{
      if(!node.querySelector('[data-functional-status]'))node.remove();
    });
    document.querySelectorAll('[data-footer-version],.site-release-label,.site-build-label').forEach((node)=>node.remove());
  };
  cleanProductionChrome();

  const PUBLIC_NAV = [
    { label: 'Studio', href: '/studio/', active: ['/studio/'] },
    {
      label: "Solutions",
      active: ['/crear-cursos-interactivos/','/juegos-educativos-3d/','/cursos-offline/'],
      items: [
        ['/crear-cursos-interactivos/',"Create interactive courses"],
        ['/juegos-educativos-3d/',"3D educational games"],
        ['/cursos-offline/',"Offline courses without an LMS"],
      ],
    },
    { label: 'Analytics', href: '/analytics/', active: ['/analytics/'] },
    { label: "AI Skills", href: '/skills/', active: ['/skills/'] },
    { label: "Documentation", href: '/docs/', active: ['/docs/'] },
    { label: "Contact", href: '/contacto/', active: ['/contacto/'] },
  ];

  const GLOBAL_NAV = [
    {
      label: "Documentation",
      active: ['/docs/','/docs/empezar/','/docs/que-usar/','/docs/conceptos/','/docs/formato/','/docs/formato-portable-cursos-interactivos/'],
      items: [
        ['/docs/',"Home"],
        ['/docs/empezar/',"Before you start"],
        ['/docs/que-usar/',"Component map"],
        ['/docs/conceptos/',"Concepts"],
        ['/docs/formato/',"P2LRN format"],
        ['/docs/formato-portable-cursos-interactivos/',"Portability guide"],
      ],
    },
    {
      label: "Install",
      active: ['/docs/instalar/','/docs/npm/','/docs/npm/*','/docs/cdn/','/docs/cdn/*'],
      items: [
        ['/docs/instalar/',"Choose an installation"],
        ['/docs/npm/','NPM'],
        ['/docs/npm/studio/',"Studio with npm"],
        ['/docs/cdn/','CDN'],
        ['/docs/cdn/studio/',"Studio via CDN"],
      ],
    },
    {
      label: "Create",
      active: ['/studio/','/crear-cursos-interactivos/','/cursos-offline/','/docs/studio/','/docs/entrega-offline/','/docs/paquetes/*','/docs/toolkit/','/docs/cli/'],
      items: [
        ['/studio/',"Open Studio"],
        ['/crear-cursos-interactivos/',"Create interactive courses"],
        ['/cursos-offline/',"Offline courses without an LMS"],
        ['/docs/studio/',"Studio guide"],
        ['/docs/entrega-offline/',"Offline delivery"],
        ['/docs/paquetes/',"Create packages"],
        ['/docs/paquetes/multipart/','Multipart'],
        ['/docs/toolkit/','Toolkit'],
        ['/docs/cli/','CLI'],
      ],
    },
    {
      label: "Play",
      active: ['/docs/player/','/demo/','/juegos-educativos-3d/','/docs/questionnaires/*','/docs/juegos-3d/','/docs/ejemplos/'],
      wide: true,
      items: [
        ['/docs/player/','Player'],
        ['/demo/',"Viewer"],
        ['/juegos-educativos-3d/',"3D educational games"],
        ['/docs/questionnaires/',"Quizzes and games"],
        ['/docs/questionnaires/standard/',"Standard questionnaire"],
        ['/docs/questionnaires/memory/',"Memory"],
        ['/docs/questionnaires/matching/',"Matching"],
        ['/docs/questionnaires/ordering/',"Ordering"],
        ['/docs/questionnaires/classification/',"Classification"],
        ['/docs/questionnaires/true-false/',"True / false"],
        ['/docs/questionnaires/word-search/',"Word search"],
        ['/docs/questionnaires/crossword/',"Crossword"],
        ['/docs/questionnaires/rosco/',"Word wheel"],
        ['/docs/questionnaires/3d/',"3D game"],
        ['/docs/juegos-3d/','Arquitectura 3D'],
        ['/docs/ejemplos/',"Examples"],
      ],
    },
    {
      label: 'Integrar',
      active: ['/docs/integracion/','/docs/colaboracion/','/docs/eventos/','/docs/conectores/*','/docs/skills/'],
      items: [
        ['/docs/integracion/',"Integration"],
        ['/docs/colaboracion/',"Collaboration"],
        ['/docs/eventos/',"Events"],
        ['/docs/conectores/',"Connectors: overview"],
        ['/docs/conectores/ia/',"AI connectors"],
        ['/docs/conectores/lms/',"LMS platforms"],
        ['/docs/conectores/lti/',"LTI 1.3"],
      ],
    },
    {
      label: 'Seguimiento',
      active: ['/docs/progresion/','/docs/metricas/'],
      items: [
        ['/docs/progresion/',"Progression"],
        ['/docs/metricas/',"Metrics and analytics"],
      ],
    },
    {
      label: 'Analytics',
      active: ['/docs/analytics/','/analytics/'],
      items: [
        ['/docs/analytics/',"Analytics guide"],
        ['/analytics/','Abrir Analytics'],
      ],
    },
    {
      label: "Reference",
      active: ['/docs/compatibilidad/','/docs/recetas/','/docs/glosario/','/docs/referencia/','/docs/troubleshooting/'],
      items: [
        ['/docs/compatibilidad/',"Compatibility"],
        ['/docs/recetas/',"Recipes"],
        ['/docs/glosario/',"Glossary"],
        ['/docs/referencia/',"Technical reference"],
        ['/docs/troubleshooting/',"Troubleshooting"],
      ],
    },
  ];

  const normalizePath = (value) => {
    // Route comparisons use the same logical path for both languages.
    // English pages keep their /en/ URL, while the navigation config remains
    // independent of the locale and therefore preserves active links/sidebars.
    let pathname = String(value || '/').split(/[?#]/, 1)[0].replace(/\/index\.html$/u, '/');
    if(/^en(?:-|$)/i.test(document.documentElement.lang||'')&&pathname.startsWith('/en/'))
      pathname=pathname.slice(3)||'/';
    return pathname.endsWith('/') ? pathname : pathname + '/';
  };

  // Every route still uses one canonical logic tree; only outbound page links
  // receive the /en prefix. Technical and downloadable paths remain shared.
  const siteHref=(href)=>{
    const value=String(href||'');
    if(!/^en(?:-|$)/i.test(document.documentElement.lang||'')||!value.startsWith('/')||value.startsWith('/en/'))return value;
    if(/^\/(?:assets|downloads|examples|player|api|_next|\.netlify)\//.test(value))return value;
    if(/^\/(?:p2lrn\.|favicon\.|apple-touch-icon\.|index\.json|robots\.txt|search-index\.json)/.test(value))return value;
    if(value.startsWith('/studio/runtime/')||value.startsWith('/analytics/current/'))return value;
    return '/en'+value;
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
    nav.setAttribute('aria-label',"Main navigation");
    const current = normalizePath(window.location.pathname);
    const fragment = document.createDocumentFragment();

    const navigationEntries = current.startsWith('/docs/') ? GLOBAL_NAV : PUBLIC_NAV;
    for (const entry of navigationEntries) {
      const active = (entry.active || []).some((path) => path.endsWith('*') ? current.startsWith(normalizePath(path.slice(0,-1))) : current === normalizePath(path));
      if (entry.href) {
        const link = document.createElement('a');
        link.className = 'nav-direct';
        link.href = siteHref(entry.href);
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
        link.href = siteHref(href);
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
      menuButton.textContent = "Menu";
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
    menu.textContent = "Menu";
  };

  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', String(open));
      menu.textContent = open ? "Close" : "Menu";
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
    button.textContent = "Copied";
    announce("Code copied to clipboard");
    window.setTimeout(() => { button.textContent = previous; }, 1200);
  };

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.closest('.codebox')?.querySelector('code')?.innerText || '';
      try { await navigator.clipboard.writeText(code); copied(button); } catch { announce("Could not copy the code"); }
    });
  });

  document.querySelectorAll('[data-copy-inline]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.parentElement?.querySelector('code')?.innerText || '';
      try { await navigator.clipboard.writeText(code); copied(button); } catch { announce("Could not copy the code"); }
    });
  });

  const GLOBAL_SIDEBAR = [
    ["GET STARTED", [
      ['/docs/',"Documentation"],
      ['/docs/empezar/',"Before you start"],
      ['/docs/empezar-facil/',"Quick start"],
    ]],
    ["INSTALL", [
      ['/docs/instalar/',"Installation"],
      ['/docs/cdn/','CDN'],
      ['/docs/cdn/studio/',"Studio via CDN"],
      ['/docs/npm/','NPM'],
      ['/docs/npm/studio/',"Studio with npm"],
    ]],
    ["CREATE", [
      ['/docs/studio/',"Visual Studio editor"],
      ['/docs/entrega-offline/',"Offline delivery"],
      ['/docs/paquetes/',"Create packages"],
      ['/docs/paquetes/multipart/','Multipart'],
      ['/docs/toolkit/','Toolkit'],
      ['/docs/cli/','CLI'],
    ]],
    ['REPRODUCIR', [
      ['/docs/player/','Player'],
      ['/docs/questionnaires/',"Quizzes and games"],
      ['/docs/juegos-3d/',"3D games"],
      ['/docs/ejemplos/',"Examples"],
    ]],
    ['INTEGRAR', [
      ['/docs/integracion/',"Integration"],
      ['/docs/colaboracion/',"Collaboration"],
      ['/docs/eventos/',"Events"],
    ]],
    ["CONNECTORS", [
      ['/docs/conectores/',"Connectors and integration"],
    ]],
    ['SEGUIMIENTO', [
      ['/docs/progresion/',"Progression"],
      ['/docs/metricas/',"Metrics and analytics"],
    ]],
    ['ANALYTICS', [
      ['/docs/analytics/','P2LRN Analytics'],
      ['/analytics/','Abrir panel demo ↗'],
    ]],
    ["REFERENCE", [
      ['/docs/compatibilidad/',"Compatibility"],
      ['/docs/recetas/',"Recipes"],
      ['/docs/glosario/',"Glossary"],
      ['/docs/referencia/',"Technical reference"],
      ['/docs/troubleshooting/',"Troubleshooting"],
    ]],
    ["RESOURCES", [
      ['/studio/','Abrir Studio ↗'],
      ['/demo/',"Viewer ↗"],
      ['/examples/catalog.json',"Examples catalog ↗"],
    ]],
  ];

  const DOC_SIDEBAR_CHILDREN = new Map([
    ['/docs/empezar/',[
      ['/docs/que-usar/',"Component map"],
      ['/docs/conceptos/',"Fundamental concepts"],
      ['/docs/formato/',"P2LRN format"],
      ['/docs/formato-portable-cursos-interactivos/',"Portability guide"],
    ]],
    ['/docs/conectores/',[
      ['/docs/conectores/ia/',"AI connectors"],
      ['/docs/skills/',"P2LRN AI Skills"],
      ['/docs/conectores/lms/',"LMS platforms"],
      ['/docs/conectores/lti/',"LTI 1.3 module"],
    ]],
    ['/docs/questionnaires/',[
      ['/docs/questionnaires/standard/',"Standard questionnaire"],
      ['/docs/questionnaires/memory/',"Memory"],
      ['/docs/questionnaires/matching/',"Matching"],
      ['/docs/questionnaires/ordering/',"Ordering"],
      ['/docs/questionnaires/classification/',"Classification"],
      ['/docs/questionnaires/true-false/',"True / false"],
      ['/docs/questionnaires/word-search/',"Word search"],
      ['/docs/questionnaires/crossword/',"Crossword"],
      ['/docs/questionnaires/rosco/',"Word wheel"],
      ['/docs/questionnaires/3d/',"3D game"],
    ]],
  ]);

  // IA topics are part of a single guide. They are anchors, not extra pages.
  const DOC_AI_TOPICS = Object.freeze([
    ['para-que',"What you can do"],
    ['crear-cursos',"Create courses"],
    ['chatgpt','ChatGPT'],
    ['claude','Claude'],
    ['gemini','Gemini'],
    ['grok','Grok'],
    ['conectar-ordenador',"Connect your computer"],
    ['servicios-web',"Web access"],
    ['comprobar','Comprobaciones'],
  ]);

  const DOC_SECTION_LABELS = Object.freeze({
    EMPEZAR:"Get started",
    INSTALAR:"Install",
    CREAR:"Create",
    REPRODUCIR:"Play",
    INTEGRAR:'Integrar',
    CONECTORES:"Connectors",
    SEGUIMIENTO:'Seguimiento',
    REFERENCIA:"Reference",
  });
  const DOC_BREADCRUMB_PARENTS = new Map([
    ['/docs/que-usar/',['/docs/empezar/',"Before you start"]],
    ['/docs/conceptos/',['/docs/empezar/',"Before you start"]],
    ['/docs/formato/',['/docs/empezar/',"Before you start"]],
    ['/docs/formato-portable-cursos-interactivos/',['/docs/formato/',"P2LRN format"]],
    ['/docs/npm/studio/',['/docs/npm/','NPM']],
    ['/docs/cdn/studio/',['/docs/cdn/','CDN']],
    ['/docs/paquetes/multipart/',['/docs/paquetes/',"Create packages"]],
    ['/docs/conectores/ia/',['/docs/conectores/',"Connectors and integration"]],
    ['/docs/skills/',['/docs/conectores/',"Connectors and integration"]],
    ['/docs/conectores/gemini/',['/docs/conectores/ia/',"AI connectors"]],
    ['/docs/conectores/skills/',['/docs/conectores/ia/',"AI connectors"]],
    ['/docs/conectores/local/',['/docs/conectores/ia/',"AI connectors"]],
    ['/docs/conectores/lms/',['/docs/conectores/',"Connectors and integration"]],
    ['/docs/conectores/lti/',['/docs/conectores/',"Connectors and integration"]],
  ]);
  // Keep legacy detail URLs reachable without advertising a separate IA
  // navigation entry for every provider or installation method.
  const CONNECTOR_IA_DETAIL_ROUTES=new Set([
    '/docs/conectores/gemini/',
    '/docs/conectores/skills/',
    '/docs/conectores/local/',
  ]);
  const sidebarPath=(path)=>CONNECTOR_IA_DETAIL_ROUTES.has(path)
    ?'/docs/conectores/ia/':path;
  const sidebarLocation = (current) => {
    const selected=sidebarPath(current);
    for (const [section,items] of GLOBAL_SIDEBAR) {
      for (const [href,label] of items) {
        const normalized=normalizePath(href);
        if (selected===normalized) return {section,href,label};
        const children=DOC_SIDEBAR_CHILDREN.get(href) || [];
        if (children.some(([childHref])=>selected===normalizePath(childHref))) {
          return {section,href,label,child:true};
        }
      }
    }
    return null;
  };

  const sidebar = document.querySelector('.doc-sidebar');
  if (sidebar) {
    const current = normalizePath(window.location.pathname);
    const selected = sidebarPath(current);
    const fragment = document.createDocumentFragment();
    for (const [section,items] of GLOBAL_SIDEBAR) {
      const label=document.createElement('span');
      label.textContent=section;
      fragment.append(label);
      for (const [href,textValue] of items) {
        const normalized=normalizePath(href);
        const children=DOC_SIDEBAR_CHILDREN.get(href) || [];
        const currentChild=children.find(([childHref])=>selected===normalizePath(childHref));
        const a=document.createElement('a');
        a.href=siteHref(href);
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
            childLink.href=siteHref(childHref);
            childLink.textContent=childLabel;
            if (current===normalizePath(childHref)) childLink.setAttribute('aria-current','page');
            else if (selected===normalizePath(childHref)) childLink.setAttribute('aria-current','location');
            childNav.append(childLink);
            if (childHref==='/docs/conectores/ia/' && selected===normalizePath(childHref)) {
              const topics=document.createElement('div');
              topics.className='doc-ai-topics';
              topics.setAttribute('role','group');
              topics.setAttribute('aria-label',"AI connector sections");
              for (const [id,label] of DOC_AI_TOPICS) {
                const topic=document.createElement('a');
                topic.href=siteHref('/docs/conectores/ia/#'+id);
                topic.dataset.targetId=id;
                topic.textContent=label;
                topics.append(topic);
              }
              childNav.append(topics);
            }
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
    search.innerHTML = '<label for="docs-search-input">Buscar en docs</label><input id="docs-search-input" type="search" aria-controls="docs-search-list" aria-describedby="docs-search-status" placeholder="NPM, Skills, Gemini, LMS…" autocomplete="off"><div class="docs-search-results" id="docs-search-list" hidden></div><div class="sr-only docs-search-status" id="docs-search-status" role="status" aria-live="polite" aria-atomic="true"></div>';
    sidebar.prepend(search);
    const input = search.querySelector('input');
    const results = search.querySelector('.docs-search-results');
    const resultsStatus = search.querySelector('.docs-search-status');
    let index = null;
    const ensureIndex = async () => {
      if (index) return index;
      const response = await fetch(/^en(?:-|$)/i.test(document.documentElement.lang||'')?'/en/search-index.json':'/search-index.json', {cache:'no-store'});
      if (!response.ok) throw new Error('search-index');
      index = await response.json();
      return index;
    };
    let searchRequestToken = 0;
    input.addEventListener('input', async () => {
      const token = ++searchRequestToken;
      const query = input.value.trim().toLocaleLowerCase('en');
      if (query.length < 2) {
        results.hidden = true;
        results.replaceChildren();
        resultsStatus.textContent = '';
        return;
      }
      try {
        const docs = await ensureIndex();
        if (token !== searchRequestToken) return;
        const allMatches = docs.filter((item) => item.search.includes(query));
        const matches = allMatches.slice(0, 8);
        results.replaceChildren(...matches.map((item) => {
          const a = document.createElement('a');
          a.href = siteHref(item.url);
          a.innerHTML = '<strong></strong><span></span>';
          a.querySelector('strong').textContent = item.title;
          a.querySelector('span').textContent = item.section || item.description || '';
          return a;
        }));
        results.hidden = matches.length === 0;
        resultsStatus.textContent = allMatches.length === 0 ? "No results for this search."
          : allMatches.length === 1 ? "1 search result."
          : allMatches.length + " search results" + (allMatches.length > 8 ? ". Showing the first 8." : '.');
      } catch {
        if (token !== searchRequestToken) return;
        results.replaceChildren();
        results.hidden = true;
        resultsStatus.textContent = "Could not load the search index.";
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
    toggle.innerHTML = "<span>Documentation index</span><strong></strong>";
    toggle.querySelector('strong').textContent = currentLink?.textContent || "Open";
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
      toggle.querySelector('span').textContent = open ? "Close index" : "Documentation index";
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

    const pageTitle = docArticle.querySelector('.doc-hero h1')?.textContent?.trim() || document.title.split('—')[0].trim() || "This page";
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
      breadcrumb.setAttribute('aria-label',"Breadcrumb navigation");
      const list=document.createElement('ol');
      const addLink=(href,label)=>{
        const li=document.createElement('li');
        const a=document.createElement('a');
        a.href=siteHref(href);a.textContent=label;li.append(a);list.append(li);
      };
      const addText=(label,current=false)=>{
        const li=document.createElement('li');
        const span=document.createElement('span');
        span.textContent=label;
        if (current) span.setAttribute('aria-current','page');
        li.append(span);list.append(li);
      };
      addLink('/docs/',"Documentation");
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
      aside.setAttribute('aria-label',"On this page");

      const toggle=document.createElement('button');
      toggle.type='button';
      toggle.className='doc-page-toc-toggle';
      toggle.setAttribute('aria-expanded','false');
      toggle.innerHTML="<span>On this page</span><strong></strong>";
      toggle.querySelector('strong').textContent=headings[0]?.textContent || '';

      const nav=document.createElement('nav');
      nav.className='doc-page-toc-nav';
      nav.setAttribute('aria-label',"On this page");
      const title=document.createElement('strong');
      title.textContent="On this page";
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
        const sectionId=heading.closest('.doc-section')?.id || '';
        document.querySelectorAll('.doc-ai-topics a[data-target-id]').forEach((link)=>{
          if (link.dataset.targetId===sectionId)link.setAttribute('aria-current','location');
          else link.removeAttribute('aria-current');
        });
        toggle.querySelector('strong').textContent=heading.textContent;
      };

      let frame=0;
      const syncActive=()=>{
        frame=0;
        // The IA sidebar identifies a section once its title enters the
        // reading area, not only after it reaches the very top. This keeps
        // deep-link redirects and smooth anchor scrolling understandable.
        const line=Math.max(104,window.innerHeight*(
          currentPath==='/docs/conectores/ia/' ? .58 : .2));
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
        if (status) status.textContent = "Wait a few seconds before sending another message.";
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
        const response = await fetch(SUPABASE_URL + '/functions/v1/p2lrn-contact', {
          method: 'POST',
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (response.status === 429) throw new Error('contact_rate_limited');
        if (!response.ok) throw new Error('contact_failed');
        localStorage.setItem('p2lrn-contact-last', String(now));
        form.reset();
        if (status) status.textContent = "Message sent. Thank you for contacting us.";
      } catch (error) {
        if (status) status.textContent = error?.message === 'contact_rate_limited' ? "Submission limit reached. Please try again later." : "Could not send the message. Please try again.";
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

// The npm release and the rebuilt web revision are different identifiers.
// Keep both visible; never pretend unreleased site changes are a new npm tag.
(()=>{
  const label=document.querySelector('[data-site-build]');
  if(!label)return;
  const entry=[...document.scripts].find((script)=>{
    if(!script.src)return false;
    const url=new URL(script.src,document.baseURI);
    return url.origin===location.origin&&['/p2lrn.js','/en/p2lrn.js'].includes(url.pathname);
  });
  const revision=entry?new URL(entry.src).searchParams.get('v'):null;
  label.textContent=revision?'Web '+revision.slice(0,12):"Website revision unavailable";
  label.title="Website file revision; the npm version is shown separately";
})();

/* Accessible navigation landmarks and keyboard-operable horizontal scrolling. */
(()=>{
  const boot=()=>{
    document.querySelectorAll('nav.doc-child-subnav').forEach(nav=>{
      const label=nav.getAttribute('aria-label') || "documentation";
      if(!label.startsWith("Subsections of "))nav.setAttribute('aria-label',"Subsections of "+label);
    });
    document.querySelectorAll('nav.resource-links:not([aria-label])').forEach(nav=>nav.setAttribute('aria-label',"Technical resources"));
    document.querySelectorAll('nav.doc-pager:not([aria-label])').forEach(nav=>nav.setAttribute('aria-label',"Navigation between guides"));
    const updateScrollable=()=>{
      for(const el of document.querySelectorAll('pre,.capability-table-wrap,.capability-matrix')){
        const overflowing=el.clientWidth>0&&el.scrollWidth>el.clientWidth+1;
        if(overflowing&&!el.hasAttribute('tabindex')){el.tabIndex=0;el.dataset.p2lrnAddedTabindex='1'}
        else if(!overflowing&&el.dataset.p2lrnAddedTabindex==='1'){el.removeAttribute('tabindex');delete el.dataset.p2lrnAddedTabindex}
      }
    };
    updateScrollable();
    window.addEventListener('resize',updateScrollable,{passive:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
