import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const root=resolve(process.cwd());
const site=join(root,'deploy','netlify','site');
const failures=[];
const read=(p)=>readFile(join(root,p),'utf8');
const routeFile=(route)=>route==='/docs/'?join(site,'docs','index.html'):join(site,...route.slice(1).split('/'),'index.html');
const article=(html)=>/<article class="doc-content">([\s\S]*?)<\/article>/i.exec(html)?.[1]??html;
const pager=(html)=>{
  const body=article(html);
  const prev=/<a class="prev" href="([^"]+)"/i.exec(body)?.[1]??null;
  const next=/<a class="next" href="([^"]+)"/i.exec(body)?.[1]??null;
  return {prev,next};
};

const primary=[
  '/docs/','/docs/empezar/','/docs/que-usar/','/docs/conceptos/','/docs/formato/','/docs/instalar/','/docs/studio/','/docs/paquetes/','/docs/paquetes/multipart/','/docs/toolkit/','/docs/cli/','/docs/player/','/docs/questionnaires/','/docs/questionnaires/standard/','/docs/questionnaires/memory/','/docs/questionnaires/matching/','/docs/questionnaires/ordering/','/docs/questionnaires/classification/','/docs/questionnaires/true-false/','/docs/questionnaires/word-search/','/docs/questionnaires/crossword/','/docs/questionnaires/rosco/','/docs/questionnaires/3d/','/docs/juegos-3d/','/docs/ejemplos/','/docs/integracion/','/docs/eventos/','/docs/progresion/','/docs/metricas/','/docs/compatibilidad/','/docs/recetas/','/docs/glosario/','/docs/referencia/','/docs/troubleshooting/'
];
for(let i=0;i<primary.length;i++){
  const route=primary[i];
  const html=await readFile(routeFile(route),'utf8');
  const p=pager(html);
  if(i>0 && p.prev!==primary[i-1])failures.push(`${route}: prev ${p.prev} expected ${primary[i-1]}`);
  if(i<primary.length-1 && p.next!==primary[i+1])failures.push(`${route}: next ${p.next} expected ${primary[i+1]}`);
}

const branches=[
  ['/docs/npm/','/docs/instalar/','/docs/npm/studio/'],
  ['/docs/npm/studio/','/docs/npm/','/docs/studio/'],
  ['/docs/cdn/','/docs/instalar/','/docs/cdn/studio/'],
  ['/docs/cdn/studio/','/docs/cdn/','/docs/studio/'],
];
for(const [route,prev,next] of branches){
  const p=pager(await readFile(routeFile(route),'utf8'));
  if(p.prev!==prev||p.next!==next)failures.push(`${route}: branch pager ${JSON.stringify(p)} expected ${prev} -> ${next}`);
}

