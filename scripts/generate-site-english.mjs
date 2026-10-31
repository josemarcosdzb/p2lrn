import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {dirname,extname,join,relative,resolve} from 'node:path';
import {pipeline} from '@huggingface/transformers';
import * as acorn from 'acorn';
import {load} from 'cheerio';

const root=resolve(process.cwd());
const siteRoot=join(root,'deploy','netlify','site');
const englishRoot=join(siteRoot,'en');
const cachePath=join(root,'scripts','site-en-translations.json');
const MODEL='Xenova/opus-mt-es-en';
const JS_FILES=['p2lrn.js','studio/studio.js','demo/viewer.js','analytics/demo.js'];

const MANUAL=new Map(Object.entries({
  'Menú':'Menu','Cerrar':'Close','Abrir':'Open','Inicio':'Home','Anterior':'Previous','Siguiente':'Next',
  'Documentación':'Documentation','Integración':'Integration','Colaboración':'Collaboration','Contacto':'Contact',
  'Privacidad':'Privacy','Licencia':'License','Términos':'Terms','Aviso legal':'Legal notice','Recursos':'Resources',
  'Crear':'Create','Reproducir':'Play','Integrar':'Integrate','Seguimiento':'Tracking','Referencia':'Reference',
  'Empezar':'Get started','Instalar':'Install','Conectores':'Connectors','Cuestionarios':'Questionnaires',
  'Cuestionario':'Questionnaire','Memoria':'Memory','Relacionar':'Matching','Ordenar':'Ordering',
  'Clasificar':'Classification','Verdadero / Falso':'True / False','Sopa de letras':'Word search',
  'Crucigrama':'Crossword','Rosco':'Word Wheel','Juego 3D':'3D game','Juegos 3D':'3D games',
  'Lecciones':'Lessons','Paquetes':'Packages','Compatibilidad':'Compatibility','Métricas':'Metrics',
  'Analítica':'Analytics','Progresión':'Progress','Alumno':'Learner','Alumnos':'Learners','Profesor':'Teacher',
  'Profesores':'Teachers','Autor':'Author','Descripción':'Description','Título':'Title','Archivo':'File',
  'Archivos':'Files','Guardar':'Save','Descargar':'Download','Seleccionar':'Select','Eliminar':'Delete',
  'Copiado':'Copied','Disponible':'Available','No disponible':'Unavailable','Resultados':'Results',
  'Resultado':'Result','Actividad':'Activity','Actividades':'Activities','Curso':'Course','Cursos':'Courses',
  'Unidad':'Unit','Unidades':'Units','Lección':'Lesson','Puntuación':'Score','Intentos':'Attempts',
  'Contenido':'Content','Formato':'Format','Formatos':'Formats','Ejemplos':'Examples','Ejemplo':'Example',
  'Configuración':'Settings','Seguridad':'Security','Cookies':'Cookies'
}));

const SPANISH_RE=/[áéíóúñü¿¡]|\b(?:el|la|los|las|una?|unos|unas|de|del|al|para|por|con|sin|desde|hasta|como|cómo|que|qué|quién|cuál|cuando|cuándo|donde|dónde|este|esta|estos|estas|ese|esa|esos|esas|su|sus|tu|tus|nuestro|nuestra|puede|puedes|pueden|crear|crea|curso|cursos|juego|juegos|alumno|alumnos|profesor|profesores|docente|lección|lecciones|actividad|actividades|abrir|cerrar|guardar|descargar|seleccionar|eliminar|añadir|nuevo|nueva|documentación|integración|colaboración|seguimiento|métricas|analítica|progresión|referencia|recursos|paquete|paquetes|formato|formatos|compatible|compatibilidad|resultado|resultados|respuesta|respuestas|pregunta|preguntas|intento|intentos|autor|derechos|titular|licencia|privacidad|términos|aviso|contacto|solución|problemas|antes|empezar|instalación|reproducir|disponible|fecha|contenido|puntuación|archivo|archivos|herramientas|plataforma|plataformas|navegador|compartir|revisión|primera|después|todo|toda|todos|todas|más|menos|también|sólo|solo|ningún|ninguna|memoria|relacionar|ordenar|clasificar|verdadero|falso|crucigrama|rosco|visor|inicio|menú|anterior|siguiente|configurar|página|páginas|datos|calificaciones|ejemplos|ejemplo|seguridad)\b/i;

