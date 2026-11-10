// Build-time only. Source documentation HTML and its visible text are never rewritten.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,relative,basename} from 'node:path';
import {englishRouteFor,spanishRouteFor,canonicalRoute,legacyRouteFor} from './site-routes.mjs';

export const CANONICAL_ORIGIN='https://p2lrn.org';

// Search-intent copy is applied only to compiled pages; the authored guides remain unchanged.
export const SEO_PAGE_METADATA=Object.freeze({
  "/docs/": {
    "title": "Documentación P2LRN para profesores y desarrolladores",
    "description": "Guías independientes para profesores que crean cursos en Studio y desarrolladores que integran Player, Toolkit, Host y LTI."
  },
  "/en/docs/": {
    "title": "P2LRN documentation for teachers and developers",
    "description": "Separate authoring guides for teachers using Studio and technical documentation for developers integrating Player, Host, Toolkit and LTI."
  },
  "/docs/desarrolladores/": {
    "title": "P2LRN para desarrolladores: Player, Host, CDN, NPM y LTI",
    "description": "Documentación técnica para integrar P2LRN: guía HTML, API de Player y Toolkit, seguridad del Host, Analytics y LTI."
  },
  "/en/docs/developers/": {
    "title": "P2LRN developer docs: Player, Host, npm, CDN and LTI",
    "description": "Technical developer guides for P2LRN: HTML, Player and Toolkit APIs, secure Host services, Analytics and LTI."
  },
  "/docs/desarrolladores/primeros-pasos/": {
    "title": "Integrar P2LRN Player en HTML con CDN paso a paso",
    "description": "Ejemplo para desarrolladores: descarga un curso, incrusta Player en HTML, abre la página mediante HTTP y comprueba su reproducción."
  },
  "/en/docs/developers/quickstart/": {
    "title": "Embed P2LRN Player in HTML using CDN: developer guide",
    "description": "Developer quickstart: download a course, embed Player in HTML, serve the page over HTTP and verify playback."
  },
  "/docs/studio/": {
    "title": "Cómo usar P2LRN Studio: guía visual paso a paso",
    "description": "Guía visual de P2LRN Studio con capturas reales ampliables y pasos para crear un curso, editar lecciones, añadir actividades, probar y exportar .p2lrn."
  },
  "/en/docs/studio/": {
    "title": "How to use P2LRN Studio: step-by-step visual guide",
    "description": "Learn P2LRN Studio with enlarged real screenshots and practical steps for lessons, assessments, learner preview, saving and .p2lrn course export."
  },
  "/docs/paquetes/": {
    "title": "Cómo crear y exportar paquetes .p2lrn | P2LRN",
    "description": "Aprende a crear y exportar paquetes .p2lrn: organiza lecciones, actividades y recursos, comprueba su integridad y ábrelos con P2LRN Player."
  },
  "/en/docs/packages/": {
    "title": "How to create and export .p2lrn packages | P2LRN",
    "description": "Learn to build and export .p2lrn packages: organize lessons, activities and resources, check their integrity and open them with P2LRN Player."
  },
  "/docs/que-usar/": {
    "title": "Studio, Player, Toolkit y Analytics: qué usar | P2LRN",
    "description": "Compara Studio, Player, Toolkit y Analytics de P2LRN: descubre qué hace cada herramienta y cómo combinarlas para crear y reproducir cursos."
  },
  "/en/docs/choose-tools/": {
    "title": "Studio, Player, Toolkit and Analytics: choose tools",
    "description": "Compare P2LRN Studio, Player, Toolkit and Analytics: learn what each tool does and how to combine them to create and deliver courses."
  },
  "/docs/conceptos/": {
    "title": "Conceptos básicos de P2LRN: cursos y paquetes",
    "description": "Entiende cómo funcionan los cursos P2LRN: paquete .p2lrn, manifiesto, lecciones, recursos, Player y conexión con tu plataforma educativa."
  },
  "/en/docs/concepts/": {
    "title": "P2LRN basics: interactive courses and packages",
    "description": "Understand P2LRN courses: the .p2lrn package, manifest, lessons, resources, Player and integration with your learning platform."
  },
  "/docs/juegos-3d/": {
    "title": "Juegos 3D educativos: crear y practicar | P2LRN",
    "description": "Configura juegos educativos 3D de ordenar, relacionar, clasificar y ensamblar. Sigue capturas reales del editor y conoce la experiencia del alumno."
  },
  "/en/docs/3d-games/": {
    "title": "3D learning games: create and practise | P2LRN",
    "description": "Set up 3D ordering, matching, classification and assembly activities. Follow real editor screenshots and see how learners use the games."
  },
  "/docs/formato/": {
    "title": "Formato .p2lrn: estructura de un curso | P2LRN",
    "description": "Conoce qué contiene un archivo .p2lrn: manifiesto, lecciones, actividades, recursos y comprobaciones de integridad para cursos portables."
  },
  "/en/docs/file-format/": {
    "title": "The .p2lrn file format: course structure | P2LRN",
    "description": "Learn what a .p2lrn file contains: a manifest, lessons, activities, resources and integrity checks for portable learning courses."
  },
  "/docs/referencia/": {
    "title": "Referencia de P2LRN: API, Player e integración",
    "description": "Consulta la referencia técnica de P2LRN: API de creación, Player, integración con LMS, eventos, seguimiento del alumno y herramientas de desarrollo."
  },
  "/en/docs/reference/": {
    "title": "P2LRN reference: Player API and integration",
    "description": "Explore P2LRN technical references: authoring API, Player, LMS integration, events, learner progress and developer tools."
  },
  "/docs/recetas/": {
    "title": "Ejemplos para crear e integrar cursos | P2LRN",
    "description": "Sigue ejemplos prácticos para crear, validar, reproducir e integrar cursos interactivos con P2LRN Studio, Player y Toolkit."
  },
  "/en/docs/recipes/": {
    "title": "How to build and integrate courses | P2LRN",
    "description": "Follow practical examples to create, validate, play and integrate interactive courses with P2LRN Studio, Player and Toolkit."
  },
  "/docs/empezar/": {
    "title": "Cómo crear tu primer curso con Studio | P2LRN",
    "description": "Primeros pasos para profesores: crea una lección, añade una actividad en Studio y comprueba el curso desde la vista del alumno."
  },
  "/en/docs/getting-started/": {
    "title": "How to create your first course in Studio | P2LRN",
    "description": "Teacher guide for creating lessons, adding activities and checking the learner view in P2LRN Studio."
  },
  "/docs/instalar/": {
    "title": "Instalar P2LRN Player y Studio: CDN y npm",
    "description": "Guía para desarrolladores: instala P2LRN Player, Studio y Toolkit en una web o LMS mediante CDN o NPM, con versiones y requisitos."
  },
  "/en/docs/installation/": {
    "title": "Install P2LRN Player and Studio: CDN and npm",
    "description": "Developer guide to installing P2LRN Player, Studio and Toolkit in websites and LMSs using CDN or npm, with version requirements."
  },
  "/docs/player/": {
    "title": "P2LRN Player: reproducir cursos en web y LMS",
    "description": "Integra P2LRN Player en tu web o LMS y reproduce cursos .p2lrn: consulta su API, eventos, seguimiento del alumno y requisitos de ejecución."
  },
  "/en/docs/player/": {
    "title": "P2LRN Player: run courses on web and LMS",
    "description": "Integrate P2LRN Player with your website or LMS and play .p2lrn courses: explore its API, events, learner tracking and runtime requirements."
  },
  "/docs/toolkit/": {
    "title": "P2LRN Toolkit: crear y validar paquetes",
    "description": "Aprende a crear, inspeccionar, validar y transformar paquetes .p2lrn con P2LRN Toolkit para Node.js y TypeScript, con comandos y ejemplos."
  },
  "/en/docs/toolkit/": {
    "title": "P2LRN Toolkit: build and validate course packages",
    "description": "Learn to create, inspect, validate and transform .p2lrn packages with P2LRN Toolkit for Node.js and TypeScript, with practical examples."
  }
});

