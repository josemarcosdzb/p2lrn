import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';

const repo=resolve(import.meta.dirname,'..');
const site=join(repo,'deploy','netlify','site');
const evidence=join(repo,'.p2lrn-i18n-ci','evidence');
const compact=s=>String(s??'').replace(/<script\b[\s\S]*?<\/script>/gi,' ')
 .replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')
 .replace(/&amp;/g,'&').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
const attribute=(tag,name)=>new RegExp('(?:^|\\s)'+name+'="([^"]*)"','i').exec(tag)?.[1]??'';
async function files(dir){const result=[];for(const ent of await readdir(dir,{withFileTypes:true})){
 const full=join(dir,ent.name);if(ent.isDirectory())result.push(...await files(full));
 else if(ent.isFile()&&ent.name==='index.html')result.push(full);
}return result;}
const teacher=route=>/^(?:docs\/(?:empezar(?:-facil)?|studio|questionnaires(?:\/[^/]+)?|juegos-3d|colaboracion|entrega-offline)\/|crear-cursos-interactivos\/|juegos-educativos-3d\/|cursos-offline\/)/.test(route);
const dev=route=>/^(?:docs\/(?:desarrolladores|conectores|formato|conceptos|cdn|npm|cli|integracion|referencia|paquetes|toolkit|player)\/)/.test(route);
const intent={
'index.html':[/cursos interactivos/i,/interactive courses/i],
'crear-cursos-interactivos/index.html':[/crear cursos interactivos/i,/create interactive courses/i],
'cursos-offline/index.html':[/cursos offline/i,/offline courses/i],
'juegos-educativos-3d/index.html':[/juegos educativos 3d/i,/3d educational games/i],
'docs/questionnaires/index.html':[/cuestionarios|juegos educativos/i,/quizzes|learning games/i],
'docs/studio/index.html':[/Studio/i,/Studio/i],
'docs/ejemplos/index.html':[/ejemplos/i,/examples/i],
'docs/conectores/lti/index.html':[/LTI 1\.3/i,/LTI 1\.3/i],
'docs/compatibilidad/index.html':[/SCORM|H5P/i,/SCORM|H5P/i]
};
const issues=[],pages=[],pairs=new Map(),titles=new Map();
const add=(severity,route,code,detail)=>issues.push({severity,route,code,detail});
for(const filename of (await files(site)).sort()){
 const raw=relative(site,filename).replaceAll('\\','/');
 const english=raw.startsWith('en/');
 const source=english?raw.slice(3):raw, lang=english?'en':'es';
 const route=(english?'/en/':'/')+source.replace(/index\.html$/,'');
 const html=await readFile(filename,'utf8');
 const redirect=/<meta[^>]*http-equiv="refresh"/i.test(html);
 const title=compact(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
 const desc=attribute(/<meta[^>]*name="description"[^>]*>/i.exec(html)?.[0]??'','content');
 const foundLang=attribute(/<html\b[^>]*>/i.exec(html)?.[0]??'','lang');
 const h1=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>compact(m[1]));
 const headings=[...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h([1-6])>/gi)].map(m=>({from:m[1],to:m[3],text:compact(m[2])}));
 // Audit the raw heading token stream as well: a loose regex can miss an
 // opening <h3> wrongly closed with </h4> and still report zero problems.
 const headingStack=[];
 for(const match of html.matchAll(/<(\/?)h([1-6])\b[^>]*>/gi)){
   const level=Number(match[2]);
   if(match[1]===''){headingStack.push({level,index:match.index});continue;}
   const opened=headingStack.pop();
   if(!opened||opened.level!==level)
     add('error',route,'heading-close-mismatch',
       'Closing h'+level+' at offset '+match.index+' does not match '+(opened?'h'+opened.level+' at '+opened.index:'an opening heading'));
 }
 if(headingStack.length)
   add('error',route,'heading-unclosed',headingStack.map(h=>'h'+h.level+' at '+h.index).join(', '));

 const article=/<article class="doc-content">([\s\S]*?)<\/article>/i.exec(html)?.[1]||
   /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1]||html;
 const words=compact(article).split(/\s+/).filter(Boolean).length;
 const images=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
 const role=teacher(source)?'teacher':dev(source)?'developer':'general';
 if(foundLang!==lang)add('error',route,'lang','Expected '+lang+', got '+foundLang);
 if(!redirect){
  if(!title)add('error',route,'title','Missing page title');
  if(!desc)add('error',route,'description','Missing meta description');
  if(h1.length!==1)add('error',route,'h1','Expected one H1, got '+h1.length);
  if(title.length<20||title.length>76)add('warning',route,'title-length',String(title.length));
  if(desc.length<70||desc.length>185)add('warning',route,'description-length',String(desc.length));
  if(words<90)add('warning',route,'thin-source','Only '+words+' words: review search intent manually');
 }
 const mismatch=headings.filter(h=>h.from!==h.to);
 if(mismatch.length)add('error',route,'heading-markup',mismatch.map(h=>h.text).join('; '));
 const noAlt=images.filter(t=>!/\balt="[^"]*"/i.test(t)).length;
 const noSize=images.filter(t=>!/\bwidth="\d+"/i.test(t)||!/\bheight="\d+"/i.test(t)).length;
 if(noAlt)add('error',route,'image-alt',noAlt+' images without alt');
 if(noSize)add('warning',route,'image-size',noSize+' images without explicit dimensions');
 // Check visible public-facing captions and translated Studio controls, rather than
 // assuming a passed meta-description/word-count audit proves editorial quality.
 if(source==='index.html'&&!redirect &&
    /development (?:branch|build)|not certified production|sesión local de desarrollo|rama de desarrollo/i.test(html))
   add('error',route,'homepage-release-jargon','Public homepage screenshot captions contain internal release language');
 if(source==='studio/index.html'&&english&&!redirect &&
    /\bplaceholder=["'](?:Ej\.|Ex\.)\s*30["']/i.test(html))
   add('error',route,'studio-english-placeholder','Untranslated Spanish placeholder in the English Studio controls');
 if(source==='docs/npm/analytics/index.html'&&!redirect &&
    /\b(?:redesign branch|rama de rediseño)\b/i.test(html))
   add('error',route,'unverified-release-terminology','Public Analytics documentation uses internal branch terminology instead of explaining feature availability');
 // Explicit editorial regressions for the inspected teacher and public pages.
 if(source==='docs/studio/index.html'&&!redirect){
   if(!html.includes('id="studio-doc-informacion-adicional"')||
      html.includes('<details class="studio-doc-appendix"'))
     add('error',route,'studio-manual','The practical teacher guidance must be visible, not a collapsed technical appendix');
   if(/collaboration\.room|URL\+SHA-256|materializeSharedResource|resourceLibrary\s*\(/i.test(html))
     add('error',route,'studio-internals','The teacher guide contains implementation details');
   if((html.match(/id="studio-apendice-[1-9]"/g)||[]).length!==9)
     add('error',route,'studio-sections','Studio guidance lost one of the nine original navigation anchors');
 }
 if(source==='crear-cursos-interactivos/index.html'&&!redirect){
   if(/development (?:branch|build)|entorno local de desarrollo|rama de desarrollo/i.test(html))
     add('error',route,'site-language','Internal release terminology appears in public course-creation copy');
   if(!(english?/local Studio installation/i:/instalación local de Studio/i).test(html))
     add('error',route,'screenshot-provenance','Public Studio images need clear source disclosure in ordinary language');
 }
 if(source==='docs/juegos-3d/index.html'&&!redirect){
   const entryImages=(html.match(/src="\/assets\/activity-examples\/1[2-5]-3d-[^"]+\.webp"/g)||[]).length;
   if(entryImages!==4)add('error',route,'3d-images','Expected four authentic 3D entry-screen images');
   const captions=english?'Opening screen only:':'Pantalla inicial del juego:';
   if(html.split(captions).length-1!==4)
     add('error',route,'3d-provenance','Each 3D entry screenshot must explicitly state it does not prove a completed game');
 }
 if(role==='teacher'&&!redirect){
  if(/<pre\b/i.test(article))add('error',route,'teacher-code','Code blocks in teacher-facing article');
  if(/(?:resourceLibrary|materializeSharedResource|exportOfflineAssignment|reviewOfflineResult)\(/i.test(article)||
    /<code>(?:studio\.)?(?:resourceLibrary|materializeSharedResource)/i.test(article))
   add('error',route,'teacher-api','Developer API in teacher-facing article');
 }
 if(english&&!redirect){
  // Check educational terminology, not just language tags and translated headings.
  const visibleProse=compact(article.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi,' '));
  const falseFriends=[
    ['grade-meaning',/\b(?:official ratings|official note)\b/i],
    ['attempt-meaning',/\b(?:intents and rich interactions|intent cycle|intent inspection|registration\/intent)\b/i],
    ['classification-meaning',/\brating question\b/i],
    ['platform-meaning',/\b(?:two facilities|group, call and attempt|roles, permits and registration)\b/i],
    ['untranslated-prose',/\bapuntando a\b/i]
  ];
  for(const [code,pattern] of falseFriends)
    if(pattern.test(visibleProse))add('error',route,code,'Incorrect English educational terminology: '+pattern);
 }
 if(english){
  const untranslated=headings.filter(h=>/\b(?:Decisiones binarias|Experiencia espacial|Cómo se configura|Palabras extra \/ distractores|Para profesores)\b/i.test(h.text));
  if(untranslated.length)add('error',route,'untranslated-heading',untranslated.map(h=>h.text).join('; '));
  if(source.startsWith('docs/questionnaires/') &&
     /<h[1-6]\b[^>]*>[^<]*(?:Decisiones binarias|Experiencia espacial)/i.test(html))
     add('error',route,'untranslated-questionnaire','Untranslated Spanish questionnaire heading in English guide');
 }
 if(intent[source]&&!redirect&&!intent[source][english?1:0].test(title+' '+desc+' '+h1.join(' ')))
  add('warning',route,'search-intent','Title/H1/description may miss the source-backed query intent');
 if(title&&!redirect){
  const key=lang+':'+title.toLowerCase();
  if(titles.has(key))add('warning',route,'duplicate-title',titles.get(key));
  else titles.set(key,route);
 }
 if(!pairs.has(source))pairs.set(source,new Set());pairs.get(source).add(lang);
 pages.push({route,source,lang,role,title,description:desc,h1:h1[0]??'',words,images:images.length,redirect});
}
for(const [source,langs] of pairs)if(langs.size!==2)add('error',source,'language-parity','Missing ES/EN pair');
if(pages.length<140)add('error','/','page-count','Expected at least 140 authored pages, got '+pages.length);
const errors=issues.filter(i=>i.severity==='error'),warnings=issues.filter(i=>i.severity==='warning');
const report={generatedAt:new Date().toISOString(),scope:'Authored HTML. Not live SEO ranking, deployed URLs, AT accessibility or Player completion.',
 totals:{pages:pages.length,es:pages.filter(p=>p.lang==='es').length,en:pages.filter(p=>p.lang==='en').length,
 teacher:pages.filter(p=>p.role==='teacher').length,developer:pages.filter(p=>p.role==='developer').length,
 errors:errors.length,warnings:warnings.length},issues,pages};
await mkdir(evidence,{recursive:true});
await writeFile(join(evidence,'editorial-seo-report.json'),JSON.stringify(report,null,2)+'\n','utf8');
console.log('P2LRN_EDITORIAL_SEO_AUDIT='+JSON.stringify(report.totals));
for(const issue of errors.slice(0,60))console.error('EDITORIAL_ERROR '+JSON.stringify(issue));
for(const issue of warnings.slice(0,25))console.warn('EDITORIAL_WARNING '+JSON.stringify(issue));
if(errors.length||(process.argv.includes('--strict')&&warnings.length))process.exitCode=1;