const TECH_EXACT=new Set(['P2LRN','Player','Studio','Toolkit','Analytics','SCORM','H5P','cmi5','xAPI','QTI','LTI','LMS','HTML','CSS','JavaScript','TypeScript','Node','Node.js','NPM','npm','CDN','API','MCP','JSON','JSON-LD','SHA-256','Ed25519','WebRTC','URL','HTTP','HTTPS','ChatGPT','Claude','Gemini','Grok','Windows','Linux','macOS','ZIP','CSV','EPUB','DOCX','PPTX','PDF','RTF','ODT','Markdown','.p2lrn','.p2lrn-result','P2LRN-NCSL 1.0','Apache-2.0','MIT']);

async function walk(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory()){
      if(full===englishRoot)continue;
      out.push(...await walk(full));
    }else if(entry.isFile())out.push(full);
  }
  return out;
}
function routeFromRelative(rel){
  const normalized=rel.replaceAll('\\','/');
  if(normalized==='index.html')return '/';
  if(normalized.endsWith('/index.html'))return '/'+normalized.slice(0,-'index.html'.length);
  return null;
}
function normalizeRoute(pathname){return pathname==='/'?'/':(pathname.endsWith('/')?pathname:pathname+'/');}
function englishRoute(route){return route==='/'?'/en/':'/en'+route;}
function splitHref(value){
  const q=value.indexOf('?'),h=value.indexOf('#');
  let cut=value.length;
  if(q>=0)cut=Math.min(cut,q);
  if(h>=0)cut=Math.min(cut,h);
  return {path:value.slice(0,cut),suffix:value.slice(cut)};
}
function rewriteHref(value,routes){
  if(!value||value.startsWith('#')||value.startsWith('//')||/^[a-z][a-z0-9+.-]*:/i.test(value)||!value.startsWith('/'))return value;
  const {path,suffix}=splitHref(value);
  if(path.startsWith('/en/'))return value;
  if(path==='/search-index.json')return '/en/search-index.json'+suffix;
  const normalized=normalizeRoute(path);
  return routes.has(normalized)?englishRoute(normalized)+suffix:value;
}
function rewriteAbsoluteUrl(value,routes){
  const origin='https://p2lrn.netlify.app';
  if(!value.startsWith(origin+'/'))return value;
  return origin+rewriteHref(value.slice(origin.length),routes);
}
function looksSpanish(value){return MANUAL.has(String(value).trim())||SPANISH_RE.test(String(value));}
function shouldTranslate(value){
  const text=String(value??'').trim();
  if(!text||TECH_EXACT.has(text)||!/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]/.test(text))return false;
  if(/^https?:\/\//i.test(text)||/^mailto:/i.test(text)||/^tel:/i.test(text)||/^[/#.\[]/.test(text))return false;
  if(/^(?:application|text|image|audio|video)\//i.test(text))return false;
  if(/^[\w.-]+\.(?:js|mjs|css|json|html|xml|png|jpe?g|svg|webp|zip|p2lrn|md|txt|wasm)$/i.test(text))return false;
  if(/^[a-z0-9_.:@/-]+$/i.test(text)&&!looksSpanish(text))return false;
  return looksSpanish(text);
}

let cache={};
try{cache=JSON.parse(await readFile(cachePath,'utf8'));}catch{}
const pending=new Set();
function register(value){
  const text=String(value??'').trim();
  if(!shouldTranslate(text)||MANUAL.has(text)||cache[text])return;
  pending.add(text);
}
function registerJson(value,key=''){
  if(Array.isArray(value)){for(const item of value)registerJson(item,key);return;}
  if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value))registerJson(v,k);return;}
  if(typeof value!=='string'||['url','@id','@context','sameAs','image','inLanguage'].includes(key))return;
  register(value);
}
function registerHtmlFragment(fragment){
  const $=load('<body>'+fragment+'</body>',{decodeEntities:false},false);
  const blocked=new Set(['code','pre','script','style','kbd','samp','svg','path']);
  const visit=(node,ancestorBlocked=false)=>{
    const tag=node.type==='tag'?String(node.name||'').toLowerCase():'';
    const nextBlocked=ancestorBlocked||blocked.has(tag);
    if(node.type==='text'&&!nextBlocked)register(node.data);
    for(const child of node.children??[])visit(child,nextBlocked);
  };
  for(const node of $('body').get(0)?.children??[])visit(node,false);
  for(const attr of ['aria-label','aria-description','alt','placeholder','title'])
    $('['+attr+']').each((_,el)=>register($(el).attr(attr)));
}

