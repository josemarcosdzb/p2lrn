import {readFile,readdir} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {load} from 'cheerio';
import {parseJs,walkAst} from './site-i18n-ast.mjs';
import {englishRouteFor,ENGLISH_ANCHORS,LEGACY_ENGLISH_ROUTES} from '../deploy/netlify/site-routes.mjs';

const root=resolve(process.cwd());
const siteRoot=join(root,'deploy','netlify','site');
const enRoot=join(siteRoot,'en');
const SPANISH_RE=/[áéíóúñü¿¡]|\b(?:el|la|los|las|una?|unos|unas|de|del|al|para|por|con|sin|desde|hasta|cómo|qué|quién|cuál|cuándo|dónde|este|esta|estos|estas|su|sus|tu|tus|puede|puedes|pueden|crear|crea|curso|cursos|juego|juegos|alumno|alumnos|profesor|profesores|docente|lección|lecciones|actividad|actividades|abrir|cerrar|guardar|descargar|seleccionar|eliminar|añadir|nuevo|nueva|documentación|integración|colaboración|seguimiento|métricas|analítica|progresión|referencia|recursos|paquete|paquetes|formato|formatos|compatibilidad|resultado|resultados|respuesta|respuestas|pregunta|preguntas|intento|intentos|autor|derechos|titular|licencia|privacidad|términos|aviso|contacto|solución|problemas|antes|empezar|instalación|reproducir|disponible|fecha|contenido|puntuación|archivo|archivos|herramientas|plataforma|plataformas|navegador|compartir|revisión|primera|después|todo|toda|todos|todas|más|también|sólo|ningún|ninguna|memoria|relacionar|ordenar|clasificar|verdadero|falso|crucigrama|rosco|visor|inicio|menú|anterior|siguiente|configurar|página|páginas|datos|calificaciones|ejemplos|ejemplo|seguridad|perfiles|arquitectura|eventos|recetas|glosario|limitaciones)\b/i;
const EXTRA_SPANISH_RE=/\b(?:y|en|de|del|al|el|la|los|las|un|una|unos|unas|para|por|con|sin|desde|hasta|este|esta|estos|estas|que|como|curso|cursos|unidad|unidades|leccion|lecciones|pregunta|preguntas|respuesta|respuestas|archivo|archivos|alumno|alumnos|docente|profesor|profesores|juego|juegos|verdadero|falso|ordenar|relacionar|clasificar|clasifica|rellenar|huecos|sopa|letras|pizarra|compartida|borrador|entrega|integridad|origen|perfiles|eventos|recetas|glosario|arquitectura|instalar|cargar|comprobar|verificar|descargar|guardar|editar|generar|revisar|recurso|biblioteca|documento|documentos|seguridad|derechos|titular|autor|licencia|privacidad|terminos|aviso|responsabilidad|finalidad|actualizaciones|obligaciones|disponibilidad|servidor|persistencia|notas|estado|metadatos|representaciones|renderizador|reintentos|duplicados|idempotencia|secuencias|estructura|interactivo|nativos|interactivas|componentes)\b/i;

