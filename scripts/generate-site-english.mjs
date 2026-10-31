import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {dirname,extname,join,relative,resolve} from 'node:path';
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
  'Configuración':'Settings','Seguridad':'Security','Cookies':'Cookies',
  'Perfiles':'Profiles','Glosario':'Glossary','Arquitectura':'Architecture','Eventos':'Events','Recetas':'Recipes',
  'curso.p2lrn':'course.p2lrn','curso-split.p2lrn':'course-split.p2lrn',
  'https://…/curso.p2lrn':'https://…/course.p2lrn','https://content.example.com/courses/curso/':'https://content.example.com/courses/course/',
  'P2LRN Analytics | Analítica educativa y seguimiento de alumnos':'P2LRN Analytics | Learning analytics and learner tracking',
  '1. Qué muestra':'1. What it shows',
  '2. Manifiesto (manifest): identidad, capacidades e integridad':'2. Manifest: identity, capabilities and integrity',
  'Recorrido común del proveedor':'Common provider flow',
  'NRPS: roles y matrículas (opcional)':'NRPS: roles and enrollments (optional)',
  'Estado actual del proveedor':'Current provider status',
  'Flujo docente y alumno implementado':'Implemented teacher and learner flow',
  'Catálogo procesable':'Machine-readable catalog',
  'Empezar fácil con P2LRN — P2LRN':'Quick start with P2LRN — P2LRN',
  'Empezar fácil':'Quick start',
  'Antes de empezar':'Before you start',
  'Entrega offline y paquetes autorreproducibles — P2LRN':'Offline delivery and self-running packages — P2LRN',
  'Entrega offline y cursos autorreproducibles':'Offline delivery and self-running courses',
  '5. Qué registra una entrega autorreproducible':'5. What a self-running delivery records',
  '9. Firma del encargo y procedencia':'9. Assignment signature and provenance',
  'Recursos compartidos verificados':'Verified shared resources',
  'Ejemplo ejecutable':'Runnable example','Limitaciones':'Limitations',
  'Player web — P2LRN':'Web Player — P2LRN','Player web':'Web Player',
  'API pública':'Public API','Integridad y transporte':'Integrity and transport',
  'Relacionar — P2LRN':'Matching — P2LRN','Ordenar — P2LRN':'Ordering — P2LRN','Rosco — P2LRN':'Word Wheel — P2LRN',
  'Studio visual — P2LRN':'P2LRN Studio — Visual editor',
  '6. Comprobar la vista del alumno':'6. Check the learner view',
  '9. Referencia técnica del componente':'9. Component technical reference',
  '2. Recorrido habitual':'2. Typical workflow',
  '8. Host autoritativo de referencia':'8. Authoritative reference host',
  'Descarga P2LRN para crear cursos educativos con IA.':'Download P2LRN Skills to create educational courses with AI.',
  'Entrega offline autorreproducible':'Self-running offline delivery',
  'Revisar entrega offline':'Review offline delivery',
  '1. Objeto':'1. Purpose',
  '¿Necesitas seguimiento de alumnos y resultados?':'Need learner and result tracking?',
  'De la primera lección a la experiencia del alumno.':'From the first lesson to the learner experience.',
  'Qué vas a conseguir':'What you will get','Qué componente necesitas':'Which component you need',
  'Comprobación final':'Final check','Accesibilidad y alternativa':'Accessibility and alternative mode',
  'Probar un paquete':'Test a package','Probar el ejemplo':'Try the example',
  'Finalización y puntuación':'Completion and scoring',
  'Referencia técnica del componente':'Component technical reference',
  'Toolkit para creación por código':'Toolkit for programmatic authoring',
  'Abrir visor':'Open viewer','Vista alumno':'Learner view',
  'Objeto':'Purpose','Terceros':'Third parties','Responsabilidad':'Liability','Cambios':'Changes',
  'Nombre':'Name','Asunto':'Subject','Mensaje':'Message','Empresa':'Company','Resumen':'Summary',
  'Consentimiento':'Consent','Proveedor':'Provider','Finalidad':'Purpose','Tipo':'Type',
  'Emparejar':'Match','Recargar':'Reload','Pausar':'Pause','Copiar':'Copy','Limpiar':'Clear',
  'RECURSO':'RESOURCE','Notas':'Notes','Inactividad':'Inactivity','Localiza':'Locate','Consulta':'Query',
  'Carga.':'Load.','Salida.':'Output.','expone':'exposes','Identidad':'Identity','Permisos':'Permissions',
  'Nativo':'Native','Leer':'Read','Conservar':'Preserve','Perfil':'Profile','representaciones':'representations',
  'renderizador':'renderer','Ejecuta':'Run','ejecuta':'runs','Administrador:':'Administrator:','Notas:':'Notes:',
  'Requisitos':'Requirements','Servidor':'Server','Reintentos':'Retries','Demuestra':'Demonstrates',
  'Origen':'Origin','Metadatos':'Metadata','Contactar':'Contact','Preparar':'Prepare','Entregar':'Deliver',
  'Realizar':'Complete','Devolver':'Return','Analizar':'Analyze','informativas':'informational',
  'Pulsa':'Click','Comportamiento':'Behavior','Autorreproducible':'Self-running','Incluye':'Includes',
  'Conserva':'Preserves','publicados.':'published.','Fases':'Phases','INSTALAR':'INSTALL',
  'exporta':'exports','Configura':'Configure','Usa':'Use','ESTADO':'STATUS','PRIVADO':'PRIVATE',
  'selecciona':'selects','Estado':'Status','Nota:':'Note:','Interacciones':'Interactions',
  'Objetivos':'Objectives','Deriva':'Derives','Puntuaciones':'Scores','proporciona':'provides',
  'Instala':'Install','Cada':'Each','Conecta':'Connect','Acepta':'Accepts','Renderizado.':'Rendering.',
  'Reglas.':'Rules.','Persistencia.':'Persistence.','Emite':'Emits','Secuencias':'Sequences',
  'DOCUMENTOS':'DOCUMENTS','PRUEBA':'TEST','Devuelve':'Returns','Requisitos:':'Requirements:',
  'Unidad.':'Unit.','Guarda':'Save','DOCUMENTO':'DOCUMENT','estructura':'structure','responde.':'responds.',
  'Comprueba':'Check','Escucha':'Listen','Si':'If','Interactivo':'Interactive','Nativos':'Native',
  'Interactivas':'Interactive','Componentes':'Components','OTROS':'OTHER','independiente.':'independent.',
  'EXPERIENCIA':'EXPERIENCE','Responsable':'Controller','Destinatarios':'Recipients',
  'Actualizaciones':'Updates','indicando':'specifying','Editar':'Edit','Componente':'Component',
  'Fuente':'Font','Negrita':'Bold','Cursiva':'Italic','Subrayado':'Underline','Tachado':'Strikethrough',
  'Centrar':'Center','Color':'Color','Obligaciones':'Obligations','Versiones':'Versions',
  'Disponibilidad':'Availability',
  'y':'and','Y':'AND','o':'or','O':'OR','En':'In','en':'in',
  'INTEGRIDAD':'INTEGRITY','ORIGEN':'ORIGIN','PERFILES':'PROFILES',
  'Usar CDN':'Use CDN','Usar NPM':'Use NPM','Ver eventos':'View events',
  'exige perfiles completos.':'requires complete profiles.',
  '7. Eventos y tiempo activo':'7. Events and active time','8. API y eventos':'8. API and events',
  '5. Perfiles (profiles): reglas adicionales':'5. Profiles: additional rules',
  'Eventos — P2LRN':'Events — P2LRN','Glosario — P2LRN':'Glossary — P2LRN',
  'eventos / Host Adapter':'events / Host Adapter','servidor y persistencia':'server and persistence',
  'Identidad y permisos':'Identity and permissions','Almacenamiento y procesamiento':'Storage and processing',
  'Identidad y notas':'Identity and grades','estado / notas / eventos / LRS':'state / grades / events / LRS',
  '9. Eventos':'9. Events','Arquitectura 3D':'3D architecture','Recetas — P2LRN':'Recipes — P2LRN',
  'EVENTOS':'EVENTS','educational analytics y learning analytics':'educational analytics and learning analytics',
  'Entrega offline':'Offline delivery'
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
  if(text.startsWith('{')||text.startsWith('[')){
    try{JSON.parse(text);return false;}catch{}
  }
  if(/^https?:\/\//i.test(text)||/^mailto:/i.test(text)||/^tel:/i.test(text)||/^[/#\[]/.test(text))return false;
  if(/^\.[A-Za-z0-9_-]+(?:[./:#?]|$)/.test(text))return false;
  if(/^(?:application|text|image|audio|video)\//i.test(text))return false;
  if(/^(?:\\[nrt])+$/i.test(text))return false;
  if(/^[\w.-]+\.(?:js|mjs|css|json|html|xml|png|jpe?g|svg|webp|zip|p2lrn|md|txt|wasm)$/i.test(text))return false;
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
  if(typeof value!=='string')return;
  if(['url','@id','@context','@type','sameAs','image','inLanguage','applicationCategory','operatingSystem','position'].includes(key))return;
  if(['name','headline','description','alternateName','text','about','keywords'].includes(key))register(value);
}
function registerHtmlFragment(fragment){
  const $=load('<body>'+fragment+'</body>',{decodeEntities:false},false);
  const blocked=new Set(['code','pre','script','style','kbd','samp','svg','path']);
  const visit=(node,ancestorBlocked=false)=>{
    const tag=String(node.name||'').toLowerCase();
    const nextBlocked=ancestorBlocked||blocked.has(tag);
    if(node.type==='text'&&!nextBlocked)register(node.data);
    for(const child of node.children??[])visit(child,nextBlocked);
  };
  for(const node of $('body').get(0)?.children??[])visit(node,false);
  for(const attr of ['aria-label','aria-description','alt','placeholder','title'])
    $('['+attr+']').each((_,el)=>register($(el).attr(attr)));
}

const files=await walk(siteRoot);
const htmlFiles=files.filter(file=>{
  if(extname(file).toLowerCase()!=='.html')return false;
  const rel=relative(siteRoot,file).replaceAll('\\','/');
  return !rel.startsWith('en/')&&routeFromRelative(rel)!==null;
});
console.log('P2LRN_I18N_PHASE=scan-source-html pages='+htmlFiles.length);
const routes=new Set();
for(const file of htmlFiles){
  const route=routeFromRelative(relative(siteRoot,file).replaceAll('\\','/'));
  if(route)routes.add(route);
}

function visitTextNodes($,registerOnly=true){
  const blockedTags=new Set(['code','pre','script','style','kbd','samp','svg','path']);
  const visit=(node,blocked=false)=>{
    const tag=String(node.name||'').toLowerCase();
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

console.log('P2LRN_I18N_PHASE=registered-html pending='+pending.size);
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
for(const file of htmlFiles){
  const $=load(await readFile(file,'utf8'),{decodeEntities:false});
  $('script:not([src])').each((_,el)=>{
    const type=String($(el).attr('type')??'').toLowerCase();
    if(type==='application/ld+json'||type==='importmap'||type==='application/json')return;
    const source=$(el).text();
    if(!source.trim())return;
    let ast;
    try{ast=parseJs(source);}catch{return;}
    walkAst(ast,(node,parent)=>{
      if(node.type==='Literal'&&typeof node.value==='string'&&!node.regex&&!structuralLiteral(node,parent)){
        if(node.value.includes('<')&&node.value.includes('>'))registerHtmlFragment(node.value);
        else register(node.value);
      }
    });
  });
}

console.log('P2LRN_I18N_PHASE=registered-js pending='+pending.size+' cache='+Object.keys(cache).length);
let translator=null;
async function getTranslator(){
  if(!translator){
    const {pipeline}=await import('@huggingface/transformers');
    translator=await pipeline('translation',MODEL,{dtype:'q8'});
  }
  return translator;
}
function unwrap(item){
  const value=Array.isArray(item)?item[0]:item;
  return String(value?.translation_text??value?.generated_text??'').trim();
}
const missing=[...pending].filter(text=>!MANUAL.has(text)&&!cache[text]);
console.log('P2LRN_I18N_PHASE=translate missing='+missing.length+' provider='+(process.env.P2LRN_I18N_PROVIDER||'local'));
if(process.env.P2LRN_I18N_REPORT_MISSING==='1'){
  console.log('P2LRN_I18N_MISSING_JSON='+JSON.stringify(missing));
  process.exit(missing.length?2:0);
}
const translationProvider=String(process.env.P2LRN_I18N_PROVIDER||'local').toLowerCase();
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function translateGoogle(text){
  const endpoint='https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=en&dt=t&q='+encodeURIComponent(text);
  for(let attempt=0;attempt<6;attempt++){
    try{
      const response=await fetch(endpoint,{
        headers:{'User-Agent':'P2LRN-site-i18n/1.0'},
        signal:AbortSignal.timeout(15000),
      });
      if(!response.ok)throw new Error('HTTP '+response.status);
      const payload=await response.json();
      const translated=Array.isArray(payload?.[0])
        ?payload[0].map(part=>String(part?.[0]??'')).join('').trim()
        :'';
      if(!translated)throw new Error('Empty translation');
      return translated;
    }catch(error){
      if(attempt===5)throw error;
      await sleep((attempt+1)*750);
    }
  }
}
if(missing.length&&translationProvider==='google'){
  const concurrency=Math.max(1,Math.min(8,Number(process.env.P2LRN_I18N_CONCURRENCY)||4));
  let cursor=0,done=0;
  const failures=[];
  async function worker(){
    while(true){
      const index=cursor++;
      if(index>=missing.length)return;
      const source=missing[index];
      try{cache[source]=await translateGoogle(source);}
      catch(error){failures.push({source,error:String(error?.message??error)});}
      done++;
      if(done%80===0||done===missing.length){
        console.log('P2LRN_I18N_PROGRESS='+done+'/'+missing.length+' failures='+failures.length);
        await writeFile(cachePath,JSON.stringify(cache,null,2)+'\n','utf8');
      }
    }
  }
  await Promise.all(Array.from({length:concurrency},()=>worker()));
  if(failures.length){
    throw new Error('Remote translation left '+failures.length+' unresolved string(s): '+JSON.stringify(failures.slice(0,12)));
  }
}else if(missing.length){
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
function normalizeEnglishCopy(value){
  return String(value).replace(/\bRosco\b/g,'Word Wheel').replace(/\brosco\b/g,'word wheel');
}
function translatePlain(value){
  const original=String(value??'');
  const text=original.trim();
  if(MANUAL.has(text))return preserveWhitespace(original,normalizeEnglishCopy(MANUAL.get(text)));
  if(!shouldTranslate(text))return original;
  return preserveWhitespace(original,normalizeEnglishCopy(cache[text]??text));
}
function translateHtmlFragment(fragment){
  const $=load('<body>'+fragment+'</body>',{decodeEntities:false},false);
  const blocked=new Set(['code','pre','script','style','kbd','samp','svg','path']);
  const visit=(node,ancestorBlocked=false)=>{
    const tag=String(node.name||'').toLowerCase();
    const nextBlocked=ancestorBlocked||blocked.has(tag);
    if(node.type==='text'&&!nextBlocked)node.data=translatePlain(node.data);
    for(const child of node.children??[])visit(child,nextBlocked);
  };
  for(const node of $('body').get(0)?.children??[])visit(node,false);
  for(const attr of ['aria-label','aria-description','alt','placeholder','title'])
    $('['+attr+']').each((_,el)=>$(el).attr(attr,translatePlain($(el).attr(attr))));
  return $('body').html()??fragment;
}
function translateJavaScriptSource(source){
  let ast;
  try{ast=parseJs(source);}catch{return source;}
  const edits=[];
  walkAst(ast,(node,parent)=>{
    if(node.type!=='Literal'||typeof node.value!=='string'||node.regex||structuralLiteral(node,parent))return;
    let next=node.value.includes('<')&&node.value.includes('>')
      ?translateHtmlFragment(node.value)
      :translatePlain(node.value);
    next=rewriteHref(next,routes);
    if(next!==node.value)edits.push({start:node.start,end:node.end,text:JSON.stringify(next)});
  });
  let generated=source;
  for(const edit of edits.sort((a,b)=>b.start-a.start))
    generated=generated.slice(0,edit.start)+edit.text+generated.slice(edit.end);
  return generated;
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
  if(['@context','@type','applicationCategory','operatingSystem','position'].includes(key))return value;
  if(['name','headline','description','alternateName','text','about','keywords'].includes(key))return translatePlain(value);
  return value;
}

console.log('P2LRN_I18N_PHASE=generate-html cache='+Object.keys(cache).length);
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
  $('script:not([src])').each((_,el)=>{
    const type=String($(el).attr('type')??'').toLowerCase();
    if(type==='application/ld+json'||type==='importmap'||type==='application/json')return;
    const source=$(el).text();
    if(source.trim())$(el).text(translateJavaScriptSource(source));
  });
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

console.log('P2LRN_I18N_PHASE=html-generated pages='+htmlFiles.length);
const sourceManifestPath=join(siteRoot,'site.webmanifest');
try{
  const manifest=JSON.parse(await readFile(sourceManifestPath,'utf8'));
  manifest.lang='en';
  manifest.start_url='/en/';
  manifest.scope='/en/';
  await writeFile(join(englishRoot,'site.webmanifest'),JSON.stringify(manifest,null,2)+'\n','utf8');
}catch{}

console.log('P2LRN_I18N_PHASE=generate-js files='+jsSources.size);
for(const [rel,source] of jsSources){
  const generated=translateJavaScriptSource(source);
  const dest=join(englishRoot,...rel.split('/'));
  await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,generated,'utf8');
}

console.log(JSON.stringify({ok:true,model:MODEL,htmlPages:htmlFiles.length,routes:routes.size,cacheEntries:Object.keys(cache).length},null,2));