const files=await walk(siteRoot);
const htmlFiles=files.filter(file=>extname(file).toLowerCase()==='.html'&&!relative(siteRoot,file).replaceAll('\\','/').startsWith('en/'));
const routes=new Set();
for(const file of htmlFiles){
  const route=routeFromRelative(relative(siteRoot,file).replaceAll('\\','/'));
  if(route)routes.add(route);
}

function visitTextNodes($,registerOnly=true){
  const blockedTags=new Set(['code','pre','script','style','kbd','samp','svg','path']);
  const visit=(node,blocked=false)=>{
    const tag=node.type==='tag'?String(node.name||'').toLowerCase():'';
    const nextBlocked=blocked||blockedTags.has(tag);
    if(node.type==='text'&&!nextBlocked){
      if(registerOnly)register(node.data);
      else node.data=translatePlain(node.data);
    }
    for(const child of node.children??[])visit(child,nextBlocked);
  };
  for(const node of $.root().get(0)?.children??[])visit(node,false);
}

for(const file of htmlFiles){
  const $=load(await readFile(file,'utf8'),{decodeEntities:false});
  visitTextNodes($,true);
  for(const attr of ['aria-label','aria-description','alt','placeholder','title'])$('['+attr+']').each((_,el)=>register($(el).attr(attr)));
  $('input[type="button"][value],input[type="submit"][value]').each((_,el)=>register($(el).attr('value')));
  $('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]').each((_,el)=>register($(el).attr('content')));
  $('script[type="application/ld+json"]').each((_,el)=>{try{registerJson(JSON.parse($(el).text()));}catch{}});
}

