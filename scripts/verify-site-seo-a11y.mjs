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
 const locale=route==='/en/'||route.startsWith('/en/')?'en':'es';
 const langPattern=new RegExp('<html\\b[^>]*lang=["\\\']'+locale+'["\\\']','i');
 if(!langPattern.test(html))errors.push(route+' missing '+locale+' lang');
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
 if((route.startsWith('/docs/')||route.startsWith('/en/docs/'))&&!aliases.includes(route)){
  const sidebar=tags(html,'aside').find(x=>(attr(x,'class')||'').includes('doc-sidebar'));
  if(!sidebar||!attr(sidebar,'aria-label'))errors.push(route+' sidebar not labelled');
 }
}
const sitemap=await readFile(join(out,'sitemap.xml'),'utf8').catch(()=>{errors.push('missing sitemap.xml');return ''});
const xmlUrls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]).sort();
const expected=indexable.map(x=>CANONICAL_ORIGIN+x).sort();
if(JSON.stringify(xmlUrls)!==JSON.stringify(expected))errors.push('sitemap does not match indexed routes');
const englishSourcePages=sourcePages.filter(p=>relative(src,p).replaceAll('\\','/').startsWith('en/'));
const spanishSourcePages=sourcePages.filter(p=>!relative(src,p).replaceAll('\\','/').startsWith('en/'));
const englishAliases=aliases.filter(route=>route==='/en/'||route.startsWith('/en/'));
const spanishAliases=aliases.filter(route=>!(route==='/en/'||route.startsWith('/en/')));
if(spanishSourcePages.length<60||englishSourcePages.length<60||
   spanishSourcePages.length!==englishSourcePages.length||
   indexable.length+aliases.length!==sourcePages.length||
   spanishAliases.length!==englishAliases.length||aliases.length!==6)
  errors.push('unexpected bilingual source/indexable/alias counts: '+[
    sourcePages.length,indexable.length,aliases.length,
    spanishSourcePages.length,englishSourcePages.length,
    spanishAliases.length,englishAliases.length
  ].join('/'));
// Public solution pages have unique search intent, real actions, and inbound links from each locale homepage.
const solutionSlugs=['crear-cursos-interactivos','juegos-educativos-3d','cursos-offline'];
const homeHtml=await readFile(join(out,'index.html'),'utf8');
const englishHomeHtml=await readFile(join(out,'en','index.html'),'utf8');
for(const [prefix,home] of [['/',homeHtml],['/en/',englishHomeHtml]]){
  for(const slug of solutionSlugs){
    const route=prefix+slug+'/';
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
  if(siteSchemas.length!==1||siteSchemas[0].name!=='P2LRN'||siteSchemas[0].url!==expectedUrl)
    errors.push('Missing or inconsistent '+label+' P2LRN WebSite identity structured data');
  if(named(home,'meta','property','og:site_name').length!==1)errors.push('Missing '+label+' site identity in home OpenGraph');
}
const [quick,creator]=await Promise.all(['quickstart.p2lrn','canonical/creator-course.p2lrn'].map(p=>readFile(join(out,'examples',p)).catch(()=>null)));
if(!quick||!creator||!quick.equals(creator))errors.push('compatibility quickstart package missing or not identical to verified creator-course');
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
  ['en/docs/conectores/ia/index.html','/en/skills/','/en/docs/skills/'],
  ['en/docs/conectores/index.html','/en/skills/','/en/docs/skills/'],
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
 ['claude','p2lrn-creator/'],
 ['gemini',''],
 ['grok','.grok/skills/p2lrn-creator/']
]);
if(skillManifest.packages.length!==4)errors.push('Skill download manifest must contain four packages');
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

const result={ok:errors.length===0,sourcePages:sourcePages.length,indexable:indexable.length,aliases:aliases.length,sitemapURLs:xmlUrls.length,quickstartVerified:Boolean(quick&&creator&&quick.equals(creator)),errors};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
