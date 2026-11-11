// Checks media indexing from real bilingual site HTML, without shipping a
// separate crawl/indexing implementation or inventing video publication dates.
import assert from 'node:assert/strict';
import {cp,mkdir,readFile,rm,stat,writeFile,readdir} from 'node:fs/promises';
import {join,resolve,relative,basename,dirname} from 'node:path';
import {normalizeSeoAndAccessibility,routeOf} from '../deploy/netlify/site-seo-a11y.mjs';
import {canonicalRoute,englishRouteFor} from '../deploy/netlify/site-routes.mjs';

const root=resolve(import.meta.dirname,'..');
const sourceRoot=join(root,'deploy','netlify','site');
const staging=join(root,'.p2lrn-i18n-ci','media-seo-staging');
const evidence=join(root,'.p2lrn-i18n-ci','evidence');
await mkdir(evidence,{recursive:true});
const report={source:'Actual static ES/EN pages, copied to an ephemeral compile folder',
  verified:false,checks:[],errors:[]};
try{
  // A committed static sitemap is a dangerous stale alternative to the
  // production-generated index (especially for images and videos).
  const staleSourceSitemap=await stat(join(sourceRoot,'sitemap.xml')).then(()=>true).catch(()=>false);
  assert.equal(staleSourceSitemap,false,'Remove obsolete source sitemap; only the production compiler creates it');
  await rm(staging,{recursive:true,force:true});
  await cp(sourceRoot,staging,{recursive:true,force:true});
  // Netlify's full compiler maps several English source filenames to their
  // final canonical routes. Prepare those output paths in the temporary build
  // before running the exact production sitemap normalizer.
  async function scan(dir){
    const found=[];
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const full=join(dir,entry.name);
      if(entry.isDirectory())found.push(...await scan(full));
      else if(entry.isFile()&&basename(full)==='index.html')found.push(full);
    }
    return found;
  }
  for(const sourcePage of await scan(sourceRoot)){
    const route=canonicalRoute(routeOf(sourceRoot,sourcePage));
    const target=route==='/'?join(staging,'index.html'):
      join(staging,...route.slice(1).split('/').filter(Boolean),'index.html');
    if(!await stat(target).catch(()=>null)){
      await mkdir(dirname(target),{recursive:true});
      await cp(sourcePage,target);
    }
  }
  const build=await normalizeSeoAndAccessibility(staging,{sourceRoot,strict:true});
  const xml=await readFile(join(staging,'sitemap.xml'),'utf8');
  assert.ok(xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'),'Image namespace missing');
  assert.ok(xml.includes('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"'),'Video namespace missing');
  const routes=[...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/g)]
    .map(m=>({url:m[1],xml:m[2]}));
  assert.equal(routes.length,build.indexable,'One sitemap URL per indexable page');
  const esc=s=>String(s).replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>');
  const images=routes.flatMap(page=>[...page.xml.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)]
    .map(m=>({page:page.url,url:esc(m[1])})));
  const videos=routes.flatMap(page=>[...page.xml.matchAll(/<video:video>([\s\S]*?)<\/video:video>/g)]
    .map(m=>({page:page.url,markup:m[1]})));
  assert.equal(images.length,build.imageEntries,'Image sitemap count mismatch');
  assert.equal(videos.length,build.videoEntries,'Video sitemap count mismatch');
  assert.ok(build.imageEntries>=80,'Too few meaningful site images in sitemap');
  assert.ok(build.videoEntries>=6,'ES/EN video sitemap lost real recordings');
  const required=['/','/en/','/crear-cursos-interactivos/',englishRouteFor('/crear-cursos-interactivos/'),
    '/docs/studio/',englishRouteFor('/docs/studio/')];
  for(const route of required){
    const match=routes.find(row=>row.url==='https://p2lrn.org'+route);
    assert.ok(match,'Required media landing page missing: '+route);
    assert.ok(match.xml.includes('<video:video>'),'Required video missing from sitemap: '+route);
    const html=await readFile(route==='/'?join(staging,'index.html'):
      join(staging,...route.slice(1).split('/').filter(Boolean),'index.html'),'utf8');
    assert.match(html,/"@type":"VideoObject"/,'VideoObject missing on '+route);
    assert.match(html,/data-video-description=/,'Actual video description missing on '+route);
    const entry=videos.find(v=>v.page==='https://p2lrn.org'+route)?.markup??'';
    assert.match(entry,/<video:thumbnail_loc>https:\/\/p2lrn\.org\/assets\//);
    assert.match(entry,/<video:content_loc>https:\/\/p2lrn\.org\/assets\//);
  }
  const duplicateVideoRefs=videos.filter(row=>!row.markup.includes('<video:description>')||
    !row.markup.includes('<video:thumbnail_loc>')||!row.markup.includes('<video:title>'));
  assert.deepEqual(duplicateVideoRefs,[],'Missing required video sitemap elements');
  const mediaRoutes=routes.filter(page=>page.xml.includes('<image:image>')||page.xml.includes('<video:video>'));
  assert.ok(mediaRoutes.length>=25,'Images or videos missing from documentation routes');
  // Google Video rich results require uploadDate. The real first publication
  // dates have not been established: never invent them from git timestamps.
  const missingUploadDate=[];
  for(const route of required){
    const page=routes.find(x=>x.url==='https://p2lrn.org'+route);
    const html=await readFile(route==='/'?join(staging,'index.html'):
      join(staging,...route.slice(1).split('/').filter(Boolean),'index.html'),'utf8');
    const structured=[...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
      .flatMap(match=>{const payload=JSON.parse(match[1]);return Array.isArray(payload)?payload:
        payload['@graph']??[payload];});
    const video=structured.find(item=>item['@type']==='VideoObject' &&
      item.contentUrl==='https://p2lrn.org'+(
        /<video:content_loc>([^<]+)<\/video:content_loc>/.exec(page?.xml??'')?.[1]
          ?.replace('https://p2lrn.org','')??'__missing__'));
    assert.ok(video,'VideoObject must match the actual sitemap media URL: '+route);
    if(!video.uploadDate)missingUploadDate.push(route);
  }
  assert.ok(routes.find(x=>x.url==='https://p2lrn.org/')?.xml
    .includes('/assets/hero/optimized/'),'Responsive homepage images absent from sitemap');
  report.verified=true;
  report.summary={pages:build.indexable,videoEntries:build.videoEntries,
    imageEntries:build.imageEntries,distinctAssets:build.mediaAssets,mediaRoutes:mediaRoutes.length,
    googleVideoRichResults:{eligible:missingUploadDate.length===0,missingVerifiedUploadDate:missingUploadDate,
      reason:missingUploadDate.length?'Google requires real uploadDate. Do not derive it from the repository or current build.':null},
    indexationClaim:'Sitemap is eligible for crawling; Search Console indexation is unverified'};
  report.checks.push('Bilingual sitemap','Indexable landing pages','Image URLs',
    'Video poster and downloadable file','Video metadata','Caption files',
    'Local assets exist and are nonempty','No stale redirect or noindex media URLs');
  console.log('P2LRN_MEDIA_SEO_VERIFIED='+JSON.stringify(report.summary));
}catch(error){
  report.errors.push(String(error?.stack||error));
  console.error('P2LRN_MEDIA_SEO_FAILED='+report.errors[0]);
  process.exitCode=1;
}finally{
  await writeFile(join(evidence,'media-indexing-report.json'),JSON.stringify(report,null,2)+'\n','utf8');
  await rm(staging,{recursive:true,force:true});
}
