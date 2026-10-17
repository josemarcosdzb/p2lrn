(() => {
  const player=document.getElementById('demo-player');
  const sample=document.querySelector('[data-sample]');
  const rendererSelect=document.querySelector('[data-renderer]');
  const urlInput=document.querySelector('[data-package-url]');
  const loadButton=document.querySelector('[data-load]');
  const reloadButton=document.querySelector('[data-reload]');
  const clearButton=document.querySelector('[data-clear-log]');
  const pauseButton=document.querySelector('[data-pause-log]');
  const copyLogButton=document.querySelector('[data-copy-log]');
  const log=document.querySelector('[data-event-log]');
  const state=document.querySelector('[data-runtime-state]');
  const status=document.querySelector('[data-viewer-status]');
  const label=document.querySelector('[data-package-label]');
  const menu=document.querySelector('[data-menu]');
  const nav=document.getElementById('nav');
  const fields={package:document.querySelector('[data-inspect-package]'),format:document.querySelector('[data-inspect-format]'),version:document.querySelector('[data-inspect-version]'),integrity:document.querySelector('[data-inspect-integrity]'),transport:document.querySelector('[data-inspect-transport]'),entrypoints:document.querySelector('[data-inspect-entrypoints]'),profiles:document.querySelector('[data-inspect-profiles]'),renderer:document.querySelector('[data-inspect-renderer]'),entity:document.querySelector('[data-inspect-entity]'),representation:document.querySelector('[data-inspect-representation]')};
  const params=new URLSearchParams(location.search);
  const initialSrc=params.get('src');
  const initialRenderer=params.get('renderer')||'';
  const automaticRuntime=params.get('runtime')==='auto';
  let paused=false,records=[],catalog=[];
  const MAX_EVENTS=200;
  const RUNTIME_ORIGINS=Object.freeze([
    'https://main--p2lrn.netlify.app',
    'https://p2lrn.netlify.app',
  ]);

  async function configureIsolatedRuntime(api){
    let lastError=null;
    for(const origin of RUNTIME_ORIGINS){
      if(origin===location.origin)continue;
      const baseUrl=new URL('/player/current/dist/runtime-host/',origin).href;
      try{
        const response=await fetch(new URL('/health.json',origin),{mode:'cors',credentials:'omit',cache:'no-store'});
        if(!response.ok)throw new Error('HTTP '+response.status);
        const health=await response.json();
        if(health?.playerVersion&&api?.version&&health.playerVersion!==api.version){
          throw new Error('Versión de runtime '+health.playerVersion+' distinta del Player '+api.version);
        }
        api.configureRuntimeHost({baseUrl,mode:'static'});
        player.runtimeBaseUrl=baseUrl;
        write('runtime-host',{status:'ready',applicationOrigin:location.origin,runtimeOrigin:new URL(baseUrl).origin,baseUrl,playerVersion:health?.playerVersion||api?.version||null});
        return baseUrl;
      }catch(error){
        lastError=error;
        write('runtime-host-candidate-failed',{origin,message:error?.message||String(error)});
      }
    }
    throw new Error('No hay un origen de runtime P2LRN aislado disponible. '+(lastError?.message||''));
  }

  function normalizeSource(value){const raw=String(value||'').trim();if(!raw)throw new Error('Introduce una URL de paquete.');let url;try{url=new URL(raw,location.href);}catch{throw new Error('La URL no es válida.');}if(!['http:','https:'].includes(url.protocol))throw new Error('Sólo se admiten URLs http/https.');return url.href;}
  const setField=(key,value)=>{if(fields[key])fields[key].textContent=value==null||value===''?'—':String(value);};
  const setState=(value,text)=>{state.textContent=value;state.dataset.state=value.toLowerCase();if(status)status.textContent=text||value;};
  const renderLog=()=>{log.textContent=records.map((item)=>'['+item.time+'] '+item.name+item.suffix).join('\n')||'[viewer] sin eventos';log.scrollTop=log.scrollHeight;};
  const write=(name,detail)=>{if(paused)return;let suffix='';if(detail!==undefined){try{suffix=' '+JSON.stringify(detail,null,2);}catch{suffix=' '+String(detail);}}records.push({time:new Date().toLocaleTimeString(),name,suffix});if(records.length>MAX_EVENTS)records=records.slice(-MAX_EVENTS);renderLog();};
  const categoryLabel=(value)=>value==='generated-questionnaire'?'Cuestionarios y juegos':value==='generated-multipart'?'Multipart':value==='generated-external'?'Formatos externos':value==='canonical-external'?'Formatos externos':value==='canonical-reader'?'Ejemplos de Reader':'Ejemplos P2LRN';

  function populateCatalog(data){catalog=Array.isArray(data?.examples)?data.examples:[];sample.replaceChildren();const groups=new Map();for(const item of catalog){const key=categoryLabel(item.category);if(!groups.has(key)){const group=document.createElement('optgroup');group.label=key;groups.set(key,group);sample.append(group);}const option=document.createElement('option');option.value=item.url;option.textContent=item.title||item.url;option.dataset.renderer=item.rendererId||'';groups.get(key).append(option);}}
  function selectCatalogEntry(src){let normalized;try{normalized=normalizeSource(src);}catch{return null;}const item=catalog.find((entry)=>{try{return normalizeSource(entry.url)===normalized;}catch{return false;}});if(item){sample.value=item.url;if(!rendererSelect.value&&item.rendererId)rendererSelect.value=item.rendererId;}return item;}

  async function inspect(src){setField('integrity','verificando…');const api=await window.P2LRNReady;const pkg=await api.openPackageURL(src);const manifest=pkg.manifest||{};setField('package',manifest.packageId||new URL(src).pathname.split('/').filter(Boolean).at(-1));setField('format',manifest.format||'—');setField('version',manifest.formatVersion||'—');setField('integrity',manifest.integrity?.contentRoot?'verificada':'sin contentRoot');setField('transport',pkg.verification?.transport||'—');setField('entrypoints',Array.isArray(manifest.entrypoints)?manifest.entrypoints.length:0);setField('profiles',Array.isArray(manifest.profiles)?manifest.profiles.map((profile)=>profile.id).join(' · '):'—');write('inspect',{packageId:manifest.packageId,format:manifest.format,formatVersion:manifest.formatVersion,contentRoot:manifest.integrity?.contentRoot,transport:pkg.verification?.transport,profiles:manifest.profiles?.map((profile)=>profile.id)});}
  async function load(){let src;try{src=normalizeSource(urlInput.value);}catch(error){setState('ERROR',error.message);write('url-error',{message:error.message});return;}urlInput.value=src;const renderer=rendererSelect.value.trim();if(renderer)player.setAttribute('renderer',renderer);else player.removeAttribute('renderer');setState('LOADING','Cargando paquete');label.textContent=new URL(src).pathname.split('/').filter(Boolean).at(-1)||src;setField('renderer',renderer||'automático');setField('entity','—');setField('representation','—');write('load',{src,renderer:renderer||null});try{await inspect(src);player.setAttribute('src',src);const next=new URL(location.href);next.searchParams.set('src',src);if(renderer)next.searchParams.set('renderer',renderer);else next.searchParams.delete('renderer');history.replaceState(null,'',next);selectCatalogEntry(src);}catch(error){setState('ERROR','No se pudo abrir o verificar el paquete');write('load-error',{message:error?.message||String(error)});}}

  sample?.addEventListener('change',()=>{const option=sample.selectedOptions[0];urlInput.value=new URL(sample.value,location.href).href;rendererSelect.value=option?.dataset.renderer||'';void load();});
  rendererSelect?.addEventListener('change',()=>{if(player.getAttribute('src'))void load();});
  loadButton?.addEventListener('click',()=>void load());
  urlInput?.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();void load();}});
  reloadButton?.addEventListener('click',()=>{setState('LOADING','Recargando');write('reload');void player.reload?.();});
  clearButton?.addEventListener('click',()=>{records=[];renderLog();});
  pauseButton?.addEventListener('click',()=>{paused=!paused;pauseButton.textContent=paused?'Reanudar':'Pausar';});
  copyLogButton?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(log.textContent||'');const before=copyLogButton.textContent;copyLogButton.textContent='Copiado';setTimeout(()=>{copyLogButton.textContent=before;},1200);}catch{}});

  for(const name of ['p2lrn:ready','p2lrn:rendered','p2lrn:activityready','p2lrn:xapi','p2lrn:score','p2lrn:statechange','p2lrn:complete','p2lrn:progressionchange','p2lrn:error']){player.addEventListener(name,(event)=>{write(name,event.detail);if(name==='p2lrn:ready')setState('READY','Player preparado');if(name==='p2lrn:rendered'){setState('RENDERED','Contenido renderizado');setField('renderer',event.detail?.rendererId);setField('entity',event.detail?.entityId||event.detail?.context?.entityId);setField('representation',event.detail?.representationId);}if(name==='p2lrn:error')setState('ERROR','Error de reproducción');});}

  async function boot(){try{const api=await window.P2LRNReady;write('runtime',{status:'registered',version:api?.version||globalThis.P2LRN?.version});if(!automaticRuntime)await configureIsolatedRuntime(api);else write('runtime-host',{status:'automatic-opaque',applicationOrigin:location.origin});try{const response=await fetch('/examples/catalog.json',{cache:'no-store'});if(response.ok)populateCatalog(await response.json());}catch(error){write('catalog-error',{message:error?.message||String(error)});}if(globalThis.P2LRN?.installServiceWorker){setState('BRIDGE','Preparando recursos verificados');const pageBridge=await globalThis.P2LRN.installServiceWorker({url:'/p2lrn-sw.js',scope:'/'});const bridge=await globalThis.P2LRN.installServiceWorker({url:'/p2lrn-sw.js',scope:'/__p2lrn__/'});write('virtual-resource-bridge',{status:'ready',pageScope:pageBridge?.scope??'/',resourceScope:bridge?.scope??'/__p2lrn__/',controlled:Boolean(navigator.serviceWorker.controller)});}rendererSelect.value=[...rendererSelect.options].some((option)=>option.value===initialRenderer)?initialRenderer:'';const start=initialSrc||catalog[0]?.url||'/examples/canonical/creator-course.p2lrn';urlInput.value=new URL(start,location.href).href;const item=selectCatalogEntry(urlInput.value);if(!initialRenderer&&item?.rendererId)rendererSelect.value=item.rendererId;await load();}catch(error){write('boot-error',{message:error?.message||String(error)});setState('ERROR','Error preparando el visor');}}
  void boot();

  const closeMenu=()=>{nav?.classList.remove('is-open');menu?.setAttribute('aria-expanded','false');if(menu)menu.textContent='Menú';};
  if(menu&&nav){menu.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');menu.setAttribute('aria-expanded',String(open));menu.textContent=open?'Cerrar':'Menú';});document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeMenu();});}
})();