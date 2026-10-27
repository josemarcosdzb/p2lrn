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
const channelArticle=(html)=>article(html).replace(/<nav class="doc-pager"[\s\S]*?<\/nav>/gi,'');
const files=await walk(docsRoot);
const forbidden=[
  [/p2lrn-build-web-sdk/iu,'maintenance CLI leaked into end-user docs'],
  [/p2lrn-rebuild-examples/iu,'maintenance CLI leaked into end-user docs'],
  [/p2lrn-build-advanced-example/iu,'maintenance CLI leaked into end-user docs'],
  [/p2lrn\.org\/renderizador\//iu,'translated renderer identifier'],
  [/--renderizador\b/iu,'translated CLI flag'],
  [/Modelo mínimo/iu,'vague minimum-example heading'],
  [/JSON \/ guía/iu,'unclear JSON guide label'],
  [/aulap2p/iu,'AulaP2P reference outside its own platform documentation'],
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
  for(const match of html.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi)){
    const raw=match[1]
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
      .replace(/<[^>]+>/g,'').trim();
    const lines=raw.split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
    if(lines.length&&lines.every((line)=>line.startsWith('//')||line.startsWith('#')||line.startsWith('/*')||line.startsWith('*'))){
      failures.push(relative(root,file).replaceAll('\\','/')+': comment-only code block');
    }
  }
  const rel=relative(root,file).replaceAll('\\','/');
  for(const section of html.matchAll(/<section class="doc-section"[^>]*>([\s\S]*?)<\/section>/gi)){
    const body=section[1].replace(/^\s*<h2[^>]*>[\s\S]*?<\/h2>/i,'').trim();
    if(body.startsWith('<div class="codebox"')||body.startsWith('<div class="install"')){
      failures.push(rel+': unexplained code block appears before user-facing context');
    }
  }
  // Validate wording visible to readers, not HTML attributes or hyperlink URLs.
  const visibleText=html.replace(/<[^>]+>/g,' ');
  for(const [pattern,label] of forbidden)if(pattern.test(visibleText))failures.push(rel+': '+label);
}
const strict=[
  ['deploy/netlify/site/docs/npm/index.html',[/\bCDN\b/u,/p2lrn\.netlify\.app/u]],
  ['deploy/netlify/site/docs/npm/studio/index.html',[/\bCDN\b/u,/p2lrn\.netlify\.app/u]],
  ['deploy/netlify/site/docs/cdn/index.html',[/\bNPM\b/u,/npm install/u,/\bnpx\b/u,/@p2lrn\//u]],
  ['deploy/netlify/site/docs/cdn/studio/index.html',[/\bNPM\b/u,/npm install/u,/\bnpx\b/u,/@p2lrn\//u]],
  ['deploy/netlify/site/docs/empezar-facil/index.html',[/npm install/u,/\bnpx\b/u,/@p2lrn\//u]],
  ['deploy/netlify/site/docs/studio/index.html',[/\bNPM\b/u,/\bCDN\b/u,/npm install/u,/p2lrn\.netlify\.app/u]],
];
for(const [rel,patterns] of strict){
  const html=await readFile(join(root,rel),'utf8');
  const body=channelArticle(html);
  for(const pattern of patterns)if(pattern.test(body))failures.push(rel+': mixed installation channel '+pattern);
}
for(const rel of ['deploy/netlify/site/docs/empezar-facil/index.html','deploy/netlify/site/docs/cdn/index.html']){
  const html=article(await readFile(join(root,rel),'utf8'));
  if(!html.includes('editor de texto o código')||!html.includes('servidor HTTP local')){
    failures.push(rel+': local HTTP instructions must be editor-neutral and explain the local HTTP requirement');
  }
  for(const pattern of [/Visual Studio Code/iu,/Live Server/iu,/Open with Live Server/iu]){
    if(pattern.test(html))failures.push(rel+': local HTTP instructions must not require a specific editor or extension '+pattern);
  }
  if(/python\s+-m\s+http\.server/iu.test(html)){
    failures.push(rel+': Python local-server example must not appear in public docs');
  }
}
const examplesPage=await readFile(join(root,'deploy/netlify/site/docs/ejemplos/index.html'),'utf8');
const executableSection=/<section class="doc-section"><h2>Ejemplos ejecutables<\/h2>([\s\S]*?)<\/section>/i.exec(examplesPage)?.[1]??'';
for(const href of [
  '/examples/generated/questionnaire-standard.p2lrn',
  '/examples/generated/questionnaire-memory.p2lrn',
  '/examples/generated/questionnaire-matching.p2lrn',
  '/examples/generated/questionnaire-ordering.p2lrn',
  '/examples/generated/questionnaire-classification.p2lrn',
  '/examples/generated/questionnaire-true-false.p2lrn',
  '/examples/generated/questionnaire-word-search.p2lrn',
  '/examples/generated/questionnaire-crossword.p2lrn',
  '/examples/generated/questionnaire-rosco.p2lrn',
  '/examples/generated/questionnaire-3d.p2lrn',
  '/examples/multipart-demo/course.p2lrn',
]){
  const needle='<a href="'+href+'" download>Paquete</a>';
  if(!executableSection.includes(needle)){
    failures.push('deploy/netlify/site/docs/ejemplos/index.html: executable examples missing downloadable package '+href);
  }
}
const progressionDocs=article(await readFile(join(root,'deploy/netlify/site/docs/progresion/index.html'),'utf8'));
if(!progressionDocs.includes('<p class="eyebrow">SEGUIMIENTO / PROGRESIÓN</p>')){
  failures.push('deploy/netlify/site/docs/progresion/index.html: progression must belong to Seguimiento, not Empezar');
}
if(/EMPEZAR\s*\/\s*PROGRESIÓN/iu.test(progressionDocs)){
  failures.push('deploy/netlify/site/docs/progresion/index.html: stale Empezar progression label');
}
const metricsDocs=article(await readFile(join(root,'deploy/netlify/site/docs/metricas/index.html'),'utf8'));
if(!metricsDocs.includes('<p class="eyebrow">SEGUIMIENTO / MÉTRICAS</p>')){
  failures.push('deploy/netlify/site/docs/metricas/index.html: metrics must belong to Seguimiento, not Empezar');
}
if(/EMPEZAR\s*\/\s*MÉTRICAS/iu.test(metricsDocs)){
  failures.push('deploy/netlify/site/docs/metricas/index.html: stale Empezar metrics label');
}
for(const token of [
  'Integración mediante Host Adapter',
  'p2lrn:xapi',
  'score.questions',
  'cmi.core.lesson_status',
  'cmi.completion_status',
  'p2lrn-progression-state/1',
  'El progreso global del curso se obtiene',
  'authoritative:false',
]){
  if(!metricsDocs.includes(token)) failures.push('deploy/netlify/site/docs/metricas/index.html: missing detailed metrics contract '+token);
}
for(const pattern of [
  /sacar las métricas/iu,
  /<strong>Quiero\s/iu,
  /No leas métricas/iu,
  /Qué conviene persistir/iu,
  /Recetas rápidas/iu,
]){
  if(pattern.test(metricsDocs)) failures.push('deploy/netlify/site/docs/metricas/index.html: informal or conversational metrics copy '+pattern);
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

const integrationRuntimeDocs=article(await readFile(join(root,'deploy/netlify/site/docs/integracion/index.html'),'utf8'));
if(!integrationRuntimeDocs.includes('<code>runtime-base-url</code> no es obligatorio para SCORM ni H5P.')){
  failures.push('deploy/netlify/site/docs/integracion/index.html: automatic SCORM/H5P runtime is not explained');
}
if(!integrationRuntimeDocs.includes('iframe sandbox con origen opaco')){
  failures.push('deploy/netlify/site/docs/integracion/index.html: opaque sandbox behavior is not explained');
}
const playerRuntimeDocs=article(await readFile(join(root,'deploy/netlify/site/docs/player/index.html'),'utf8'));
if(!playerRuntimeDocs.includes('crea automáticamente un iframe sandbox de origen opaco')){
  failures.push('deploy/netlify/site/docs/player/index.html: automatic embedded runtime flow is missing');
}
const updatedStudioDocs=article(await readFile(join(root,'deploy/netlify/site/docs/studio/index.html'),'utf8'));
for(const token of ['Componentes nativos','<strong>Aviso</strong>','<strong>Línea temporal</strong>']){
  if(!updatedStudioDocs.includes(token)) failures.push('deploy/netlify/site/docs/studio/index.html: missing native content component '+token);
}
const formatRightsDocs=article(await readFile(join(root,'deploy/netlify/site/docs/formato/index.html'),'utf8'));
for(const token of ['https://p2lrn.org/ext/course-rights/1','<code>author</code>','<code>createdAt</code>','<code>license</code>','<code>copyrightHolder</code>']){
  if(!formatRightsDocs.includes(token)) failures.push('deploy/netlify/site/docs/formato/index.html: missing course rights metadata '+token);
}
const packageRightsDocs=article(await readFile(join(root,'deploy/netlify/site/docs/paquetes/index.html'),'utf8'));
if(!packageRightsDocs.includes('workspace.setCourseRights({')){
  failures.push('deploy/netlify/site/docs/paquetes/index.html: package workflow must explain setCourseRights');
}
const questionnaireOverviewDocs=article(await readFile(join(root,'deploy/netlify/site/docs/questionnaires/index.html'),'utf8'));
if(!questionnaireOverviewDocs.includes('Completar huecos')){
  failures.push('deploy/netlify/site/docs/questionnaires/index.html: fill-blanks game is missing from the overview');
}
const componentMapDocs=article(await readFile(join(root,'deploy/netlify/site/docs/que-usar/index.html'),'utf8'));
for(const token of ['Componentes nativos','Aviso','línea temporal']){
  if(!componentMapDocs.includes(token)) failures.push('deploy/netlify/site/docs/que-usar/index.html: missing native component map token '+token);
}
for(const rel of ['deploy/netlify/site/docs/player/index.html','deploy/netlify/site/docs/integracion/index.html']){
  const html=article(await readFile(join(root,rel),'utf8'));
  for(const pattern of [/npm install/u,/p2lrn\.netlify\.app/u])if(pattern.test(html))failures.push(rel+': installation implementation leaked into reference page '+pattern);
}
if(failures.length)throw new Error('Public documentation content audit failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,pages:files.length,noAulaP2P:true,noInternalDevelopmentCopy:true,strictChannelSeparation:true,studioPublicCopy:true,studioVisibleUiLanguage:'es',noCommentOnlyCode:true,noUnexplainedCodeBlocks:true,executableExamplesDownloadable:true,automaticRuntimeDocs:true,metricsDocsDetailed:true,trackingInformationArchitecture:true,editorNeutralLocalServer:true},null,2));
