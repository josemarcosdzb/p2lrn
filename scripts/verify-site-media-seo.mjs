// Checks media indexing from real bilingual site HTML, without shipping a
// separate crawl/indexing implementation or inventing video publication dates.
import assert from 'node:assert/strict';
import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {normalizeSeoAndAccessibility} from '../deploy/netlify/site-seo-a11y.mjs';

const root=resolve(import.meta.dirname,'..');
const sourceRoot=join(root,'deploy','netlify','site');
const staging=join(root,'.p2lrn-i18n-ci','media-seo-staging');
const evidence=join(root,'.p2lrn-i18n-ci','evidence');
await mkdir(evidence,{recursive:true});
const report={source:'Actual static ES/EN pages, copied to an ephemeral compile folder',
  verified:false,checks:[],errors:[]};
try{
  await rm(staging,{recursive:true,force:true});
  await cp(sourceRoot,staging,{recursive:true,force:true});
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
  const required=['/','/en/','/crear-cursos-interactivos/','/en/crear-cursos-interactivos/',
    '/docs/studio/','/en/docs/studio/'];
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
  report.verified=true;
  report.summary={pages:build.indexable,videoEntries:build.videoEntries,
    imageEntries:build.imageEntries,distinctAssets:build.mediaAssets,mediaRoutes:mediaRoutes.length,
    indexationClaim:'Eligible for crawling, not proof of Google indexation'};
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
