(async()=>{
 const status=document.querySelector('[data-analytics-status]');
 const panel=document.querySelector('p2lrn-analytics');
 const demoTitle=document.querySelector('[data-analytics-demo-title]');
 const demoDescription=document.querySelector('[data-analytics-demo-description]');
 const demoNotice=document.querySelector('[data-analytics-demo-notice]');
 if(!status||!panel)return;
 let hasImportedResult=false;
 const set=(text,state)=>{status.textContent=text;status.dataset.state=state;};
 const markImported=()=>{
  hasImportedResult=true;
  if(demoTitle)demoTitle.textContent="Resultado offline abierto";
  if(demoDescription)demoDescription.textContent="El archivo importado puede contener información real de alumnos. Sus puntuaciones no son notas oficiales sin aceptación de un LMS o Host autorizado.";
  if(demoNotice)demoNotice.dataset.source='offline-result';
 };
 panel.addEventListener('p2lrn-analytics-refresh',()=>set(hasImportedResult?"Resultado offline abierto en Analytics.":"Datos de prueba cargados.",'ready'));
 panel.addEventListener('p2lrn-analytics-import',()=>{markImported();set("Resultado offline abierto en Analytics.",'ready');});
 panel.addEventListener('p2lrn-analytics-error',()=>set("No se pudieron cargar los datos de Analytics.",'error'));
 set("Cargando P2LRN Analytics…",'loading');
 const params=new URLSearchParams(location.search);
 if(params.get('import')==='offline-result'){
  try{
   await customElements.whenDefined('p2lrn-analytics');
   const raw=sessionStorage.getItem('p2lrn:analytics:offline-result');
   try{window.opener=null}catch{}
   if(raw){
    panel.removeAttribute('src');
    await panel.importOfflineResult(raw);
    markImported();
    sessionStorage.removeItem('p2lrn:analytics:offline-result');
    set("Resultado offline abierto en Analytics.",'ready');
   }
  }catch(error){set("No se pudo abrir el resultado offline: "+String(error?.message||error),'error');}
 }
})();