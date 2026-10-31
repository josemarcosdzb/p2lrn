import {readFile,readdir} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {load} from 'cheerio';
import * as acorn from 'acorn';

const root=resolve(process.cwd());
const siteRoot=join(root,'deploy','netlify','site');
const enRoot=join(siteRoot,'en');
const SPANISH_RE=/[áéíóúñü¿¡]|\b(?:el|la|los|las|una?|unos|unas|de|del|al|para|por|con|sin|desde|hasta|cómo|qué|quién|cuál|cuándo|dónde|este|esta|estos|estas|su|sus|tu|tus|puede|puedes|pueden|crear|crea|curso|cursos|juego|juegos|alumno|alumnos|profesor|profesores|docente|lección|lecciones|actividad|actividades|abrir|cerrar|guardar|descargar|seleccionar|eliminar|añadir|nuevo|nueva|documentación|integración|colaboración|seguimiento|métricas|analítica|progresión|referencia|recursos|paquete|paquetes|formato|formatos|compatible|compatibilidad|resultado|resultados|respuesta|respuestas|pregunta|preguntas|intento|intentos|autor|derechos|titular|licencia|privacidad|términos|aviso|contacto|solución|problemas|antes|empezar|instalación|reproducir|disponible|fecha|contenido|puntuación|archivo|archivos|herramientas|plataforma|plataformas|navegador|compartir|revisión|primera|después|todo|toda|todos|todas|más|también|sólo|ningún|ninguna|memoria|relacionar|ordenar|clasificar|verdadero|falso|crucigrama|rosco|visor|inicio|menú|anterior|siguiente|configurar|página|páginas|datos|calificaciones|ejemplos|ejemplo|seguridad)\b/i;

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
  return text&&SPANISH_RE.test(text);
}
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
function skipJsValue(value,parent,node){
  if((parent?.type==='ImportDeclaration'||parent?.type==='ExportNamedDeclaration'||parent?.type==='ExportAllDeclaration')&&parent.source===node)return true;
  if(parent?.type==='Property'&&parent.key===node&&!parent.computed)return true;
  const text=String(value??'');
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
if(sourceHtml.length!==enHtml.length)errors.push('English page count '+enHtml.length+' does not match Spanish source count '+sourceHtml.length+'.');

const routes=new Set();
for(const file of sourceHtml){
  const rel=relative(siteRoot,file).replaceAll('\\','/');
  const route=routeFromRelative(rel);
  if(route)routes.add(route);
  const counterpart=join(enRoot,...rel.split('/'));
  try{await readFile(counterpart,'utf8');}catch{errors.push('Missing English counterpart for '+rel);}
}

for(const file of enHtml){
  const rel=relative(enRoot,file).replaceAll('\\','/');
  const html=await readFile(file,'utf8');
  const $=load(html,{decodeEntities:false});
  if(String($('html').attr('lang')??'').toLowerCase()!=='en')errors.push(rel+': html lang is not en.');
  const blocked=new Set(['code','pre','script','style','kbd','samp','svg','path']);
  const visit=(node,ancestorBlocked=false)=>{
    const tag=node.type==='tag'?String(node.name||'').toLowerCase():'';
    const nextBlocked=ancestorBlocked||blocked.has(tag);
    if(node.type==='text'&&!nextBlocked&&isVisibleSpanish(node.data))errors.push(rel+': Spanish visible text: '+JSON.stringify(String(node.data).trim().slice(0,180)));
    for(const child of node.children??[])visit(child,nextBlocked);
  };
  for(const node of $.root().get(0)?.children??[])visit(node,false);
  for(const attr of ['aria-label','aria-description','alt','placeholder','title']){
    $('['+attr+']').each((_,el)=>{
      const value=$(el).attr(attr);
      if(isVisibleSpanish(value))errors.push(rel+': Spanish '+attr+': '+JSON.stringify(value));
    });
  }
  $('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]').each((_,el)=>{
    const value=$(el).attr('content');
    if(isVisibleSpanish(value))errors.push(rel+': Spanish metadata: '+JSON.stringify(value));
  });
  $('a[href]').each((_,el)=>{
    const href=$(el).attr('href')??'';
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