const jsSources=new Map();
function parseJs(source){try{return acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});}catch{return acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'});}}
function walkAst(node,fn,parent=null){
  if(!node||typeof node!=='object')return;
  fn(node,parent);
  for(const [key,val] of Object.entries(node)){
    if(['start','end','loc','range','raw','value'].includes(key))continue;
    if(Array.isArray(val))for(const child of val)if(child&&typeof child==='object'&&child.type)walkAst(child,fn,node);
    else if(val&&typeof val==='object'&&val.type)walkAst(val,fn,node);
  }
}
function structuralLiteral(node,parent){
  if(!parent)return false;
  if((parent.type==='ImportDeclaration'||parent.type==='ExportNamedDeclaration'||parent.type==='ExportAllDeclaration')&&parent.source===node)return true;
  if(parent.type==='Property'&&parent.key===node&&!parent.computed)return true;
  return false;
}
for(const rel of JS_FILES){
  const source=await readFile(join(siteRoot,...rel.split('/')),'utf8');
  jsSources.set(rel,source);
  walkAst(parseJs(source),(node,parent)=>{
    if(node.type==='Literal'&&typeof node.value==='string'&&!node.regex&&!structuralLiteral(node,parent)){
      if(node.value.includes('<')&&node.value.includes('>'))registerHtmlFragment(node.value);
      else register(node.value);
    }
  });
}

let translator=null;
async function getTranslator(){if(!translator)translator=await pipeline('translation',MODEL,{dtype:'q8'});return translator;}
function unwrap(item){
  const value=Array.isArray(item)?item[0]:item;
  return String(value?.translation_text??value?.generated_text??'').trim();
}
const missing=[...pending].filter(text=>!MANUAL.has(text)&&!cache[text]);
if(missing.length){
  const pipe=await getTranslator();
  const batchSize=Math.max(1,Number(process.env.P2LRN_I18N_BATCH_SIZE)||16);
  for(let offset=0;offset<missing.length;offset+=batchSize){
    const batch=missing.slice(offset,offset+batchSize);
    let results;
    try{
      results=await pipe(batch,{max_new_tokens:512});
      if(!Array.isArray(results)||results.length!==batch.length)throw new Error('Unexpected batch output shape.');
      for(let index=0;index<batch.length;index++){
        const translated=unwrap(results[index]);
        cache[batch[index]]=translated||batch[index];
      }
    }catch(batchError){
      console.warn('P2LRN_I18N_BATCH_FALLBACK='+offset+': '+String(batchError?.message??batchError));
      for(const source of batch){
        let result;
        try{result=await pipe(source,{max_new_tokens:512});}
        catch(error){throw new Error('Translation failed for '+JSON.stringify(source)+': '+String(error?.message??error));}
        const translated=unwrap(result);
        cache[source]=translated||source;
      }
    }
    const done=Math.min(offset+batch.length,missing.length);
    if(done%80===0||done===missing.length)console.log('P2LRN_I18N_PROGRESS='+done+'/'+missing.length);
    if(done%320===0)await writeFile(cachePath,JSON.stringify(cache,null,2)+'\n','utf8');
  }
}
await writeFile(cachePath,JSON.stringify(cache,null,2)+'\n','utf8');

function preserveWhitespace(original,replacement){
  const leading=String(original).match(/^\s*/)?.[0]??'';
  const trailing=String(original).match(/\s*$/)?.[0]??'';
  return leading+replacement+trailing;
}
function translatePlain(value){
  const original=String(value??'');
  const text=original.trim();
  if(!shouldTranslate(text))return original;
  return preserveWhitespace(original,MANUAL.get(text)??cache[text]??text);
}
function translateHtmlFragment(fragment){
  const $=load('<body>'+fragment+'</body>',{decodeEntities:false},false);
  const blocked=new Set(['code','pre','script','style','kbd','samp','svg','path']);
  const visit=(node,ancestorBlocked=false)=>{
    const tag=node.type==='tag'?String(node.name||'').toLowerCase():'';
    const nextBlocked=ancestorBlocked||blocked.has(tag);
    if(node.type==='text'&&!nextBlocked)node.data=translatePlain(node.data);
    for(const child of node.children??[])visit(child,nextBlocked);
  };
  for(const node of $('body').get(0)?.children??[])visit(node,false);
  for(const attr of ['aria-label','aria-description','alt','placeholder','title'])
    $('['+attr+']').each((_,el)=>$(el).attr(attr,translatePlain($(el).attr(attr))));
  return $('body').html()??fragment;
}
function translateJson(value,key=''){
  if(Array.isArray(value))return value.map(item=>translateJson(item,key));
  if(value&&typeof value==='object'){
    const out={};
    for(const [k,v] of Object.entries(value))out[k]=translateJson(v,k);
    return out;
  }
  if(typeof value!=='string')return value;
  if(key==='inLanguage')return 'en';
  if(['url','@id','sameAs','image'].includes(key))return rewriteAbsoluteUrl(value,routes);
  if(key==='@context')return value;
  return translatePlain(value);
}

await rm(englishRoot,{recursive:true,force:true});
await mkdir(englishRoot,{recursive:true});
for(const file of htmlFiles){
  const rel=relative(siteRoot,file).replaceAll('\\','/');
  const $=load(await readFile(file,'utf8'),{decodeEntities:false});
  $('html').attr('lang','en');
  visitTextNodes($,false);
  for(const attr of ['aria-label','aria-description','alt','placeholder','title'])$('['+attr+']').each((_,el)=>$(el).attr(attr,translatePlain($(el).attr(attr))));
  $('input[type="button"][value],input[type="submit"][value]').each((_,el)=>$(el).attr('value',translatePlain($(el).attr('value'))));
  $('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]').each((_,el)=>$(el).attr('content',translatePlain($(el).attr('content'))));
  $('meta[property="og:url"]').each((_,el)=>$(el).attr('content',rewriteAbsoluteUrl($(el).attr('content')??'',routes)));
  $('link[rel~="canonical"][href]').each((_,el)=>$(el).attr('href',rewriteAbsoluteUrl($(el).attr('href')??'',routes)));
  $('script[type="application/ld+json"]').each((_,el)=>{try{$(el).text(JSON.stringify(translateJson(JSON.parse($(el).text()))));}catch{}});
  $('a[href]').each((_,el)=>$(el).attr('href',rewriteHref($(el).attr('href'),routes)));
  $('form[action]').each((_,el)=>$(el).attr('action',rewriteHref($(el).attr('action'),routes)));
  $('link[rel~="manifest"]').each((_,el)=>$(el).attr('href','/en/site.webmanifest'));
  $('meta[http-equiv]').each((_,el)=>{
    if(String($(el).attr('http-equiv')??'').toLowerCase()!=='refresh')return;
    const content=String($(el).attr('content')??'');
    const match=/^(\s*\d+\s*;\s*url=)([\s\S]+)$/i.exec(content);
    if(match)$(el).attr('content',match[1]+rewriteHref(match[2].trim(),routes));
  });
  const scriptMap=[['/p2lrn.js','/en/p2lrn.js'],['/studio/studio.js','/en/studio/studio.js'],['/demo/viewer.js','/en/demo/viewer.js'],['/analytics/demo.js','/en/analytics/demo.js']];
  $('script[src]').each((_,el)=>{
    const src=$(el).attr('src')??'';
    for(const [from,to] of scriptMap)if(src===from||src.startsWith(from+'?')){$(el).attr('src',to+src.slice(from.length));break;}
  });
  const dest=join(englishRoot,...rel.split('/'));
  await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,$.html(),'utf8');
}

