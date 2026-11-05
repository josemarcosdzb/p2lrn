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
  // The Player already isolates executable content in an opaque sandbox by default.
  // External runtime hosts are optional and explicitly requested, never a prerequisite for the viewer.
  const automaticRuntime=params.get('runtime')!=='isolated';
  let paused=false,records=[],catalog=[],catalogDefault=null;
  const MAX_EVENTS=200;
  // Keep the default opaque sandbox. A separate HTTPS runtime is opt-in.
  const RUNTIME_ORIGINS=Object.freeze([...new Set([
    params.get('runtimeOrigin'),
    globalThis.P2LRN_RUNTIME_ORIGIN,
  ].filter(Boolean).map((value)=>{
    try{return new URL(String(value)).origin;}catch{return null;}
  }).filter((origin)=>origin&&origin.startsWith('https://')&&origin!==location.origin))]);

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
          throw new Error("runtime version "+health.playerVersion+" different from the Player "+api.version);
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
    throw new Error("There is no isolated P2LRN runtime source available. "+(lastError?.message||''));
  }

  function normalizeSource(value){const raw=String(value||'').trim();if(!raw)throw new Error("Enter a package URL.");let url;try{url=new URL(raw,location.href);}catch{throw new Error("The URL is invalid.");}if(!['http:','https:'].includes(url.protocol))throw new Error("Only HTTP/HTTPS URLs are supported.");return url.href;}
  const setField=(key,value)=>{if(fields[key])fields[key].textContent=value==null||value===''?'—':String(value);};
  const stateLabels={ERROR:'ERROR',LOADING:"LOADING",READY:"READY",RENDERED:"RENDERING",BRIDGE:"PREPARING"};
  const setState=(value,text)=>{const label=stateLabels[value]||value;state.textContent=label;state.dataset.state=value.toLowerCase();if(status)status.textContent=text||label;};
  const renderLog=()=>{log.textContent=records.map((item)=>'['+item.time+'] '+item.name+item.suffix).join('\n')||"[viewer] no events";log.scrollTop=log.scrollHeight;};
  const write=(name,detail)=>{if(paused)return;let suffix='';if(detail!==undefined){try{suffix=' '+JSON.stringify(detail,null,2);}catch{suffix=' '+String(detail);}}records.push({time:new Date().toLocaleTimeString(),name,suffix});if(records.length>MAX_EVENTS)records=records.slice(-MAX_EVENTS);renderLog();};
  const categoryLabel=(value)=>value==='generated-questionnaire'?"Quizzes and games":value==='generated-multipart'?'Multipart':value==='generated-external'?"External formats":value==='canonical-external'?"External formats":value==='canonical-reader'?"Reader examples":"P2LRN examples";

  function populateCatalog(data){catalog=Array.isArray(data?.examples)?data.examples:[];catalogDefault=catalog.find((example)=>example.url===data?.defaultExample)?.url??null;sample.replaceChildren();const groups=new Map();for(const item of catalog){const key=categoryLabel(item.category);if(!groups.has(key)){const group=document.createElement('optgroup');group.label=key;groups.set(key,group);sample.append(group);}const option=document.createElement('option');option.value=item.url;option.textContent=item.title||item.url;option.dataset.renderer=item.rendererId||'';groups.get(key).append(option);}}
  function selectCatalogEntry(src){let normalized;try{normalized=normalizeSource(src);}catch{return null;}const item=catalog.find((entry)=>{try{return normalizeSource(entry.url)===normalized;}catch{return false;}});if(item){sample.value=item.url;if(!rendererSelect.value&&item.rendererId)rendererSelect.value=item.rendererId;}return item;}

  async function inspect(src){setField('integrity',"verifying…");const api=await window.P2LRNReady;const pkg=await api.openPackageURL(src);const manifest=pkg.manifest||{};setField('package',manifest.packageId||new URL(src).pathname.split("/en/").filter(Boolean).at(-1));setField('format',manifest.format||'—');setField('version',manifest.formatVersion||'—');setField('integrity',manifest.integrity?.contentRoot?"verified":"missing contentRoot");setField('transport',pkg.verification?.transport||'—');setField('entrypoints',Array.isArray(manifest.entrypoints)?manifest.entrypoints.length:0);setField('profiles',Array.isArray(manifest.profiles)?manifest.profiles.map((profile)=>profile.id).join(' · '):'—');write('inspect',{packageId:manifest.packageId,format:manifest.format,formatVersion:manifest.formatVersion,contentRoot:manifest.integrity?.contentRoot,transport:pkg.verification?.transport,profiles:manifest.profiles?.map((profile)=>profile.id)});}
  async function load(){let src;try{src=normalizeSource(urlInput.value);}catch(error){setState('ERROR',error.message);write('url-error',{message:error.message});return;}urlInput.value=src;const renderer=rendererSelect.value.trim();if(renderer)player.setAttribute('renderer',renderer);else player.removeAttribute('renderer');setState('LOADING',"Loading package");label.textContent=new URL(src).pathname.split("/en/").filter(Boolean).at(-1)||src;setField('renderer',renderer||"automatic");setField('entity','—');setField('representation','—');write('load',{src,renderer:renderer||null});try{await inspect(src);player.setAttribute('src',src);const next=new URL(location.href);next.searchParams.set('src',src);if(renderer)next.searchParams.set('renderer',renderer);else next.searchParams.delete('renderer');history.replaceState(null,'',next);selectCatalogEntry(src);}catch(error){setState('ERROR',"Could not open or verify the package");write('load-error',{message:error?.message||String(error)});}}

  sample?.addEventListener('change',()=>{const option=sample.selectedOptions[0];urlInput.value=new URL(sample.value,location.href).href;rendererSelect.value=option?.dataset.renderer||'';void load();});
  rendererSelect?.addEventListener('change',()=>{if(player.getAttribute('src'))void load();});
  loadButton?.addEventListener('click',()=>void load());
  urlInput?.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();void load();}});
  reloadButton?.addEventListener('click',()=>{setState('LOADING',"Reloading");write('reload');void player.reload?.();});
  clearButton?.addEventListener('click',()=>{records=[];renderLog();});
  pauseButton?.addEventListener('click',()=>{paused=!paused;pauseButton.textContent=paused?"Resume":"Pause";});
  copyLogButton?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(log.textContent||'');const before=copyLogButton.textContent;copyLogButton.textContent="Copied";setTimeout(()=>{copyLogButton.textContent=before;},1200);}catch{}});

  for(const name of ['p2lrn:ready','p2lrn:rendered','p2lrn:activityready','p2lrn:xapi','p2lrn:score','p2lrn:statechange','p2lrn:complete','p2lrn:progressionchange','p2lrn:error']){player.addEventListener(name,(event)=>{write(name,event.detail);if(name==='p2lrn:ready')setState('READY',"Player ready");if(name==='p2lrn:rendered'){globalThis.P2LRNRecordConversion?.('player_course_rendered');setState('RENDERED',"Content rendered");setField('renderer',event.detail?.rendererId);setField('entity',event.detail?.entityId||event.detail?.context?.entityId);setField('representation',event.detail?.representationId);}if(name==='p2lrn:error')setState('ERROR',"Playback error");});}

  async function boot(){try{const api=await window.P2LRNReady;write('runtime',{status:'registered',version:api?.version||globalThis.P2LRN?.version});if(!automaticRuntime)await configureIsolatedRuntime(api);else write('runtime-host',{status:'automatic-opaque',applicationOrigin:location.origin});try{const response=await fetch('/examples/catalog.json',{cache:'no-store'});if(response.ok)populateCatalog(await response.json());}catch(error){write('catalog-error',{message:error?.message||String(error)});}if(globalThis.P2LRN?.installServiceWorker){setState('BRIDGE',"Preparing verified resources");const pageBridge=await globalThis.P2LRN.installServiceWorker({url:'/p2lrn-sw.js',scope:"/en/"});const bridge=await globalThis.P2LRN.installServiceWorker({url:'/p2lrn-sw.js',scope:'/__p2lrn__/'});write('virtual-resource-bridge',{status:'ready',pageScope:pageBridge?.scope??"/en/",resourceScope:bridge?.scope??'/__p2lrn__/',controlled:Boolean(navigator.serviceWorker.controller)});}rendererSelect.value=[...rendererSelect.options].some((option)=>option.value===initialRenderer)?initialRenderer:'';const start=initialSrc||catalogDefault||catalog[0]?.url||'/examples/generated/scorm12-browser-demo.p2lrn';urlInput.value=new URL(start,location.href).href;const item=selectCatalogEntry(urlInput.value);if(!initialRenderer&&item?.rendererId)rendererSelect.value=item.rendererId;await load();}catch(error){write('boot-error',{message:error?.message||String(error)});setState('ERROR',"Error preparing the viewer");}}
  void boot();

  const closeMenu=()=>{nav?.classList.remove('is-open');menu?.setAttribute('aria-expanded','false');if(menu)menu.textContent="Menu";};
  if(menu&&nav){menu.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');menu.setAttribute('aria-expanded',String(open));menu.textContent=open?"Close":"Menu";});document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeMenu();});}
})();