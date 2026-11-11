// Build-time only. Source documentation HTML and its visible text are never rewritten.
import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
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
  "/docs/desarrolladores/actividades/": {
    "title": "Referencia técnica de cuestionarios y juegos | P2LRN",
    "description": "Documentación para desarrolladores: esquemas JSON, validación, puntuación y renderizadores de los juegos P2LRN."
  },
  "/en/docs/developers/activities/": {
    "title": "P2LRN game developer reference: JSON and renderers",
    "description": "Technical reference for P2LRN educational activities: JSON structures, renderer contracts, validation, scoring and browser integration checks."
  },
  "/docs/desarrolladores/juegos-3d/": {
    "title": "Motor de juegos 3D y arquitectura para desarrolladores",
    "description": "Guía técnica de los juegos 3D de P2LRN para desarrolladores: escenas, modelos, físicas, interacción accesible y pruebas de integración con Player."
  },
  "/en/docs/developers/3d-games/": {
    "title": "P2LRN 3D game engine and developer architecture",
    "description": "Technical guide to P2LRN 3D games: scene setup, models, physics, accessible controls, Player integration and validation requirements."
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
    // An already-correct description is valid: the SEO normalizer must be idempotent.
    if(attr(updatedDescription,'content')!==escape(seoCopy.description))
      throw Error('Unable to set meta description: '+route);
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


// Site-owned media discovered from actual visible page HTML. Never list unused
// assets, decorative icons, test clips or media from noindex/redirect pages.
const imageExtension=/\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const videoExtension=/\.(?:mp4|mov|og[gv]|webm)$/i;
function mediaLink(source,route,origin,extension){
  const text=decode(source).trim();
  if(!text||/^(?:data|blob|javascript):/i.test(text))return null;
  let url;
  try{url=new URL(text,origin+route);}catch{return null;}
  if(url.origin!==origin||!extension.test(url.pathname))return null;
  return url.href;
}
function discoverPageMedia(html,route,origin){
  const main=/<main\b[^>]*>[\s\S]*?<\/main>/i.exec(html)?.[0]||'';
  const images=new Set();
  for(const tag of tagList(main,'img')){
    const alt=decode(attr(tag,'alt')??'').trim();
    const src=mediaLink(attr(tag,'src')||'',route,origin,imageExtension);
    if(alt&&src)images.add(src);
  }
  const videos=[];
  for(const found of main.matchAll(/(<video\b[^>]*>)([\s\S]*?)<\/video>/gi)){
    const opening=found[1],body=found[2];
    const source=tagList(body,'source').map(tag=>
      mediaLink(attr(tag,'src')||'',route,origin,videoExtension)).find(Boolean);
    const poster=mediaLink(attr(opening,'poster')||'',route,origin,imageExtension);
    const title=decode(attr(opening,'data-video-title')||'').trim();
    const description=decode(attr(opening,'data-video-description')||'').trim();
    if(!source||!poster||title.length<12||description.length<70)
      throw Error('Video SEO metadata missing, inaccurate or external: '+route);
    const tracks=tagList(body,'track').filter(t=>(attr(t,'kind')||'').toLowerCase()==='captions');
    const locale=languageOfRoute(route);
    const caption=tracks.find(t=>(attr(t,'srclang')||'').toLowerCase()===locale);
    if(!caption)throw Error('No '+locale+' caption track for '+route);
    const captionUrl=mediaLink(attr(caption,'src')||'',route,origin,/\.vtt$/i);
    if(!captionUrl)throw Error('Invalid video caption path for '+route);
    images.add(poster);
    videos.push({title,description,poster,content:source,caption:captionUrl});
  }
  return {images:[...images],videos};
}
async function verifySiteMedia(outputRoot,mediaByRoute,origin){
  const assets=new Map();
  for(const [route,media] of mediaByRoute){
    for(const item of media.images)assets.set(item,'image');
    for(const video of media.videos){
      assets.set(video.content,'video');
      assets.set(video.caption,'captions');
      assets.set(video.poster,'poster');
    }
  }
  await Promise.all([...assets].map(async ([uri,kind])=>{
    const url=new URL(uri);
    if(url.origin!==origin)throw Error('Sitemap media host mismatch: '+uri);
    const path=decodeURIComponent(url.pathname);
    if(!path.startsWith('/')||path.split('/').includes('..'))
      throw Error('Unsafe sitemap asset path: '+uri);
    const target=join(outputRoot,path.slice(1));
    const info=await stat(target).catch(()=>null);
    if(!info?.isFile()||info.size<1)
      throw Error('Missing or empty '+kind+' for media sitemap: '+target);
    if(kind==='video'&&info.size<16000)
      throw Error('Video is too short or placeholder-like for media sitemap: '+target);
  }));
  return assets.size;
}

export async function normalizeSeoAndAccessibility(outputRoot,{sourceRoot=outputRoot,origin=CANONICAL_ORIGIN,strict=true}={}){
  const sourcePages=(await walk(sourceRoot)).filter(x=>basename(x)==='index.html');
  if(strict&&sourcePages.length<60)throw Error('Site page count dropped below the verified baseline: '+sourcePages.length);

  const bilingual=sourcePages.some(path=>relative(sourceRoot,path).replaceAll('\\','/').startsWith('en/'));
  const expectedAliases=bilingual?14:7; // 3 old aliases + 4 legal noindex per locale
  const routes=[];
  const mediaByRoute=new Map();
  let changed=0,aliases=0;

  for(const src of sourcePages){
    const route=canonicalRoute(routeOf(sourceRoot,src));
    const target=route==='/'?join(outputRoot,'index.html'):join(outputRoot,route.slice(1),'index.html');
    const before=await readFile(target,'utf8');
    let after=updateHtml(before,route,origin);
    if(isIndexable(after)){
      const media=discoverPageMedia(after,route,origin);
      mediaByRoute.set(route,media);
      if(media.videos.length&&!hasJsonLdType(after,'VideoObject')){
        for(let i=0;i<media.videos.length;i++){
          const video=media.videos[i];
          after=addJsonLd(after,{'@context':'https://schema.org','@type':'VideoObject',
            '@id':origin+route+'#video-'+(i+1),name:video.title,
            description:video.description,thumbnailUrl:video.poster,
            contentUrl:video.content,url:origin+route,inLanguage:languageOfRoute(route),
            isAccessibleForFree:true});
        }
      }
      routes.push(route);
    }else aliases++;
    if(before!==after){await writeFile(target,after,'utf8');changed++;}
  }
  if(strict&&(routes.length+aliases!==sourcePages.length||aliases!==expectedAliases))
    throw Error('Route classification changed unexpectedly: '+routes.length+'/'+aliases+' expected aliases '+expectedAliases);

  routes.sort((a,b)=>a==='/'?-1:b==='/'?1:a.localeCompare(b,'en'));
  const mediaAssets=await verifySiteMedia(outputRoot,mediaByRoute,origin);
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n'+
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '+
    'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" '+
    'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n'+
    routes.map(route=>{
      const media=mediaByRoute.get(route)??{images:[],videos:[]};
      const images=media.images.map(uri=>
        '    <image:image><image:loc>'+escape(uri)+'</image:loc></image:image>').join('\n');
      const videos=media.videos.map(v=>
        '    <video:video>\n'+
        '      <video:thumbnail_loc>'+escape(v.poster)+'</video:thumbnail_loc>\n'+
        '      <video:title>'+escape(v.title)+'</video:title>\n'+
        '      <video:description>'+escape(v.description)+'</video:description>\n'+
        '      <video:content_loc>'+escape(v.content)+'</video:content_loc>\n'+
        '    </video:video>').join('\n');
      return '  <url>\n    <loc>'+escape(origin+route)+'</loc>'+
        (images?'\n'+images:'')+(videos?'\n'+videos:'')+'\n  </url>';
    }).join('\n')+
    '\n</urlset>\n';
  await writeFile(join(outputRoot,'sitemap.xml'),xml,'utf8');
  return {total:sourcePages.length,indexable:routes.length,redirects:aliases,changed,
    sitemapUrls:routes.length,bilingual,imageEntries:[...mediaByRoute.values()].reduce((n,m)=>n+m.images.length,0),
    videoEntries:[...mediaByRoute.values()].reduce((n,m)=>n+m.videos.length,0),
    mediaAssets};
}