const sourceManifestPath=join(siteRoot,'site.webmanifest');
try{
  const manifest=JSON.parse(await readFile(sourceManifestPath,'utf8'));
  manifest.lang='en';
  manifest.start_url='/en/';
  manifest.scope='/en/';
  await writeFile(join(englishRoot,'site.webmanifest'),JSON.stringify(manifest,null,2)+'\n','utf8');
}catch{}

for(const [rel,source] of jsSources){
  const edits=[];
  walkAst(parseJs(source),(node,parent)=>{
    if(node.type!=='Literal'||typeof node.value!=='string'||node.regex||structuralLiteral(node,parent))return;
    let next=node.value.includes('<')&&node.value.includes('>')
      ?translateHtmlFragment(node.value)
      :translatePlain(node.value);
    next=rewriteHref(next,routes);
    if(next!==node.value)edits.push({start:node.start,end:node.end,text:JSON.stringify(next)});
  });
  let generated=source;
  for(const edit of edits.sort((a,b)=>b.start-a.start))generated=generated.slice(0,edit.start)+edit.text+generated.slice(edit.end);
  const dest=join(englishRoot,...rel.split('/'));
  await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,generated,'utf8');
}

console.log(JSON.stringify({ok:true,model:MODEL,htmlPages:htmlFiles.length,routes:routes.size,cacheEntries:Object.keys(cache).length},null,2));
