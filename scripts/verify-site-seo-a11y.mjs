// Verify the real .netlify-cdn output, never the unbuilt HTML alone.
import {createHash} from 'node:crypto';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join,resolve,relative,basename,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CANONICAL_ORIGIN,SEO_PAGE_METADATA,routeOf,isIndexable} from '../deploy/netlify/site-seo-a11y.mjs';
import {canonicalRoute,englishRouteFor,spanishRouteFor,legacyRouteFor,LEGACY_ENGLISH_ROUTES} from '../deploy/netlify/site-routes.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const src=join(root,'deploy/netlify/site');
const out=join(root,'.netlify-cdn');
async function walk(p){let a=[];for(const e of await readdir(p,{withFileTypes:true})){const f=join(p,e.name);if(e.isDirectory())a.push(...await walk(f));else if(e.isFile())a.push(f)}return a}
const attr=(tag,key)=>new RegExp('\\b'+key+'\\s*=\\s*(["\\\'])([\\s\\S]*?)\\1','i').exec(tag)?.[2]??null;
const tags=(html,tag)=>[...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>','gi'))].map(x=>x[0]);
const named=(html,tag,key,val)=>tags(html,tag).filter(t=>(attr(t,key)||'').toLowerCase()===val.toLowerCase());
const errors=[];const indexable=[];const aliases=[];
// Fact-checked SEO guide must stay substantial, readable and symmetric in both languages.
for(const [rel,language,faqTitle] of [
 ['docs/formato-portable-cursos-interactivos/index.html','es','Preguntas frecuentes'],
 ['en/docs/portable-course-format/index.html','en','Frequently asked questions']
]){
 const html=await readFile(join(out,...rel.split('/')),'utf8').catch(()=>null);
 if(!html){errors.push(rel+' missing editorial article');continue}
 const article=html.match(/<article\b[^>]*class=["'][^"']*doc-content[^"']*["'][^>]*>([\s\S]*?)<\/article>/i)?.[1]||'';
 const readable=article.replace(/<[^>]+>/g,' ').replace(/&(?:amp|quot|lt|gt|nbsp);/g,' ').trim();
 const wordCount=readable.split(/\s+/).filter(Boolean).length;
 if(wordCount<1200||wordCount>1800)errors.push(rel+' article word count outside 1200-1800: '+wordCount);
 const meta=html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)/i)?.[1]||'';
 if(!meta||meta.length>155)errors.push(rel+' missing or overlong meta description');
 const h2=[...article.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
 const faqAt=article.indexOf('>'+faqTitle+'</h2>');
 const faqHeadings=faqAt<0?0:(article.slice(faqAt).match(/<h3\b/g)||[]).length;
 if(h2.length<7||faqHeadings!==5)errors.push(rel+' lacks well-structured sections or five FAQs');
 const links=[...article.matchAll(/<a\b[^>]*href=["']([^"']+)/gi)].map(m=>m[1]);
 if(links.length<5)errors.push(rel+' missing relevant internal links');
 if(!html.includes('<html lang="'+language+'"'))errors.push(rel+' wrong locale');
}

const sourcePages=(await walk(src)).filter(p=>basename(p)==='index.html');
for(const file of sourcePages){
 const route=canonicalRoute(routeOf(src,file));
 const target=route==='/'?join(out,'index.html'):join(out,...route.slice(1).split('/').filter(Boolean),'index.html');
 const html=await readFile(target,'utf8').catch(()=>{errors.push(route+' missing compiled page');return ''});
 if(!html)continue;
 const pageIndexable=isIndexable(html);if(pageIndexable)indexable.push(route);else aliases.push(route);
 const head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]||'';
 if(pageIndexable){
   const counterpart=localeRoute=>localeRoute.startsWith('/en/')?spanishRouteFor(localeRoute):englishRouteFor(localeRoute);
   const other=counterpart(route);
   const expectedPairs=[[route.startsWith('/en/')?'en':'es',route],
     [route.startsWith('/en/')?'es':'en',other]];
   for(const [language,expectedRoute] of expectedPairs){
     const actual=[...html.matchAll(/<link\b[^>]*rel=["']alternate["'][^>]*>/gi)]
       .filter(x=>x[0].includes('hreflang="'+language+'"'));
     if(actual.length!==1||!actual[0][0].includes('href="'+CANONICAL_ORIGIN+expectedRoute+'"'))
       errors.push(route+' missing reciprocal hreflang '+language+' to '+expectedRoute);
   }
   if(!html.includes('content="summary_large_image"'))errors.push(route+' Twitter large card missing');
   if(!html.includes(CANONICAL_ORIGIN+'/assets/social/p2lrn-studio-1200x630.png'))
     errors.push(route+' social Studio screenshot missing');
   if(route!=='/'&&route!=='/en/'&&!html.includes('"@type":"BreadcrumbList"'))
     errors.push(route+' BreadcrumbList missing');
 }
 if((html.match(/data-language-switch/g)||[]).length!==1)
   errors.push(route+' duplicate or missing language selector');
 // Parse the complete JSON-LD in the compiled HTML and verify each guide's schema.
 const structured=[];
 for(const script of head.matchAll(/<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi)){
   try{structured.push(JSON.parse(script[2]));}
   catch{errors.push(route+' contains invalid JSON-LD');}
 }
 if(pageIndexable&&(route.startsWith('/docs/')||route.startsWith('/en/docs/'))){
   const articles=structured.filter(s=>s&&s['@type']==='TechArticle');
   if(articles.length!==1)errors.push(route+' expected exactly one TechArticle');
   else if(articles[0].url!==CANONICAL_ORIGIN+route||articles[0].inLanguage!==(route.startsWith('/en/')?'en':'es'))
     errors.push(route+' TechArticle URL or language mismatched');
 }
 const customSeo=SEO_PAGE_METADATA[route]||SEO_PAGE_METADATA[legacyRouteFor(route)];
 if(pageIndexable&&customSeo){
   const pageTitle=(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').trim();
   const pageDescription=attr(named(head,'meta','name','description')[0]||'','content');
   if(pageTitle!==customSeo.title||pageDescription!==customSeo.description)
     errors.push(route+' SEO search-intent metadata does not match its locale');
   if(customSeo.description.length<95||customSeo.description.length>180)
     errors.push(route+' SEO description falls outside its quality bounds');
 }
 const main=tags(html,'main')[0]||'';
 const id=attr(main,'id');
 const jumps=tags(html,'a').filter(t=>(attr(t,'class')||'').split(/\s+/).includes('skip-link'));
 const canonical=tags(head,'link').filter(t=>(attr(t,'rel')||'').toLowerCase()==='canonical');
 const locale=route==='/en/'||route.startsWith('/en/')?'en':'es';
 const langPattern=new RegExp('<html\\b[^>]*lang=["\\\']'+locale+'["\\\']','i');
 if(!langPattern.test(html))errors.push(route+' missing '+locale+' lang');
 if(!/<title\b[^>]*>[^<]+<\/title>/i.test(head))errors.push(route+' missing title');
 if(named(head,'meta','name','description').length!==1)errors.push(route+' missing description');
 if((html.match(/<h1\b/gi)||[]).length!==1)errors.push(route+' invalid h1 count');
 if(!id||attr(main,'tabindex')!=='-1'||jumps.length!==1||attr(jumps[0]||'','href')!=='#'+id)errors.push(route+' broken keyboard skip target');
 for(const tag of tags(html,'img')){
   if(attr(tag,'alt')===null)errors.push(route+' image without alt');
   const width=Number(attr(tag,'width')),height=Number(attr(tag,'height'));
   if(!Number.isSafeInteger(width)||width<=0||!Number.isSafeInteger(height)||height<=0)
     errors.push(route+' image missing valid intrinsic width/height: '+String(attr(tag,'src')));
 }
 if(pageIndexable){
  const url=CANONICAL_ORIGIN+route;
  if(canonical.length!==1||attr(canonical[0],'href')!==url)errors.push(route+' canonical missing, repeated or mismatched');
  for(const [key,value] of [['property','og:title'],['property','og:description'],['property','og:url'],['property','og:type'],['name','twitter:card']])if(named(head,'meta',key,value).length!==1)errors.push(route+' metadata '+value+' missing/repeated');
  if(attr(named(head,'meta','property','og:url')[0]||'','content')!==url)errors.push(route+' og:url mismatched');
 }else if(!/noindex/.test(attr(named(head,'meta','name','robots')[0]||'','content')||''))errors.push(route+' alias missing noindex');
 if((route.startsWith('/docs/')||route.startsWith('/en/docs/'))&&!aliases.includes(route)){
  const sidebar=tags(html,'aside').find(x=>(attr(x,'class')||'').includes('doc-sidebar'));
  if(!sidebar||!attr(sidebar,'aria-label'))errors.push(route+' sidebar not labelled');
 }
}
// A real 1200x630 PNG generated from the Studio screenshot must ship.
const social=await readFile(join(out,'assets/social/p2lrn-studio-1200x630.png')).catch(()=>null);
if(!social||social.length<1000||social.subarray(1,4).toString()!=='PNG'||
   social.readUInt32BE(16)!==1200||social.readUInt32BE(20)!==630)
  errors.push('Social Studio image is not a valid 1200x630 PNG');
const redirects=await readFile(join(out,'_redirects'),'utf8').catch(()=>'');
for(const [from,to] of Object.entries(LEGACY_ENGLISH_ROUTES))
  if(!redirects.includes(from+' '+to+' 301!'))errors.push('Missing permanent English redirect '+from);
if(!redirects.includes('https://p2lrn.netlify.app/* https://p2lrn.org/:splat 301!'))
  errors.push('Netlify subdomain is not redirected to the canonical host');
const sitemap=await readFile(join(out,'sitemap.xml'),'utf8').catch(()=>{errors.push('missing sitemap.xml');return ''});
const xmlUrls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]).sort();
const expected=indexable.map(x=>CANONICAL_ORIGIN+x).sort();
if(JSON.stringify(xmlUrls)!==JSON.stringify(expected))errors.push('sitemap does not match indexed routes');

if(!sitemap.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')||
   !sitemap.includes('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"'))
  errors.push('Sitemap missing Google image/video namespaces');
const sitemapSections=new Map([...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/g)]
  .map(match=>[match[1],match[2]]));
const decodeXml=value=>String(value).replaceAll('&amp;','&').replaceAll('&quot;','"')
  .replaceAll('&lt;','<').replaceAll('&gt;','>');
const sitemapAssetCheck=new Set();
let mediaImageCount=0,mediaVideoCount=0;
for(const route of indexable){
  const url=CANONICAL_ORIGIN+route;
  const section=sitemapSections.get(url)||'';
  const pageFile=route==='/'?join(out,'index.html'):
    join(out,...route.slice(1).split('/').filter(Boolean),'index.html');
  const page=await readFile(pageFile,'utf8');
  const main=/<main\b[^>]*>[\s\S]*?<\/main>/i.exec(page)?.[0]||'';
  const images=[...section.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map(m=>decodeXml(m[1]));
  const videoBlocks=[...section.matchAll(/<video:video>([\s\S]*?)<\/video:video>/g)].map(m=>m[1]);
  const expectedImages=new Set();
  const indexImage=raw=>{
    const candidate=String(raw||'').trim().replaceAll('&amp;','&');
    if(!candidate)return;
    let uri;
    try{uri=new URL(candidate,url);}catch{return;}
    if(uri.origin===CANONICAL_ORIGIN&&/\.(?:webp|avif|png|jpe?g|gif|svg)$/i.test(uri.pathname))
      expectedImages.add(uri.href);
  };
  const indexSrcset=srcset=>{
    for(const item of String(srcset||'').split(','))indexImage(item.trim().split(/\s+/)[0]);
  };
  for(const tag of tags(main,'img')){
    if(!(attr(tag,'alt')||'').trim())continue;
    indexImage(attr(tag,'src'));
    indexSrcset(attr(tag,'srcset'));
  }
  for(const picture of main.matchAll(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi)){
    const fallback=tags(picture[0],'img')[0]||'';
    if(!(attr(fallback,'alt')||'').trim())continue;
    for(const tag of tags(picture[0],'source'))indexSrcset(attr(tag,'srcset'));
  }
  const videoTags=[...main.matchAll(/(<video\b[^>]*>)([\s\S]*?)<\/video>/gi)];
  for(const [,tag] of videoTags){
    const poster=attr(tag,'poster');
    if(poster)expectedImages.add(new URL(poster,url).href);
  }
  if(images.length!==new Set(images).size)errors.push(route+' sitemap contains repeated image entries');
  if(JSON.stringify([...expectedImages].sort())!==JSON.stringify([...images].sort()))
    errors.push(route+' sitemap images differ from discoverable content and video posters');
  if(videoBlocks.length!==videoTags.length)
    errors.push(route+' sitemap has '+videoBlocks.length+' videos but HTML has '+videoTags.length);
  if(videoTags.length && !page.includes('"@type":"VideoObject"'))
    errors.push(route+' video without VideoObject structured data');
  for(const mediaUrl of images){
    if(!mediaUrl.startsWith(CANONICAL_ORIGIN+'/'))errors.push(route+' external or unsafe image URL');
    sitemapAssetCheck.add(mediaUrl);
  }
  mediaImageCount+=images.length;
  for(const block of videoBlocks){
    const value=name=>decodeXml(new RegExp('<video:'+name+'>([^<]+)<\\/video:'+name+'>').exec(block)?.[1]||'');
    const title=value('title'),description=value('description'),
      poster=value('thumbnail_loc'),content=value('content_loc');
    if(title.length<12||description.length<70||!poster||!content)
      errors.push(route+' invalid video sitemap description, title, thumbnail or media file');
    if(!/\.(?:webm|mp4|mov|og[gv])$/i.test(new URL(content).pathname))
      errors.push(route+' unsupported video file in sitemap');
    if(!images.includes(poster))errors.push(route+' video poster not in image sitemap');
    sitemapAssetCheck.add(content);
    sitemapAssetCheck.add(poster);
    mediaVideoCount++;
  }
}
for(const uri of sitemapAssetCheck){
  if(!uri.startsWith(CANONICAL_ORIGIN+'/'))continue;
  const path=decodeURIComponent(new URL(uri).pathname).replace(/^\/+/,'');
  const file=join(out,path);
  const media=await stat(file).catch(()=>null);
  if(!media?.isFile()||media.size<1)errors.push('Sitemap asset unavailable: '+uri);
}
if(mediaImageCount<80)errors.push('Image sitemap unexpectedly small: '+mediaImageCount);
if(mediaVideoCount<6)errors.push('Video sitemap lost a verified ES/EN demonstration: '+mediaVideoCount);

const englishSourcePages=sourcePages.filter(p=>relative(src,p).replaceAll('\\','/').startsWith('en/'));
const spanishSourcePages=sourcePages.filter(p=>!relative(src,p).replaceAll('\\','/').startsWith('en/'));
const englishAliases=aliases.filter(route=>route==='/en/'||route.startsWith('/en/'));
const spanishAliases=aliases.filter(route=>!(route==='/en/'||route.startsWith('/en/')));
if(spanishSourcePages.length<60||englishSourcePages.length<60||
   spanishSourcePages.length!==englishSourcePages.length||
   indexable.length+aliases.length!==sourcePages.length||
   spanishAliases.length!==englishAliases.length||aliases.length!==14)
  errors.push('unexpected bilingual source/indexable/alias counts: '+[
    sourcePages.length,indexable.length,aliases.length,
    spanishSourcePages.length,englishSourcePages.length,
    spanishAliases.length,englishAliases.length
  ].join('/'));
// Public solution pages have unique search intent, real actions, and inbound links from each locale homepage.
const solutionSlugs=['crear-cursos-interactivos','juegos-educativos-3d','cursos-offline'];
const homeHtml=await readFile(join(out,'index.html'),'utf8');
const englishHomeHtml=await readFile(join(out,'en','index.html'),'utf8');
for(const [language,home] of [['es',homeHtml],['en',englishHomeHtml]]){
  for(const slug of solutionSlugs){
    const route=language==='en'?englishRouteFor('/'+slug+'/'):'/'+slug+'/';
    if(!indexable.includes(route))errors.push('Solution route is not indexable: '+route);
    if(!home.includes('href="'+route+'"'))errors.push('No discoverable home link to '+route);
    const html=await readFile(join(out,...route.slice(1).split('/').filter(Boolean),'index.html'),'utf8').catch(()=>null);
    if(!html||!html.includes('class="landing-hero"')||!html.includes('class="landing-steps"')||!html.includes('class="landing-card-grid"'))
      errors.push('Missing actionable solution content: '+route);
  }
}
for(const [route,home,docsHref] of [
  ['/docs/analytics/',homeHtml,'/docs/analytics/'],
  ['/analytics/',homeHtml,'/docs/analytics/'],
  ['/en/docs/analytics/',englishHomeHtml,'/en/docs/analytics/'],
  ['/en/analytics/',englishHomeHtml,'/en/docs/analytics/'],
]){
  if(!indexable.includes(route))errors.push('Analytics route is not indexable: '+route);
  if(!home.includes('href="'+docsHref+'"'))errors.push('Homepage must link to Analytics documentation: '+docsHref);
}
const analyticsDocs=await readFile(join(out,'docs/analytics/index.html'),'utf8');
const englishAnalyticsDocs=await readFile(join(out,'en/docs/analytics/index.html'),'utf8');
for(const term of ['analítica educativa','learning analytics','seguimiento de alumnos','progreso de cursos','calificaciones'])
  if(!analyticsDocs.toLowerCase().includes(term.toLowerCase()))errors.push('Spanish Analytics SEO topic missing: '+term);
for(const term of ['educational analytics','learning analytics','learner tracking','course progress','grades'])
  if(!englishAnalyticsDocs.toLowerCase().includes(term.toLowerCase()))errors.push('English Analytics SEO topic missing: '+term);
const analyticsDemo=await readFile(join(out,'analytics/index.html'),'utf8');
const englishAnalyticsDemo=await readFile(join(out,'en/analytics/index.html'),'utf8');
if(!analyticsDemo.includes('"@type":"WebApplication"')||!englishAnalyticsDemo.includes('"@type":"WebApplication"'))
  errors.push('Analytics WebApplication structured data missing in one locale');
if(!analyticsDocs.includes('"@type":"TechArticle"')||!englishAnalyticsDocs.includes('"@type":"TechArticle"'))
  errors.push('Analytics TechArticle structured data missing in one locale');
for(const [home,expectedUrl,label] of [
  [homeHtml,CANONICAL_ORIGIN+'/','Spanish'],
  [englishHomeHtml,CANONICAL_ORIGIN+'/en/','English'],
]){
  const schemaScripts=[...home.matchAll(/<script\s+type="application\/ld\+json"\s*>([\s\S]*?)<\/script>/gi)];
  const siteSchemas=schemaScripts.map(m=>{try{return JSON.parse(m[1])}catch{return null}}).filter(s=>s&&s['@type']==='WebSite');
  if(siteSchemas.length!==1||siteSchemas[0].name!=='P2LRN'||siteSchemas[0].alternateName!=='p2lrn.org'||siteSchemas[0].url!==expectedUrl)
    errors.push('Missing or inconsistent '+label+' P2LRN WebSite identity structured data');
  if(named(home,'meta','property','og:site_name').length!==1)errors.push('Missing '+label+' site identity in home OpenGraph');
}
const [quick,creator,scorm]=await Promise.all(['quickstart.p2lrn','canonical/creator-course.p2lrn','generated/scorm12-browser-demo.p2lrn'].map(p=>readFile(join(out,'examples',p)).catch(()=>null)));
if(quick||creator)errors.push('Retired native quickstart or creator course is still published');
if(!scorm)errors.push('Imported SCORM example missing from generated site');
for(const [path,label] of [['studio/index.html','Spanish'],['en/studio/index.html','English']]){
  const studio=await readFile(join(out,...path.split('/')),'utf8');
  if(!/<button\b[^>]*data-open-file/.test(studio)||!/<dialog\b[^>]*data-add-dialog[^>]*aria-labelledby=/.test(studio))
    errors.push(label+' Studio accessibility controls missing');
}
for(const [path,label] of [['p2lrn.js','Spanish'],['en/p2lrn.js','English']]){
  const js=await readFile(join(out,...path.split('/')),'utf8');
  if(!js.includes('docs-search-status')||!js.includes("resultsStatus.textContent"))
    errors.push(label+' docs search result announcement missing');
}
// Ensure the production CSP authorizes exactly the immutable import map on Viewer and Studio.
async function verifyGeneratedImportMapCsp(){
 const raw=await readFile(join(out,'_headers'),'utf8');
 const runtimeManifest=JSON.parse(await readFile(join(out,'runtime-bootstrap-csp.json'),'utf8'));
 const approvedBootstraps=Object.values(runtimeManifest.hashes??{}).map(hash=>"'"+hash+"'");
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
   const approved=new Set(["'"+expected+"'",...approvedBootstraps]);
   if(hashes.length!==approved.size||hashes.some(hash=>!approved.has(hash)))
     errors.push(name+' CSP must authorize exactly the import map and approved sandbox bootstrap hashes');
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
// Public Skills pages must remain indexable, crawlable and connected to documentation in both locales.
for(const route of ['/skills/','/docs/skills/','/en/skills/','/en/docs/skills/']){
  if(!indexable.includes(route))errors.push('Skills page must be indexable: '+route);
  if(!xmlUrls.includes(CANONICAL_ORIGIN+route))errors.push('Skills URL missing from sitemap: '+route);
}
if(!homeHtml.includes('href="/skills/"'))errors.push('Spanish Skills landing page missing from home navigation');
if(!englishHomeHtml.includes('href="/en/skills/"'))errors.push('English Skills landing page missing from home navigation');
for(const [route,landingHref,guideHref] of [
  ['docs/index.html','/skills/','/docs/skills/'],
  ['docs/conectores/ia/index.html','/skills/','/docs/skills/'],
  ['docs/conectores/index.html','/skills/','/docs/skills/'],
  ['en/docs/index.html','/en/skills/','/en/docs/skills/'],
  ['en/docs/connectors/ai/index.html','/en/skills/','/en/docs/skills/'],
  ['en/docs/connectors/index.html','/en/skills/','/en/docs/skills/'],
]){
  const html=await readFile(join(out,...route.split('/')),'utf8').catch(()=>null);
  if(!html||!html.includes('href="'+landingHref+'"')||!html.includes('href="'+guideHref+'"'))
    errors.push('Skills integration link absent from '+route);
}
const landing=await readFile(join(out,'skills/index.html'),'utf8').catch(()=>null);
const guide=await readFile(join(out,'docs/skills/index.html'),'utf8').catch(()=>null);
const englishLanding=await readFile(join(out,'en/skills/index.html'),'utf8').catch(()=>null);
const englishGuide=await readFile(join(out,'en/docs/skills/index.html'),'utf8').catch(()=>null);
if(!landing||!guide||!englishLanding||!englishGuide)errors.push('Skills landing or installation guide missing in one locale');
const skillManifest=JSON.parse(await readFile(join(out,'downloads/skills/manifest.json'),'utf8').catch(()=>'{"packages":[]}'));
const expectedPlatforms=new Map([
 ['chatgpt','skills/p2lrn-creator/'],
 ['codex','.agents/skills/p2lrn-creator/'],
 ['claude','p2lrn-creator/'],
 ['gemini',''],
 ['grok','.grok/skills/p2lrn-creator/']
]);
if(skillManifest.packages.length!==expectedPlatforms.size)errors.push('Skill download manifest must contain all five declared platforms');
function zipEntries(bytes){
  const paths=[];let pos=0;
  while(pos+30<=bytes.length&&bytes.readUInt32LE(pos)===0x04034b50){
    const nameLen=bytes.readUInt16LE(pos+26),extraLen=bytes.readUInt16LE(pos+28);
    const size=bytes.readUInt32LE(pos+18),start=pos+30;
    paths.push(bytes.subarray(start,start+nameLen).toString('utf8'));
    pos=start+nameLen+extraLen+size;
  }
  return paths;
}
for(const [platform,prefix] of expectedPlatforms){
  const item=skillManifest.packages.find(x=>x.platform===platform);
  if(!item){errors.push('Missing '+platform+' Skill package');continue}
  if(!/^p2lrn-[a-z-]+\.zip$/.test(item.filename)||item.url!=='/downloads/skills/'+item.filename)
    errors.push('Unsafe filename or URL for '+platform);
  const bytes=await readFile(join(out,'downloads/skills',item.filename)).catch(()=>null);
  if(!bytes||bytes.length<10000||bytes.length>25*1024*1024){errors.push(platform+' Skill ZIP not published correctly');continue}
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(item.sha256!==digest||item.bytes!==bytes.length)errors.push('Skill ZIP integrity mismatch for '+platform);
  const members=zipEntries(bytes);
  if(!members.includes(prefix+'SKILL.md')||!members.includes(prefix+'scripts/p2lrn_official.mjs')||
     !members.includes(prefix+'references/official-packages.json')||
     !members.includes(prefix+'references/official-runtime.md')||!members.includes(prefix+'scripts/p2lrn_package.py')||
     !members.includes(prefix+'scripts/test_p2lrn_package.py')||members.some(n=>/__pycache__|\.pyc$/i.test(n)))
    errors.push('Skill archive missing entrypoint, package writer, tests or includes bytecode: '+platform);
  if(!landing?.includes('href="'+item.url+'"')||!guide?.includes('href="'+item.url+'"')||
     !englishLanding?.includes('href="'+item.url+'"')||!englishGuide?.includes('href="'+item.url+'"'))
    errors.push('Skill ZIP not linked from both locale landing and guide pages: '+platform);
}
if(!landing?.includes('"@type":"CollectionPage"')||!englishLanding?.includes('"@type":"CollectionPage"'))
  errors.push('Skills collection structured data missing in one locale');

if(landing&&englishLanding){
  for(const [html,lang,heading] of [
    [landing,'es','Skills para crear cursos con IA'],
    [englishLanding,'en','AI Skills to create courses'],
  ]){
    const title=html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]||'';
    const h1=html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]||'';
    const description=html.match(/<meta name="description" content="([^"]+)"/i)?.[1]||'';
    const faq=html.slice(html.indexOf('aria-labelledby="questions-title"'));
    if(!title.toLowerCase().includes(lang==='es'?'skills para crear cursos':'ai skills to create courses')||
       !h1.includes(heading)||description.length<110||description.length>180)
      errors.push(lang+' compiled Skills landing has insufficient SEO metadata');
    if(!html.includes('skill-capabilities-title')||
       !html.includes('src="/assets/hero/player.png"')||
       (faq.match(/<div><strong>/g)||[]).length<6)
      errors.push(lang+' compiled Skills landing has no useful static course creation content');
    if(html.includes('noindex'))errors.push(lang+' compiled Skills landing has unintended noindex');
    for(const name of ['chatgpt','codex','claude','gemini','grok'])
      if(!html.includes('p2lrn-'+name+'-'))errors.push(lang+' compiled Skills page missing '+name+' download');
  }
}



for(const [locale,home,expectedHeading] of [
  ['es',homeHtml,'Paquetes .p2lrn para web y LMS compatibles'],
  ['en',englishHomeHtml,'Portable .p2lrn packages for websites and LMSs'],
]){
  const description=/<meta\s+name="description"\s+content="([^"]+)"/i.exec(home)?.[1]||'';
  if(description.length<120||description.length>180||
     !/P2LRN|\.p2lrn/i.test(description)||!/Studio/i.test(description)||
     !/Player/i.test(description)||!/SCORM/i.test(description)||!/H5P/i.test(description))
    errors.push('Homepage SEO description does not explain the format and its tools: '+locale);
  if(!home.includes(expectedHeading))
    errors.push('Homepage does not explain portable course packages: '+locale);
}
for(const [route,locale] of [['studio/index.html','es'],['en/studio/index.html','en']]){
  const html=await readFile(join(out,...route.split('/')),'utf8').catch(()=>null);
  const scripts=html?[...html.matchAll(/<script\s+type="application\/ld\+json"\s*>([\s\S]*?)<\/script>/gi)]:[];
  const apps=scripts.map(match=>{try{return JSON.parse(match[1])}catch{return null}})
    .filter(schema=>schema?.['@type']==='WebApplication'&&schema.name==='P2LRN Studio');
  const expectedUrl=CANONICAL_ORIGIN+(locale==='en'?'/en/studio/':'/studio/');
  if(apps.length!==1||apps[0].url!==expectedUrl||apps[0].inLanguage!==locale||
     apps[0].applicationCategory!=='EducationalApplication'||apps[0].operatingSystem!=='Web'||
     'aggregateRating' in apps[0]||'review' in apps[0]||'offers' in apps[0])
    errors.push('Invalid or unsupported Studio software schema: '+route);
}
for(const [route,heading] of [
  ['docs/compatibilidad/index.html','¿Qué es un paquete .p2lrn y en qué se diferencia de SCORM y H5P?'],
  ['en/docs/compatibility/index.html','What is a .p2lrn package and how does it differ from SCORM and H5P?'],
]){
  const html=await readFile(join(out,...route.split('/')),'utf8').catch(()=>null);
  if(!html?.includes(heading)||!html.includes('id="formato-p2lrn-vs-scorm"'))
    errors.push('Missing substantive package compatibility explanation: '+route);
}


// Regression gates for the 19-format gallery: crawlable content and accessible
// colors must remain present even with JavaScript switched off.
const communityCss=await readFile(join(out,'docs','ejemplos','community-gallery.css'),'utf8');
const hexValue=name=>{
  const hit=new RegExp('--'+name+':(#[0-9a-fA-F]{6})').exec(communityCss);
  return hit?.[1]??null;
};
const luminance=hex=>{
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4));
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
const ratio=(a,b)=>{
  const la=luminance(a),lb=luminance(b);
  return (Math.max(la,lb)+.05)/(Math.min(la,lb)+.05);
};
for(const field of ['community-ink','community-muted','community-link']){
  const color=hexValue(field);
  if(!color||ratio(color,'#ffffff')<4.5)
    errors.push('Gallery '+field+' fails WCAG AA 4.5:1 foreground contrast on white');
}
for(const [file,locale] of [
  ['docs/ejemplos/index.html','es'],['en/docs/examples/index.html','en']
]){
  const html=await readFile(join(out,...file.split('/')),'utf8').catch(()=>null);
  if(!html){errors.push('Examples documentation route missing: '+file);continue;}
  const index=/<div class="community-static-index">([\s\S]*?)<\/div>/u.exec(html)?.[1]??'';
  if((index.match(/<li>/gu)||[]).length!==19 ||
     (index.match(/\/examples\/canonical\/external\/free\/[a-z0-9-]+\.p2lrn/gu)||[]).length<19)
    errors.push('Examples static fallback lacks 19 crawlable package links: '+locale);
  const sidebar=/<nav class="doc-fallback-nav"[^>]*>([\s\S]*?)<\/nav>/u.exec(html)?.[1]??'';
  const links=[...sidebar.matchAll(/<a\b[^>]*href="([^"]+)"/gu)].map(x=>x[1]);
  const developer=locale==='en'?'/en/docs/developers/':'/docs/desarrolladores/';
  const quickstart=locale==='en'?'/en/docs/quickstart/':'/docs/empezar-facil/';
  const npm=locale==='en'?'/en/docs/installation/':'/docs/instalar/';
  const solutions=['/crear-cursos-interactivos/','/juegos-educativos-3d/','/cursos-offline/','/skills/'];
  const expectedSolutions=locale==='en'?solutions.map(englishRouteFor):solutions;
  if(links.length!==12||new Set(links).size!==links.length||
     !links.includes(quickstart)||!links.includes(developer)||links.includes(npm)||
     expectedSolutions.some(route=>!links.includes(route)))
    errors.push('Teacher docs fallback must expose authoring, not installation menus: '+locale);
}

for(const [file,locale] of [
  ['docs/desarrolladores/colaboracion/index.html','es'],
  ['en/docs/developers/collaboration/index.html','en']
]){
  const html=await readFile(join(out,...file.split('/')),'utf8').catch(()=>null);
  if(!html){errors.push('Developer documentation fallback missing: '+file);continue;}
  const sidebar=/<nav class="doc-fallback-nav"[^>]*>([\s\S]*?)<\/nav>/u.exec(html)?.[1]??'';
  const links=[...sidebar.matchAll(/<a\b[^>]*href="([^"]+)"/gu)].map(x=>x[1]);
  const developer=locale==='en'?'/en/docs/developers/':'/docs/desarrolladores/';
  const technical=locale==='en'?'/en/docs/developers/quickstart/':'/docs/desarrolladores/primeros-pasos/';
  const teacher=locale==='en'?'/en/docs/quickstart/':'/docs/empezar-facil/';
  const solutions=['/crear-cursos-interactivos/','/juegos-educativos-3d/','/cursos-offline/','/skills/'];
  const expectedSolutions=locale==='en'?solutions.map(englishRouteFor):solutions;
  const skillsGuide=locale==='en'?englishRouteFor('/docs/skills/'):'/docs/skills/';
  if(links.length!==16||new Set(links).size!==links.length||
     !links.includes(developer)||!links.includes(technical)||links.includes(teacher)||
     !links.includes(skillsGuide)||expectedSolutions.some(route=>!links.includes(route)))
    errors.push('Developer docs fallback must show technical guides separately: '+file);
}


// Technical compatibility fixtures must not be misrepresented as full courses.
const publishedSamples=JSON.parse(await readFile(join(out,'examples/catalog.json'),'utf8'));
const technicalFixtures=publishedSamples.examples.filter(x=>x.sampleRole==='technical-fixture');
if(technicalFixtures.length!==3)errors.push('Expected exactly three disclosed IMSCC fixtures');
for(const item of technicalFixtures){
  if(item.sourceFormat!=='imscc'||!item.sampleNoteEs||!item.sampleNoteEn||
      item.browserVerified!==false)
    errors.push('Technical fixture lacks bilingual scope or has unsupported verification status: '+item.url);
}
for(const [file,needle] of [
  ['docs/ejemplos/index.html','Pruebas técnicas y cursos reales son distintos'],
  ['en/docs/examples/index.html','Technical fixtures and complete courses are different']
]){
  const html=await readFile(join(out,...file.split('/')),'utf8').catch(()=>'');
  if(!html.includes(needle)||!html.includes('common-cartridge-topkit.p2lrn'))
    errors.push('Examples documentation must disclose test fixtures and link to TOPkit: '+file);
}

const result={ok:errors.length===0,sourcePages:sourcePages.length,indexable:indexable.length,aliases:aliases.length,sitemapURLs:xmlUrls.length,quickstartVerified:Boolean(quick&&creator&&quick.equals(creator)),errors};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
