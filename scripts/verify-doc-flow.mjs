import {readFile,readdir} from 'node:fs/promises';
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
  '/docs/','/docs/empezar/','/docs/que-usar/','/docs/conceptos/','/docs/formato/','/docs/empezar-facil/','/docs/instalar/','/docs/cdn/','/docs/cdn/studio/','/docs/studio/','/docs/entrega-offline/','/docs/paquetes/','/docs/paquetes/multipart/','/docs/toolkit/','/docs/cli/','/docs/player/','/docs/questionnaires/','/docs/questionnaires/standard/','/docs/questionnaires/memory/','/docs/questionnaires/matching/','/docs/questionnaires/ordering/','/docs/questionnaires/classification/','/docs/questionnaires/true-false/','/docs/questionnaires/word-search/','/docs/questionnaires/crossword/','/docs/questionnaires/rosco/','/docs/questionnaires/3d/','/docs/juegos-3d/','/docs/ejemplos/','/docs/integracion/','/docs/eventos/','/docs/progresion/','/docs/metricas/','/docs/analytics/','/docs/compatibilidad/','/docs/recetas/','/docs/glosario/','/docs/referencia/','/docs/troubleshooting/'
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
];
for(const [route,prev,next] of branches){
  const p=pager(await readFile(routeFile(route),'utf8'));
  if(p.prev!==prev||p.next!==next)failures.push(`${route}: branch pager ${JSON.stringify(p)} expected ${prev} -> ${next}`);
}

