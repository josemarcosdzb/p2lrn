// Read-only production acceptance gate. Do not confuse a successful local
// build with the SEO and media files actually deployed at the public domain.
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const evidence=join(root,'.p2lrn-i18n-ci','evidence');
const args=process.argv.slice(2);
const option=(flag,defaultValue)=>{const index=args.indexOf(flag);return index<0?defaultValue:args[index+1]};
const origin=String(option('--origin','https://p2lrn.org')).replace(/\/$/,'');
if(!/^https:\/\/[a-z0-9.-]+$/i.test(origin))throw Error('Invalid production origin');
const baseline={pages:130,imageEntries:140,videoEntries:6};
const fetchPage=async(uri,method='GET')=>{
 const response=await fetch(uri,{method,redirect:'manual',signal:AbortSignal.timeout(20000),headers:{
  'User-Agent':'P2LRN-Production-SEO-Audit/1.0'
 }});
 return response;
};
const attribute=(tag,key)=>new RegExp('\\b'+key+'\\s*=\\s*(["\\x27])([\\s\\S]*?)\\1','i').exec(tag)?.[2]??'';
const tags=(html,type)=>[...html.matchAll(new RegExp('<'+type+'\\b[^>]*>','gi'))].map(m=>m[0]);
const unescape=s=>String(s).replaceAll('&amp;','&').replaceAll('&quot;','"')
 .replaceAll('&lt;','<').replaceAll('&gt;','>');
