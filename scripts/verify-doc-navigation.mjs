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

const expectedSections=['EMPEZAR','INSTALAR','CREAR','REPRODUCIR','INTEGRAR','REFERENCIA','RECURSOS'];
const sidebarBlock=/const GLOBAL_SIDEBAR = \[([\s\S]*?)\n  \];/.exec(js)?.[1] ?? '';
const sectionNames=[...sidebarBlock.matchAll(/\['([^']+)', \[/g)].map((match)=>match[1]);
if(JSON.stringify(sectionNames)!==JSON.stringify(expectedSections)){
  failures.push('p2lrn.js: sidebar sections/order mismatch: '+JSON.stringify(sectionNames));
}
const sidebarLinks=[...sidebarBlock.matchAll(/\['(\/[^']*)','([^']+)'\]/g)].map((match)=>({href:match[1],label:match[2]}));
if(sidebarLinks.length!==33) failures.push('p2lrn.js: expected 33 global sidebar links, found '+sidebarLinks.length);
const hrefs=sidebarLinks.map((item)=>item.href);
for(const required of ['/docs/instalar/','/docs/npm/studio/','/docs/cdn/studio/','/docs/metricas/']){
  if(!hrefs.includes(required)) failures.push('p2lrn.js: missing split Studio route '+required);
}
const duplicates=hrefs.filter((href,index)=>hrefs.indexOf(href)!==index);
if(duplicates.length) failures.push('p2lrn.js: duplicate sidebar hrefs: '+[...new Set(duplicates)].join(', '));
const childBlock=/const DOC_SIDEBAR_CHILDREN = new Map\(\[([\s\S]*?)\n  \]\);/.exec(js)?.[1] ?? '';
const childLinks=[...childBlock.matchAll(/\['(\/docs\/questionnaires\/[^']+\/)','([^']+)'\]/g)].map((match)=>({href:match[1],label:match[2]}));
if(childLinks.length!==10) failures.push('p2lrn.js: expected 10 questionnaire child links, found '+childLinks.length);
for(const required of ['/docs/questionnaires/standard/','/docs/questionnaires/memory/','/docs/questionnaires/matching/','/docs/questionnaires/3d/']){
  if(!childLinks.some((item)=>item.href===required)) failures.push('p2lrn.js: missing questionnaire child submenu route '+required);
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
console.log(JSON.stringify({ok:true,pages:pages.length,sidebarAuthority:'/p2lrn.js',legacySidebarHtml:false,sections:expectedSections,links:sidebarLinks.length,duplicateLinks:0,questionnaireChildrenUseParent:true,childPageSubmenu:true,samePageSectionsInSidebar:false,breadcrumbs:true,mobileIndexSticky:true,mobileIndexRevealsCurrentPage:true,mobileIndexUsesPageTitle:true,mobileIndexDynamicOffset:true},null,2));