const js=await read('deploy/netlify/site/p2lrn.js');
const css=await read('deploy/netlify/site/p2lrn.css');
for(const token of ["['EMPEZAR'","['CREAR'","['INSTALAR'","['REPRODUCIR'","['INTEGRAR'","['SEGUIMIENTO'","['REFERENCIA'"])if(!js.includes(token))failures.push('p2lrn.js missing sidebar group '+token);
const order=['EMPEZAR','INSTALAR','CREAR','REPRODUCIR','INTEGRAR','SEGUIMIENTO','REFERENCIA'].map(x=>js.indexOf("['"+x+"'"));
for(let i=1;i<order.length;i++)if(order[i]<=order[i-1])failures.push('sidebar groups are not in product-flow order');
const childBlock=/const DOC_SIDEBAR_CHILDREN = new Map\(\[([\s\S]*?)\n  \]\);/.exec(js)?.[1] ?? '';
const foundationalRoutes=['/docs/que-usar/','/docs/conceptos/','/docs/formato/'];
const foundationalOrder=foundationalRoutes.map(route=>childBlock.indexOf("['"+route+"'"));
for(let i=0;i<foundationalOrder.length;i++)if(foundationalOrder[i]<0)failures.push('missing foundational route under Antes de empezar');
for(let i=1;i<foundationalOrder.length;i++)if(foundationalOrder[i]<=foundationalOrder[i-1])failures.push('Antes de empezar children are not in mental-model order');
const flatSidebar=/const GLOBAL_SIDEBAR = \[([\s\S]*?)\n  \];/.exec(js)?.[1] ?? '';
for(const route of foundationalRoutes)if(flatSidebar.includes("['"+route+"'"))failures.push('foundational route is flat instead of nested under Antes de empezar: '+route);
for(const route of ['/docs/progresion/','/docs/metricas/']){
  if(childBlock.includes("['"+route+"'"))failures.push('advanced tracking route remains under Antes de empezar: '+route);
  const seguimiento=flatSidebar.slice(flatSidebar.indexOf("['SEGUIMIENTO', ["),flatSidebar.indexOf("['REFERENCIA', ["));
  if(!seguimiento.includes("['"+route+"'"))failures.push('tracking route missing from SEGUIMIENTO: '+route);
}
for(const token of ['docs-sidebar-toggle','doc-toc','doc-child-subnav','DOC_SIDEBAR_CHILDREN','doc-breadcrumbs','Migas de pan','requestAnimationFrame(revealCurrent)','syncToggleHeight','mobileIndexCurrent.textContent=pageTitle','aria-current\',\'location','Índice de documentación'])if(!js.includes(token))failures.push('p2lrn.js missing documentation UX hook '+token);
for(const token of ['.doc-sidebar.is-open','.docs-sidebar-toggle{display:flex','.docs-sidebar-toggle{position:sticky;top:64px','.doc-sidebar.is-open{position:sticky!important;top:calc(64px + var(--docs-index-toggle-height,52px))!important','.doc-breadcrumbs{','.doc-toc ol','.doc-child-subnav{','.doc-child-subnav a[aria-current="page"]','max-height:calc(100vh - 124px)'])if(!css.includes(token))failures.push('p2lrn.css missing documentation UX rule '+token);

const npm=article(await read('deploy/netlify/site/docs/npm/index.html'));
const cdn=article(await read('deploy/netlify/site/docs/cdn/index.html'));
if(/\bCDN\b|p2lrn\.netlify\.app/u.test(npm))failures.push('NPM article leaks CDN instructions');
if(/\bNPM\b|npm install|\bnpx\b|@p2lrn\//u.test(cdn))failures.push('CDN article leaks NPM instructions');

const richMinimum=new Map([
  ['/docs/empezar/',5],['/docs/conceptos/',8],['/docs/studio/',7],['/docs/progresion/',8],['/docs/eventos/',9],['/docs/metricas/',12],['/docs/recetas/',4],['/docs/glosario/',5],['/docs/questionnaires/',5]
]);
for(const [route,min] of richMinimum){
  const html=await readFile(routeFile(route),'utf8');
  const count=[...article(html).matchAll(/<section class="doc-section">/g)].length;
  if(count<min)failures.push(`${route}: only ${count} content sections, expected at least ${min}`);
}
for(const route of primary.filter(x=>x.startsWith('/docs/questionnaires/')&&x!=='/docs/questionnaires/')){
  const body=article(await readFile(routeFile(route),'utf8'));
  for(const heading of ['Qué hace y qué ve el alumno','Crear en Studio','Requisitos del contenido','Ejemplo de datos válido','Crear por CLI','Interacción y accesibilidad','Finalización y puntuación'])if(!body.includes(heading))failures.push(`${route}: missing learner-facing section ${heading}`);
}

for(const route of primary){const body=article(await readFile(routeFile(route),'utf8'));if(body.includes('Modelo mínimo'))failures.push(route+': vague Modelo mínimo section remains');if(body.includes('p2lrn.org/renderizador/'))failures.push(route+': translated renderer identifier remains');if(body.includes('--renderizador'))failures.push(route+': translated CLI flag remains');}
if(failures.length)throw new Error('Documentation flow audit failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,primaryFlowPages:primary.length,branchFlows:branches.length,installBeforeCreate:true,mobileNavigation:'sticky-collapsed-index',breadcrumbs:true,childPageSubmenu:true,samePageSectionsInSidebar:false,mobileIndexRevealsCurrentPage:true,mobileIndexUsesPageTitle:true,mobileIndexDynamicOffset:true,beforeStartOwnsFoundationalDocs:true,progressionAndMetricsGroupedUnderTracking:true,trackingAfterIntegration:true,longPageToc:true,questionnaireExperienceGuides:10,noVagueMinimumExamples:true},null,2));