const toLocs=s=>[...s.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(m=>unescape(m[1].trim()));
const report={origin,originType:'live site, not GitHub source',
 checkedAt:new Date().toISOString(),baseline,errors:[],pages:[],
 multimedia:{},headers:{},notes:['A valid sitemap does not prove Google indexation or WCAG compliance.']};
const fail=(code,detail)=>report.errors.push({code,detail});
try{
 const [robotsResponse,sitemapResponse]=await Promise.all([
  fetchPage(origin+'/robots.txt'),fetchPage(origin+'/sitemap.xml')]);
 report.headers.robotsStatus=robotsResponse.status;
 report.headers.sitemapStatus=sitemapResponse.status;
 if(robotsResponse.status!==200)fail('robots-http',robotsResponse.status);
 const robots=robotsResponse.status===200?await robotsResponse.text():'';
 if(!robots.includes('Sitemap: '+origin+'/sitemap.xml'))fail('robots-sitemap','Canonical sitemap not declared');
 if(sitemapResponse.status!==200)fail('sitemap-http',sitemapResponse.status);
 const xml=sitemapResponse.status===200?await sitemapResponse.text():'';
 if(!/<urlset\b/.test(xml))fail('sitemap-format','Missing urlset');
 const urlEntries=[...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/gi)]
  .map(m=>({url:unescape(m[1].trim()),xml:m[2]}));
 const urls=urlEntries.map(x=>x.url);
 const imageEntries=[...xml.matchAll(/<image:loc>([^<]+)<\/image:loc>/gi)].map(m=>unescape(m[1]));
 const videoEntries=[...xml.matchAll(/<video:content_loc>([^<]+)<\/video:content_loc>/gi)].map(m=>unescape(m[1]));
 report.multimedia={sitemapPages:urlEntries.length,imageEntries:imageEntries.length,
  videoEntries:videoEntries.length,uniqueImageFiles:new Set(imageEntries).size,
  uniqueVideoFiles:new Set(videoEntries).size,
  namespaceImages:xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'),
  namespaceVideos:xml.includes('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"')};
 if(new Set(urls).size!==urls.length)fail('duplicate-sitemap-urls','Sitemap has repeated page URLs');
 if(urlEntries.length<baseline.pages)fail('not-deployed','Only '+urlEntries.length+' pages in live sitemap; required '+baseline.pages);
 if(imageEntries.length<baseline.imageEntries)fail('image-sitemap-stale',imageEntries.length+' < '+baseline.imageEntries);
 if(videoEntries.length<baseline.videoEntries)fail('video-sitemap-stale',videoEntries.length+' < '+baseline.videoEntries);
 if(!report.multimedia.namespaceImages||!report.multimedia.namespaceVideos)
  fail('missing-media-namespace','Live sitemap is missing image/video namespaces');
 for(const url of [...urls,...imageEntries,...videoEntries])
  if(!url.startsWith(origin+'/')||new URL(url).origin!==origin)
    fail('off-domain-url',url);
 let next=0;
 async function worker(){
  while(next<urlEntries.length){
   const item=urlEntries[next++];
   const outcome={url:item.url};
   try{
    const response=await fetchPage(item.url);
    outcome.status=response.status;
    if(response.status!==200){fail('html-http',{url:item.url,status:response.status});report.pages.push(outcome);continue;}
    const html=await response.text();
    outcome.lang=attribute(/<html\b[^>]*>/i.exec(html)?.[0]||'','lang');
    const canons=tags(html,'link').filter(t=>(attribute(t,'rel')||'').split(/\s+/).includes('canonical'));
    outcome.canonical=attribute(canons[0]||'','href');
    if(canons.length!==1||outcome.canonical!==item.url)fail('canonical',{url:item.url,value:outcome.canonical});
    const lang=item.url.startsWith(origin+'/en/')?'en':'es';
    if(outcome.lang!==lang)fail('lang',{url:item.url,found:outcome.lang});
    const others=tags(html,'link').filter(t=>(attribute(t,'rel')||'').split(/\s+/).includes('alternate'));
    outcome.hreflang=Object.fromEntries(others.map(t=>[attribute(t,'hreflang'),attribute(t,'href')]));
    if(!outcome.hreflang.es||!outcome.hreflang.en||!outcome.hreflang['x-default'])
      fail('hreflang',{url:item.url,found:outcome.hreflang});
    const robotsMeta=tags(html,'meta').find(t=>attribute(t,'name').toLowerCase()==='robots');
    if(/\bnoindex\b/i.test(attribute(robotsMeta||'','content')))
      fail('noindex',{url:item.url});
    outcome.h1=tags(html,'h1').length;
    if(outcome.h1!==1)fail('source-h1',{url:item.url,count:outcome.h1});
    outcome.images=tags(html,'img').length;
    outcome.missingAlt=tags(html,'img').filter(t=>attribute(t,'alt')===undefined).length;
    // Presence of an empty alt is intentional for a decorative image.
    outcome.missingAlt=tags(html,'img').filter(t=>!/\balt\s*=/.test(t)).length;
    if(outcome.missingAlt)fail('image-alt',{url:item.url,count:outcome.missingAlt});
   }catch(error){outcome.error=String(error).slice(0,300);fail('html-fetch',outcome);}
   report.pages.push(outcome);
  }
 }
 await Promise.all(Array.from({length:5},worker));
 const byUrl=new Map(report.pages.map(p=>[p.url,p]));
 for(const page of report.pages){
  if(!page.hreflang)continue;
  const expected=page.hreflang;
  const es=byUrl.get(expected.es),en=byUrl.get(expected.en);
  if(!es||!en||es.hreflang?.es!==expected.es||en.hreflang?.en!==expected.en)
    fail('hreflang-not-reciprocal',page.url);
 }
 const mediaUrls=[...new Set([...imageEntries,...videoEntries])];
 let verifiedAssets=0;
 for(const uri of mediaUrls){
  if(!uri.startsWith(origin+'/'))continue;
  try{
   const response=await fetchPage(uri,'HEAD');
   if(response.status!==200)fail('media-http',{url:uri,status:response.status});
   else verifiedAssets++;
  }catch(error){fail('media-fetch',{url:uri,error:String(error)});}
 }
 report.multimedia.verifiedAssets=verifiedAssets;
}catch(error){
 fail('auditor-exception',String(error?.stack||error));
}finally{
 report.ok=report.errors.length===0;
 report.checkedPages=report.pages.length;
 await mkdir(evidence,{recursive:true});
 await writeFile(join(evidence,'public-production-seo.json'),JSON.stringify(report,null,2)+'\n','utf8');
 console.log('P2LRN_PUBLIC_PRODUCTION_SEO='+JSON.stringify({
  ok:report.ok,pages:report.checkedPages,media:report.multimedia,
  errors:report.errors.length,firstErrors:report.errors.slice(0,12)}));
 if(!report.ok)process.exitCode=1;
}
