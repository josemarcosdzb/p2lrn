(() => {
  const player=document.getElementById('demo-player');
  const sample=document.querySelector('[data-sample]');
  const rendererSelect=document.querySelector('[data-renderer]');
  const fileInput=document.querySelector('[data-file-input]');
  const fileSummary=document.querySelector('[data-file-summary]');
  const loadButton=document.querySelector('[data-load]');
  const reloadButton=document.querySelector('[data-reload]');
  const clearButton=document.querySelector('[data-clear-log]');
  const pauseButton=document.querySelector('[data-pause-log]');
  const copyLogButton=document.querySelector('[data-copy-log]');
  const log=document.querySelector('[data-event-log]');
  const state=document.querySelector('[data-runtime-state]');
  const status=document.querySelector('[data-viewer-status]');
  const label=document.querySelector('[data-package-label]');
  const sampleNotice=document.createElement('aside');
  sampleNotice.className='viewer-source-notice';
  sampleNotice.setAttribute('aria-live','polite');
  sampleNotice.hidden=true;
  document.querySelector('.viewer-workbench')?.before(sampleNotice);
  const menu=document.querySelector('[data-menu]');
  const nav=document.getElementById('nav');
  const fields={package:document.querySelector('[data-inspect-package]'),format:document.querySelector('[data-inspect-format]'),version:document.querySelector('[data-inspect-version]'),integrity:document.querySelector('[data-inspect-integrity]'),transport:document.querySelector('[data-inspect-transport]'),entrypoints:document.querySelector('[data-inspect-entrypoints]'),profiles:document.querySelector('[data-inspect-profiles]'),renderer:document.querySelector('[data-inspect-renderer]'),entity:document.querySelector('[data-inspect-entity]'),representation:document.querySelector('[data-inspect-representation]')};
  const params=new URLSearchParams(location.search);
  // The same official viewer supports a compact presentation when embedded
  // from a Studio guide; all runtime and package validation remains unchanged.
  if(params.get('embed')==='1')document.documentElement.dataset.p2lrnEmbedded='true';
  const initialSrc=params.get('src');
  const initialRenderer=params.get('renderer')||'';
  // The Player already isolates executable content in an opaque sandbox by default.
  // External runtime hosts are optional and explicitly requested, never a prerequisite for the viewer.
  const automaticRuntime=params.get('runtime')!=='isolated';
  let paused=false,records=[],catalog=[],catalogDefault=null,currentSource=null,loadSequence=0;
  const localPackages=new Map(); // The value is a browser-minted object URL, never a server upload.
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

  function normalizeSource(value){
    const raw=String(value||'').trim();
    if(localPackages.has(raw))return raw;
    if(!raw)throw new Error("Selecciona un paquete.");
    let url;
    try{url=new URL(raw,location.href);}catch{throw new Error("La URL del ejemplo no es válida.");}
    if(!['http:','https:'].includes(url.protocol))throw new Error("Sólo se admiten los paquetes seleccionados del equipo y URLs HTTP/HTTPS del catálogo.");
    return url.href;
  }
  const sourceName=(src)=>localPackages.get(src)?.name||
    new URL(src,location.href).pathname.split('/').filter(Boolean).at(-1)||src;
  function updateLocalSummary(selected=null){
    if(!fileSummary)return;
    const count=localPackages.size;
    fileSummary.textContent=count
      ? (selected
        ? selected+' · '+count+" paquete(s) del equipo disponibles en el selector."
        : count+" paquete(s) del equipo disponibles en el selector.")
      : "Selecciona archivos .p2lrn del equipo. Se abren en este navegador; no se envían al servidor.";
  }
  const setField=(key,value)=>{if(fields[key])fields[key].textContent=value==null||value===''?'—':String(value);};
  const stateLabels={ERROR:'ERROR',LOADING:'CARGANDO',READY:'LISTO',RENDERED:'MOSTRANDO',BRIDGE:'PREPARANDO'};
  const setState=(value,text)=>{const label=stateLabels[value]||value;state.textContent=label;state.dataset.state=value.toLowerCase();if(status)status.textContent=text||label;};
  const renderLog=()=>{log.textContent=records.map((item)=>'['+item.time+'] '+item.name+item.suffix).join('\n')||'[viewer] sin eventos';log.scrollTop=log.scrollHeight;};
  const write=(name,detail)=>{if(paused)return;let suffix='';if(detail!==undefined){try{suffix=' '+JSON.stringify(detail,null,2);}catch{suffix=' '+String(detail);}}records.push({time:new Date().toLocaleTimeString(),name,suffix});if(records.length>MAX_EVENTS)records=records.slice(-MAX_EVENTS);renderLog();};
  const categoryLabel=(value)=>value==='generated-questionnaire'?'Cuestionarios y juegos':value==='generated-multipart'?'Multipart':value==='generated-external'?'Formatos externos':value==='canonical-external'?'Formatos externos':value==='canonical-reader'?'Ejemplos de Reader':'Ejemplos P2LRN';

  function refreshCatalog(){
    sample.replaceChildren();
    const groups=new Map();
    for(const item of catalog){
      const key=item.sampleRole==='technical-fixture'?'Pruebas técnicas de formatos (no cursos completos)':categoryLabel(item.category);
      if(!groups.has(key)){
        const group=document.createElement('optgroup');
        group.label=key;
        groups.set(key,group);
        sample.append(group);
      }
      const option=document.createElement('option');
      option.value=item.url;
      option.textContent=item.title||item.url;
      option.dataset.renderer=item.rendererId||'';
      groups.get(key).append(option);
    }
    if(localPackages.size){
      const group=document.createElement('optgroup');
      group.label="Paquetes del equipo";
      for(const [url,file] of localPackages){
        const option=document.createElement('option');
        option.value=url;
        option.textContent=file.name;
        option.dataset.renderer='';
        group.append(option);
      }
      sample.append(group);
    }
    if(currentSource)selectCatalogEntry(currentSource);
  }
  function populateCatalog(data){
    catalog=Array.isArray(data?.examples)?data.examples.filter(item=>typeof item?.url==='string'&&typeof item?.title==='string'):[];
    catalogDefault=catalog.find(item=>item.url===data?.defaultExample)?.url??null;
    refreshCatalog();
  }

  // Digest-valid imported archives can be minimal upstream test fixtures.
  function updateSourceNotice(item){
    sampleNotice.replaceChildren();
    if(item?.sampleRole!=='technical-fixture'){
      sampleNotice.hidden=true;
      return;
    }
    const en=document.documentElement.lang.toLowerCase().startsWith('en');
    const heading=document.createElement('strong');
    heading.textContent=en?'Technical compatibility fixture — not a complete course':
      'Archivo de pruebas técnicas — no es un curso completo';
    const description=document.createElement('p');
    description.textContent=String((en?item.sampleNoteEn:item.sampleNoteEs)||
      (en?'This source contains minimal test resources.':'La fuente contiene recursos de prueba mínimos.')).slice(0,400);
    const integrity=document.createElement('p');
    integrity.textContent=en?
      'Verified integrity confirms that the package has not been altered; it does not certify pedagogical completeness or full standard conformance.':
      'La integridad verificada confirma que el paquete no ha sido alterado; no certifica que sea un curso desarrollado ni la conformidad completa del estándar.';
    const children=[heading,description,integrity];
    const fullCourse=catalog.find(row=>row.url==='/examples/canonical/external/common-cartridge-topkit.p2lrn')??{url:'/examples/canonical/external/common-cartridge-topkit.p2lrn'};
    if(fullCourse){
      const link=document.createElement('a');
      const dest=new URL(en?'/en/demo/':'/demo/',location.origin);
      dest.searchParams.set('src',fullCourse.url);
      link.href=dest.pathname+dest.search;
      link.textContent=en?'Open the more extensive TOPkit course':'Abrir el curso TOPkit, con más contenido';
      const note=document.createElement('p');
      note.append(link);
      if(Number.isSafeInteger(fullCourse.bytes)&&fullCourse.bytes>0)
        note.append(document.createTextNode(' ('+Math.ceil(fullCourse.bytes/1048576)+' MiB)'));
      children.push(note);
    }
    sampleNotice.replaceChildren(...children);
    sampleNotice.hidden=false;
  }

  function selectCatalogEntry(src){
    let normalized;
    try{normalized=normalizeSource(src);}catch{return null;}
    const local=localPackages.get(normalized);
    if(local){sample.value=normalized;updateSourceNotice(null);return {url:normalized,title:local.name,rendererId:''};}
    const item=catalog.find(entry=>{
      try{return normalizeSource(entry.url)===normalized;}catch{return false;}
    });
    if(item){
      sample.value=item.url;
      if(!rendererSelect.value&&item.rendererId)rendererSelect.value=item.rendererId;
    }else sample.selectedIndex=-1;
    updateSourceNotice(item);return item;
  }
  async function inspect(src){
    setField('integrity',"verificando…");
    const api=await window.P2LRNReady;
    const pkg=await api.openPackageURL(src);
    const manifest=pkg.manifest||{};
    setField('package',manifest.packageId||sourceName(src));
    setField('format',manifest.format||'—');
    setField('version',manifest.formatVersion||'—');
    setField('integrity',manifest.integrity?.contentRoot?"verificada":"sin contentRoot");
    setField('transport',localPackages.has(src)?"archivo local":(pkg.verification?.transport||'—'));
    setField('entrypoints',Array.isArray(manifest.entrypoints)?manifest.entrypoints.length:0);
    setField('profiles',Array.isArray(manifest.profiles)?manifest.profiles.map(profile=>profile.id).join(' · '):'—');
    write('inspect',{packageId:manifest.packageId,format:manifest.format,formatVersion:manifest.formatVersion,contentRoot:manifest.integrity?.contentRoot,transport:localPackages.has(src)?'local-file':pkg.verification?.transport,profiles:manifest.profiles?.map(profile=>profile.id)});
  }
  async function load(source=null){
    let src;
    try{src=normalizeSource(source??currentSource??sample.value);}
    catch(error){setState('ERROR',error.message);write('source-error',{message:error.message});return;}
    const generation=++loadSequence;
    currentSource=src;
    const local=localPackages.get(src);
    const renderer=rendererSelect.value.trim();
    if(renderer)player.setAttribute('renderer',renderer);else player.removeAttribute('renderer');
    setState('LOADING',"Cargando paquete");
    label.textContent=sourceName(src);
    updateLocalSummary(local?.name||null);
    setField('renderer',renderer||"automático");
    setField('entity','—');
    setField('representation','—');
    write('load',{src:local?'local-file':src,name:sourceName(src),renderer:renderer||null});
    try{
      await inspect(src);
      if(generation!==loadSequence)return;
      if(player.getAttribute('src')===src)await player.reload();
      else player.setAttribute('src',src);
      const next=new URL(location.href);
      // Blob URLs do not survive navigation and must not be published as links.
      if(local)next.searchParams.delete('src');
      else next.searchParams.set('src',src);
      if(renderer)next.searchParams.set('renderer',renderer);
      else next.searchParams.delete('renderer');
      history.replaceState(null,'',next);
      selectCatalogEntry(src);
    }catch(error){
      if(generation!==loadSequence)return;
      setState('ERROR',"No se pudo abrir o verificar el paquete");
      write('load-error',{name:sourceName(src),message:error?.message||String(error)});
    }
  }
  async function addLocalFiles(files){
    if(!files?.length)return;
    const errors=[];
    let first=null;
    for(const file of files){
      if(!/\.p2lrn$/i.test(file.name)||file.size===0){
        errors.push(file.name);
        continue;
      }
      let existing=[...localPackages.entries()].find(([,value])=>
        value.name===file.name&&value.size===file.size&&value.lastModified===file.lastModified
      )?.[0];
      if(!existing){
        existing=URL.createObjectURL(file);
        localPackages.set(existing,{name:file.name,size:file.size,lastModified:file.lastModified});
      }
      if(!first)first=existing;
    }
    if(errors.length){
      write('file-rejected',{files:errors});
      if(!first)setState('ERROR',"Selecciona archivos .p2lrn válidos y no vacíos.");
    }
    if(!first)return;
    refreshCatalog();
    rendererSelect.value='';
    await load(first);
  }
  sample?.addEventListener('change',()=>{
    const option=sample.selectedOptions[0];
    rendererSelect.value=option?.dataset.renderer||'';
    void load(sample.value);
  });
  rendererSelect?.addEventListener('change',()=>{if(currentSource)void load(currentSource);});
  // The main Load package button opens the operating-system file picker.
  loadButton?.addEventListener('click',()=>fileInput?.click());
  fileInput?.addEventListener('change',()=>{
    const files=[...(fileInput.files||[])];
    fileInput.value=''; // Allow choosing the same file again.
    void addLocalFiles(files);
  });
  reloadButton?.addEventListener('click',()=>{if(currentSource)void load(currentSource);});
  addEventListener('pagehide',()=>{for(const url of localPackages.keys())URL.revokeObjectURL(url);localPackages.clear();});
  clearButton?.addEventListener('click',()=>{records=[];renderLog();});
  pauseButton?.addEventListener('click',()=>{paused=!paused;pauseButton.textContent=paused?'Reanudar':'Pausar';});
  copyLogButton?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(log.textContent||'');const before=copyLogButton.textContent;copyLogButton.textContent='Copiado';setTimeout(()=>{copyLogButton.textContent=before;},1200);}catch{}});

  for(const name of ['p2lrn:ready','p2lrn:rendered','p2lrn:activityready','p2lrn:xapi','p2lrn:score','p2lrn:statechange','p2lrn:complete','p2lrn:progressionchange','p2lrn:error']){player.addEventListener(name,(event)=>{write(name,event.detail);if(name==='p2lrn:ready')setState('READY','Paquete verificado; comprobando contenido');if(name==='p2lrn:rendered'){globalThis.P2LRNRecordConversion?.('player_course_rendered');setState('RENDERED','Contenido renderizado');setField('renderer',event.detail?.rendererId);setField('entity',event.detail?.entityId||event.detail?.context?.entityId);setField('representation',event.detail?.representationId);}if(name==='p2lrn:activityready')setState('RENDERED','Actividad externa preparada');if(name==='p2lrn:error')setState('ERROR','Error de reproducción');});}

  async function boot(){try{const api=await window.P2LRNReady;write('runtime',{status:'registered',version:api?.version||globalThis.P2LRN?.version});if(!automaticRuntime)await configureIsolatedRuntime(api);else write('runtime-host',{status:'automatic-opaque',applicationOrigin:location.origin});try{const response=await fetch('/examples/catalog.json',{cache:'no-store'});if(response.ok)populateCatalog(await response.json());}catch(error){write('catalog-error',{message:error?.message||String(error)});}if(globalThis.P2LRN?.installServiceWorker){setState('BRIDGE','Preparando recursos verificados');const pageBridge=await globalThis.P2LRN.installServiceWorker({url:'/p2lrn-sw.js',scope:'/'});const bridge=await globalThis.P2LRN.installServiceWorker({url:'/p2lrn-sw.js',scope:'/__p2lrn__/'});write('virtual-resource-bridge',{status:'ready',pageScope:pageBridge?.scope??'/',resourceScope:bridge?.scope??'/__p2lrn__/',controlled:Boolean(navigator.serviceWorker.controller)});}rendererSelect.value=[...rendererSelect.options].some((option)=>option.value===initialRenderer)?initialRenderer:'';const start=initialSrc||catalogDefault||catalog[0]?.url||'/examples/generated/scorm12-browser-demo.p2lrn';const item=selectCatalogEntry(start);if(!initialRenderer&&item?.rendererId)rendererSelect.value=item.rendererId;await load(start);}catch(error){write('boot-error',{message:error?.message||String(error)});setState('ERROR','Error preparando el visor');}}
  void boot();

  const closeMenu=()=>{nav?.classList.remove('is-open');menu?.setAttribute('aria-expanded','false');if(menu)menu.textContent='Menú';};
  if(menu&&nav){menu.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');menu.setAttribute('aria-expanded',String(open));menu.textContent=open?'Cerrar':'Menú';});document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeMenu();});}
})();