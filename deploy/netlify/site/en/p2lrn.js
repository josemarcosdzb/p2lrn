// Public acquisition/conversion signals. No identifiers, cookies, URL queries,
// user-generated course data or referrer URLs are transmitted.
(()=>{
  if(globalThis.P2LRNRecordConversion||location.hostname!=='p2lrn.org')return;
  const pages=new Set([
    '/','/en/','/studio/','/en/studio/','/demo/','/en/demo/','/skills/','/en/skills/',
    '/crear-cursos-interactivos/','/en/create-interactive-courses/',
    '/juegos-educativos-3d/','/en/3d-educational-games/',
    '/cursos-offline/','/en/offline-courses/'
  ]);
  const page=location.pathname.replace(/\/index\.html$/,'/');
  if(!pages.has(page))return;
  let channel='direct';
  try{
    if(document.referrer){
      const from=new URL(document.referrer);
      if(from.origin===location.origin)channel='internal';
      else if(/(^|\.)google\.[a-z.]+$/i.test(from.hostname))channel='google';
      else channel='external';
    }
  }catch{}
  const locale=/^en\b/i.test(document.documentElement.lang||'')?'en':'es';
  const sent=new Set();
  const emit=(event,destination='')=>{
    const once=event==='landing_view'||event==='studio_editor_ready'||event==='player_course_rendered';
    if(once&&sent.has(event))return;
    if(once)sent.add(event);
    const payload=JSON.stringify({event,page,locale,channel,destination});
    const url='/.netlify/functions/p2lrn-conversion';
    try{
      const blob=new Blob([payload],{type:'text/plain'});
      if(navigator.sendBeacon?.(url,blob))return;
      void fetch(url,{method:'POST',body:payload,headers:{'Content-Type':'text/plain'},
        keepalive:true,credentials:'omit',mode:'same-origin'}).catch(()=>{});
    }catch{}
  };
  globalThis.P2LRNRecordConversion=emit;
  const landing=new Set([
    '/','/en/','/skills/','/en/skills/','/crear-cursos-interactivos/',
    '/en/create-interactive-courses/','/juegos-educativos-3d/',
    '/en/3d-educational-games/','/cursos-offline/','/en/offline-courses/'
  ]);
  if(landing.has(page))emit('landing_view');
  document.addEventListener('click',(event)=>{
    const link=event.target?.closest?.('a[href]');
    if(!link)return;
    let target;
    try{target=new URL(link.href,location.href);}catch{return;}
    if(target.origin!==location.origin)return;
    const path=target.pathname.replace(/\/index\.html$/,'/');
    if(path==='/studio/'||path==='/en/studio/')emit('link_studio','studio');
    else if(path==='/demo/'||path==='/en/demo/')emit('link_player','player');
    else if(path==='/skills/'||path==='/en/skills/')emit('link_skills','skills');
    else {
      const match=/^\/downloads\/skills\/p2lrn-(chatgpt-plugin|claude-skill|gemini-skill|grok-skill)\.zip$/i.exec(path);
      if(match)emit('skill_download_clicked',match[1].split('-')[0]);
    }
  },{capture:true,passive:true});
})();

