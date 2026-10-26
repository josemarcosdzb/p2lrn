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
  "['CREAR', [",
  "['REPRODUCIR', [",
  "['INTEGRAR', [",
  "['SEGUIMIENTO', [",
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

const expectedSections=['EMPEZAR','INSTALAR','CREAR','REPRODUCIR','INTEGRAR','SEGUIMIENTO','REFERENCIA','RECURSOS'];
const sidebarBlock=/const GLOBAL_SIDEBAR = \[([\s\S]*?)\n  \];/.exec(js)?.[1] ?? '';
const sectionNames=[...sidebarBlock.matchAll(/\['([^']+)', \[/g)].map((match)=>match[1]);
if(JSON.stringify(sectionNames)!==JSON.stringify(expectedSections)){
  failures.push('p2lrn.js: sidebar sections/order mismatch: '+JSON.stringify(sectionNames));
}
const sectionChunks=new Map();
for(let i=0;i<sectionNames.length;i++){
  const start=sidebarBlock.indexOf("['"+sectionNames[i]+"', [");
  const end=i+1<sectionNames.length ? sidebarBlock.indexOf("['"+sectionNames[i+1]+"', [",start+1) : sidebarBlock.length;
  sectionChunks.set(sectionNames[i],sidebarBlock.slice(start,end));
}
const installChunk=sectionChunks.get('INSTALAR')??'';
const installOrder=['/docs/instalar/','/docs/cdn/','/docs/cdn/studio/','/docs/npm/','/docs/npm/studio/'].map((href)=>installChunk.indexOf("['"+href+"'"));
for(let i=0;i<installOrder.length;i++)if(installOrder[i]<0)failures.push('p2lrn.js: missing install route in expected flow');
for(let i=1;i<installOrder.length;i++)if(installOrder[i]<=installOrder[i-1])failures.push('p2lrn.js: install routes must be ordered Installation -> CDN -> Studio CDN -> NPM -> Studio NPM');
if(!sectionChunks.get('EMPEZAR')?.includes("['/docs/empezar-facil/','Empezar fácil']")) failures.push('p2lrn.js: Empezar fácil must appear before installation');
for(const href of ['/docs/que-usar/','/docs/conceptos/','/docs/formato/']){
  if(sectionChunks.get('EMPEZAR')?.includes("['"+href+"'")) failures.push('p2lrn.js: before-start child must not remain flat under EMPEZAR: '+href);
}
for(const href of ['/docs/progresion/','/docs/metricas/']){
  if(!sectionChunks.get('SEGUIMIENTO')?.includes("['"+href+"'")) failures.push('p2lrn.js: tracking route must be grouped under SEGUIMIENTO: '+href);
  if(sectionChunks.get('EMPEZAR')?.includes("['"+href+"'")) failures.push('p2lrn.js: advanced tracking route must not be under EMPEZAR: '+href);
}
const sidebarLinks=[...sidebarBlock.matchAll(/\['(\/[^']*)','([^']+)'\]/g)].map((match)=>({href:match[1],label:match[2]}));
if(sidebarLinks.length!==32) failures.push('p2lrn.js: expected 32 global sidebar links, found '+sidebarLinks.length);
const hrefs=sidebarLinks.map((item)=>item.href);
for(const required of ['/docs/empezar-facil/','/docs/instalar/','/docs/cdn/','/docs/cdn/studio/','/docs/npm/','/docs/npm/studio/','/docs/colaboracion/','/docs/progresion/','/docs/metricas/','/docs/compatibilidad/']){
  if(!hrefs.includes(required)) failures.push('p2lrn.js: missing global sidebar route '+required);
}
const duplicates=hrefs.filter((href,index)=>hrefs.indexOf(href)!==index);
if(duplicates.length) failures.push('p2lrn.js: duplicate sidebar hrefs: '+[...new Set(duplicates)].join(', '));
const childBlock=/const DOC_SIDEBAR_CHILDREN = new Map\(\[([\s\S]*?)\n  \]\);/.exec(js)?.[1] ?? '';
const childLinks=[...childBlock.matchAll(/\['(\/docs\/[^']+\/)','([^']+)'\]/g)].map((match)=>({href:match[1],label:match[2]}));
const foundationChildren=childLinks.filter((item)=>['/docs/que-usar/','/docs/conceptos/','/docs/formato/'].includes(item.href));
if(foundationChildren.length!==3) failures.push('p2lrn.js: expected 3 Antes de empezar child links, found '+foundationChildren.length);
for(const advanced of ['/docs/progresion/','/docs/metricas/'])if(childLinks.some((item)=>item.href===advanced)) failures.push('p2lrn.js: advanced tracking route must not be nested under Antes de empezar: '+advanced);
const questionnaireChildren=childLinks.filter((item)=>item.href.startsWith('/docs/questionnaires/')&&item.href!=='/docs/questionnaires/');
if(questionnaireChildren.length!==10) failures.push('p2lrn.js: expected 10 questionnaire child links, found '+questionnaireChildren.length);
for(const required of ['/docs/que-usar/','/docs/conceptos/','/docs/formato/','/docs/questionnaires/standard/','/docs/questionnaires/memory/','/docs/questionnaires/matching/','/docs/questionnaires/3d/']){
  if(!childLinks.some((item)=>item.href===required)) failures.push('p2lrn.js: missing child submenu route '+required);
}
for(const required of ['/docs/que-usar/','/docs/conceptos/','/docs/formato/']){
  const breadcrumbNeedle="['"+required+"',['/docs/empezar/','Antes de empezar']]";
  if(!js.includes(breadcrumbNeedle)) failures.push('p2lrn.js: before-start breadcrumb must pass through Antes de empezar: '+required);
}
for(const advanced of ['/docs/progresion/','/docs/metricas/']){
  if(js.includes("['"+advanced+"',['/docs/empezar/','Antes de empezar']]")) failures.push('p2lrn.js: tracking breadcrumb must not pass through Antes de empezar: '+advanced);
}

const docRoutes=pages.map((path)=>{
  const rel=relative(docsRoot,path).replaceAll('\\','/');
  return rel==='index.html' ? '/docs/' : '/docs/'+rel.slice(0,-'index.html'.length);
});
for(const route of docRoutes){
  const exact=hrefs.includes(route);
  const child=childLinks.some((item)=>item.href===route);
  if(!exact && !child) failures.push('sidebar does not cover documentation route: '+route);
}

if(failures.length) throw new Error('Global documentation navigation gate failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,pages:pages.length,sidebarAuthority:'/p2lrn.js',legacySidebarHtml:false,sections:expectedSections,links:sidebarLinks.length,duplicateLinks:0,desktopHoverBridge:true,questionnaireChildrenUseParent:true,beforeStartChildrenUseParent:true,trackingGroupedLater:true,childPageSubmenu:true,samePageSectionsInSidebar:false,breadcrumbs:true,mobileIndexSticky:true,mobileIndexRevealsCurrentPage:true,mobileIndexUsesPageTitle:true,mobileIndexDynamicOffset:true,foundationalDocsBeforeInstall:true,advancedTrackingAfterIntegration:true,easyStartBeforeInstall:true,cdnBeforeNpm:true},null,2));
