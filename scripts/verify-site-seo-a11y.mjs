// Verify the real .netlify-cdn output, never the unbuilt HTML alone.
import {createHash} from 'node:crypto';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join,resolve,relative,basename,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CANONICAL_ORIGIN,routeOf,isIndexable} from '../deploy/netlify/site-seo-a11y.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const src=join(root,'deploy/netlify/site');
const out=join(root,'.netlify-cdn');
async function walk(p){let a=[];for(const e of await readdir(p,{withFileTypes:true})){const f=join(p,e.name);if(e.isDirectory())a.push(...await walk(f));else if(e.isFile())a.push(f)}return a}
const attr=(tag,key)=>new RegExp('\\b'+key+'\\s*=\\s*(["\\\'])([\\s\\S]*?)\\1','i').exec(tag)?.[2]??null;
const tags=(html,tag)=>[...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>','gi'))].map(x=>x[0]);
const named=(html,tag,key,val)=>tags(html,tag).filter(t=>(attr(t,key)||'').toLowerCase()===val.toLowerCase());
const errors=[];const indexable=[];const aliases=[];
const sourcePages=(await walk(src)).filter(p=>basename(p)==='index.html');
for(const file of sourcePages){
 const route=routeOf(src,file);
 const target=join(out,relative(src,file));
 const html=await readFile(target,'utf8').catch(()=>{errors.push(route+' missing compiled page');return ''});
 if(!html)continue;
 const pageIndexable=isIndexable(html);if(pageIndexable)indexable.push(route);else aliases.push(route);
 const head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]||'';
 const main=tags(html,'main')[0]||'';
 const id=attr(main,'id');
 const jumps=tags(html,'a').filter(t=>(attr(t,'class')||'').split(/\s+/).includes('skip-link'));
 const canonical=tags(head,'link').filter(t=>(attr(t,'rel')||'').toLowerCase()==='canonical');
 if(!/<html\b[^>]*lang=["']es["']/i.test(html))errors.push(route+' missing Spanish lang');
 if(!/<title\b[^>]*>[^<]+<\/title>/i.test(head))errors.push(route+' missing title');
 if(named(head,'meta','name','description').length!==1)errors.push(route+' missing description');
 if((html.match(/<h1\b/gi)||[]).length!==1)errors.push(route+' invalid h1 count');
 if(!id||attr(main,'tabindex')!=='-1'||jumps.length!==1||attr(jumps[0]||'','href')!=='#'+id)errors.push(route+' broken keyboard skip target');
 for(const tag of tags(html,'img'))if(attr(tag,'alt')===null)errors.push(route+' image without alt');
 if(pageIndexable){
  const url=CANONICAL_ORIGIN+route;
  if(canonical.length!==1||attr(canonical[0],'href')!==url)errors.push(route+' canonical missing, repeated or mismatched');
  for(const [key,value] of [['property','og:title'],['property','og:description'],['property','og:url'],['property','og:type'],['name','twitter:card']])if(named(head,'meta',key,value).length!==1)errors.push(route+' metadata '+value+' missing/repeated');
  if(attr(named(head,'meta','property','og:url')[0]||'','content')!==url)errors.push(route+' og:url mismatched');
 }else if(!/noindex/.test(attr(named(head,'meta','name','robots')[0]||'','content')||''))errors.push(route+' alias missing noindex');
 if(route.startsWith('/docs/')&&!aliases.includes(route)){
  const sidebar=tags(html,'aside').find(x=>(attr(x,'class')||'').includes('doc-sidebar'));
  if(!sidebar||!attr(sidebar,'aria-label'))errors.push(route+' sidebar not labelled');
 }
}
const sitemap=await readFile(join(out,'sitemap.xml'),'utf8').catch(()=>{errors.push('missing sitemap.xml');return ''});
const xmlUrls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]).sort();
const expected=indexable.map(x=>CANONICAL_ORIGIN+x).sort();
if(JSON.stringify(xmlUrls)!==JSON.stringify(expected))errors.push('sitemap does not match indexed routes');
if(sourcePages.length!==60||indexable.length!==57||aliases.length!==3)errors.push('unexpected source/indexable/alias counts: '+[sourcePages.length,indexable.length,aliases.length].join('/'));
// Public solution pages have unique search intent, real actions, and inbound links from the homepage.
const solutionRoutes=['/crear-cursos-interactivos/','/juegos-educativos-3d/','/cursos-offline/'];
const homeHtml=await readFile(join(out,'index.html'),'utf8');
for(const route of solutionRoutes){
  if(!indexable.includes(route))errors.push('Solution route is not indexable: '+route);
  if(!homeHtml.includes('href="'+route+'"'))errors.push('No discoverable home link to '+route);
  const html=await readFile(join(out,route.slice(1),'index.html'),'utf8').catch(()=>null);
  if(!html||!html.includes('class="landing-hero"')||!html.includes('class="landing-steps"')||!html.includes('class="landing-card-grid"'))
    errors.push('Missing actionable solution content: '+route);
}
const schemaScripts=[...homeHtml.matchAll(/<script\s+type="application\/ld\+json"\s*>([\s\S]*?)<\/script>/gi)];
const siteSchemas=schemaScripts.map(m=>{try{return JSON.parse(m[1])}catch{return null}}).filter(s=>s&&s['@type']==='WebSite');
if(siteSchemas.length!==1||siteSchemas[0].name!=='P2LRN'||siteSchemas[0].url!==CANONICAL_ORIGIN+'/')
  errors.push('Missing or inconsistent P2LRN WebSite identity structured data');
