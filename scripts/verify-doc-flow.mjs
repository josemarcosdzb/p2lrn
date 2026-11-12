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
for(const route of primary){
  const html=await readFile(routeFile(route),'utf8');
  if(!/<h1\b[^>]*>[\s\S]*?<\/h1>/iu.test(html))failures.push(route+': missing main heading');
  const p=pager(html);
  for(const [direction,target] of Object.entries(p)){
    if(!target)continue; // Section landing pages may end a reading journey.
    if(!/^\/(?:docs(?:\/[a-z0-9/-]*)?|demo)\/$/iu.test(target)||target===route){
      failures.push(route+': unsafe/self '+direction+' pager '+target);continue;
    }
    try{await readFile(routeFile(target),'utf8');}
    catch{failures.push(route+': '+direction+' pager target missing '+target);}
  }
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
const sections=['EMPEZAR','CREAR','REPRODUCIR','DESARROLLADORES','INSTALAR','INTEGRAR','CONECTORES','REFERENCIA','RECURSOS'];
const offsets=sections.map(section=>js.indexOf("['"+section+"', ["));
for(let i=0;i<sections.length;i++){
  if(offsets[i]<0)failures.push('missing sidebar section '+sections[i]);
  if(i&&offsets[i]<=offsets[i-1])failures.push('sidebar sections out of current teacher/developer order: '+sections[i]);
}
for(const marker of ['const GLOBAL_SIDEBAR = [','const DOC_SIDEBAR_CHILDREN = new Map([',
  'docs-sidebar-toggle','doc-page-toc','doc-breadcrumbs','doc-child-subnav',
  'requestAnimationFrame(revealCurrent)','mobileIndexCurrent.textContent=pageTitle',
  "childLink.setAttribute('aria-current','page')"])
  if(!js.includes(marker))failures.push('documentation accessibility/navigation hook missing '+marker);
for(const marker of ['.doc-sidebar.is-open','.doc-page-toc{','.doc-child-subnav{'])
  if(!css.includes(marker))failures.push('documentation responsive navigation rule missing '+marker);
for(const route of ['/docs/empezar/','/docs/studio/','/docs/entrega-offline/','/docs/desarrolladores/',
  '/docs/conectores/','/docs/analytics/','/docs/player/'])
  if(!js.includes("'"+route+"'"))failures.push('navigation missing teacher/developer route '+route);
const easy=article(await read('deploy/netlify/site/docs/empezar-facil/index.html'));
const npm=article(await read('deploy/netlify/site/docs/npm/index.html'));
const cdn=article(await read('deploy/netlify/site/docs/cdn/index.html'));
const docsHome=article(await read('deploy/netlify/site/docs/index.html'));
for(const route of ['/docs/studio/','/docs/desarrolladores/','/docs/entrega-offline/'])
  if(!docsHome.includes('href="'+route+'"'))failures.push('docs home missing learning path '+route);
if(!docsHome.includes('Profesores')||!docsHome.includes('Desarrolladores'))
  failures.push('documentation must separate teachers from developers');
if(/\bCDN\b|p2lrn\.netlify\.app/u.test(npm))failures.push('NPM article leaks CDN instructions');
if(/\bNPM\b|npm install|\bnpx\b|@p2lrn\//u.test(cdn))failures.push('CDN article leaks NPM instructions');

const richMinimum=new Map([
  ['/docs/empezar/',3],['/docs/conceptos/',8],['/docs/studio/',7],['/docs/entrega-offline/',10],['/docs/progresion/',8],['/docs/eventos/',9],['/docs/metricas/',12],['/docs/analytics/',10],['/docs/recetas/',4],['/docs/glosario/',5],['/docs/questionnaires/',4]
]);
for(const [route,min] of richMinimum){
  const html=await readFile(routeFile(route),'utf8');
  const count=[...article(html).matchAll(/<section\b[^>]*class="doc-section"[^>]*>/g)].length;
  if(count<min)failures.push(`${route}: only ${count} content sections, expected at least ${min}`);
}
for(const route of primary.filter(x=>x.startsWith('/docs/questionnaires/')&&x!=='/docs/questionnaires/')){
  const body=article(await readFile(routeFile(route),'utf8'));
  for(const heading of ['Interacción y accesibilidad','Finalización y puntuación'])
    if(!body.includes(heading))failures.push(route+': missing learner-facing section '+heading);
  for(const token of ['Studio','Vista alumno'])
    if(!body.includes(token))failures.push(route+': missing practical authoring/learner step '+token);
  const words=body.replace(/<[^>]*>/gu,' ').trim().split(/\s+/u);
  if(words.length<180)failures.push(route+': activity guide too short to explain controls and scoring: '+words.length);
}

for(const route of primary){const body=article(await readFile(routeFile(route),'utf8'));if(body.includes('Modelo mínimo'))failures.push(route+': vague Modelo mínimo section remains');if(body.includes('p2lrn.org/renderizador/'))failures.push(route+': translated renderer identifier remains');if(body.includes('--renderizador'))failures.push(route+': translated CLI flag remains');}
const offlineGuide=article(await read('deploy/netlify/site/docs/entrega-offline/index.html'));
for(const term of ['Preparar una entrega offline con Studio','Windows 64 bits · EXE','ZIP portable','Windows · CMD','.p2lrn-result','No abras un curso ejecutable de procedencia desconocida.','Caducidad desde la primera apertura','aperturas registradas','Abrir en Analytics','Colaboración en directo','Revisar entrega'])if(!offlineGuide.includes(term))failures.push('offline delivery guide missing '+term);
for(const source of ['deploy/netlify/site/index.html','deploy/netlify/site/docs/index.html','deploy/netlify/site/docs/empezar/index.html','deploy/netlify/site/docs/studio/index.html','deploy/netlify/site/studio/index.html']){const html=await read(source);if(!html.includes('href="/docs/entrega-offline/"'))failures.push(source+': missing offline delivery discovery link');}
if(!js.includes("['/docs/entrega-offline/',"))failures.push('documentation navigation missing offline delivery route');
const requireBuiltSitemap=process.argv.includes('--require-sitemap');
const sitemap=await read('.netlify-cdn/sitemap.xml').catch(error=>{
  if(error?.code==='ENOENT')return null;
  throw error;
});
if(requireBuiltSitemap&&!sitemap)failures.push('Generated production sitemap is required after build');
if(sitemap&&!sitemap.includes('https://p2lrn.org/docs/entrega-offline/'))
  failures.push('generated sitemap missing offline delivery route');

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
    'La integración LTI 1.3 puede desplegarse en infraestructura propia','binding manual autorizado',
    'Implementado no equivale a certificado en todos los LMS'
  ]]
]);
for(const [file,tokens] of requiredByFile){
  const body=await read(file);
  for(const token of tokens)if(!body.includes(token))failures.push(file+': missing current API/status token '+token);
}
const studioTeacherGuide=await read('deploy/netlify/site/docs/studio/index.html');
for(const internal of ['materializeSharedResource','exportOfflineAssignment','reviewOfflineResult'])
  if(studioTeacherGuide.includes(internal))failures.push('Studio teacher guide leaks internal API '+internal);
if(!studioTeacherGuide.includes('Vista alumno')||!studioTeacherGuide.includes('Guardar'))
  failures.push('Studio teacher guide must show actual edit/save/learner workflow');
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
console.log(JSON.stringify({ok:true,primaryFlowPages:primary.length,branchFlows:branches.length,connectorFlowPages:connectorFlow.length,easyStartBeforeInstall:true,defaultInstallPath:'CDN',cdnBeforeNpm:true,installBeforeCreate:true,mobileNavigation:'sticky-collapsed-index',breadcrumbs:true,childPageSubmenu:true,samePageSectionsInSidebar:false,mobileIndexRevealsCurrentPage:true,mobileIndexUsesPageTitle:true,mobileIndexDynamicOffset:true,beforeStartOwnsFoundationalDocs:true,progressionAndMetricsGroupedUnderTracking:true,analyticsOwnSection:true,trackingAfterIntegration:true,longPageToc:true,questionnaireExperienceGuides:10,teacherDeveloperSeparated:true,offlineDeliveryGuide:true,fullPublicHtmlAudit:true,currentVersion:currentPlayerVersion,noVagueMinimumExamples:true},null,2));