async function walk(dir){
  const found=[];
  for(const e of await readdir(dir,{withFileTypes:true})){
    const p=join(dir,e.name);
    if(e.isDirectory())found.push(...await walk(p));
    else if(e.isFile())found.push(p);
  }
  return found;
}
export function routeOf(root,p){
  const rel=relative(root,p).replaceAll('\\','/');
  if(rel==='index.html')return '/';
  if(!rel.endsWith('/index.html'))throw Error('Not a public route: '+rel);
  return '/'+rel.slice(0,-'index.html'.length);
}
const attr=(tag,key)=>new RegExp('\\b'+key+'\\s*=\\s*(["\\\'])([\\s\\S]*?)\\1','i').exec(tag)?.[2]??null;
const tagList=(html,tag)=>[...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>','gi'))].map(x=>x[0]);
const metaTag=(html,key,value)=>tagList(html,'meta').find(x=>(attr(x,key)||'').toLowerCase()===value.toLowerCase())||null;
const canonTags=(html)=>tagList(html,'link').filter(x=>(attr(x,'rel')||'').toLowerCase().split(/\s+/).includes('canonical'));
const alternateTags=(html)=>tagList(html,'link').filter(x=>(attr(x,'rel')||'').toLowerCase().split(/\s+/).includes('alternate')&&attr(x,'hreflang'));
const escape=(s)=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const decode=(s)=>String(s||'').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
const insertHead=(html,fragment)=>html.replace(/<\/head>/i,fragment+'\n</head>');
const languageOfRoute=(route)=>route==='/en/'||route.startsWith('/en/')?'en':'es';
const stripEnglishPrefix=(route)=>spanishRouteFor(route);
const englishRoute=(route)=>englishRouteFor(route);

export function isIndexable(html){
  const robots=attr(metaTag(html,'name','robots')||'','content')||'';
  return !/(?:^|,)\s*noindex\b/i.test(robots)&&!tagList(html,'meta').some(x=>(attr(x,'http-equiv')||'').toLowerCase()==='refresh');
}

function setMeta(html,kind,name,value){
  const found=tagList(html,'meta').filter(x=>(attr(x,kind)||'').toLowerCase()===name.toLowerCase());
  const tag='<meta '+kind+'="'+name+'" content="'+escape(value)+'">';
  if(!found.length)return insertHead(html,tag);
  html=html.replace(found[0],tag);
  for(const duplicate of found.slice(1))html=html.replace(duplicate,'');
  return html;
}
function jsonLdPayloads(html){
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(x=>{try{return JSON.parse(x[1]);}catch{throw Error('Invalid JSON-LD');}});
}
const hasJsonLdType=(html,type)=>jsonLdPayloads(html).some(item=>{
  const types=Array.isArray(item['@type'])?item['@type']:[item['@type']];
  return types.includes(type)||item['@graph']?.some?.(node=>node['@type']===type);
});
const addJsonLd=(html,payload)=>insertHead(html,
  '<script type="application/ld+json">'+JSON.stringify(payload).replaceAll('<','\\u003c')+'</script>');

export function updateHtml(html,route,origin=CANONICAL_ORIGIN){
  if(!/^https:\/\/[a-z\d.-]+$/i.test(origin))throw Error('Invalid public origin');
  if(!/<html\b/i.test(html)||!/<\/head>/i.test(html))throw Error('Invalid HTML: '+route);
  const language=languageOfRoute(route);
  const english=language==='en';
  // Preserve guide content while replacing only search snippets in the deploy output.
  let result=html;
  const seoCopy=SEO_PAGE_METADATA[route]||SEO_PAGE_METADATA[legacyRouteFor(route)];
  if(seoCopy){
    result=result.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i,'<title>'+escape(seoCopy.title)+'</title>');
    const descriptionTag=metaTag(result,'name','description');
    if(!descriptionTag)throw Error('Missing meta description: '+route);
    const updatedDescription=descriptionTag.replace(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i,
      'content="'+escape(seoCopy.description)+'"');
    if(updatedDescription===descriptionTag)throw Error('Unable to set meta description: '+route);
    result=result.replace(descriptionTag,updatedDescription);
  }
  const title=decode((result.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]*>/g,'').trim());
  const description=decode(attr(metaTag(result,'name','description')||'','content')||'').trim();
  if(!title||!description)throw Error('Missing original title or description: '+route);
  const url=origin+route;

  // Legal policies remain accessible to people, but not standalone search results.
  const legalUnindexed=['/privacidad/','/terminos/','/cookies/','/aviso-legal/'];
  const contentRoute=english?spanishRouteFor(route):route;
  if(legalUnindexed.includes(contentRoute))result=setMeta(result,'name','robots','noindex,follow');

  // Legacy redirect aliases intentionally canonicalize to a different URL.
  // Preserve their existing noindex + refresh and don't generate alternates.
  const redirectAlias=tagList(result,'meta').some(t=>(attr(t,'http-equiv')||'').toLowerCase()==='refresh');
  if(!redirectAlias){
  // Correct a historical canonical only when it belongs to an explicit
  // permanent English slug migration. Never conceal unrelated mismatches.
  const previousUrl=origin+legacyRouteFor(route);
  if(previousUrl!==url)result=result.replaceAll(previousUrl,url);
  const canonical=canonTags(result);
  if(canonical.length>1||(canonical.length===1&&decode(attr(canonical[0],'href'))!==url))
    throw Error('Conflicting canonical: '+route);
  if(!canonical.length)result=insertHead(result,'<link rel="canonical" href="'+escape(url)+'">');

  // Always regenerate ES, EN and x-default as reciprocal canonical pairs.
  for(const item of alternateTags(result))result=result.replace(item,'');
  const esRoute=english?spanishRouteFor(route):route;
  const enRoute=english?route:englishRouteFor(route);
  result=insertHead(result,[
    '<link rel="alternate" hreflang="es" href="'+escape(origin+esRoute)+'">',
    '<link rel="alternate" hreflang="en" href="'+escape(origin+enRoute)+'">',
    '<link rel="alternate" hreflang="x-default" href="'+escape(origin+esRoute)+'">',
  ].join('\n'));

  // Standard social preview uses an actual 1200x630 screenshot of Studio.
  const socialImage=origin+'/assets/social/p2lrn-studio-1200x630.png';
  for(const [kind,name,value] of [
    ['property','og:type',contentRoute.startsWith('/docs/')?'article':'website'],
    ['property','og:title',title],
    ['property','og:description',description],
    ['property','og:url',url],
    ['property','og:locale',english?'en_US':'es_ES'],
    ['property','og:locale:alternate',english?'es_ES':'en_US'],
    ['property','og:site_name','P2LRN'],
    ['property','og:image',socialImage],
    ['property','og:image:width','1200'],
    ['property','og:image:height','630'],
    ['property','og:image:alt',english?'P2LRN Studio course editor preview':'Vista del editor de cursos P2LRN Studio'],
    ['name','twitter:card','summary_large_image'],
    ['name','twitter:title',title],
    ['name','twitter:description',description],
    ['name','twitter:image',socialImage],
  ])result=setMeta(result,kind,name,value);

  if(isIndexable(result)){
    // Every indexable technical guide receives one localized TechArticle.
    if(contentRoute.startsWith('/docs/')){
      const article={
        '@context':'https://schema.org','@type':'TechArticle','@id':url+'#article',
        headline:title,description,url,inLanguage:language,mainEntityOfPage:url,
        isPartOf:{'@id':origin+'/#website'}
      };
      if(!hasJsonLdType(result,'TechArticle'))result=addJsonLd(result,article);
    }
    if(route==='/'||route==='/en/'){
      if(!hasJsonLdType(result,'WebSite'))
        result=addJsonLd(result,{'@context':'https://schema.org','@type':'WebSite',
          '@id':origin+'/#website',name:'P2LRN',url:origin+'/'});
      if(!hasJsonLdType(result,'Organization'))
        result=addJsonLd(result,{'@context':'https://schema.org','@type':'Organization',
          '@id':origin+'/#organization',name:'P2LRN',url:origin+'/',
          logo:origin+'/p2lrn-mark.png',sameAs:['https://github.com/josemarcosdzb/p2lrn']});
    }
    if(contentRoute==='/studio/'&&!hasJsonLdType(result,'WebApplication'))
      result=addJsonLd(result,{'@context':'https://schema.org','@type':'WebApplication',
        '@id':url+'#app',name:'P2LRN Studio',url,
        applicationCategory:'EducationalApplication',operatingSystem:'Web',
        inLanguage:language,
        description:english?'Visual editor for P2LRN interactive courses.':'Editor visual de cursos interactivos P2LRN.',
        publisher:{'@id':origin+'/#organization'}});
    if(route!=='/'&&route!=='/en/'&&!hasJsonLdType(result,'BreadcrumbList')){
      const heading=decode((result.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||title).replace(/<[^>]*>/g,'')).trim()||title;
      const home=english?'/en/':'/';
      const items=[{name:english?'Home':'Inicio',route:home}];
      if(contentRoute.startsWith('/docs/')&&contentRoute!=='/docs/')
        items.push({name:english?'Documentation':'Documentación',route:english?'/en/docs/':'/docs/'});
      items.push({name:heading,route});
      result=addJsonLd(result,{'@context':'https://schema.org','@type':'BreadcrumbList',
        '@id':url+'#breadcrumbs',
        itemListElement:items.map(({name,route},index)=>({
          '@type':'ListItem',position:index+1,name,item:origin+route
        }))});
    }
  }

  }

  const main=/<main\b[^>]*>/i.exec(result);
  if(!main)throw Error('Missing main landmark: '+route);
  let mainTag=main[0];
  let mainId=attr(mainTag,'id');
  if(!mainId){
    mainId=english?'content':'contenido';
    mainTag=mainTag.replace(/>$/,' id="'+mainId+'">');
  }
  if(attr(mainTag,'tabindex')===null)mainTag=mainTag.replace(/>$/,' tabindex="-1">');
  result=result.slice(0,main.index)+mainTag+result.slice(main.index+main[0].length);

  if(!/<a\b[^>]*class=["'][^"']*\bskip-link\b/i.test(result)){
    if(!/<body\b[^>]*>/i.test(result))throw Error('Missing body: '+route);
    const label=english?'Skip to content':'Saltar al contenido';
    result=result.replace(/<body\b[^>]*>/i,x=>x+'<a class="skip-link" href="#'+escape(mainId)+'">'+label+'</a>');
  }
  return result;
}

