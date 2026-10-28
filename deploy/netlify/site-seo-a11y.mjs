// Build-time only. Source documentation HTML and its visible text are never rewritten.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,relative,basename} from 'node:path';
export const CANONICAL_ORIGIN='https://p2lrn.netlify.app';
async function walk(dir){const found=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())found.push(...await walk(p));else if(e.isFile())found.push(p)}return found}
export function routeOf(root,p){const rel=relative(root,p).replaceAll('\\','/');if(rel==='index.html')return '/';if(!rel.endsWith('/index.html'))throw Error('Not a public route: '+rel);return '/'+rel.slice(0,-'index.html'.length)}
const attr=(tag,key)=>new RegExp('\\b'+key+'\\s*=\\s*(["\\\'])([\\s\\S]*?)\\1','i').exec(tag)?.[2]??null;
const tagList=(html,tag)=>[...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>','gi'))].map(x=>x[0]);
const metaTag=(html,key,value)=>tagList(html,'meta').find(x=>(attr(x,key)||'').toLowerCase()===value.toLowerCase())||null;
const canonTags=(html)=>tagList(html,'link').filter(x=>(attr(x,'rel')||'').toLowerCase().split(/\s+/).includes('canonical'));
const escape=(s)=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const decode=(s)=>String(s||'').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
const insertHead=(html,fragment)=>html.replace(/<\/head>/i,fragment+'\n</head>');
export function isIndexable(html){const robots=attr(metaTag(html,'name','robots')||'','content')||'';return !/(?:^|,)\s*noindex\b/i.test(robots)&&!tagList(html,'meta').some(x=>(attr(x,'http-equiv')||'').toLowerCase()==='refresh')}
export function updateHtml(html,route,origin=CANONICAL_ORIGIN){
  if(!/^https:\/\/[a-z\d.-]+$/i.test(origin))throw Error('Invalid public origin');
  if(!/<html\b/i.test(html)||!/<\/head>/i.test(html))throw Error('Invalid HTML: '+route);
  const title=decode((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]*>/g,'').trim());
  const description=decode(attr(metaTag(html,'name','description')||'','content')||'').trim();
  if(!title||!description)throw Error('Missing original title or description: '+route);
  let result=html;const url=origin+route;
  if(isIndexable(result)){
    const canonical=canonTags(result);
    if(canonical.length>1||(canonical.length===1&&decode(attr(canonical[0],'href'))!==url))throw Error('Conflicting canonical: '+route);
    if(!canonical.length)result=insertHead(result,'<link rel="canonical" href="'+escape(url)+'">');
    for(const [type,name,value] of [
      ['property','og:type',route.startsWith('/docs/')?'article':'website'],
      ['property','og:title',title],['property','og:description',description],
      ['property','og:url',url],['property','og:locale','es_ES'],['property','og:site_name','P2LRN'],
      ['name','twitter:card','summary'],['name','twitter:title',title],['name','twitter:description',description]
    ]){
      const existing=tagList(result,'meta').filter(x=>(attr(x,type)||'').toLowerCase()===name.toLowerCase());
      if(existing.length>1)throw Error('Duplicate metadata '+name+' on '+route);
      if(!existing.length)result=insertHead(result,'<meta '+type+'="'+name+'" content="'+escape(value)+'">');
    }
  }
  const main=/<main\b[^>]*>/i.exec(result);if(!main)throw Error('Missing main landmark: '+route);
  let mainTag=main[0];let mainId=attr(mainTag,'id');
  if(!mainId){mainId='contenido';mainTag=mainTag.replace(/>$/,' id="contenido">')}
  if(attr(mainTag,'tabindex')===null)mainTag=mainTag.replace(/>$/,' tabindex="-1">');
  result=result.slice(0,main.index)+mainTag+result.slice(main.index+main[0].length);
  if(!/<a\b[^>]*class=["'][^"']*\bskip-link\b/i.test(result)){
    if(!/<body\b[^>]*>/i.test(result))throw Error('Missing body: '+route);
    result=result.replace(/<body\b[^>]*>/i,x=>x+'<a class="skip-link" href="#'+escape(mainId)+'">Saltar al contenido</a>');
  }
  return result;
}
export async function normalizeSeoAndAccessibility(outputRoot,{sourceRoot=outputRoot,origin=CANONICAL_ORIGIN,strict=true}={}){
  const sourcePages=(await walk(sourceRoot)).filter(x=>basename(x)==='index.html');
  if(strict&&sourcePages.length!==60)throw Error('Unexpected site page count '+sourcePages.length+'; review route policy first');
  const routes=[];let changed=0,aliases=0;
  for(const src of sourcePages){
    const route=routeOf(sourceRoot,src);
    const target=route==='/'?join(outputRoot,'index.html'):join(outputRoot,route.slice(1),'index.html');
    const before=await readFile(target,'utf8');const after=updateHtml(before,route,origin);
    if(before!==after){await writeFile(target,after,'utf8');changed++}
    if(isIndexable(after))routes.push(route);else aliases++;
  }
  if(strict&&(routes.length!==57||aliases!==3))throw Error('Route classification changed unexpectedly: '+routes.length+'/'+aliases);
  routes.sort((a,b)=>a==='/'?-1:b==='/'?1:a.localeCompare(b,'es'));
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+routes.map(r=>'  <url><loc>'+escape(origin+r)+'</loc></url>').join('\n')+'\n</urlset>\n';
  await writeFile(join(outputRoot,'sitemap.xml'),xml,'utf8');
  return {total:sourcePages.length,indexable:routes.length,redirects:aliases,changed,sitemapUrls:routes.length};
}
