import {readFile,readdir} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';

const root=resolve(process.cwd());
const docsRoot=join(root,'deploy','netlify','site','docs');
const failures=[];
const expectedNav='<nav class="nav" id="nav" aria-label="Navegación principal"><a class="nav-direct" href="/docs/">Documentación</a><a class="nav-direct" href="/docs/studio/">Studio</a><a class="nav-direct" href="/docs/player/">Player</a><a class="nav-direct" href="/docs/toolkit/">Toolkit</a><a class="nav-direct" href="/docs/integracion/">Integración</a></nav>';
const forbiddenEditorial=[
  'START HERE','START /','INSTALL /','AUTHOR /','BUILD /','REFERENCE /','HELP /','INTEGRATE /',
  '<h1>P2LRN Documentation</h1>','<h1>Recipes</h1>','Questionnaires y juegos','<span data-health>Build CDN</span>',
  '<nav class="doc-pager"><span></span>',
];

async function walk(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await walk(full));
    else if(entry.isFile()&&entry.name==='index.html')out.push(full);
  }
  return out;
}
const strip=(value)=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g,' ').replace(/\s+/g,' ').trim();
const files=await walk(docsRoot);
for(const file of files){
  const rel=relative(root,file).replaceAll('\\','/');
  const html=await readFile(file,'utf8');
  if(!/<html\s+lang="es"/i.test(html))failures.push(rel+': missing lang="es"');
  if(!/<meta\s+name="description"\s+content="[^"]+"/i.test(html))failures.push(rel+': missing meta description');
  if(!/<meta\s+name="theme-color"\s+content="#0d1117"/i.test(html))failures.push(rel+': missing canonical theme-color');
  if(!html.includes('href="/contacto/"'))failures.push(rel+': footer/contact route missing');
  if(!html.includes(expectedNav))failures.push(rel+': fallback top navigation is not canonical');
  if(!html.includes('<a class="skip-link" href="#contenido">Saltar al contenido</a>'))failures.push(rel+': missing skip link');
  if(!/<main class="doc-main" id="contenido">/i.test(html))failures.push(rel+': main content has no stable #contenido target');
  if(!/<aside class="doc-sidebar" aria-label="Navegación de documentación">/i.test(html))failures.push(rel+': docs sidebar lacks accessible label');
  if(!html.includes('<span data-health>CDN</span>'))failures.push(rel+': non-canonical CDN fallback label');
  for(const token of forbiddenEditorial)if(html.includes(token))failures.push(rel+': forbidden editorial token '+token);

  const headings=[...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m=>({level:Number(m[1]),text:strip(m[2])}));
  const h1s=headings.filter(h=>h.level===1);
  if(h1s.length!==1)failures.push(rel+': expected exactly one h1, found '+h1s.length);
  for(let i=1;i<headings.length;i++)if(headings[i].level>headings[i-1].level+1)failures.push(rel+`: heading jump h${headings[i-1].level}->h${headings[i].level} before "${headings[i].text}"`);

  for(const block of html.matchAll(/<div class="decision-grid">([\s\S]*?)<\/div>/gi)){
    if(/<h2\b/i.test(block[1]))failures.push(rel+': decision card uses h2 instead of h3');
  }
  const ids=[...html.matchAll(/<[A-Za-z][^>]*\sid="([^"]+)"[^>]*>/g)].map(m=>m[1]);
  for(const id of new Set(ids))if(ids.filter(x=>x===id).length>1)failures.push(rel+': duplicate id '+id);

  for(const match of html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)){
    const attrs=match[2], body=strip(match[3]);
    if(!body&&!/aria-label="[^"]+"/i.test(attrs)&&!/title="[^"]+"/i.test(attrs))failures.push(rel+': unnamed '+match[1]+' control');
  }
}
if(failures.length)throw new Error('Professional documentation audit failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,pages:files.length,language:'es',headingHierarchy:true,canonicalFallbackNavigation:true,skipLinks:true,accessibleSidebars:true,editorialLabels:'normalized'},null,2));
