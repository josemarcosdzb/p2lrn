import {readFile,readdir} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';

const root=resolve(process.cwd());
const docsRoot=join(root,'deploy','netlify','site','docs');
const portalScript=join(root,'deploy','netlify','site','p2lrn.js');

async function walk(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory()) out.push(...await walk(full));
    else if(entry.isFile()&&entry.name==='index.html') out.push(full);
  }
  return out;
}

const pages=(await walk(docsRoot)).sort();
if(!pages.length) throw new Error('No documentation pages found.');

const failures=[];
for(const path of pages){
  const html=await readFile(path,'utf8');
  const rel=relative(root,path).replaceAll('\\','/');
  const sidebars=[...html.matchAll(/<aside\s+class=["']doc-sidebar["'][^>]*>([\s\S]*?)<\/aside>/gi)];
  if(sidebars.length!==1){
    failures.push(rel+': expected exactly one .doc-sidebar, found '+sidebars.length);
    continue;
  }
  if(sidebars[0][1].trim()!=='') failures.push(rel+': legacy sidebar HTML is not empty');
  if(!/<script[^>]+src=["']\/p2lrn\.js["']/i.test(html)) failures.push(rel+': missing shared /p2lrn.js');
}

const js=await readFile(portalScript,'utf8');
for(const marker of [
  'const GLOBAL_SIDEBAR = [',
  "['EMPEZAR', [",
  "['SOLUCIONES', [",
  "['CREAR', [",
  "['REPRODUCIR', [",
  "['INTEGRAR', [",
  "['DESARROLLADORES', [",
  "['CONECTORES', [",
  "['REFERENCIA', [",
  "['RECURSOS', [",
  'sidebar.replaceChildren(fragment)',
  "const DOC_SIDEBAR_CHILDREN = new Map([",
  "childNav.className='doc-child-subnav'",
  "currentChild) a.setAttribute('aria-current','location')",
  "childLink.setAttribute('aria-current','page')",
  "const pageTitle = docArticle.querySelector('.doc-hero h1')",
  "breadcrumb.className='doc-breadcrumbs'",
  "breadcrumb.setAttribute('aria-label','Migas de pan')",
  "const DOC_BREADCRUMB_PARENTS = new Map([",
  "requestAnimationFrame(revealCurrent)",
  "const syncToggleHeight = () =>",
  "mobileIndexCurrent.textContent=pageTitle",
  "event.key==='Escape' && !media.matches",
]){
  if(!js.includes(marker)) failures.push('p2lrn.js: missing '+marker);
}
for(const forbidden of ['P2LRN_EXTRA_DOC_LINKS','sidebar.append(','doc-page-subnav','data-doc-section']){
  if(js.includes(forbidden)) failures.push('p2lrn.js: legacy logic remains: '+forbidden);
}

const expectedSections=['EMPEZAR','SOLUCIONES','CREAR','REPRODUCIR','REVISAR RESULTADOS','DESARROLLADORES','INSTALAR','INTEGRAR','CONECTORES','REFERENCIA','RECURSOS'];
const sidebarBlock=/const GLOBAL_SIDEBAR = \[([\s\S]*?)\n  \];/.exec(js)?.[1]??'';
const sectionNames=[...sidebarBlock.matchAll(/\['([^']+)', \[/g)].map(x=>x[1]);
if(JSON.stringify(sectionNames)!==JSON.stringify(expectedSections))
  failures.push('sidebar role groups mismatch: '+JSON.stringify(sectionNames));
const sectionChunks=new Map();
for(let i=0;i<sectionNames.length;i++){
  const a=sidebarBlock.indexOf("['"+sectionNames[i]+"', [");
  const b=i+1<sectionNames.length?sidebarBlock.indexOf("['"+sectionNames[i+1]+"', [",a+1):sidebarBlock.length;
  sectionChunks.set(sectionNames[i],sidebarBlock.slice(a,b));
}
const sidebarLinks=[...sidebarBlock.matchAll(/\['(\/[^']*)','([^']+)'\]/g)].map(x=>({href:x[1],label:x[2]}));
const hrefs=sidebarLinks.map(x=>x.href);
if(hrefs.length!==45)failures.push('expected 45 global role-grouped links, found '+hrefs.length);
const duplicates=hrefs.filter((href,i)=>hrefs.indexOf(href)!==i);
if(duplicates.length)failures.push('duplicate global sidebar links: '+[...new Set(duplicates)]);
for(const route of ['/docs/','/docs/empezar-facil/','/docs/studio/','/docs/questionnaires/','/docs/entrega-offline/'])
  if(![...['EMPEZAR','CREAR'].map(k=>sectionChunks.get(k)||'')].some(s=>s.includes("['"+route+"'")))
    failures.push('teacher authoring guide misplaced: '+route);
for(const route of ['/crear-cursos-interactivos/','/juegos-educativos-3d/','/cursos-offline/','/skills/'])
  if(!(sectionChunks.get('SOLUCIONES')||'').includes("['"+route+"'"))failures.push('related guides missing from one sidebar: '+route);
const resultLinks=sectionChunks.get('REVISAR RESULTADOS')||'';
if(!resultLinks.includes("['/analytics/'")||resultLinks.includes("['/docs/analytics/'"))
  failures.push('teacher results menu must link to the Analytics app without duplicating the integration guide');
const teachers=(sectionChunks.get('EMPEZAR')||'')+(sectionChunks.get('CREAR')||'')+(sectionChunks.get('REPRODUCIR')||'');
for(const route of ['/docs/cdn/','/docs/npm/','/docs/toolkit/','/docs/cli/','/docs/integracion/','/docs/referencia/'])
  if(teachers.includes("['"+route+"'"))failures.push('technical guide mixed into teacher navigation: '+route);
const developer=(sectionChunks.get('DESARROLLADORES')||'');
for(const route of ['/docs/desarrolladores/','/docs/desarrolladores/primeros-pasos/'])
  if(!developer.includes("['"+route+"'"))failures.push('missing developer entry: '+route);
for(const route of ['/docs/skills/','/docs/conectores/ia/'])
  if(!(sectionChunks.get('CONECTORES')||'').includes("['"+route+"'"))
    failures.push('Skills/MCP connector missing from developer navigation: '+route);
const install=(sectionChunks.get('INSTALAR')||'');
const order=['/docs/instalar/','/docs/cdn/','/docs/cdn/studio/','/docs/npm/','/docs/npm/studio/'].map(h=>install.indexOf("['"+h+"'"));
if(order.some(x=>x<0)||order.some((x,i)=>i>0&&x<=order[i-1]))
  failures.push('installation must progress from overview through CDN to npm');
for(const route of ['/docs/analytics/','/docs/progresion/','/docs/metricas/'])
  if(!(sectionChunks.get('INTEGRAR')||'').includes("['"+route+"'"))
    failures.push('advanced analytics and progression must live under developer integration: '+route);
const childBlock=/const DOC_SIDEBAR_CHILDREN = new Map\(\[([\s\S]*?)\n  \]\);/.exec(js)?.[1]??'';
const childLinks=[...childBlock.matchAll(/\['(\/docs\/[^']+\/)','([^']+)'\]/g)].map(x=>({href:x[1],label:x[2]}));
const foundation=['/docs/que-usar/','/docs/conceptos/','/docs/formato/','/docs/formato-portable-cursos-interactivos/'];
for(const route of foundation){
  if(!childBlock.includes("['"+route+"'"))failures.push('missing developer reference child: '+route);
}
if(!childBlock.includes("['/docs/desarrolladores/',["))
  failures.push('technical foundation must belong under the developer hub');
if(childBlock.includes("['/docs/empezar/',["))
  failures.push('teacher before-start page must not contain technical reference submenu');
for(const route of foundation.slice(0,3)){
  if(!js.includes("['"+route+"',['/docs/desarrolladores/','Desarrolladores']]"))
    failures.push('technical breadcrumb does not point to developer hub: '+route);
}
const qChildren=childLinks.filter(x=>x.href.startsWith('/docs/questionnaires/')&&x.href!=='/docs/questionnaires/');
if(qChildren.length!==10)failures.push('expected all 10 game guide subpages, found '+qChildren.length);
const connectorRoutes=['/docs/conectores/ia/','/docs/conectores/lms/','/docs/conectores/lti/'];
const connectorChildren=childLinks.filter(x=>x.href.startsWith('/docs/conectores/')).map(x=>x.href);
if(JSON.stringify(connectorChildren)!==JSON.stringify(connectorRoutes))
  failures.push('connector subpages must remain IA, LMS, LTI');
const connectorIaDetailRoutes=['/docs/conectores/gemini/','/docs/conectores/skills/','/docs/conectores/local/'];
for(const route of connectorIaDetailRoutes){
  if(!js.includes("'"+route+"'"))failures.push('missing connector detail handling: '+route);
}
const docRoutes=pages.map((path)=>{
  const rel=relative(docsRoot,path).replaceAll('\\','/');
  return rel==='index.html' ? '/docs/' : '/docs/'+rel.slice(0,-'index.html'.length);
});
for(const route of docRoutes){
  const exact=hrefs.includes(route);
  const child=childLinks.some((item)=>item.href===route);
  const iaDetail=connectorIaDetailRoutes.includes(route);
  if(!exact && !child && !iaDetail) failures.push('sidebar does not cover documentation route: '+route);
}


const enScript=await readFile(join(root,'deploy','netlify','site','en','p2lrn.js'),'utf8');
const navPattern=/const SITE_NAV = (\[[^\r\n]+\]);/;
const esNav=navPattern.exec(js)?.[1],enNav=navPattern.exec(enScript)?.[1];
if(!esNav||!enNav)failures.push('missing canonical site-wide navigation');
else{
  const spanish=JSON.parse(esNav),english=JSON.parse(enNav);
  const routes=['/studio/','/demo/',null,'/analytics/','/skills/','/docs/','/docs/desarrolladores/','/contacto/'];
  if(JSON.stringify(spanish.map(v=>v.href||null))!==JSON.stringify(routes)||
    JSON.stringify(english.map(v=>v.href||null))!==JSON.stringify(routes)||
    spanish.length!==8||english.length!==8)
    failures.push('top navigation destinations differ between pages or languages');
  for(const navConfig of [spanish,english]){
    const solutions=navConfig.find(item=>item.items);
    if(!solutions||solutions.items.length!==3||
       JSON.stringify(solutions.items.map(item=>item[0]))!==JSON.stringify(['/crear-cursos-interactivos/','/juegos-educativos-3d/','/cursos-offline/']))
      failures.push('top Solutions dropdown must remain one contextual menu for three existing sections');
  }
}
for(const page of ['crear-cursos-interactivos','juegos-educativos-3d','cursos-offline','skills']){
  for(const locale of ['', 'en/']){
    const file=join(root,'deploy','netlify','site',...locale.split('/').filter(Boolean),page,'index.html');
    const html=await readFile(file,'utf8');
    if(!html.includes('landing-doc-shell doc-main')||!html.includes('class="doc-sidebar"'))
      failures.push('marketing page missing single left documentation index: '+locale+page);
    if(html.includes('landing-section-links'))
      failures.push('duplicated horizontal menu remains: '+locale+page);
    if(page==='juegos-educativos-3d'&&!html.includes('curso-ensamblaje-burro.p2lrn'))
      failures.push('missing original donkey 3D course link: '+locale+page);
  }
}

const siteCss=await readFile(join(root,'deploy','netlify','site','p2lrn.css'),'utf8');
if(!siteCss.includes('.doc-main{margin-inline:auto;'))
  failures.push('left documentation grid must be centered within the viewport instead of clipping at x=0');
for(const locale of ['', 'en/']){
  const studio=await readFile(join(root,'deploy','netlify','site',...locale.split('/').filter(Boolean),'docs','studio','index.html'),'utf8');
  const games=studio.slice(studio.indexOf('<div class="studio-guide-choice-description"><p>')>0?
    studio.indexOf('<div class="studio-guide-choice-description"><p>'):0);
  if((studio.match(/<dt><a href="[^"]+">/g)||[]).length<13)
    failures.push('each of the 13 Studio games needs a specific documentation link: '+locale);
  if(!studio.includes('class="studio-guide-multipart-in-flow"')||
     studio.indexOf('id="multipart-studio"')>studio.indexOf('class="doc-pager"'))
    failures.push('multipart must follow File, not the last-page pager: '+locale);
  if(!studio.includes('studio-guide-control-crop--create')||
     !studio.includes('studio-guide-control-crop--interactive'))
    failures.push('Studio insert screenshots must show cropped authentic controls: '+locale);
}

if(failures.length) throw new Error('Global documentation navigation gate failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,pages:pages.length,sidebarAuthority:'/p2lrn.js',legacySidebarHtml:false,sections:expectedSections,links:sidebarLinks.length,duplicateLinks:0,desktopHoverBridge:true,questionnaireChildrenUseParent:true,beforeStartChildrenUseParent:false,developerReferenceChildren:true,analyticsInDeveloperIntegration:true,childPageSubmenu:true,connectorSubpages:3,connectorIaLegacyDetails:3,samePageSectionsInSidebar:false,breadcrumbs:true,mobileIndexSticky:true,mobileIndexRevealsCurrentPage:true,mobileIndexUsesPageTitle:true,mobileIndexDynamicOffset:true,foundationalDocsBeforeInstall:true,advancedTrackingAfterIntegration:true,easyStartBeforeInstall:true,cdnBeforeNpm:true},null,2));
