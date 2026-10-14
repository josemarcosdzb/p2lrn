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
  '/docs/','/docs/empezar/','/docs/instalar/','/docs/que-usar/','/docs/conceptos/','/docs/studio/','/docs/paquetes/','/docs/formato/','/docs/progresion/','/docs/paquetes/multipart/','/docs/toolkit/','/docs/cli/','/docs/player/','/docs/questionnaires/','/docs/questionnaires/standard/','/docs/questionnaires/memory/','/docs/questionnaires/matching/','/docs/questionnaires/ordering/','/docs/questionnaires/classification/','/docs/questionnaires/true-false/','/docs/questionnaires/word-search/','/docs/questionnaires/crossword/','/docs/questionnaires/rosco/','/docs/questionnaires/3d/','/docs/juegos-3d/','/docs/ejemplos/','/docs/integracion/','/docs/eventos/','/docs/compatibilidad/','/docs/recetas/','/docs/glosario/','/docs/referencia/','/docs/troubleshooting/'
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
for(const token of ["['EMPEZAR'","['CREAR'","['INSTALAR'","['REPRODUCIR'","['INTEGRAR'","['REFERENCIA'"])if(!js.includes(token))failures.push('p2lrn.js missing sidebar group '+token);
const order=['EMPEZAR','INSTALAR','CREAR','REPRODUCIR','INTEGRAR','REFERENCIA'].map(x=>js.indexOf("['"+x+"'"));
for(let i=1;i<order.length;i++)if(order[i]<=order[i-1])failures.push('sidebar groups are not in product-flow order');
for(const token of ['docs-sidebar-toggle','doc-toc','Índice de documentación'])if(!js.includes(token))failures.push('p2lrn.js missing documentation UX hook '+token);
for(const token of ['.doc-sidebar.is-open','.docs-sidebar-toggle{display:flex','.doc-toc ol'])if(!css.includes(token))failures.push('p2lrn.css missing documentation UX rule '+token);

const npm=article(await read('deploy/netlify/site/docs/npm/index.html'));
const cdn=article(await read('deploy/netlify/site/docs/cdn/index.html'));
if(/\bCDN\b|p2lrn\.netlify\.app/u.test(npm))failures.push('NPM article leaks CDN instructions');
if(/\bNPM\b|npm install|\bnpx\b|@p2lrn\//u.test(cdn))failures.push('CDN article leaks NPM instructions');

const richMinimum=new Map([
  ['/docs/conceptos/',8],['/docs/studio/',7],['/docs/progresion/',7],['/docs/eventos/',6],['/docs/recetas/',4],['/docs/glosario/',5],['/docs/questionnaires/',5]
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
console.log(JSON.stringify({ok:true,primaryFlowPages:primary.length,branchFlows:branches.length,installBeforeCreate:true,mobileNavigation:'collapsed',longPageToc:true,questionnaireExperienceGuides:10,noVagueMinimumExamples:true},null,2));