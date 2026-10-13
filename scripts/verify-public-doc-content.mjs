import {readFile,readdir} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';

const root=resolve(process.cwd());
const docsRoot=join(root,'deploy','netlify','site','docs');
const failures=[];
async function walk(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await walk(full));
    else if(entry.isFile()&&entry.name==='index.html')out.push(full);
  }
  return out;
}
const article=(html)=>/<article class="doc-content">([\s\S]*?)<\/article>/i.exec(html)?.[1]??html;
const files=await walk(docsRoot);
const forbidden=[
  [/p2lrn-build-web-sdk/iu,'maintenance CLI leaked into end-user docs'],
  [/p2lrn-rebuild-examples/iu,'maintenance CLI leaked into end-user docs'],
  [/p2lrn-build-advanced-example/iu,'maintenance CLI leaked into end-user docs'],
  [/p2lrn\.org\/renderizador\//iu,'translated renderer identifier'],
  [/--renderizador\b/iu,'translated CLI flag'],
  [/Modelo mínimo/iu,'vague minimum-example heading'],
  [/JSON \/ guía/iu,'unclear JSON guide label'],
  [/aulap2p/iu,'AulaP2P reference'],
  [/\bdeploy\b/iu,'deployment-process wording'],
  [/\bfixtures?\b/iu,'test-fixture wording'],
  [/Gate del/iu,'internal gate wording'],
  [/build-site\.mjs/iu,'internal build script'],
  [/rama principal/iu,'branch implementation detail'],
  [/Paquetes del repositorio/iu,'repository implementation detail'],
  [/Ejemplo fuente adicional del repositorio/iu,'repository implementation detail'],
  [/Estado real del generador/iu,'development-status wording'],
  [/API pública comprobada/iu,'validation wording'],
  [/Eventos públicos comprobados/iu,'validation wording'],
  [/contrastad[oa] con/iu,'validation wording'],
  [/Versión instalada actualmente/iu,'development-status wording'],
];
for(const file of files){
  const html=await readFile(file,'utf8');
  const rel=relative(root,file).replaceAll('\\','/');
  for(const [pattern,label] of forbidden)if(pattern.test(html))failures.push(rel+': '+label);
}
const strict=[
  ['deploy/netlify/site/docs/npm/index.html',[/\bCDN\b/u,/p2lrn\.netlify\.app/u]],
  ['deploy/netlify/site/docs/npm/studio/index.html',[/\bCDN\b/u,/p2lrn\.netlify\.app/u]],
  ['deploy/netlify/site/docs/cdn/index.html',[/\bNPM\b/u,/npm install/u,/\bnpx\b/u,/@p2lrn\//u]],
  ['deploy/netlify/site/docs/cdn/studio/index.html',[/\bNPM\b/u,/npm install/u,/\bnpx\b/u,/@p2lrn\//u]],
  ['deploy/netlify/site/docs/studio/index.html',[/\bNPM\b/u,/\bCDN\b/u,/npm install/u,/p2lrn\.netlify\.app/u]],
];
for(const [rel,patterns] of strict){
  const html=await readFile(join(root,rel),'utf8');
  const body=article(html);
  for(const pattern of patterns)if(pattern.test(body))failures.push(rel+': mixed installation channel '+pattern);
}
const demoPage=await readFile(join(root,'deploy/netlify/site/demo/index.html'),'utf8');
for(const pattern of [/REAL PLAYER/iu,/REAL PACKAGES/iu,/generado durante el deploy/iu,/\bfixtures?\b/iu,/\bcanónicos?\b/iu]){
  if(pattern.test(demoPage))failures.push('deploy/netlify/site/demo/index.html: internal development copy '+pattern);
}
const studioPage=await readFile(join(root,'deploy/netlify/site/studio/index.html'),'utf8');
for(const pattern of [/AUTHORING \/ LOCAL WORKING COPY/u,/copia local de un paquete/iu,/AulaP2P/iu]){
  if(pattern.test(studioPage))failures.push('deploy/netlify/site/studio/index.html: internal or non-product copy '+pattern);
}
const studioElement=await readFile(join(root,'packages/studio/src/p2lrn-studio.js'),'utf8');
for(const token of ['New course','Open .p2lrn','Add content','Advanced structure','Student view','Download .p2lrn','Save course','+ Unit','+ Lesson']){
  if(studioElement.includes(token))failures.push('packages/studio/src/p2lrn-studio.js: untranslated visible Studio token '+token);
}

for(const rel of ['deploy/netlify/site/docs/player/index.html','deploy/netlify/site/docs/integracion/index.html']){
  const html=article(await readFile(join(root,rel),'utf8'));
  for(const pattern of [/npm install/u,/p2lrn\.netlify\.app/u])if(pattern.test(html))failures.push(rel+': installation implementation leaked into reference page '+pattern);
}
if(failures.length)throw new Error('Public documentation content audit failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,pages:files.length,noAulaP2P:true,noInternalDevelopmentCopy:true,strictChannelSeparation:true,studioPublicCopy:true,studioVisibleUiLanguage:'es'},null,2));
