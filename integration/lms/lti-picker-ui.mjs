// UI for the authorized LTI Deep Linking picker; no LMS secrets enter the browser.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
function submitForm(ticket,c,e,main=false){
 return '<form method="post" action="/lti/deep-link/confirm">'+
  '<input type="hidden" name="ticket" value="'+esc(ticket)+'">'+
  '<input type="hidden" name="catalogId" value="'+esc(c.id)+'">'+
  '<input type="hidden" name="entityId" value="'+esc(e.id)+'">'+
  '<button type="submit">'+(main?'Añadir curso':'Añadir actividad')+'</button></form>';
}
export function pickerHtml({ticket,contents,cspNonce}){
 const cards=[];
 for(const c of contents||[]){
  const entities=(c.entities||[]).filter(e=>['course','unit','activity'].includes(e.type));
  const main=entities.find(e=>e.type==='course')||entities[0];
  if(!main)continue;
  const other=entities.filter(e=>e!==main);
  const activity=other.map(e=>'<li><span>'+esc(e.title||e.id)+'</span>'+submitForm(ticket,c,e)+'</li>').join('');
  const search=[c.title,main.title,...other.map(e=>e.title)].filter(Boolean).join(' ');
  cards.push('<article class="course" data-filter="'+esc(search)+'"><div class="main-card">'+
   '<div><span class="tag">Curso P2LRN</span><h2>'+esc(c.title||main.title)+'</h2>'+
   '<p>'+other.length+' actividades o unidades</p></div>'+submitForm(ticket,c,main,true)+'</div>'+
   (other.length?'<details><summary>Elegir una actividad específica (opcional)</summary><ul>'+activity+'</ul></details>':'')+'</article>');
 }
 const code='(()=>{const input=document.getElementById("buscar");'+
  'const items=[...document.querySelectorAll(".course")],count=document.getElementById("total"),'+
  'empty=document.getElementById("vacio");'+
  'const norm=x=>x.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();'+
  'const update=()=>{const q=norm(input.value.trim());let n=0;for(const card of items){'+
  'card.hidden=!norm(card.dataset.filter).includes(q);if(!card.hidden)n++;}'+
  'count.textContent=n+" "+(n===1?"curso disponible":"cursos disponibles");empty.hidden=n>0;};input.addEventListener("input",update);update();})();';
 return '<!doctype html><html lang="es"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta name="referrer" content="no-referrer"><title>Añadir un curso</title>'+
  '<style>:root{font-family:system-ui,sans-serif;background:#f4f7fb;color:#172b45}*{box-sizing:border-box}'+
  'body{margin:0}main{max-width:940px;margin:auto;padding:clamp(16px,4vw,36px)}'+
  'h1{font-size:clamp(1.5rem,3vw,2rem)}h2{font-size:1.14rem;margin:.3rem 0}'+
  'p{line-height:1.5}.course{background:white;border:1px solid #becddf;border-radius:12px;padding:18px;margin:12px 0}'+
  '.main-card{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}'+
  '.main-card p{margin:0;color:#425670}.tag{font-size:.8rem;color:#275580;font-weight:700}'+
  'button{border:0;border-radius:8px;background:#1353a1;color:white;padding:12px 17px;min-height:44px;font:inherit;font-weight:650;cursor:pointer}'+
  'button:hover{background:#0b3c74}button:focus-visible,summary:focus-visible,input:focus-visible{outline:3px solid #eb9d16;outline-offset:3px}'+
  'input[type=search]{width:100%;background:white;color:inherit;border:2px solid #66798f;border-radius:9px;padding:13px;font:inherit}'+
  '.upload{background:#eaf3ff;border:1px solid #86acda;border-radius:12px;padding:18px;margin:20px 0}'+
  '.upload h2{margin:0 0 8px}.upload label{display:block;font-weight:650;margin:12px 0 5px}'+
  '.upload input[type=file]{display:block;max-width:100%;padding:10px 0;font:inherit}'+
  '.upload button{margin-top:10px}.upload p{margin:6px 0}'+
  'details{margin-top:14px;padding-top:11px;border-top:1px solid #e0e6ef}summary{color:#16579a;font-weight:600;cursor:pointer}'+
  'ul{list-style:none;padding:0;margin:10px 0}li{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:9px 0;border-bottom:1px solid #edf2f7}'+
  '[hidden]{display:none!important}@media(max-width:480px){.main-card form,.main-card form button{width:100%}}</style></head>'+
  '<body><main><h1>Insertar contenido P2LRN</h1><p>Elige un curso y pulsa <b>Añadir curso</b>. Volverás a tu aula. '+
  'No necesitas descargar archivos ni configurar nada más.</p>'+
  '<section class="upload"><h2>¿Tu curso todavía no está aquí?</h2>'+
  '<p>Desde Studio, exporta un archivo <b>.p2lrn</b>. Selecciónalo y se añadirá a esta aula sin convertirlo ni cambiarlo.</p>'+
  '<form method="post" action="/lti/deep-link/confirm" enctype="multipart/form-data">'+
  '<input type="hidden" name="ticket" value="'+esc(ticket)+'">'+
  '<label for="p2lrn-file">Archivo del curso</label>'+
  '<input id="p2lrn-file" type="file" name="course" accept=".p2lrn,application/vnd.p2lrn+zip" required>'+
  '<button type="submit">Publicar y añadir</button></form></section>'+
  '<label for="buscar"><b>O seleccionar un curso publicado</b></label><input id="buscar" type="search" placeholder="Título del curso" autocomplete="off">'+
  '<p id="total" role="status" aria-live="polite"></p>'+cards.join('')+
  '<p id="vacio" hidden>'+(cards.length?'No hay cursos con ese nombre.':'No hay cursos publicados. Contacta con el administrador de P2LRN.')+'</p>'+
  '<script nonce="'+esc(cspNonce)+'">'+code+'</script></main></body></html>';
}
