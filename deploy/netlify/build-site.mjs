import {createHash} from 'node:crypto';
import {cp, copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, join, relative, resolve} from 'node:path';
import {openP2LRNPackageBytes} from '../../packages/toolkit/web/p2lrn-player.js';
import {buildDocExamples} from './build-doc-examples.mjs';
import {STUDIO_RUNTIME_SHARED_FILES} from './studio-runtime-assets.mjs';
import {reviseSiteBrowserAssets} from './browser-site-revision.mjs';
import {authorizeOpaqueRuntimeBootstraps} from './runtime-bootstrap-csp.mjs';
import {renderSiteFooter,getSiteFooterLinks} from './site-footer.mjs';
import {verifyPackageCorrespondingSource} from './corresponding-source.mjs';
import {normalizeSeoAndAccessibility} from './site-seo-a11y.mjs';
import {buildSocialImage} from './build-social-image.mjs';
import {ENGLISH_ROUTES, LEGACY_ENGLISH_ROUTES, SPANISH_ROUTES, ENGLISH_ANCHORS, englishRouteFor, spanishRouteFor, canonicalRoute} from './site-routes.mjs';

const root = resolve(process.cwd());
await import('./build-cdn.mjs');

const siteRoot = join(root,'deploy','netlify','site');
const outputRoot = join(root,'.netlify-cdn');
// Preserve immutable CDN/runtime headers: copying the marketing site would
// otherwise overwrite _headers and silently remove cross-origin SRI/CSP rules.
const cdnHeaders=await readFile(join(outputRoot,'_headers'),'utf8');
await cp(siteRoot,outputRoot,{recursive:true,force:true});
const siteHeaders=await readFile(join(outputRoot,'_headers'),'utf8');
await writeFile(join(outputRoot,'_headers'),siteHeaders.trimEnd()+'\n\n'+cdnHeaders);
// Validate every published versioned source snapshot before HTML transformations.
const correspondingVersion=JSON.parse(await readFile(join(root,'packages','player','package.json'),'utf8')).version;
for(const component of ['toolkit','studio','analytics']){
  await verifyPackageCorrespondingSource({outputRoot,name:component,version:correspondingVersion});
}

// Publish the same native executable reviewed by the Windows offline exporter.
await import('./build-offline-executable.mjs');
const offlineExecutable=JSON.parse(await readFile(join(outputRoot,'downloads','p2lrn-offline-launcher.json'),'utf8'));
const nativeSource=JSON.parse(await readFile(join(outputRoot,'downloads','source','SOURCE-MANIFEST.json'),'utf8'));
if(nativeSource.version!==correspondingVersion||offlineExecutable.correspondingSource?.manifest!=='/downloads/source/SOURCE-MANIFEST.json')
  throw new Error('Offline launcher has no matching corresponding source manifest');
for(const entry of nativeSource.files??[]){
  if(entry.path.split('/').includes('..'))throw new Error('Unsafe native source path');
  const buf=await readFile(join(outputRoot,'downloads','source',...entry.path.split('/')));
  const digest='sha256:'+createHash('sha256').update(buf).digest('hex');
  if(buf.length!==entry.bytes||digest!==entry.sha256)
    throw new Error('Offline launcher source hash mismatch: '+entry.path);
}
const nativeArchive=await readFile(join(outputRoot,'downloads','p2lrn-offline-launcher-source.tar.gz'));
if(offlineExecutable.correspondingSource.archiveSha256!=='sha256:'+createHash('sha256').update(nativeArchive).digest('hex'))
  throw new Error('Native source archive hash mismatch');

// The web build publishes real, inspectable connector ZIPs from this same source.
await import('./build-connector-downloads.mjs');
// Deterministic downloadable P2LRN Skills for four AI platforms.
await import('./build-skill-downloads.mjs');
// Additional independently installable P2LRN Skills for all five agents.
await import('./build-extra-skill-downloads.mjs');
// Fail the site build when any supplemental download is incomplete or corrupted.
await import('../../scripts/verify-extra-skill-downloads.mjs');
await copyFile(join(outputRoot,'player','current','dist','p2lrn-sw.js'),join(outputRoot,'p2lrn-sw.js'));
await cp(join(root,'packages','toolkit','web','studio'),join(outputRoot,'studio','runtime'),{recursive:true,force:true});
for(const file of STUDIO_RUNTIME_SHARED_FILES){
  const destination=join(outputRoot,'studio',file);
  await mkdir(dirname(destination),{recursive:true});
  await copyFile(join(root,'packages','toolkit','web',file),destination);
}
const studioRendererLocalization=await readFile(join(outputRoot,'studio','renderers','ui-i18n.js'),'utf8');
if(!studioRendererLocalization.includes('export function playerUiText('))
  throw new Error('Studio renderer translation dependency not deployed');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    const full = join(dir,entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}
const toArrayBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
function titleOf(entity) {
  const title = entity?.title ?? {};
  return title.es ?? title.en ?? title.und ?? Object.values(title)[0] ?? entity?.id ?? 'P2LRN';
}
async function inspectPackage(path) {
  const bytes = new Uint8Array(await readFile(path));
  const pkg = await openP2LRNPackageBytes(toArrayBuffer(bytes));
  const entry = pkg.manifest.entrypoints?.[0];
  return {
    packageId:pkg.manifest.packageId,
    formatVersion:pkg.manifest.formatVersion,
    title:titleOf(entry ? pkg.entities.get(entry.id) : null),
    profiles:(pkg.manifest.profiles ?? []).map((profile)=>profile.id),
    entrypoints:(pkg.manifest.entrypoints ?? []).map((item)=>({id:item.id,type:item.type,role:item.role})),
    bytes:bytes.byteLength,
  };
}

const examplesOutput = join(outputRoot,'examples');
// Always reset examples so deleted courses cannot survive incremental Netlify builds.
await rm(examplesOutput,{recursive:true,force:true});
await mkdir(examplesOutput,{recursive:true});
// Retain the public Analytics example script after clearing obsolete sample packages.
// The documentation references this exact route in both languages.
await copyFile(join(siteRoot,'examples','p2lrn-results-index.mjs'),join(examplesOutput,'p2lrn-results-index.mjs'));
const canonicalSource = join(root,'examples','canonical');
const canonicalOutput = join(examplesOutput,'canonical');
await mkdir(canonicalOutput,{recursive:true});
await cp(join(canonicalSource,'external'),join(canonicalOutput,'external'),{recursive:true,force:true});

// Only imported interoperability packages remain in the public canonical corpus.
for (const name of ['developer-course','developer-game-3d']) {
  try {
    await cp(join(root,'examples',name),join(examplesOutput,'source',name),{recursive:true,force:true});
  } catch {}
}