async function walk(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await walk(full));
    else if(entry.isFile())out.push(full);
  }
  return out;
}
function routeFromRelative(rel){
  const p=rel.replaceAll('\\','/');
  if(p==='index.html')return '/';
  if(p.endsWith('/index.html'))return '/'+p.slice(0,-'index.html'.length);
  return null;
}
function normalizeRoute(pathname){return pathname==='/'?'/':(pathname.endsWith('/')?pathname:pathname+'/');}
function isVisibleSpanish(value){
  const text=String(value??'').replace(/\s+/g,' ').trim();
  return text&&(SPANISH_RE.test(text)||EXTRA_SPANISH_RE.test(text));
}
// Route fragment IDs, locale codes and game-mode identifiers are protocol values,
// not visible labels. They must stay identical across both languages.
const JS_PROTOCOL_VALUES=new Set(['en','es','rosco','para-que','crear-cursos','comprobar']);
function skipJsValue(value,parent,node){
  if((parent?.type==='ImportDeclaration'||parent?.type==='ExportNamedDeclaration'||parent?.type==='ExportAllDeclaration')&&parent.source===node)return true;
  if(parent?.type==='Property'&&parent.key===node&&!parent.computed)return true;
  const text=String(value??'');
  if(JS_PROTOCOL_VALUES.has(text))return true;
  return /^[/#.\[]/.test(text)||/^https?:\/\//i.test(text)||/^(?:application|text|image|audio|video)\//i.test(text);
}

const sourceHtml=(await walk(siteRoot)).filter(file=>{
  if(!file.endsWith('.html'))return false;
  const rel=relative(siteRoot,file).replaceAll('\\','/');
  return !rel.startsWith('en/')&&routeFromRelative(rel)!==null;
});
const enHtml=(await walk(enRoot)).filter(file=>{
  if(!file.endsWith('.html'))return false;
  return routeFromRelative(relative(enRoot,file).replaceAll('\\','/'))!==null;
});
const errors=[];

const spanishHome=load(await readFile(join(siteRoot,'index.html'),'utf8'),{decodeEntities:false});
const englishHome=load(await readFile(join(enRoot,'index.html'),'utf8'),{decodeEntities:false});
const spanishSkills=spanishHome('a.home-feature--compact[href="/docs/skills/"]');
const englishSkills=englishHome('a.home-feature--compact[href="/en/docs/skills/"]');
const normalizedText=(value)=>String(value).replace(/\s+/g,' ').trim();
if(spanishSkills.length!==1||normalizedText(spanishSkills.find('h3').text())!=='Skills para IA'||
  normalizedText(spanishSkills.find('b').text())!=='Ver Skills para IA →')
  errors.push('index.html: Spanish Skills card must have the correct heading, destination and CTA.');
if(englishSkills.length!==1||normalizedText(englishSkills.find('h3').text())!=='AI Skills'||
  normalizedText(englishSkills.find('b').text())!=='Explore AI Skills →')
  errors.push('en/index.html: English Skills card must have the corresponding heading, destination and CTA.');
if(normalizedText(spanishHome('.format-flow article:first-child h3').text())!=='PAQUETE')
  errors.push('index.html: the first format step must be labeled PAQUETE, not PACKAGE.');
if(normalizedText(englishHome('.format-flow article:first-child h3').text())!=='PACKAGE')
  errors.push('en/index.html: the first format step must retain the English label PACKAGE.');

if(sourceHtml.length!==enHtml.length)errors.push('English page count '+enHtml.length+' does not match Spanish source count '+sourceHtml.length+'.');

const routes=new Set();
for(const file of sourceHtml){
  const rel=relative(siteRoot,file).replaceAll('\\','/');
  const route=routeFromRelative(rel);
  if(route)routes.add(route);
  const counterpart=join(enRoot,...rel.split('/'));
  try{await readFile(counterpart,'utf8');}catch{errors.push('Missing English counterpart for '+rel);}
}

const PARITY_SELECTORS=['h1','h2','h3','a','button','input','select','textarea','form','img','video','iframe','details','summary','table','thead','tbody','tr','th','td','code','pre'];
function expectedEnglishHref(href){
  const fragment=(s)=>String(s).replace(/#([A-Za-z0-9_-]+)/g,(m,id)=>'#'+(ENGLISH_ANCHORS[id]||id));
  if(href.startsWith('#'))return fragment(href);
  if(!href.startsWith('/')||href.startsWith('//')||href.startsWith('/en/'))return href;
  const match=/^([^?#]*)([?#].*)?$/.exec(href);
  const path=match?.[1]??href,suffix=fragment(match?.[2]??'');
  if(path==='/search-index.json')return '/en/search-index.json'+suffix;
  const normalized=normalizeRoute(path);
  if(!routes.has(normalized))return href;
  return englishRouteFor(normalized)+suffix;
}
function idsOf($){return $('[id]').map((_,el)=>$(el).attr('id')).get().sort();}
function dataContract($){
  return $('*').map((_,el)=>{
    const attrs=el.attribs??{};
    const data=Object.keys(attrs).filter(key=>key.startsWith('data-')).sort().map(key=>key==='data-help'?key:key+'='+attrs[key]);
    const role=attrs.role?['role='+attrs.role]:[];
    const name=attrs.name?['name='+attrs.name]:[];
    const type=attrs.type?['type='+attrs.type]:[];
    return [...data,...role,...name,...type].join('|');
  }).get().filter(Boolean);
}
for(const file of sourceHtml){
  const rel=relative(siteRoot,file).replaceAll('\\','/');
  const counterpart=join(enRoot,...rel.split('/'));
  let esHtml,enHtmlText;
  try{[esHtml,enHtmlText]=await Promise.all([readFile(file,'utf8'),readFile(counterpart,'utf8')]);}
  catch{continue;}
  const es=load(esHtml,{decodeEntities:false}),en=load(enHtmlText,{decodeEntities:false});
  for(const selector of PARITY_SELECTORS){
    const a=es(selector).length,b=en(selector).length;
    if(a!==b)errors.push(rel+': structural parity mismatch for '+selector+' ('+a+' ES vs '+b+' EN).');
  }
  const esIds=idsOf(es),enIds=idsOf(en);
  const englishAliasIds=new Set(Object.values(ENGLISH_ANCHORS));
  const parityIds=enIds.filter(id=>!englishAliasIds.has(id)||esIds.includes(id));
  if(JSON.stringify(esIds)!==JSON.stringify(parityIds))
    errors.push(rel+': id set differs between ES and EN (apart from English anchor aliases).');
  const esContract=dataContract(es),enContract=dataContract(en);
  if(JSON.stringify(esContract)!==JSON.stringify(enContract))errors.push(rel+': functional data/name/type contract differs between ES and EN.');
  const esLinks=es('a[href]').map((_,el)=>es(el).attr('href')??'').get();
  const enLinks=en('a[href]').map((_,el)=>en(el).attr('href')??'').get();
  if(esLinks.length===enLinks.length){
    for(let i=0;i<esLinks.length;i++){
      const expected=expectedEnglishHref(esLinks[i]);
      if(enLinks[i]!==expected)errors.push(rel+': link '+i+' expected '+expected+' but found '+enLinks[i]+'.');
    }
  }
}

for(const file of enHtml){
  const rel=relative(enRoot,file).replaceAll('\\','/');
  const html=await readFile(file,'utf8');
  const $=load(html,{decodeEntities:false});
  if(String($('html').attr('lang')??'').toLowerCase()!=='en')errors.push(rel+': html lang is not en.');
  const blocked=new Set(['code','pre','script','style','kbd','samp','svg','path']);
  const visit=(node,ancestorBlocked=false)=>{
    const tag=String(node.name||'').toLowerCase();
    const nextBlocked=ancestorBlocked||blocked.has(tag);
    if(node.type==='text'&&!nextBlocked&&isVisibleSpanish(node.data))errors.push(rel+': Spanish visible text: '+JSON.stringify(String(node.data).trim().slice(0,180)));
    for(const child of node.children??[])visit(child,nextBlocked);
  };
  for(const node of $.root().get(0)?.children??[])visit(node,false);
  for(const attr of ['aria-label','aria-description','alt','placeholder','title','data-help']){
    $('['+attr+']').each((_,el)=>{
      const value=$(el).attr(attr);
      if(isVisibleSpanish(value))errors.push(rel+': Spanish '+attr+': '+JSON.stringify(value));
    });
  }
  $('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]').each((_,el)=>{
    const value=$(el).attr('content');
    if(isVisibleSpanish(value))errors.push(rel+': Spanish metadata: '+JSON.stringify(value));
  });
  $('pre code').each((_,el)=>{
    const raw=$(el).text();
    const inspect=raw.replace(/https?:\/\/\S+/g,'').replace(/application\/[A-Za-z0-9.+-]+/g,'');
    if(SPANISH_RE.test(inspect))errors.push(rel+': Spanish human text inside code example: '+JSON.stringify(inspect.slice(0,220)));
  });
  $('script[type="application/ld+json"]').each((_,el)=>{
    try{
      const value=JSON.parse($(el).text());
      const inspect=(node,key='')=>{
        if(Array.isArray(node)){for(const item of node)inspect(item,key);return;}
        if(node&&typeof node==='object'){for(const [k,v] of Object.entries(node))inspect(v,k);return;}
        if(typeof node==='string'&&['name','headline','description','alternateName','text','about','keywords'].includes(key)&&isVisibleSpanish(node))
          errors.push(rel+': Spanish JSON-LD human field '+key+': '+JSON.stringify(node));
      };
      inspect(value);
    }catch{}
  });
  $('a[href]').each((_,el)=>{
    const href=$(el).attr('href')??'';
    if(Object.keys(LEGACY_ENGLISH_ROUTES).some(old=>href===old||href.startsWith(old+'#')||href.startsWith(old+'?')))
      errors.push(rel+': English link uses a legacy Spanish-language slug '+href);
    if(!href.startsWith('/')||href.startsWith('/en/')||href.startsWith('//'))return;
    const path=href.split(/[?#]/,1)[0];
    if(routes.has(normalizeRoute(path)))errors.push(rel+': English page links to Spanish route '+href);
  });
  $('script:not([src])').each((_,el)=>{
    const type=String($(el).attr('type')??'').toLowerCase();
    if(type==='application/ld+json'||type==='importmap'||type==='application/json')return;
    const source=$(el).text();
    if(!source.trim())return;
    let ast;
    try{ast=parseJs(source);}catch{return;}
    walkAst(ast,(node,parent)=>{
      let value=null;
      if(node.type==='Literal'&&typeof node.value==='string'&&!node.regex)value=node.value;
      if(node.type==='TemplateElement')value=node.value?.cooked??node.value?.raw??'';
      if(value===null||skipJsValue(value,parent,node))return;
      if(isVisibleSpanish(value))errors.push(rel+': Spanish inline runtime string: '+JSON.stringify(String(value).slice(0,180)));
    });
  });
}


const [homeEs,homeEn,coursesEs,coursesEn]=await Promise.all([
  readFile(join(siteRoot,'index.html'),'utf8'),
  readFile(join(enRoot,'index.html'),'utf8'),
  readFile(join(siteRoot,'crear-cursos-interactivos/index.html'),'utf8'),
  readFile(join(enRoot,'crear-cursos-interactivos/index.html'),'utf8')
]);
if(!homeEs.includes('<h3>PAQUETE</h3>')||homeEs.includes('<h3>PACKAGE</h3>'))
  errors.push('Spanish homepage lost its translated PAQUETE heading');
if(!homeEn.includes('EXPLORE P2LRN')||homeEn.includes('EXPLORA P2LRN'))
  errors.push('English homepage has a Spanish discovery label');
if(!homeEn.includes('name="description" content="Build portable interactive courses'))
  errors.push('English homepage lost its hand-edited description');
for(const [html,lang] of [[homeEs,'es'],[homeEn,'en']]){
  const video=html.match(/<video\b[^>]*>/i)?.[0]||'';
  if(!html.includes('VideoObject')||!video.includes('poster=')||!video.includes('title=')||!video.includes('controls'))
    errors.push(lang+' homepage lacks accessible video metadata');
}
for(const [html,lang] of [[coursesEs,'es'],[coursesEn,'en']]){
  const img=html.match(/<img\b[^>]*src=["']\/assets\/hero\/studio\.png["'][^>]*>/i)?.[0]||'';
  if(!img.includes('alt=')||img.length<100)
    errors.push(lang+' course creation page lacks descriptive Studio screenshot');
  const skills=[...html.matchAll(/<a\b[^>]*href=["']\/(?:en\/)?skills\/["']/g)];
  if(skills.length!==1)errors.push(lang+' course creation page duplicates the Skills link');
  if((html.match(/<article class="landing-faq-item">/g)||[]).length!==6)
    errors.push(lang+' course creation page lost specific FAQs');
}

try{
  const manifest=JSON.parse(await readFile(join(enRoot,'site.webmanifest'),'utf8'));
  if(manifest.lang!=='en')errors.push('English manifest lang is not en.');
  if(manifest.start_url!=='/en/'||manifest.scope!=='/en/')errors.push('English manifest does not stay inside /en/.');
}catch{errors.push('Missing or invalid English site.webmanifest.');}

for(const rel of ['p2lrn.js','studio/studio.js','demo/viewer.js','analytics/demo.js']){
  const path=join(enRoot,...rel.split('/'));
  let source;
  try{source=await readFile(path,'utf8');}catch{errors.push('Missing English JS '+rel);continue;}
  walkAst(parseJs(source),(node,parent)=>{
    let value=null;
    if(node.type==='Literal'&&typeof node.value==='string'&&!node.regex)value=node.value;
    if(node.type==='TemplateElement')value=node.value?.cooked??node.value?.raw??'';
    if(value===null||skipJsValue(value,parent,node))return;
    if(isVisibleSpanish(value))errors.push(rel+': Spanish runtime string: '+JSON.stringify(String(value).slice(0,180)));
  });
}

if(errors.length){
  console.error('P2LRN bilingual site verification failed with '+errors.length+' problem(s).');
  for(const item of errors.slice(0,250))console.error('- '+item);
  if(errors.length>250)console.error('- ... '+(errors.length-250)+' more');
  process.exit(1);
}
console.log(JSON.stringify({ok:true,spanishPages:sourceHtml.length,englishPages:enHtml.length,englishJs:4},null,2));