export async function normalizeSeoAndAccessibility(outputRoot,{sourceRoot=outputRoot,origin=CANONICAL_ORIGIN,strict=true}={}){
  const sourcePages=(await walk(sourceRoot)).filter(x=>basename(x)==='index.html');
  if(strict&&sourcePages.length<60)throw Error('Site page count dropped below the verified baseline: '+sourcePages.length);

  const bilingual=sourcePages.some(path=>relative(sourceRoot,path).replaceAll('\\','/').startsWith('en/'));
  const expectedAliases=bilingual?14:7; // 3 old aliases + 4 legal noindex per locale
  const routes=[];
  let changed=0,aliases=0;

  for(const src of sourcePages){
    const route=canonicalRoute(routeOf(sourceRoot,src));
    const target=route==='/'?join(outputRoot,'index.html'):join(outputRoot,route.slice(1),'index.html');
    const before=await readFile(target,'utf8');
    const after=updateHtml(before,route,origin);
    if(before!==after){await writeFile(target,after,'utf8');changed++;}
    if(isIndexable(after))routes.push(route);else aliases++;
  }
  if(strict&&(routes.length+aliases!==sourcePages.length||aliases!==expectedAliases))
    throw Error('Route classification changed unexpectedly: '+routes.length+'/'+aliases+' expected aliases '+expectedAliases);

  routes.sort((a,b)=>a==='/'?-1:b==='/'?1:a.localeCompare(b,'en'));
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
    routes.map(r=>'  <url><loc>'+escape(origin+r)+'</loc></url>').join('\n')+
    '\n</urlset>\n';
  await writeFile(join(outputRoot,'sitemap.xml'),xml,'utf8');
  return {total:sourcePages.length,indexable:routes.length,redirects:aliases,changed,sitemapUrls:routes.length,bilingual};
}