const canonicalDisplayTitles = Object.freeze({
  'external/scorm12-real.p2lrn':'SCORM 1.2 · fixture ADL preservada (contenido fuente incompleto)',
  'external/qti3-minimal.p2lrn':'QTI 3 · fixture mínima preservada (sin itemBody)',
  'external/cmi5-catapult-pre-post.p2lrn':'cmi5 Catapult · Introduction to Geology',
});
// The external community sample list is verified provenance, not user-controlled
// runtime metadata. A sample without an exact source hash, licence and pinned
// P2LRN bytes must not silently appear as a supported web demo.
const freeProvenancePath=join(canonicalSource,'external','free','provenance.json');
const freeProvenanceMap=new Map();
if(await exists(freeProvenancePath)){
  const manifest=JSON.parse(await readFile(freeProvenancePath,'utf8'));
  if(manifest?.schema!=='https://p2lrn.org/schema/community-samples/1'||manifest?.version!==1||
     !Array.isArray(manifest.samples)||manifest.samples.length>80)
    throw new Error('Invalid community sample provenance schema');
  const supported=new Set(['scorm','h5p','qti','cmi5','imscc']);
  const allowedLicenses=new Set(['MIT','Apache-2.0','CC-BY-4.0']);
  for(const item of manifest.samples){
    if(!/^[a-z0-9][a-z0-9-]*$/u.test(item?.slug??'')||freeProvenanceMap.has(item.slug))
      throw new Error('Community sample has an invalid/duplicate slug');
    if(!supported.has(item.kind)||!allowedLicenses.has(item.license))
      throw new Error('Community sample has an undocumented external format or licence: '+item.slug);
    if(!/^https:\/\//u.test(item.sourceUrl??'')||
       !/^sha256:[0-9a-f]{64}$/u.test(item.sourceSha256??'')||
       !/^sha256:[0-9a-f]{64}$/u.test(item.packageSha256??''))
      throw new Error('Community sample is missing exact HTTPS provenance or SHA-256: '+item.slug);
    if(typeof item.title!=='string'||!item.title.trim()||item.title.length>140)
      throw new Error('Community sample title invalid: '+item.slug);
    // Keep educational samples distinct from standards-compatibility fixtures.
    // These fields label the published metadata; the pinned course bytes stay unchanged.
    if(item.sampleRole!==undefined){
      if(item.sampleRole!=='technical-fixture' ||
          ![item.sampleNoteEs,item.sampleNoteEn].every(x=>typeof x==='string'&&
            x.length>=30&&x.length<=400&&x.trim()===x))
        throw new Error('Invalid technical fixture description: '+item.slug);
    }
    freeProvenanceMap.set(item.slug,item);
  }
}
const freeSamplesSeen=new Set();
const canonicalEntries = [];
for (const path of (await walk(join(canonicalSource,'external'))).filter((item)=>item.endsWith('.p2lrn')).sort()) {
  const rel = relative(canonicalSource,path).replaceAll('\\','/');
  const publishedPath = join(canonicalOutput,...rel.split('/'));
  const [sourceBytes,publishedBytes] = await Promise.all([readFile(path),readFile(publishedPath)]);
  if (!sourceBytes.equals(publishedBytes)) throw new Error(`Published canonical example differs byte-for-byte from source: ${rel}`);
  const freeMatch=/^external\/free\/([a-z0-9][a-z0-9-]*)\.p2lrn$/u.exec(rel);
  const freeMetadata=freeMatch?freeProvenanceMap.get(freeMatch[1]):null;
  if(freeMatch){
    if(!freeMetadata)throw new Error('Unknown community sample without redistribution provenance: '+rel);
    const digest='sha256:'+createHash('sha256').update(sourceBytes).digest('hex');
    if(digest!==freeMetadata.packageSha256)throw new Error('Community sample changed without pinned SHA-256: '+rel);
    freeSamplesSeen.add(freeMatch[1]);
  }
  const inspected = await inspectPackage(publishedPath);
  canonicalEntries.push({
    title:freeMetadata?.title??canonicalDisplayTitles[rel] ?? inspected.title,
    category:rel.startsWith('external/') ? 'canonical-external' : rel.startsWith('aulap2p-reader/') ? 'canonical-reader' : 'canonical',
    ...(freeMetadata ? {
      sourceFormat:freeMetadata.kind,
      originUrl:freeMetadata.sourceUrl,
      license:freeMetadata.license,
      sourceSha256:freeMetadata.sourceSha256,
      browserVerified:freeMetadata.browserVerified===true,
      ...(freeMetadata.sampleRole ? {
        sampleRole:freeMetadata.sampleRole,
        sampleNoteEs:freeMetadata.sampleNoteEs,
        sampleNoteEn:freeMetadata.sampleNoteEn,
      } : {}),
      provenance:'/examples/canonical/external/free/provenance.json',
    } : {}),
    url:'/examples/canonical/' + rel,
    source:'examples/canonical/' + rel,
    rendererId:null,
    profiles:inspected.profiles,
    entrypoints:inspected.entrypoints,
    packageId:inspected.packageId,
    formatVersion:inspected.formatVersion,
    bytes:inspected.bytes,
  });
}

if(freeSamplesSeen.size!==freeProvenanceMap.size)
  throw new Error('Community sample provenance includes files absent from the public corpus: '+
    [...freeProvenanceMap.keys()].filter(id=>!freeSamplesSeen.has(id)).join(', '));

