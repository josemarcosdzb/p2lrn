/* Enhanced package selector. Uses the existing P2LRN catalog and /demo/ Player. */
(() => {
  const section = document.querySelector('[data-studio-demo]');
  if (!section) return;
  const locale = section.dataset.locale === 'en' ? 'en' : 'es';
  const labels = {
    es: {
      choose:'Selecciona un paquete. Player se cargará solo cuando lo solicites.',
      loading:'Consultando el catálogo oficial de ejemplos…',
      catalogError:'No se ha podido consultar el catálogo. Puedes abrir el visor mediante los enlaces de ejemplo.',
      notFound:'Este ejemplo no está en el catálogo publicado; no se iniciará un visor con una URL inventada.',
      unverified:'Reproducción e interacción completas pendientes de verificar',
      verified:'Marcado como comprobado en navegador en el catálogo; no garantiza compatibilidad integral',
      status:'Estado del paquete',
      close:'Cerrar el visor',
      format:'Formato',
      license:'Licencia',
      size:'Tamaño',
    },
    en: {
      choose:'Choose a package. Player loads only when you request it.',
      loading:'Checking the published examples catalog…',
      catalogError:'The catalog is unavailable. You can open the viewer from the sample links.',
      notFound:'This example is not in the published catalog; an unverified URL will not be loaded.',
      unverified:'Full playback and interaction remain unverified',
      verified:'Marked browser-verified in catalog; end-to-end compatibility is not guaranteed',
      status:'Package status',
      close:'Close viewer',
      format:'Format',
      license:'License',
      size:'Size',
    },
  }[locale];
  const choices=[...section.querySelectorAll('[data-demo-url]')];
  const host=section.querySelector('[data-demo-stage]');
  const status=section.querySelector('[data-demo-status]');
  const metadata=section.querySelector('[data-demo-metadata]');
  if (!host || !status || !metadata || choices.length===0) return;
  let catalogPromise;
  let requestId=0;
  function getCatalog(){
    if(!catalogPromise){
      catalogPromise=fetch('/examples/catalog.json',{credentials:'same-origin'})
        .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
        .then(x=>Array.isArray(x.examples)?x.examples:[]);
    }
    return catalogPromise;
  }
  const clear=()=>{
    host.replaceChildren();
    choices.forEach(x=>x.setAttribute('aria-pressed','false'));
  };
  async function open(choice){
    const activeRequest=++requestId;
    const url=choice.dataset.demoUrl||'';
    if(!/^\/examples\/[a-z0-9/_-]+\.p2lrn$/i.test(url)){status.textContent=labels.notFound;return}
    clear();
    choice.setAttribute('aria-pressed','true');
    status.textContent=labels.loading;
    let catalog;
    try{catalog=await getCatalog()}catch(error){
      if(activeRequest!==requestId)return;
      clear();status.textContent=labels.catalogError;return;
    }
    if(activeRequest!==requestId)return;
    const item=catalog.find(entry=>entry?.url===url);
    if(!item){
      clear();status.textContent=labels.notFound;return;
    }
    // One authoritative catalog; never infer functional certification from HTTP 200.
    const state=item.browserVerified===true?labels.verified:labels.unverified;
    status.textContent=labels.status+': '+state;
    metadata.textContent=[
      labels.format+': '+(item.sourceFormat||item.category||'P2LRN'),
      item.license?labels.license+': '+item.license:null,
      Number.isFinite(item.bytes)?labels.size+': '+Math.ceil(item.bytes/1024)+' KB':null
    ].filter(Boolean).join(' · ');
    const close=document.createElement('button');
    close.type='button';close.className='studio-demo-close';close.textContent=labels.close;
    close.addEventListener('click',()=>{requestId++;clear();status.textContent=labels.choose;metadata.textContent='';choice.focus()});
    const frame=document.createElement('iframe');
    frame.title='P2LRN Player - '+String(item.title||choice.textContent.trim()).slice(0,140);
    frame.src=(locale==='en'?'/en/demo/':'/demo/')+'?embed=1&src='+encodeURIComponent(item.url);
    frame.setAttribute('loading','eager');
    frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
    frame.setAttribute('allow','fullscreen');
    frame.setAttribute('allowfullscreen','');
    host.append(close,frame);
  }
  choices.forEach(c=>{c.setAttribute('aria-pressed','false');c.addEventListener('click',()=>{void open(c)})});
  status.textContent=labels.choose;
})();