const connectorFlow=[
  ['/docs/conectores/','/docs/integracion/','/docs/conectores/ia/'],
  ['/docs/conectores/ia/','/docs/conectores/','/docs/conectores/lms/'],
  ['/docs/conectores/lms/','/docs/conectores/ia/','/docs/conectores/lti/'],
  ['/docs/conectores/lti/','/docs/conectores/lms/','/docs/conectores/'],
];
for(const [route,prev,next] of connectorFlow){
  const p=pager(await readFile(routeFile(route),'utf8'));
  if(p.prev!==prev||p.next!==next)
    failures.push(route+': connector guide pager '+JSON.stringify(p)+' expected '+prev+' -> '+next);
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
for(const route of ['/docs/progresion/','/docs/metricas/','/docs/analytics/']){
  if(childBlock.includes("['"+route+"'"))failures.push('advanced tracking route remains under Antes de empezar: '+route);
  const seguimiento=flatSidebar.slice(flatSidebar.indexOf("['SEGUIMIENTO', ["),flatSidebar.indexOf("['REFERENCIA', ["));
  if(!seguimiento.includes("['"+route+"'"))failures.push('tracking route missing from SEGUIMIENTO: '+route);
}
for(const token of ['docs-sidebar-toggle','doc-page-toc','doc-page-toc-toggle','doc-page-toc-nav','doc-child-subnav','DOC_SIDEBAR_CHILDREN','doc-breadcrumbs','Migas de pan','requestAnimationFrame(revealCurrent)','syncToggleHeight','mobileIndexCurrent.textContent=pageTitle','aria-current\',\'location','Índice de documentación'])if(!js.includes(token))failures.push('p2lrn.js missing documentation UX hook '+token);
for(const token of ['.doc-sidebar.is-open','.docs-sidebar-toggle{display:flex','.docs-sidebar-toggle{position:sticky;top:64px','.doc-sidebar.is-open{position:sticky!important;top:calc(64px + var(--docs-index-toggle-height,52px))!important','.doc-breadcrumbs{','.doc-page-toc{grid-column:3','.doc-page-toc ol','.doc-toc{display:none!important','.doc-child-subnav{','.doc-child-subnav a[aria-current="page"]','max-height:calc(100vh - 124px)'])if(!css.includes(token))failures.push('p2lrn.css missing documentation UX rule '+token);

const easy=article(await read('deploy/netlify/site/docs/empezar-facil/index.html'));
const npm=article(await read('deploy/netlify/site/docs/npm/index.html'));
const cdn=article(await read('deploy/netlify/site/docs/cdn/index.html'));
if(/\bCDN\b|p2lrn\.netlify\.app/u.test(npm))failures.push('NPM article leaks CDN instructions');
if(/\bNPM\b|npm install|\bnpx\b|@p2lrn\//u.test(cdn))failures.push('CDN article leaks NPM instructions');

const richMinimum=new Map([
  ['/docs/empezar/',6],['/docs/conceptos/',8],['/docs/studio/',7],['/docs/entrega-offline/',10],['/docs/progresion/',8],['/docs/eventos/',9],['/docs/metricas/',12],['/docs/analytics/',10],['/docs/recetas/',4],['/docs/glosario/',5],['/docs/questionnaires/',5]
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
const offlineGuide=article(await read('deploy/netlify/site/docs/entrega-offline/index.html'));
for(const term of ['Entrega offline y paquetes autorreproducibles','Windows · un archivo','ZIP portable','.p2lrn-result','No es un nuevo formato de curso','no está firmado digitalmente','Colaboración en directo','Revisar entrega'])if(!offlineGuide.includes(term))failures.push('offline delivery guide missing '+term);
for(const source of ['deploy/netlify/site/index.html','deploy/netlify/site/docs/index.html','deploy/netlify/site/docs/empezar/index.html','deploy/netlify/site/docs/studio/index.html','deploy/netlify/site/studio/index.html']){const html=await read(source);if(!html.includes('href="/docs/entrega-offline/"'))failures.push(source+': missing offline delivery discovery link');}
if(!js.includes("['/docs/entrega-offline/','Entrega offline']"))failures.push('documentation navigation missing offline delivery route');
const sitemap=await read('deploy/netlify/site/sitemap.xml');if(!sitemap.includes('https://p2lrn.netlify.app/docs/entrega-offline/'))failures.push('sitemap missing offline delivery route');

// Full public-source currentness audit. The generated build has additional
// artifact checks, but source documentation must also remain truthful/readable.
const currentPlayerVersion=JSON.parse(await read('packages/player/package.json')).version;
const publicEntries=await readdir(site,{recursive:true});
const publicHtml=publicEntries.filter(name=>String(name).replaceAll('\\','/').endsWith('.html'));
for(const name of publicHtml){
  const html=await readFile(join(site,name),'utf8');
  if(html.includes('0.5.0-alpha.10'))failures.push('stale alpha.10 reference in public source: '+String(name));
}
if(publicHtml.length<59)failures.push('public HTML inventory unexpectedly shrank: '+publicHtml.length);

const requiredByFile=new Map([
  ['deploy/netlify/site/docs/player/index.html',[
    'createCapabilityBroker','createMcpCapabilityProvider','createOfflineHostAdapter',
    'createOfflineSyncController','createCacheStoragePackageCache','createActivityTracker',
    'createLearningEventStream','createMemoryResourceLibrary','createHttpCollaborationProvider'
  ]],
  ['deploy/netlify/site/docs/integracion/index.html',[
    'offlineDeliveryId','createOfflineSyncController','createCacheStorageResourceLibrary',
    'createResourceLibraryResolver','createReferenceAuthoritativeHost','cachePackageURL'
  ]],
  ['deploy/netlify/site/docs/toolkit/index.html',[
    '@p2lrn/toolkit@'+currentPlayerVersion,'@p2lrn/toolkit/host','setCourseRights',
    'createReferenceAuthoritativeHost'
  ]],
  ['deploy/netlify/site/docs/studio/index.html',[
    'author','createdAt','license','copyrightHolder','resourceLibrary',
    'materializeSharedResource','exportOfflineAssignment','reviewOfflineResult'
  ]],
  ['deploy/netlify/site/docs/analytics/index.html',[
    'P2LRN Analytics','@p2lrn/analytics','analytics/current/dist/p2lrn-analytics.js',
    'authoritative: true','createHttpAnalyticsDataSource','p2lrn-analytics-refresh'
  ]],
  ['deploy/netlify/site/docs/referencia/index.html',[
    'createMcpCapabilityProvider','createOfflineSyncController','createLearningEventStream',
    'createCacheStorageResourceLibrary','@p2lrn/toolkit/host','reviewOfflineResult'
  ]],
  ['deploy/netlify/site/docs/conectores/lti/index.html',[
    'createP2LRNLtiProvider','createP2LRNLtiServer','/lti/login','/lti/launch',
    '/lti/deep-link','/lti/jwks','NRPS','self-hosted'
  ]],
  ['deploy/netlify/site/docs/conectores/lms/index.html',[
    'proveedor LTI 1.3 universal self-hosted','binding manual autorizado',
    'Implementado no equivale a certificado en todos los LMS'
  ]]
]);
for(const [file,tokens] of requiredByFile){
  const body=await read(file);
  for(const token of tokens)if(!body.includes(token))failures.push(file+': missing current API/status token '+token);
}
const ltiDoc=await read('deploy/netlify/site/docs/conectores/lti/index.html');
for(const stale of [
  'no contiene endpoints OIDC/JWKS o un gateway operativo',
  'Pendiente: proveedor P2LRN LTI real',
  'Las rutas <code>/lti/login</code>, <code>/lti/launch</code> y <code>/lti/jwks</code> aparecen en el diseño técnico',
  'queda pendiente de implementación E2E. Los contratos descargables cubren sólo una parte'
])if(ltiDoc.includes(stale))failures.push('LTI documentation still contains obsolete implementation claim: '+stale);
const lmsDoc=await read('deploy/netlify/site/docs/conectores/lms/index.html');
for(const stale of [
  'gateway LTI 1.3 multiinstitución continúa en desarrollo',
  'gateway de producción de P2LRN todavía no está implementado',
  'Este recorrido está diseñado, no desplegado',
  'el gateway real todavía está pendiente'
])if(lmsDoc.includes(stale))failures.push('LMS documentation still contains obsolete provider claim: '+stale);

const playerTypes=await read('packages/player/types/index.d.ts');
for(const token of [
  'createMcpCapabilityProvider','createOfflineSyncController','createMemoryResourceLibrary',
  'createCacheStorageResourceLibrary','createResourceLibraryResolver',
  'createLearningEventStream','observeLearningEvents','RESOURCE_LIBRARY_CAPABILITY_ID'
])if(!playerTypes.includes(token))failures.push('Player public TypeScript declaration missing runtime export '+token);
const ltiArchitecture=await read('integration/lms/ARCHITECTURE.md');
if(ltiArchitecture.includes('| Proveedor P2LRN LTI 1.3 multiinstitución | Pendiente |'))
  failures.push('internal LTI architecture still marks implemented provider as pending');
const connectorBuild=await read('deploy/netlify/build-connector-downloads.mjs');
if(connectorBuild.includes('Pendiente: registro confiable de LMS, OIDC/JWKS/launch firmado'))
  failures.push('downloadable LTI README still describes implemented provider as pending');

if(failures.length)throw new Error('Documentation flow audit failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,primaryFlowPages:primary.length,branchFlows:branches.length,connectorFlowPages:connectorFlow.length,easyStartBeforeInstall:true,defaultInstallPath:'CDN',cdnBeforeNpm:true,installBeforeCreate:true,mobileNavigation:'sticky-collapsed-index',breadcrumbs:true,childPageSubmenu:true,samePageSectionsInSidebar:false,mobileIndexRevealsCurrentPage:true,mobileIndexUsesPageTitle:true,mobileIndexDynamicOffset:true,beforeStartOwnsFoundationalDocs:true,progressionAndMetricsGroupedUnderTracking:true,trackingAfterIntegration:true,longPageToc:true,questionnaireExperienceGuides:10,offlineDeliveryGuide:true,fullPublicHtmlAudit:true,currentVersion:currentPlayerVersion,noVagueMinimumExamples:true},null,2));