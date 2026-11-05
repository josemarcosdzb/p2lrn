// Source-backed gallery. All URLs come from the verified build catalog;
// course HTML is never inserted into this page and external JS is never run here.
(() => {
  const root=document.querySelector('[data-community-examples]');
  if(!root)return;
  const en=document.documentElement.lang.toLowerCase().startsWith('en');
  const labels=en?{
    filter:'Format',all:'All formats',search:'Find an example',count:n=>n+' packages',
    view:'Open in Player',download:'Download .p2lrn',original:'Original source',
    license:'Licence',package:'Package',pending:'Not certified for full playback',
    noResults:'No examples match these filters.',unavailable:'Catalog unavailable; please try again.',
    verified:'Package integrity verified',partial:'Partial or conditional playback',
  }:{
    filter:'Formato',all:'Todos los formatos',search:'Buscar un ejemplo',count:n=>n+' paquetes',
    view:'Abrir en Player',download:'Descargar .p2lrn',original:'Fuente original',
    license:'Licencia',package:'Paquete',pending:'Reproducción completa no certificada',
    noResults:'No hay ejemplos con estos filtros.',unavailable:'Catálogo no disponible; inténtalo de nuevo.',
    verified:'Integridad del paquete verificada',partial:'Reproducción parcial o condicionada',
  };
  const validPath=/^\/examples\/canonical\/external\/free\/[a-z0-9][a-z0-9-]*\.p2lrn$/;
  const localeRoot=en?'/en/demo/':'/demo/';
  const formats={scorm:'SCORM',h5p:'H5P',qti:'QTI 3',cmi5:'cmi5',imscc:'Common Cartridge'};
  const controls=document.createElement('div');controls.className='p2lrn-community-controls';
  const filter=document.createElement('select');filter.setAttribute('aria-label',labels.filter);
  const search=document.createElement('input');search.type='search';search.placeholder=labels.search;search.setAttribute('aria-label',labels.search);
  const count=document.createElement('p');count.className='p2lrn-community-count';count.setAttribute('aria-live','polite');
  const grid=document.createElement('div');grid.className='p2lrn-community-grid';
  const summary=document.createElement('p');summary.className='p2lrn-community-notice';
  const label=document.createElement('label');label.textContent=labels.filter+' ';label.append(filter);
  controls.append(label,search,count);root.replaceChildren(controls,summary,grid);
  const sourceLink=(href,text)=>{
    try{
      const url=new URL(String(href),location.origin);
      if(!['https:','http:'].includes(url.protocol))return null;
      const a=document.createElement('a');a.href=url.href;a.textContent=text;
      a.rel='noopener noreferrer';return a;
    }catch{return null;}
  };
  const create=(tag,txt,className='')=>{
    const el=document.createElement(tag);el.textContent=txt;if(className)el.className=className;return el;
  };
  function family(item){
    if(item.sourceFormat && Object.hasOwn(formats,item.sourceFormat))return item.sourceFormat;
    const profiles=item.profiles??[];
    return Object.keys(formats).find(k=>profiles.some(p=>String(p).endsWith('/'+(k==='imscc'?'common-cartridge':k))))??'other';
  }
  let rows=[];
  const allOption=document.createElement('option');allOption.value='all';allOption.textContent=labels.all;filter.append(allOption);
  function display(){
    const needle=search.value.trim().toLocaleLowerCase();const kind=filter.value;
    const matches=rows.filter(item=>(kind==='all'||item.family===kind)&&
      (!needle||[item.title,item.family,item.license,item.url].join(' ').toLocaleLowerCase().includes(needle)));
    count.textContent=labels.count(matches.length);
    grid.replaceChildren();
    if(!matches.length){grid.append(create('p',labels.noResults));return;}
    for(const entry of matches){
      const card=document.createElement('article');card.className='p2lrn-community-item';
      card.append(create('span',formats[entry.family]??entry.family.toUpperCase(),'p2lrn-community-type'));
      card.append(create('h3',entry.title??entry.url.split('/').at(-1)));
      const status=entry.browserVerified===true?labels.verified:
        entry.sourceFormat==='h5p'||entry.sourceFormat==='qti'||entry.sourceFormat==='cmi5'?
        labels.partial:labels.pending;
      card.append(create('p',status,'p2lrn-community-status'));
      const dl=document.createElement('div');dl.className='p2lrn-community-links';
      const viewer=new URL(localeRoot,location.origin);viewer.searchParams.set('src',entry.url);
      dl.append(sourceLink(viewer.href,labels.view));
      const packageLink=sourceLink(entry.url,labels.download);
      if(packageLink){packageLink.download='';dl.append(packageLink);}
      if(entry.originUrl){const original=sourceLink(entry.originUrl,labels.original);if(original)dl.append(original);}
      card.append(dl);
      const details=create('small',labels.license+': '+String(entry.license??'—')+' · '+Math.ceil(Number(entry.bytes??0)/1024)+' KiB','p2lrn-community-details');
      card.append(details);
      grid.append(card);
    }
  }
  search.addEventListener('input',display);
  filter.addEventListener('change',display);
  fetch('/examples/catalog.json',{cache:'no-store',credentials:'same-origin'})
    .then(async(response)=>{
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      rows=(Array.isArray(data.examples)?data.examples:[])
        .filter(item=>item&&typeof item.url==='string'&&validPath.test(item.url))
        .map(item=>({...item,family:family(item)}));
      const values=[...new Set(rows.map(item=>item.family))].sort();
      for(const kind of values){const opt=document.createElement('option');opt.value=kind;opt.textContent=formats[kind]??kind;filter.append(opt);}
      summary.textContent=en?
        'Real third-party files imported and SHA-256 checked. Preserving a package does not certify complete standard compliance.':
        'Archivos reales de terceros importados y comprobados con SHA-256. Conservar un paquete no certifica la compatibilidad integral del estándar.';
      display();
    }).catch(()=>{summary.textContent=labels.unavailable;count.textContent='';grid.replaceChildren();});
})();