// Native documentation fixtures are verified during the build, but must not be published.
const documentationExamples = await buildDocExamples({outputRoot:examplesOutput});
const generatedEntries = documentationExamples.filter((entry)=>entry.category==='generated-external');
const requiredExecutableExamples = ['scorm12-browser-demo.p2lrn','qti3-interactive-demo.p2lrn'];
for (const name of requiredExecutableExamples) {
  const demoPath = join(examplesOutput,'generated',name);
  if (!(await exists(demoPath))) throw new Error('Executable documentation example is missing: ' + name);
  await inspectPackage(demoPath);
}
const verifiedDefaultViewerExample=generatedEntries.find((example)=>example.url==='/examples/generated/scorm12-browser-demo.p2lrn');
if(!verifiedDefaultViewerExample)throw new Error('The public viewer default must be a validated imported SCORM package.');
const catalog = {
  defaultExample:verifiedDefaultViewerExample.url,
  schema:'https://p2lrn.org/schema/docs-example-catalog/1',
  version:'1',
  examples:[...canonicalEntries,...generatedEntries],
};
await writeFile(join(examplesOutput,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');

// Render meaningful examples without JavaScript for accessibility and search
// engines. The interactive gallery progressively enhances this static index;
// no lesson script executes in the documentation page.
const publicCommunitySamples=catalog.examples.filter(item=>
  /^\/examples\/canonical\/external\/free\/[a-z0-9-]+\.p2lrn$/u.test(item.url??''));
const escapeCommunityText=value=>String(value??'').replace(/[&<>"']/gu,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[ch]);
if(publicCommunitySamples.length!==freeProvenanceMap.size)
  throw new Error('Static example index count differs from verified community catalog');
for(const [rel,isEnglish] of [['docs/ejemplos/index.html',false],['en/docs/ejemplos/index.html',true]]){
  const target=join(outputRoot,...rel.split('/'));
  let html=await readFile(target,'utf8');
  const heading=isEnglish?'Examples available without JavaScript':'Ejemplos disponibles sin JavaScript';
  const action=isEnglish?'Open in Player':'Abrir en Player';
  const download=isEnglish?'Download package':'Descargar paquete';
  const items=publicCommunitySamples.map(entry=>{
    const title=escapeCommunityText(entry.title||entry.url.split('/').at(-1));
    const kind=escapeCommunityText(entry.sourceFormat||'P2LRN');
    const view=(isEnglish?'/en/demo/':'/demo/')+'?src='+encodeURIComponent(entry.url);
    return '<li><strong>'+title+'</strong> <span>('+kind+')</span> '+
      '<a href="'+view+'">'+action+'</a> · '+
      '<a href="'+entry.url+'" download>'+download+'</a></li>';
  }).join('');
  const replacement='<div data-community-examples><div class="community-static-index">'+
    '<h3>'+heading+'</h3><ul>'+items+'</ul></div></div>';
  if(!/<div data-community-examples>[\s\S]*?<\/div>/iu.test(html))
    throw new Error('Missing community gallery mount: '+rel);
  html=html.replace(/<div data-community-examples>[\s\S]*?<\/div>/iu,replacement);
  await writeFile(target,html,'utf8');
}


function stripTags(value) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/\s+/g,' ').trim();
}
function pageUrl(path) {
  const rel = relative(outputRoot,path).replaceAll('\\','/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0,-'index.html'.length);
  return '/' + rel;
}
function isCorrespondingSourcePath(path) {
  const rel = relative(outputRoot,path).replaceAll('\\','/');
  return /^(?:player|toolkit|studio|analytics)\/(?:current|[^/]+)\/source\//u.test(rel);
}
// CDN release files are immutable distribution artifacts, not public website
// pages. Adding brand HTML to them after release.json is generated invalidates
// their byte counts and SHA-256 digests, breaking offline exports.
function isImmutableDistributionHtml(path) {
  const rel=relative(outputRoot,path).replaceAll('\\','/');
  return /^(?:player|studio|analytics)\/(?:current|[^/]+)\/dist\//u.test(rel);
}
// Relocate only the authored English HTML pages. Keep runtime/CDN bytes immutable.
const legacyEnglishPairs=Object.entries(LEGACY_ENGLISH_ROUTES).sort((a,b)=>b[0].length-a[0].length);
const authoredHtmlFiles=(await walk(siteRoot)).filter(p=>p.endsWith('index.html'));
for(const [oldRoute,newRoute] of legacyEnglishPairs){
  const oldPath=join(outputRoot,...oldRoute.slice(1).split('/').filter(Boolean),'index.html');
  const newPath=join(outputRoot,...newRoute.slice(1).split('/').filter(Boolean),'index.html');
  if(!authoredHtmlFiles.some(p=>relative(siteRoot,p).replaceAll('\\','/')===oldRoute.slice(1)+'index.html'))
    throw new Error('Missing authored English route for localization: '+oldRoute);
  await mkdir(dirname(newPath),{recursive:true});
  await rename(oldPath,newPath);
}
for(const authoredPath of authoredHtmlFiles){
  const sourceRoute='/'+relative(siteRoot,authoredPath).replaceAll('\\','/').replace(/index\.html$/,'');
  const destinationRoute=canonicalRoute(sourceRoute);
  const target=destinationRoute==='/'?join(outputRoot,'index.html'):
    join(outputRoot,...destinationRoute.slice(1).split('/').filter(Boolean),'index.html');
  let html=await readFile(target,'utf8');
  for(const [oldRoute,newRoute] of legacyEnglishPairs)html=html.replaceAll(oldRoute,newRoute);
  // Breadcrumb labels are editorial labels, not raw slug fragments.
  html=html.replace(/(<nav\b[^>]*class=["'][^"']*landing-breadcrumbs[^"']*["'][\s\S]*?<span aria-current="page">)([^<]+)(<\/span>)/i,
    (_,opening,label,closing)=>opening+label.charAt(0).toLocaleUpperCase(destinationRoute.startsWith('/en/')?'en':'es')+label.slice(1)+closing);
  if(destinationRoute.startsWith('/en/')){
    // Add a new anchor inside the original element; legacy fragment IDs remain.
    for(const [oldAnchor,newAnchor] of Object.entries(ENGLISH_ANCHORS)){
      const token='id="'+oldAnchor+'"';
      const hit=html.indexOf(token);
      if(hit>=0&&!html.includes('id="'+newAnchor+'"')){
        const open=html.lastIndexOf('<',hit);
        const end=html.indexOf('>',hit);
        const tag=html.slice(open,end+1);
        if(open>=0&&end>hit&&end-open<450&&/^<(?:section|div|article|h[1-6])\b/i.test(tag)){
          const alias='<span class="anchor-alias" id="'+newAnchor+'" aria-hidden="true"></span>';
          html=html.slice(0,end+1)+alias+html.slice(end+1);
        }
      }
      html=html.replaceAll('#'+oldAnchor,'#'+newAnchor);
    }
  }
  await writeFile(target,html,'utf8');
}
// Netlify executes _redirects before netlify.toml. Make the hostname rule first.
const routeRedirects=[
  'https://p2lrn.netlify.app/* https://p2lrn.org/:splat 301!',
  'http://p2lrn.netlify.app/* https://p2lrn.org/:splat 301!',
  ...legacyEnglishPairs.map(([from,to])=>from+' '+to+' 301!')
];
await writeFile(join(outputRoot,'_redirects'),routeRedirects.join('\n')+'\n','utf8');
// Route config is embedded in both public JS bundles. Source scripts still
// work without this build-only config, but canonical links never need hops.
for(const publicJs of ['p2lrn.js','en/p2lrn.js']){
  const file=join(outputRoot,...publicJs.split('/'));
  const before=await readFile(file,'utf8');
  const preamble='globalThis.__P2LRN_ENGLISH_ROUTES='+JSON.stringify(ENGLISH_ROUTES)+';\n'+
    'globalThis.__P2LRN_SPANISH_ROUTES='+JSON.stringify(SPANISH_ROUTES)+';\n';
  await writeFile(file,preamble+before,'utf8');
}
const socialBuild=await buildSocialImage({siteRoot,outputRoot});
if(socialBuild.width!==1200||socialBuild.height!==630)
  throw new Error('Social image must be exactly 1200 x 630');
const heroDimensions=new Map();
for(const filename of ['studio.png','player.png','docs.png','games.png','questionnaires.png']){
  const bytes=await readFile(join(siteRoot,'assets','hero',filename));
  if(bytes.subarray(1,4).toString()!=='PNG')throw Error('Not PNG: '+filename);
  heroDimensions.set(filename,[bytes.readUInt32BE(16),bytes.readUInt32BE(20)]);
}
const allHtmlFiles = (await walk(outputRoot)).filter((path)=>path.endsWith('.html'));
// Google Search Console HTML ownership tokens must be served byte-for-byte from the root,
// not rewritten as normal public HTML pages.
const htmlFiles = allHtmlFiles.filter((path)=>!isCorrespondingSourcePath(path)
  && !isImmutableDistributionHtml(path)
  && !/^google[0-9a-f]+\.html$/i.test(relative(outputRoot,path).replaceAll('\\','/')));
const bilingualSite=htmlFiles.some(path=>relative(outputRoot,path).replaceAll('\\','/').startsWith('en/'));

// Keep the Supabase/Turnstile integration physically limited to both contact pages.
// The production English route is /en/contact/ after legacy route relocation.
const contactOnlyPath='/assets/contact/contact-form.js';
const contactPages=new Set(['contacto/index.html','en/contact/index.html']);
if(!await exists(join(outputRoot,'assets','contact','contact-form.js')))
  throw new Error('Missing isolated contact form bundle');
for(const htmlPath of htmlFiles){
  const rel=relative(outputRoot,htmlPath).replaceAll('\\','/');
  const html=await readFile(htmlPath,'utf8');
  const count=(html.match(/<script\b[^>]*\bsrc=["']\/assets\/contact\/contact-form\.js["'][^>]*><\/script>/gi)||[]).length;
  if(count!==(contactPages.has(rel)?1:0))
    throw new Error('Contact-only JS unexpectedly loaded or missing: '+rel);
}
for(const publicJs of ['p2lrn.js','en/p2lrn.js']){
  const shared=await readFile(join(outputRoot,...publicJs.split('/')),'utf8');
  if(/\bSUPABASE_|p2lrn-contact|data-contact-form|turnstile/i.test(shared))
    throw new Error('Supabase integration leaked into shared site script: '+publicJs);
}


const productionPublicVersion = JSON.parse(await readFile(join(root,'packages','player','package.json'),'utf8')).version;
const brandHeadFor=(locale='es')=>[
  '<link rel="icon" type="image/png" sizes="96x96" href="/favicon.png">',
  '<link rel="shortcut icon" type="image/png" href="/favicon.png">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="'+(locale==='en'?'/en/site.webmanifest':'/site.webmanifest')+'">',
  '<meta property="og:image" content="https://p2lrn.org/p2lrn-mark.png">',
  '<meta name="twitter:image" content="https://p2lrn.org/p2lrn-mark.png">'
].join('');
for (const htmlPath of htmlFiles) {
  const pageRelative=relative(outputRoot,htmlPath).replaceAll('\\','/');
  const pageLocale=pageRelative.startsWith('en/')?'en':'es';
  let html = await readFile(htmlPath,'utf8');
  html = html.replaceAll('0.5.0-alpha.10',productionPublicVersion);
  html = html.replace(/href=["']\/p2lrn\.css(?:\?[^"']*)?["']/gi,'href="/p2lrn.css?v=p2lrn-brand-20261027-v3"');
  // Decorative release badges may be removed, but live application status controls must remain.
  html = html.replace(/<div\s+class=["']header-meta["'][^>]*>[\s\S]*?<\/div>/gi,
    (block)=>block.includes('data-functional-status')?block:'');
  html = html.replace(/<span\s+[^>]*data-footer-version(?:=["'][^"']*["'])?[^>]*>[\s\S]*?<\/span>/gi,'');
  html = html.replace(/<span\s+class=["']site-release-label["'][^>]*>[\s\S]*?<\/span>/gi,'');
  html = html.replace(/<span\s+class=["']site-build-label["'][^>]*>[\s\S]*?<\/span>/gi,'');
  // Reserve image layout space; avoid eager-loading below-the-fold screenshots.
  let firstHeroImage=true;
  html=html.replace(/<img\b[^>]*>/gi,tag=>{
    const src=/\bsrc=["']\/assets\/hero\/([^"'?]+)(?:\?[^"']*)?["']/i.exec(tag)?.[1];
    const dimensions=heroDimensions.get(src);
    if(!dimensions)return tag;
    if(!/\bwidth=/.test(tag))tag=tag.replace(/>$/,' width="'+dimensions[0]+'">');
    if(!/\bheight=/.test(tag))tag=tag.replace(/>$/,' height="'+dimensions[1]+'">');
    if(!/\bdecoding=/.test(tag))tag=tag.replace(/>$/,' decoding="async">');
    if(!/\bloading=/.test(tag)){
      tag=tag.replace(/>$/,' loading="'+(firstHeroImage?'eager':'lazy')+'">');
      if(firstHeroImage&&!/\bfetchpriority=/.test(tag))tag=tag.replace(/>$/,' fetchpriority="high">');
    }
    firstHeroImage=false;
    return tag;
  });
  html=html.replace(/<video\b[^>]*>/gi,tag=>{
    if(!/\bposter=/.test(tag))tag=tag.replace(/>$/,' poster="/assets/hero/video-reference.jpg">');
    if(!/\bpreload=/.test(tag))tag=tag.replace(/>$/,' preload="metadata">');
    return tag;
  });
  if (!html.includes('href="/favicon.png"')) {
    html = html.replace(/<\/head>/i,brandHeadFor(pageLocale) + '</head>');
  }
  await writeFile(htmlPath,html);
}
// Only mutate outputRoot. Keep all 57 authored documentation pages unchanged.
const seoAudit=await normalizeSeoAndAccessibility(outputRoot,{sourceRoot:siteRoot});
console.log('P2LRN_BUILD_SEO='+JSON.stringify(seoAudit));

const routeFile=(route)=>route==='/'?join(outputRoot,'index.html'):join(outputRoot,...route.slice(1).split('/').filter(Boolean),'index.html');
if(bilingualSite){
  for(const htmlPath of htmlFiles){
    let html=await readFile(htmlPath,'utf8');
    if(html.includes('data-language-switch'))continue;
    const route=pageUrl(htmlPath);
    const english=route==='/en/'||route.startsWith('/en/');
    const esRoute=english?spanishRouteFor(route):route;
    const enRoute=english?route:englishRouteFor(route);
    const counterpart=english?routeFile(esRoute):routeFile(enRoute);
    if(!(await exists(counterpart)))throw new Error('Missing language counterpart for '+route);
    const languageSwitch='<nav class="language-switch" data-language-switch aria-label="'+(english?'Language':'Idioma')+'">'+
      '<a href="'+esRoute+'" lang="es" hreflang="es" aria-label="ES — '+(english?'Switch to Spanish':'Cambiar a español')+'"'+(english?'':' aria-current="page"')+'>ES</a>'+
      '<a href="'+enRoute+'" lang="en" hreflang="en" aria-label="EN — '+(english?'Switch to English':'Cambiar a inglés')+'"'+(english?' aria-current="page"':'')+'>EN</a>'+
      '</nav>';
    if(/<\/header>/i.test(html))html=html.replace(/<\/header>/i,languageSwitch+'</header>');
    else html=html.replace(/<body\b[^>]*>/i,tag=>tag+languageSwitch);
    await writeFile(htmlPath,html,'utf8');
  }
}
const brandAssets=['p2lrn-mark.png','favicon.png','apple-touch-icon.png','site.webmanifest'];
for (const asset of brandAssets) {
  if (!(await exists(join(outputRoot,asset)))) throw new Error('Missing brand asset: ' + asset);
}
if(bilingualSite&&!(await exists(join(outputRoot,'en','site.webmanifest')))){
  throw new Error('Missing English web app manifest: /en/site.webmanifest');
}
for (const htmlPath of htmlFiles) {
  const rel=relative(outputRoot,htmlPath).replaceAll('\\','/');
  const html=await readFile(htmlPath,'utf8');
  const manifest=rel.startsWith('en/')?'/en/site.webmanifest':'/site.webmanifest';
  for (const required of ['/favicon.png','/apple-touch-icon.png',manifest]) {
    if (!html.includes(required)) throw new Error('Missing brand metadata in ' + rel + ': ' + required);
  }
  if (html.includes('/p2lrn.css') && !html.includes('/p2lrn.css?v=p2lrn-brand-20261027-v3')) {
    throw new Error('Unversioned brand stylesheet in ' + relative(outputRoot,htmlPath));
  }
  if(bilingualSite){
    const route=pageUrl(htmlPath);
    const english=route==='/en/'||route.startsWith('/en/');
    const esRoute=english?spanishRouteFor(route):route;
    const enRoute=english?route:englishRouteFor(route);
    if((html.match(/data-language-switch/g)||[]).length!==1)throw new Error('Duplicate or missing ES EN language switch in '+route);
    // The visible ES/EN abbreviations must begin the accessible name (WCAG 2.5.3).
    const esLink='href="'+esRoute+'" lang="es" hreflang="es" aria-label="ES — '+(english?'Switch to Spanish':'Cambiar a español')+'"';
    const enLink='href="'+enRoute+'" lang="en" hreflang="en" aria-label="EN — '+(english?'Switch to English':'Cambiar a inglés')+'"';
    if(!html.includes(esLink)||!html.includes(enLink))throw new Error('Broken paired language links in '+route);
    const currentNeedle=english?enLink+' aria-current="page"':esLink+' aria-current="page"';
    if(!html.includes(currentNeedle))throw new Error('Language switch does not mark the active locale in '+route);
  }
}

// Detect CDN postprocessing BEFORE publishing. Runtime HTML is hashed in
// release.json, and its .raw mirrors must contain identical bytes under both
// versioned and current URLs so offline courses can be exported reliably.
const playerRelease=JSON.parse(await readFile(join(outputRoot,'player','current','dist','release.json'),'utf8'));
const runtimeHtmlMembers=playerRelease.files.filter(file=>file.path.endsWith('.html'));
if(runtimeHtmlMembers.length<3)throw new Error('Player release lacks the expected HTML runtime hosts');
for(const channel of ['current',productionPublicVersion]){
  for(const descriptor of runtimeHtmlMembers){
    for(const suffix of ['', '.raw']){
      const file=join(outputRoot,'player',channel,'dist',descriptor.path+suffix);
      const data=await readFile(file);
      const digest='sha256:'+createHash('sha256').update(data).digest('hex');
      if(data.length!==descriptor.bytes||digest!==descriptor.sha256)
        throw new Error('Immutable Player HTML differs from release.json: '+channel+'/'+descriptor.path+suffix);
    }
  }
}

// Never remove stateful UI controls when stripping decorative website metadata.
const functionalPages=[
  {path:['studio','index.html'],markers:['data-functional-status','data-studio-status','data-player','data-mode-preview','data-mode-edit']},
  {path:['demo','index.html'],markers:['data-functional-status','data-viewer-status','data-runtime-state','id="demo-player"']},
];
if(bilingualSite)functionalPages.push(
  {path:['en','studio','index.html'],markers:['data-functional-status','data-studio-status','data-player','data-mode-preview','data-mode-edit']},
  {path:['en','demo','index.html'],markers:['data-functional-status','data-viewer-status','data-runtime-state','id="demo-player"']},
);
for(const page of functionalPages){
  const built=await readFile(join(outputRoot,...page.path),'utf8');
  for(const marker of page.markers)if(!built.includes(marker))
    throw new Error('Published functional page lost control '+page.path.join('/')+': '+marker);
}

// Publish a small, crawlable fallback navigation in EVERY documentation page.
// p2lrn.js replaces this with the full localised sidebar when it loads, but
// loss of JS, a blocked bundle or a slow connection must never leave the
// documentation without any navigation or indexable internal links.
// Keep navigation readable and role-appropriate even if site JavaScript is disabled.
// This fallback uses the same teacher/developer division as p2lrn.js.
const teacherDocSections=[
  ['/docs/','Documentación','Documentation'],
  ['/docs/empezar-facil/','Primer curso con Studio','First course in Studio'],
  ['/docs/studio/','Guía de Studio','Studio guide'],
  ['/docs/questionnaires/','Cuestionarios y juegos','Quizzes and games'],
  ['/docs/colaboracion/','Colaboración en Studio','Collaboration in Studio'],
  ['/docs/entrega-offline/','Entrega offline','Offline delivery'],
  ['/docs/ejemplos/','Cursos de ejemplo','Example courses'],
  ['/docs/desarrolladores/','Para desarrolladores','For developers'],
];
const developerDocSections=[
  ['/docs/desarrolladores/','Desarrolladores','Developers'],
  ['/docs/desarrolladores/primeros-pasos/','HTML y CDN','HTML and CDN'],
  ['/docs/instalar/','Instalación','Installation'],
  ['/docs/integracion/','Identidad y Host','Identity and Host'],
  ['/docs/player/','Player para aplicaciones','Player integration'],
  ['/docs/conectores/lti/','LTI 1.3 y LMS','LTI 1.3 and LMS'],
  ['/docs/analytics/','Analytics y seguridad','Analytics and security'],
  ['/docs/progresion/','Reglas de progresión','Progression rules'],
  ['/docs/metricas/','Datos y métricas','Data and metrics'],
  ['/docs/referencia/','Referencia de API','API reference'],
  ['/docs/','Guías para profesores','Teacher guides'],
];
const teacherDocPaths=new Set([
  '/docs/','/docs/empezar/','/docs/empezar-facil/',
  '/docs/studio/','/docs/entrega-offline/','/docs/ejemplos/',
  '/docs/colaboracion/','/docs/juegos-3d/',
]);
const staticDocSidebar=(english,relativePath)=>{
  const route='/'+(relativePath.endsWith('index.html')?relativePath.slice(0,-'index.html'.length):relativePath);
  const normalized=route.endsWith('/')?route:route+'/';
  const spanish=english?spanishRouteFor(normalized):normalized;
  const teacher=teacherDocPaths.has(spanish)||spanish.startsWith('/docs/questionnaires/');
  const sections=teacher?teacherDocSections:developerDocSections;
  const heading=teacher?(english?'Teacher guides':'Guías para profesores')
    :(english?'Developer guides':'Guías para desarrolladores');
  const links=sections.map(([path,es,en])=>
    '<a href="'+(english?englishRouteFor(path):path)+'">'+(english?en:es)+'</a>').join('');
  return '<aside class="doc-sidebar" aria-label="'+(english?'Documentation navigation':'Navegación de documentación')+'">'+
    '<span>'+heading+'</span><nav class="doc-fallback-nav" aria-label="'+heading+'">'+links+'</nav></aside>';
};
const docsHtmlFilesForSidebar = htmlFiles.filter((path)=>{
  const rel=relative(outputRoot,path).replaceAll('\\','/');
  return rel.startsWith('docs/')||rel.startsWith('en/docs/');
});
const sidebarProblems = [];
for (const htmlPath of docsHtmlFilesForSidebar) {
  let html = await readFile(htmlPath,'utf8');
  const matches = [...html.matchAll(/<aside\s+class=["']doc-sidebar["'][^>]*>[\s\S]*?<\/aside>/gi)];
  if (matches.length !== 1) {
    sidebarProblems.push(relative(outputRoot,htmlPath).replaceAll('\\','/') + ': expected exactly one .doc-sidebar');
    continue;
  }
  const english=relative(outputRoot,htmlPath).replaceAll('\\','/').startsWith('en/');
  const rel=relative(outputRoot,htmlPath).replaceAll('\\','/');
  html = html.replace(/<aside\s+class=["']doc-sidebar["'][^>]*>[\s\S]*?<\/aside>/i,staticDocSidebar(english,rel));
  await writeFile(htmlPath,html);
}
for (const htmlPath of docsHtmlFilesForSidebar) {
  const html = await readFile(htmlPath,'utf8');
  const sidebar = /<aside\s+class=["']doc-sidebar["'][^>]*>([\s\S]*?)<\/aside>/i.exec(html);
  const rel=relative(outputRoot,htmlPath).replaceAll('\\','/');
  if (!sidebar) {
    sidebarProblems.push(rel + ': sidebar missing after normalization');
  } else if (!sidebar[1].includes('class="doc-fallback-nav"') ||
      (sidebar[1].match(/<a\s+href=/g)||[]).length!==
        (staticDocSidebar(rel.startsWith('en/'),rel).match(/<a\s+href=/g)||[]).length) {
    sidebarProblems.push(rel + ': static navigation fallback missing or incomplete');
  }
  const expectedScript=rel.startsWith('en/')?'/en/p2lrn.js':'/p2lrn.js';
  const hasScript=html.includes('src="'+expectedScript)||html.includes("src='"+expectedScript);
  if (!hasScript) sidebarProblems.push(rel + ': shared '+expectedScript+' missing');
}
if (sidebarProblems.length) {
  throw new Error('Documentation sidebar normalization failed:\n' + sidebarProblems.join('\n'));
}

// The distribution and Windows localhost use the same content revision
// implementation, preventing different browser module graphs across deployments.
const {runtimeRevision}=await reviseSiteBrowserAssets({siteRoot:outputRoot,htmlFiles});
// Keep the production CSP strict, while allowing only the known sandbox
// bootstraps. The import-map CSP hash above must be finalized first.
await authorizeOpaqueRuntimeBootstraps({outputRoot});

// Validate the compiled output here, not in the source-only browser fixture.
// All mutable transitive modules and CSS must use the same content revision.
const revisionedDemoHtml = await readFile(join(outputRoot,'demo','index.html'),'utf8');
const revisionedStudioHtml = await readFile(join(outputRoot,'studio','index.html'),'utf8');
for (const [html,label,expected] of [
  [revisionedDemoHtml,'Player entrypoint','src="/player/current/dist/p2lrn.js?v='+runtimeRevision+'"'],
  [revisionedDemoHtml,'Viewer entrypoint','src="/demo/viewer.js?v='+runtimeRevision+'"'],
  [revisionedStudioHtml,'Studio entrypoint','src="/studio/studio.js?v='+runtimeRevision+'"'],
  [revisionedStudioHtml,'Studio stylesheet','href="/studio/studio.css?v='+runtimeRevision+'"'],
]) {
  if (!html.includes(expected)) throw new Error('Missing built asset revision for '+label);
}
for (const [html,label] of [[revisionedDemoHtml,'Player'],[revisionedStudioHtml,'Studio']]) {
  if (!html.includes('<script type="importmap">')) {
    throw new Error('Missing '+label+' browser import map for mutable ES modules');
  }
}
for (const path of [
  '/player/current/dist/p2lrn-player.js',
  '/player/current/dist/renderers/questionnaire-rosco.js',
  '/player/current/dist/renderers/game-common.js',
]) {
  if (!revisionedDemoHtml.includes(JSON.stringify(path+'?v='+runtimeRevision))) {
    throw new Error('Mixed versions in Player browser module graph: '+path);
  }
}
if (!revisionedStudioHtml.includes(JSON.stringify('/studio/runtime/authoring-document.js?v='+runtimeRevision))) {
  throw new Error('Missing versioned Studio authoring module');
}

// Render one consistent public footer into every site page. Only replace a
// footer after </main>: Studio also contains a form's <footer> INSIDE <main>,
// which must keep its buttons and must NEVER receive legal/navigation links.
const footerSamples=[renderSiteFooter('es'),renderSiteFooter('en')];
for(const footer of footerSamples){
  if(footer.includes('site-footer__brand-mark" aria-hidden="true">P2</span>'))
    throw new Error('Shared footer still contains the legacy P2 badge');
  if(!footer.includes('<span class="site-footer__brand-mark" aria-hidden="true"></span>'))
    throw new Error('Shared footer is missing the unified P2LRN brand mark slot');
}
let publicFooterPages=0;
for(const htmlPath of htmlFiles){
  let html=await readFile(htmlPath,'utf8');
  const rel=relative(outputRoot,htmlPath).replaceAll('\\','/');
  const locale=rel.startsWith('en/')?'en':'es';
  const publicFooter=renderSiteFooter(locale);
  const mainEnd=html.toLowerCase().lastIndexOf('</main>');
  if(mainEnd<0)continue;
  const footers=[...html.matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi)];
  if(!footers.length)continue;
  const pageFooters=footers.filter(match=>match.index>mainEnd);
  if(pageFooters.length!==1)
    throw new Error('Expected exactly one page footer after </main>: '+rel);
  const target=pageFooters[0];
  html=html.slice(0,target.index)+publicFooter+html.slice(target.index+target[0].length);
  if((html.match(/class="site-footer"/g)||[]).length!==1)
    throw new Error('Duplicate or missing shared page footer: '+rel);
  for(const href of getSiteFooterLinks(locale)){
    if(!publicFooter.includes('href="'+href+'"'))
      throw new Error('Shared '+locale+' footer is missing an expected destination: '+href);
  }
  await writeFile(htmlPath,html);
  publicFooterPages++;
}
const minimumFooterPages=bilingualSite?80:40;
if(publicFooterPages<minimumFooterPages)throw new Error(
  'Shared website footer not installed on enough public pages: '+publicFooterPages+' < '+minimumFooterPages);

const studioFooterPaths=[['studio','index.html']];
if(bilingualSite)studioFooterPaths.push(['en','studio','index.html']);
for(const pathParts of studioFooterPaths){
  const studioFooterHtml=await readFile(join(outputRoot,...pathParts),'utf8');
  const studioActionFooter=/<footer\s+class="studio-offline-actions"[^>]*>[\s\S]*?<\/footer>/i.exec(studioFooterHtml)?.[0];
  if(!studioActionFooter||!studioActionFooter.includes('data-offline-generate')||
     studioActionFooter.includes('data-legal-links')||
     (studioFooterHtml.match(/class="site-footer"/g)||[]).length!==1)
    throw new Error('Studio actions footer was modified or the public footer is missing: '+pathParts.join('/'));
}

const requiredLegalRoutes = [
  ['aviso-legal','Aviso legal y uso del sitio web de P2LRN'],
  ['terminos','Términos y condiciones | P2LRN'],
  ['cookies','Política de cookies | P2LRN'],
  ['privacidad','Política de privacidad | P2LRN'],
  ['licencia','Licencias y condiciones de uso de P2LRN'],
];
const legalProblems = [];
const forbiddenLegalPlaceholders = /(?:\[PENDIENTE(?:[^\]]*)?\]|TODO\s*[:\[-]\s*(?:LEGAL|REPLACE|CONFIRM|FILL)|FIXME\s*[:\[-]\s*(?:LEGAL|REPLACE|CONFIRM|FILL)|YOUR COMPANY|COMPANY NAME|example@example\.com)/i;
for (const [slug,expectedTitle] of requiredLegalRoutes) {
  const path = join(outputRoot,slug,'index.html');
  if (!(await exists(path))) { legalProblems.push('/' + slug + '/ missing'); continue; }
  const html = await readFile(path,'utf8');
  if (!html.includes('<title>' + expectedTitle + '</title>')) legalProblems.push('/' + slug + '/ title');
  if (!/<meta\s+name="description"\s+content="[^"]+"/i.test(html)) legalProblems.push('/' + slug + '/ description');
  if (!html.includes('<link rel="canonical" href="https://p2lrn.org/' + slug + '/">')) legalProblems.push('/' + slug + '/ canonical');
  if (!html.includes('name="robots" content="'+(slug==='licencia'?'index,follow':'noindex,follow')+'"')) legalProblems.push('/' + slug + '/ robots');
  if (!html.includes('property="og:title"') || !html.includes('property="og:description"')) legalProblems.push('/' + slug + '/ OpenGraph');
  if (forbiddenLegalPlaceholders.test(html)) legalProblems.push('/' + slug + '/ placeholder');
}
if(bilingualSite){
  for(const [slug] of requiredLegalRoutes){
    const englishLegalRoute=englishRouteFor('/'+slug+'/');
    const path=join(outputRoot,...englishLegalRoute.slice(1).split('/').filter(Boolean),'index.html');
    if(!(await exists(path))){legalProblems.push('/en/'+slug+'/ missing');continue;}
    const html=await readFile(path,'utf8');
    if(!/<html\b[^>]*\blang=["']en["']/i.test(html))legalProblems.push('/en/'+slug+'/ lang');
    if(!/<title>[^<]+<\/title>/i.test(html))legalProblems.push('/en/'+slug+'/ title');
    if(!/<meta\s+name="description"\s+content="[^"]+"/i.test(html))legalProblems.push('/en/'+slug+'/ description');
    if(!html.includes('<link rel="canonical" href="https://p2lrn.org'+englishLegalRoute+'">'))legalProblems.push('/en/'+slug+'/ canonical');
    if(!html.includes('name="robots" content="'+(slug==='licencia'?'index,follow':'noindex,follow')+'"'))legalProblems.push('/en/'+slug+'/ robots');
    if(!html.includes('property="og:title"')||!html.includes('property="og:description"'))legalProblems.push('/en/'+slug+'/ OpenGraph');
    if(forbiddenLegalPlaceholders.test(html))legalProblems.push('/en/'+slug+'/ placeholder');
  }
}
if (legalProblems.length) {
  throw new Error('Legal publication gate failed:\\n' + legalProblems.join('\\n'));
}

const [repositoryLicense,publishedLicense,publishedNotice,licensePageHtml] = await Promise.all([
  readFile(join(root,'LICENSE'),'utf8'),
  readFile(join(outputRoot,'LICENSE'),'utf8'),
  readFile(join(outputRoot,'NOTICE.md'),'utf8'),
  readFile(join(outputRoot,'licencia','index.html'),'utf8'),
]);
if (repositoryLicense !== publishedLicense) {
  throw new Error('Published /LICENSE is not byte-identical to the repository LICENSE authority.');
}
if (!publishedNotice.includes('P2LRN-NCSL 1.0')) {
  throw new Error('Published NOTICE.md does not identify P2LRN-NCSL 1.0.');
}
for (const required of ['P2LRN-NCSL 1.0','Anexo A','href="/LICENSE"','/player/current/source/']) {
  if (!licensePageHtml.includes(required)) {
    throw new Error('License page is missing required authority/source marker: ' + required);
  }
}
if (/github\.com\/josemarcosfrodo\/p2lrn\/blob\/main\/LICENSE/i.test(licensePageHtml)) {
  throw new Error('License page must not depend on a private GitHub URL for the legal authority.');
}

const publicationIndex = JSON.parse(await readFile(join(outputRoot,'index.json'),'utf8'));
for (const channel of [String(publicationIndex?.player?.version ?? ''), 'current']) {
  const sourceRoot = join(outputRoot,'player',channel,'source');
  const sourceManifestPath = join(sourceRoot,'SOURCE-MANIFEST.json');
  if (!(await exists(sourceManifestPath))) {
    throw new Error('Corresponding Source manifest is missing: ' + sourceManifestPath);
  }
  const sourceManifest = JSON.parse(await readFile(sourceManifestPath,'utf8'));
  if (sourceManifest?.license?.id !== 'P2LRN-NCSL-1.0') {
    throw new Error('Corresponding Source manifest has the wrong license id: ' + channel);
  }
  if (!Array.isArray(sourceManifest?.files) || sourceManifest.files.length < 1) {
    throw new Error('Corresponding Source manifest has no file inventory: ' + channel);
  }
  for (const entry of sourceManifest.files) {
    const target = join(sourceRoot,...String(entry.path).split('/'));
    const bytes = await readFile(target);
    const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    if (digest !== entry.sha256 || bytes.byteLength !== Number(entry.bytes)) {
      throw new Error('Corresponding Source integrity mismatch: ' + channel + '/' + entry.path);
    }
  }
  if (!(await exists(join(sourceRoot,'index.html')))) {
    throw new Error('Corresponding Source browser index is missing: ' + channel);
  }
}

// Documentation regression gates. These keep the portal aligned with the real
// package surface instead of relying on a second hand-maintained checklist.
const repeatedForms = [];
for (const htmlPath of htmlFiles) {
  const rel = relative(outputRoot,htmlPath).replaceAll('\\','/');
  const html = await readFile(htmlPath,'utf8');
  for (const match of html.matchAll(/<form\b[^>]*>/gi)) {
    if (rel === 'contacto/index.html'||rel === 'en/contact/index.html') continue;
    // Studio's offline assignment form is local-only and has no network action.
    if ((rel === 'studio/index.html'||rel === 'en/studio/index.html') && /\bdata-offline-form(?:\s|=|>)/i.test(match[0]) && !/\baction\s*=/i.test(match[0])) continue;
    repeatedForms.push(rel);
  }
}
if (repeatedForms.length) {
  throw new Error('Documentation forms must be centralized in /contacto/:\\n' + repeatedForms.join('\\n'));
}

const questionnaireSlugs = [
  'standard','memory','matching','ordering','classification',
  'true-false','word-search','crossword','rosco','3d',
];
const missingQuestionnaireArtifacts = [];
for (const slug of questionnaireSlugs) {
  const doc = join(outputRoot,'docs','questionnaires',slug,'index.html');
  const pkg = join(outputRoot,'examples','generated','questionnaire-' + slug + '.p2lrn');
  if (!(await exists(doc))) missingQuestionnaireArtifacts.push('/docs/questionnaires/' + slug + '/');
  if (!(await exists(pkg))) missingQuestionnaireArtifacts.push('/examples/generated/questionnaire-' + slug + '.p2lrn');
}
if (missingQuestionnaireArtifacts.length) {
  throw new Error('Questionnaire documentation/example gate failed:\\n' + missingQuestionnaireArtifacts.join('\\n'));
}

const cliHtmlPath = join(outputRoot,'docs','cli','index.html');
const cliHtml = await readFile(cliHtmlPath,'utf8');
const toolkitPackage = JSON.parse(await readFile(join(root,'packages','toolkit','package.json'),'utf8'));
const nonEndUserBins = new Set([
  'p2lrn-rebuild-examples',
  'p2lrn-build-web-sdk',
  'p2lrn-build-advanced-example',
]);
const undocumentedBins = Object.keys(toolkitPackage.bin ?? {}).filter((name)=>!nonEndUserBins.has(name) && !cliHtml.includes(name));
if (undocumentedBins.length) {
  throw new Error('CLI reference is missing published bins: ' + undocumentedBins.join(', '));
}

const multipartMetadataPath = join(outputRoot,'examples','multipart-demo','metadata.json');
const multipartMetadata = JSON.parse(await readFile(multipartMetadataPath,'utf8'));
if (!Array.isArray(multipartMetadata.parts) || multipartMetadata.parts.length < 2) {
  throw new Error('Multipart documentation fixture must publish at least two parts.');
}
for (const part of multipartMetadata.parts) {
  const partPath = join(outputRoot,'examples','multipart-demo',String(part.href));
  if (!(await exists(partPath))) throw new Error('Multipart documentation part is missing: ' + part.href);
  const info = await stat(partPath);
  if (info.size !== Number(part.size)) {
    throw new Error('Multipart documentation part size mismatch: ' + part.href);
  }
}

const connectorDownloadManifest=JSON.parse(await readFile(join(outputRoot,'downloads','manifest.json'),'utf8'));
const requiredConnectorZips=['p2lrn-conector-mcp.zip','p2lrn-lti-contratos.zip'];
if(!Array.isArray(connectorDownloadManifest.artifacts) ||
   connectorDownloadManifest.artifacts.length!==requiredConnectorZips.length)
  throw new Error('Connector downloads manifest is incomplete');
for(const name of requiredConnectorZips){
  const artifact=connectorDownloadManifest.artifacts.find(item=>item.file===name);
  const bytes=await readFile(join(outputRoot,'downloads',name));
  if(!artifact||artifact.path!=='/downloads/'+name||artifact.bytes!==bytes.length||
    artifact.members<3||artifact.sha256!==createHash('sha256').update(bytes).digest('hex')||
    bytes.subarray(0,4).toString('hex')!=='504b0304')
    throw new Error('Connector downloadable archive is missing or corrupt: '+name);
}

// Canonical documentation: one AI guide, one LMS guide, one LTI guide.
// Old AI URLs redirect to specific sections rather than creating orphan pages.
const connectorDocs = [
  ['', ['Conectores e integración', 'Conectores para IA', 'Plataformas LMS', 'LTI 1.3']],
  ['ia', ['Conectores para IA', 'ChatGPT', 'Claude', 'Gemini', 'Grok', 'P2LRN – Crear y descargar', 'p2lrn_list_courses']],
  ['lms', ['Moodle', 'Canvas', 'Sakai', 'Chamilo', 'Open edX']],
  ['lti', ['OIDC', 'JWKS', 'Deep Linking', 'AGS', 'NRPS 2.0', '/lti/runtime/nrps/memberships', 'Comprobación antes del despliegue', 'instalación y versión']],
];
const legacyConnectorSections = new Map([
  ['gemini','gemini'],
  ['skills','crear-cursos'],
  ['local','conectar-ordenador'],
]);
const [connectorNavigation,connectorSitemap,connectorHome,connectorAiPage,netlifyConfig] = await Promise.all([
  readFile(join(outputRoot,'p2lrn.js'),'utf8'),
  readFile(join(outputRoot,'sitemap.xml'),'utf8'),
  readFile(join(outputRoot,'docs','conectores','index.html'),'utf8'),
  readFile(join(outputRoot,'docs','conectores','ia','index.html'),'utf8'),
  readFile(join(root,'netlify.toml'),'utf8'),
]);
for(const [slug,required] of connectorDocs) {
  const route='/docs/conectores/' + (slug ? slug+'/' : '');
  const html=await readFile(join(outputRoot,'docs','conectores',...(slug?[slug]:[]),'index.html'),'utf8');
  if(!html.includes('class="doc-content"') ||
     (html.match(/<section\b[^>]*class="doc-section"[^>]*>/g)||[]).length<3)
    throw new Error('Canonical connector page structure missing: '+route);
  for(const term of required)if(!html.toLocaleLowerCase('es').includes(term.toLocaleLowerCase('es')))
    throw new Error('Canonical connector page missing '+term+' in '+route);
  if(!connectorNavigation.includes("['"+route+"','"))
    throw new Error('Sidebar must include '+route);
  if(slug && !connectorHome.includes('href="'+route+'"'))
    throw new Error('Connector overview missing '+route);
  if(!connectorSitemap.includes('https://p2lrn.org'+route))
    throw new Error('Canonical connector sitemap route missing '+route);
}
const netlifyRedirects=netlifyConfig.split('[[redirects]]').slice(1);
for(const [slug,section] of legacyConnectorSections){
  const route='/docs/conectores/'+slug+'/';
  const target='/docs/conectores/ia/#'+section;
  const oldHtml=await readFile(join(outputRoot,'docs','conectores',slug,'index.html'),'utf8');
  if(!oldHtml.includes('content="0;url='+target+'"') ||
     !oldHtml.includes('name="robots" content="noindex,follow"'))
    throw new Error('Old connector route must redirect to canonical section: '+route);
  if(!netlifyRedirects.some(block=>block.includes('from = "'+route+'"') &&
      block.includes('to = "'+target+'"') && block.includes('status = 301') &&
      block.includes('force = true')))
    throw new Error('Netlify redirect to canonical AI section missing: '+route);
  if(connectorSitemap.includes('https://p2lrn.org'+route))
    throw new Error('Obsolete guide must not remain in sitemap: '+route);
  if(connectorNavigation.includes("['"+route+"','"))
    throw new Error('Obsolete guide must not be shown as its own sidebar item: '+route);
  if(!connectorAiPage.includes('id="'+section+'"'))
    throw new Error('Obsolete guide redirect target missing from canonical AI guide: '+section);
}
// Documentation headings and page TOC are now derived from real H2 elements at runtime.
if(!connectorNavigation.includes("const headings = [...docArticle.querySelectorAll('.doc-section > h2')]") ||
   !connectorNavigation.includes("a.href='#'+heading.id"))
  throw new Error('Dynamic documentation table of contents is missing');
for(const section of ['para-que','crear-cursos','chatgpt','claude','gemini','grok','conectar-ordenador','servicios-web','comprobar'])
  if(!connectorAiPage.includes('<section class="doc-section" id="'+section+'"'))
    throw new Error('Canonical AI guide is missing the real section: '+section);
const expectedDownloads=[
  ['ia','p2lrn-conector-mcp.zip'],
  ['lms','p2lrn-lti-contratos.zip'],
  ['lti','p2lrn-lti-contratos.zip'],
];
for(const [slug,filename] of expectedDownloads){
  const guide=await readFile(join(outputRoot,'docs','conectores',slug,'index.html'),'utf8');
  if(!guide.includes('href="/downloads/'+filename+'"'))
    throw new Error('Canonical connector guide does not link verified archive: '+slug);
}
if((connectorHome.match(/<div class="docs-path-grid">[\s\S]*?<\/div>/)?.[0].match(/<a href=/g)||[]).length!==3)
  throw new Error('Connector overview must contain only IA, LMS and LTI choices');

const isLegacyConnectorDoc=(rel,prefix='')=>[...legacyConnectorSections.keys()].some(slug=>
  rel===prefix+'docs/conectores/'+slug+'/index.html');
const spanishDocsFiles=htmlFiles.filter((path)=>{
  const rel=relative(outputRoot,path).replaceAll('\\','/');
  return rel.startsWith('docs/')&&!isLegacyConnectorDoc(rel);
});
const englishDocsFiles=htmlFiles.filter((path)=>{
  const rel=relative(outputRoot,path).replaceAll('\\','/');
  return rel.startsWith('en/docs/')&&!isLegacyConnectorDoc(rel,'en/');
});
const docsFiles=[...spanishDocsFiles,...englishDocsFiles];

async function buildSearchIndex(paths,locale){
  const searchIndex=[];
  for(const path of paths){
    const html=await readFile(path,'utf8');
    const title=stripTags(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]??'');
    const description=/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html)?.[1]??'';
    const headings=[...html.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(match=>stripTags(match[2])).filter(Boolean);
    const code=[...html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/gi)].map(match=>stripTags(match[1])).join(' ');
    searchIndex.push({
      title:title.replace(/\s*[—-]\s*P2LRN\s*$/i,'')||headings[0]||pageUrl(path),
      description,
      section:headings.slice(0,4).join(' · '),
      url:pageUrl(path),
      search:[title,description,headings.join(' '),code].join(' ').toLocaleLowerCase(locale),
    });
  }
  searchIndex.sort((a,b)=>a.title.localeCompare(b.title,locale));
  return searchIndex;
}
const spanishSearchIndex=await buildSearchIndex(spanishDocsFiles,'es');
await writeFile(join(outputRoot,'search-index.json'),JSON.stringify(spanishSearchIndex,null,2)+'\n');
let englishSearchIndex=[];
if(bilingualSite){
  englishSearchIndex=await buildSearchIndex(englishDocsFiles,'en');
  await mkdir(join(outputRoot,'en'),{recursive:true});
  await writeFile(join(outputRoot,'en','search-index.json'),JSON.stringify(englishSearchIndex,null,2)+'\n');
}

async function exists(path) {
  try { return (await stat(path)).isFile(); }
  catch { return false; }
}
// QA fixtures are used to verify questionnaire and multipart functionality during the build,
// but only imported SCORM and QTI packages are distributed on the public site.
for(const example of documentationExamples){
  if(example.category==='generated-external')continue;
  if(!example.url.startsWith('/examples/'))throw new Error('Invalid QA example path');
  const parts=example.url.slice('/examples/'.length).split('/');
  if(parts.some((part)=>!part||part==='.'||part==='..'))throw new Error('Unsafe QA example path');
  await rm(join(examplesOutput,...parts),{force:true});
}
await rm(join(examplesOutput,'multipart-demo'),{recursive:true,force:true});
// Release gate: refuse to publish any native course or previously removed test course.
const expectedPublicCoursePaths = new Set([
  ...canonicalEntries.map((entry)=>entry.url),
  ...generatedEntries.map((entry)=>entry.url),
]);
const actuallyPublishedCourses = (await walk(examplesOutput))
  .filter((path)=>path.endsWith('.p2lrn')||path.endsWith('.p2rln'))
  .map((path)=>'/examples/'+relative(examplesOutput,path).replaceAll('\\','/'));
const unauthorizedCourses=actuallyPublishedCourses.filter((url)=>!expectedPublicCoursePaths.has(url));
if(unauthorizedCourses.length||actuallyPublishedCourses.length!==expectedPublicCoursePaths.size){
  throw new Error('Public course allowlist mismatch: '+JSON.stringify({unauthorizedCourses,actuallyPublishedCourses,expected:[...expectedPublicCoursePaths]}));
}
const broken = [];
const refPattern = /\b(?:href|src)=["']([^"']+)["']/gi;
for (const path of htmlFiles) {
  const html = await readFile(path,'utf8');
  // Code samples intentionally contain href/src examples that are not site navigation.
  const navigableHtml = html
    .replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi,'')
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi,'');
  for (const match of navigableHtml.matchAll(refPattern)) {
    const raw = match[1];
    if (!raw || raw.startsWith('#') || /^(?:https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(raw)) continue;
    const clean = raw.split('#',1)[0].split('?',1)[0];
    if (!clean) continue;
    let target = clean.startsWith('/') ? join(outputRoot,...clean.slice(1).split('/')) : resolve(dirname(path),clean);
    if (clean.endsWith('/')) target = join(target,'index.html');
    else if (!(await exists(target))) {
      try { if ((await stat(target)).isDirectory()) target = join(target,'index.html'); } catch {}
    }
    if (!(await exists(target))) broken.push(relative(outputRoot,path).replaceAll('\\','/') + ' -> ' + raw);
  }
}
if (broken.length) throw new Error('Documentation contains broken local links/assets:\n' + broken.slice(0,100).join('\n'));

console.log(JSON.stringify({
  ok:true,
  site:'P2LRN documentation portal',
  pages:htmlFiles.length,
  searchableDocs:docsFiles.length,
  spanishSearchableDocs:spanishSearchIndex.length,
  englishSearchableDocs:englishSearchIndex.length,
  linksValidated:true,
  canonicalExamples:canonicalEntries.length,
  generatedExamples:generatedEntries.length,
  exampleCatalog:'/examples/catalog.json',
  questionnaireDocs:questionnaireSlugs.length,
  contactFormsCentralized:true,
  cliBinsDocumented:Object.keys(toolkitPackage.bin ?? {}).length,
  multipartParts:multipartMetadata.parts.length,
  connectorDocPages:connectorDocs.length,
},null,2));