// Always expose both site languages from every page, including embedded tools.
// The language switch keeps the same logical route and never carries form data,
// authentication parameters or package URLs across languages.
(()=>{
  const install=()=>{
    if(document.querySelector('[data-language-switch], .site-header .language-switch, body > .language-switch'))return;
    const english=/^en(?:-|$)/i.test(document.documentElement.lang||'');
    const current=location.pathname.replace(/\/index\.html$/i,'/');
    const logical=english?(globalThis.__P2LRN_SPANISH_ROUTES?.[current]||(current==='/en/'?'/':current.replace(/^\/en(?=\/)/,''))):current;
    const path=logical.startsWith('/')?logical:'/'+logical;
    const esHref=path;
    const enHref=globalThis.__P2LRN_ENGLISH_ROUTES?.[path]||(path==='/'?'/en/':'/en'+path);
    const switcher=document.createElement('nav');
    switcher.className='language-switch';
    switcher.setAttribute('aria-label',english?'Site language':"Site language");
    for(const [lang,href,desc] of [
      ['es',esHref,english?'Switch to Spanish':"Switch to Spanish"],
      ['en',enHref,english?'Switch to English':"Switch to English"]
    ]){
      const a=document.createElement('a');a.href=href;a.hreflang=lang;a.lang=lang;
      const visibleLabel=lang.toUpperCase();
      a.textContent=visibleLabel;a.title=desc;
      // WCAG 2.5.3: the accessible name begins with the visible label (ES / EN).
      a.setAttribute('aria-label',visibleLabel+' — '+desc);
      if(lang===(english?'en':'es'))a.setAttribute('aria-current','page');
      switcher.append(a);
    }
    document.body.append(switcher);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

(() => {

  // Observe newly inserted DOM subtrees, never re-scan the whole page
  // for every mutation. Full document scans blocked busy pages.
  const NETLIFY_BRANDING_SELECTOR =
    'netlify-toolbar,#netlify-toolbar,[data-netlify-toolbar],iframe[title*="netlify" i],iframe[src*="netlify" i],[aria-label*="netlify" i],[id*="netlify" i],[class*="netlify" i]';
  const removeInjectedNetlifyBranding = (scope=document) => {
    const removeCandidate = (node) => {
      // A branding badge must never be allowed to delete the document root.
      if (!(node instanceof Element) || node===document.documentElement || node===document.body) return;
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
      // Only process an exact branding leaf; never climb into <body>/<html>.
      const ownText = node.childElementCount===0
        ? String(node.textContent || '').replace(/\s+/g,' ').trim() : '';
      if (ownText === 'Powered by Netlify') {
        let target = node;
        for (let parent=node.parentElement,i=0;parent && i<5;parent=parent.parentElement,i++) {
          if (parent===document.body || parent===document.documentElement) break;
          const style = window.getComputedStyle(parent);
          const rect = parent.getBoundingClientRect();
          if ((style.position === 'fixed' || style.position === 'sticky') && rect.width < 360 && rect.height < 140) {
            target=parent;
            break;
          }
        }
        target.remove();
      }
    };
    // Initial document scan runs once; mutation scans inspect only the added
    // element and descendants. Avoid reading textContent of big ancestors.
    if (scope instanceof Element && scope.matches(NETLIFY_BRANDING_SELECTOR)) removeCandidate(scope);
    scope.querySelectorAll(NETLIFY_BRANDING_SELECTOR).forEach(removeCandidate);
    const checkText = (node) => {
      if (node.childElementCount) return;
      if (String(node.textContent || '').replace(/\s+/g,' ').trim() === 'Powered by Netlify') removeCandidate(node);
    };
    if (scope instanceof Element && scope.matches('a,button,div,span')) checkText(scope);
    scope.querySelectorAll('a,button,div,span').forEach(checkText);
  };

  removeInjectedNetlifyBranding();
  const netlifyBrandingObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element) || !node.isConnected) continue;
        removeInjectedNetlifyBranding(node);
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

  // One shared header. build-site.mjs reads this exact JSON for the first HTML paint.
  // No route-specific top navigation: solutions and Skills live in the left index.
  const SITE_NAV = [{"label":"Studio","href":"/studio/","active":["/studio/"]},{"label":"Viewer","href":"/demo/","active":["/demo/"]},{"label":"Analytics","href":"/analytics/","active":["/analytics/"]},{"label":"Documentation","href":"/docs/","active":["/docs/*"]},{"label":"Developers","href":"/docs/desarrolladores/","active":["/docs/desarrolladores/*"]},{"label":"Contact","href":"/contacto/","active":["/contacto/"]}];

  const normalizePath = (value) => {
    // Route comparisons use the same logical path for both languages.
    // English pages keep their /en/ URL, while the navigation config remains
    // independent of the locale and therefore preserves active links/sidebars.
    let pathname = String(value || '/').split(/[?#]/, 1)[0].replace(/\/index\.html$/u, '/');
    if(/^en(?:-|$)/i.test(document.documentElement.lang||'')&&pathname.startsWith('/en/'))
      pathname=globalThis.__P2LRN_SPANISH_ROUTES?.[pathname]||(pathname.slice(3)||'/');
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
    const base=value.split(/[?#]/,1)[0];
    return (globalThis.__P2LRN_ENGLISH_ROUTES?.[base]||'/en'+base)+value.slice(base.length);
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

    const navigationEntries = SITE_NAV;
    for (const entry of navigationEntries) {
      const active = (entry.href==='/docs/' && current.startsWith('/docs/') && !current.startsWith('/docs/desarrolladores/')) ||
        (entry.href!=='/docs/' && (entry.active || []).some((path) => path.endsWith('*') ? current.startsWith(normalizePath(path.slice(0,-1))) : current === normalizePath(path)));
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
      ['/docs/empezar/',"Before creating a course"],
      ['/docs/empezar-facil/',"First course in Studio"],
    ]],
    ["SOLUTIONS", [
      ['/crear-cursos-interactivos/',"Create interactive courses"],
      ['/juegos-educativos-3d/',"3D learning games"],
      ['/cursos-offline/',"Offline courses"],
      ['/skills/',"AI Skills"],
    ]],
    ["CREATE", [
      ['/docs/studio/',"Studio visual guide"],
      ['/docs/questionnaires/',"Quizzes and games"],
      ['/docs/entrega-offline/',"Delivery without an LMS"],
      ['/docs/colaboracion/',"Teacher collaboration"],
    ]],
    ["PLAY", [
      ['/docs/ejemplos/',"Course examples"],
    ]],
    ["EXHIBITIONS", [
      ['/analytics/',"Open Analytics"],
    ]],
    ['DESARROLLADORES', [
      ['/docs/desarrolladores/',"Developer overview"],
      ['/docs/desarrolladores/primeros-pasos/',"First HTML example"],
    ]],
    ["INSTALL", [
      ['/docs/instalar/',"Components and versions"],
      ['/docs/cdn/','CDN'],
      ['/docs/cdn/studio/',"Studio via CDN"],
      ['/docs/cdn/analytics/',"Analytics via CDN"],
      ['/docs/npm/','NPM'],
      ['/docs/npm/studio/',"Studio with npm"],
      ['/docs/npm/analytics/',"Analytics with NPM"],
      ['/docs/toolkit/',"Toolkit and Reader"],
      ['/docs/cli/',"Command-line tools"],
    ]],
    ['INTEGRAR', [
      ['/docs/integracion/',"Host, identity and permissions"],
      ['/docs/player/',"Embedded Player"],
      ['/docs/desarrolladores/colaboracion/',"Collaboration and Host"],
      ['/docs/eventos/',"Player events"],
      ['/docs/juegos-3d/',"3D game architecture"],
      ['/docs/progresion/',"Progression rules"],
      ['/docs/metricas/',"Events and metrics"],
      ['/docs/analytics/',"Analytics for platforms"],
    ]],
    ["CONNECTORS", [
      ['/docs/conectores/',"Choose a connector"],
      ['/docs/skills/',"AI Skills"],
      ['/docs/conectores/ia/',"MCP connector for AI"],
    ]],
    ["REFERENCE", [
      ['/docs/compatibilidad/',"Compatibility"],
      ['/docs/paquetes/',"Package structure"],
      ['/docs/paquetes/multipart/','Multipart'],
      ['/docs/recetas/',"Technical recipes"],
      ['/docs/glosario/',"Glossary"],
      ['/docs/referencia/',"API reference"],
      ['/docs/troubleshooting/',"Troubleshooting"],
    ]],
    ["RESOURCES", [
      ['/studio/',"Open Studio ↗"],
      ['/demo/',"Learner viewer ↗"],
      ['/examples/catalog.json',"Course catalog ↗"],
    ]],
  ];

  const DOC_SIDEBAR_CHILDREN = new Map([
    ['/docs/desarrolladores/',[
      ['/docs/desarrolladores/actividades/',"Technical reference of games"],
      ['/docs/desarrolladores/juegos-3d/',"3D Engine for Developers"],
      ['/docs/desarrolladores/colaboracion/',"Collaboration API and permissions"],
      ['/docs/que-usar/',"Technical map of components"],
      ['/docs/conceptos/',"File format concepts"],
      ['/docs/formato/',"P2LRN format"],
      ['/docs/formato-portable-cursos-interactivos/',"Portability and versions"],
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

  const DOC_SECTION_LABELS = Object.freeze({
    SOLUTIONS:"Solutions",
    EMPEZAR:"For teachers",
    DESARROLLADORES:"For developers",
    INSTALAR:"Install",
    CREAR:"Create",
    REPRODUCIR:"Play",
    INTEGRAR:"Integrate",
    CONECTORES:"Connectors",
    SEGUIMIENTO:"Tracking",
    REFERENCIA:"Reference",
  });
  const DOC_BREADCRUMB_PARENTS = new Map([
    ['/docs/desarrolladores/actividades/',['/docs/desarrolladores/',"Developers"]],
    ['/docs/desarrolladores/juegos-3d/',['/docs/desarrolladores/',"Developers"]],
    ['/docs/desarrolladores/colaboracion/',['/docs/desarrolladores/',"Developers"]],
    ['/docs/que-usar/',['/docs/desarrolladores/',"Developers"]],
    ['/docs/conceptos/',['/docs/desarrolladores/',"Developers"]],
    ['/docs/formato/',['/docs/desarrolladores/',"Developers"]],
    ['/docs/formato-portable-cursos-interactivos/',['/docs/formato/',"P2LRN format"]],
    ['/docs/npm/studio/',['/docs/npm/','NPM']],
    ['/docs/npm/analytics/',['/docs/npm/','NPM']],
    ['/docs/cdn/studio/',['/docs/cdn/','CDN']],
    ['/docs/cdn/analytics/',['/docs/cdn/','CDN']],
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
    // A teacher should never need to browse API, npm or Host menus to find
    // course authoring help. Developers get their own complete navigation.
    // One stable, complete sidebar for teachers, games and developers.
    const visibleSections=new Set(GLOBAL_SIDEBAR.map(([section])=>section));
    for (const [section,items] of GLOBAL_SIDEBAR) {
      if(!visibleSections.has(section))continue;
      const label=document.createElement('span');
      label.textContent=section==='DESARROLLADORES'?DOC_SECTION_LABELS.DESARROLLADORES:section;
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
    search.innerHTML = "<label for=\"docs-search-input\">Search documentation</label><input id=\"docs-search-input\" type=\"search\" aria-controls=\"docs-search-list\" aria-describedby=\"docs-search-status\" placeholder=\"NPM, Skills, Gemini, LMS…\" autocomplete=\"off\"><div class=\"docs-search-results\" id=\"docs-search-list\" hidden=\"\"></div><div class=\"sr-only docs-search-status\" id=\"docs-search-status\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\"></div>";
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
        toggle.querySelector('strong').textContent=heading.textContent;
      };

      let frame=0;
      const syncActive=()=>{
        frame=0;
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


  Promise.all([
    fetch('/health.json', {cache:'no-store'}).then((r) => r.ok ? r.json() : Promise.reject()),
    fetch('/index.json', {cache:'no-store'}).then((r) => r.ok ? r.json() : Promise.reject()),
    fetch('/player/current/dist/release.json', {cache:'no-store'}).then((r) => r.ok ? r.json() : Promise.reject()),
  ]).then(([health,index,release]) => {
    const version = release.webSdkVersion || health.playerVersion || index?.player?.version;
    if (version) document.querySelectorAll('[data-player-version],[data-footer-version]').forEach((n) => n.textContent = version);
    const node = document.querySelector('[data-health]');
    if (node) node.textContent = health.ok && release.webSdkVersion === version ? "CDN available" : 'CDN';
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