if(named(homeHtml,'meta','property','og:site_name').length!==1)errors.push('Missing site identity in home OpenGraph');
const [quick,creator]=await Promise.all(['quickstart.p2lrn','canonical/creator-course.p2lrn'].map(p=>readFile(join(out,'examples',p)).catch(()=>null)));
if(!quick||!creator||!quick.equals(creator))errors.push('compatibility quickstart package missing or not identical to verified creator-course');
const studio=await readFile(join(out,'studio/index.html'),'utf8');
if(!/<button\b[^>]*data-open-file/.test(studio)||!/<dialog\b[^>]*data-add-dialog[^>]*aria-labelledby=/.test(studio))errors.push('Studio accessibility controls missing');
const js=await readFile(join(out,'p2lrn.js'),'utf8');
if(!js.includes('docs-search-status')||!js.includes("resultsStatus.textContent"))errors.push('docs search result announcement missing');
// Ensure the production CSP authorizes exactly the immutable import map on Viewer and Studio.
async function verifyGeneratedImportMapCsp(){
 const raw=await readFile(join(out,'_headers'),'utf8');
 let section='';
 const policies=new Map();
 for(const line of raw.split(/\r?\n/)){
   if(line.startsWith('/'))section=line.trim();
   else if((section==='/demo/*'||section==='/studio/*')&&line.trim().startsWith('Content-Security-Policy:')){
     policies.set(section,line.slice(line.indexOf(':')+1).trim());
   }
 }
 for(const name of ['demo','studio']){
   const html=await readFile(join(out,name,'index.html'),'utf8');
   const payload=/<script type="importmap">([\s\S]*?)<\/script>/i.exec(html)?.[1];
   if(!payload){errors.push(name+' generated import map missing');continue}
   const expected='sha256-'+createHash('sha256').update(payload,'utf8').digest('base64');
   const policy=policies.get('/'+name+'/*');
   if(!policy){errors.push(name+' generated CSP missing');continue}
   const scriptSrc=policy.match(/(?:^|;)\s*script-src\s+([^;]+)/)?.[1]||'';
   const hashes=[...scriptSrc.matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)].map(m=>m[0]);
   if(hashes.length!==1||hashes[0]!=="'"+expected+"'")errors.push(name+' CSP hash must match its exact import map');
   if(scriptSrc.includes("'unsafe-inline'"))errors.push(name+' CSP must not allow arbitrary inline scripts');
 }
}
await verifyGeneratedImportMapCsp();
// Google Search Console ownership files are not regular pages and must not be transformed.
const googleVerificationFiles=(await readdir(src)).filter(name=>/^google[0-9a-f]+\.html$/i.test(name));
for(const name of googleVerificationFiles){
  const original=await readFile(join(src,name),'utf8');
  const published=await readFile(join(out,name),'utf8').catch(()=>null);
  if(original!==('google-site-verification: '+name)||published!==original)
    errors.push('Search Console verification token missing or modified: '+name);
}
const result={ok:errors.length===0,sourcePages:sourcePages.length,indexable:indexable.length,aliases:aliases.length,sitemapURLs:xmlUrls.length,quickstartVerified:Boolean(quick&&creator&&quick.equals(creator)),errors};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
