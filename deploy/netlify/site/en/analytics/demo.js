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
  if(demoTitle)demoTitle.textContent="Offline result opened";
  if(demoDescription)demoDescription.textContent="The imported file may contain real learner information. Its scores do not become official grades without an authorized LMS or Host.";
  if(demoNotice)demoNotice.dataset.source='offline-result';
 };
 panel.addEventListener('p2lrn-analytics-refresh',()=>set(hasImportedResult?"Offline result opened in Analytics.":"Sample data loaded.",'ready'));
 panel.addEventListener('p2lrn-analytics-import',()=>{markImported();set("Offline result opened in Analytics.",'ready');});
 panel.addEventListener('p2lrn-analytics-error',()=>set("Could not load Analytics data.",'error'));
 set("Loading P2LRN Analytics…",'loading');
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
    set("Offline result opened in Analytics.",'ready');
   }
  }catch(error){set("Could not open the offline result: "+String(error?.message||error),'error');}
 }
})();