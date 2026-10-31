import {createHash} from 'node:crypto';
import {cp, copyFile, mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {dirname, join, relative, resolve} from 'node:path';
import {openP2LRNPackageBytes} from '../../packages/toolkit/web/p2lrn-player.js';
import {buildDocExamples} from './build-doc-examples.mjs';
import {STUDIO_RUNTIME_SHARED_FILES} from './studio-runtime-assets.mjs';
import {reviseSiteBrowserAssets} from './browser-site-revision.mjs';
import {renderSiteFooter,getSiteFooterLinks} from './site-footer.mjs';
import {normalizeSeoAndAccessibility} from './site-seo-a11y.mjs';

const root = resolve(process.cwd());
await import('./build-cdn.mjs');

const siteRoot = join(root,'deploy','netlify','site');
const outputRoot = join(root,'.netlify-cdn');
await cp(siteRoot,outputRoot,{recursive:true,force:true});
// Publish the same native executable reviewed by the Windows offline exporter.
await import('./build-offline-executable.mjs');
// The web build publishes real, inspectable connector ZIPs from this same source.
await import('./build-connector-downloads.mjs');
// Deterministic downloadable P2LRN Skills for four AI platforms.
await import('./build-skill-downloads.mjs');
await copyFile(join(outputRoot,'player','current','dist','p2lrn-sw.js'),join(outputRoot,'p2lrn-sw.js'));
await cp(join(root,'packages','toolkit','web','studio'),join(outputRoot,'studio','runtime'),{recursive:true,force:true});
for(const file of STUDIO_RUNTIME_SHARED_FILES){
  await copyFile(join(root,'packages','toolkit','web',file),join(outputRoot,'studio',file));
}

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
await mkdir(examplesOutput,{recursive:true});
const canonicalSource = join(root,'examples','canonical');
const canonicalOutput = join(examplesOutput,'canonical');
await cp(canonicalSource,canonicalOutput,{recursive:true,force:true});

// Preserve the old short URLs while publishing the complete canonical corpus.
for (const entry of await readdir(canonicalSource,{withFileTypes:true})) {
  if (entry.isFile() && entry.name.endsWith('.p2lrn')) {
    const source = join(canonicalSource,entry.name);
    const destination = join(examplesOutput,entry.name);
    await copyFile(source,destination);
    const [sourceBytes,publishedBytes] = await Promise.all([readFile(source),readFile(destination)]);
    if (!sourceBytes.equals(publishedBytes)) throw new Error(`Published short example differs from canonical bytes: ${entry.name}`);
    await inspectPackage(destination);
  }
}
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
const canonicalEntries = [];
for (const path of (await walk(canonicalSource)).filter((item)=>item.endsWith('.p2lrn')).sort()) {
  const rel = relative(canonicalSource,path).replaceAll('\\','/');
  const publishedPath = join(canonicalOutput,...rel.split('/'));
  const [sourceBytes,publishedBytes] = await Promise.all([readFile(path),readFile(publishedPath)]);
  if (!sourceBytes.equals(publishedBytes)) throw new Error(`Published canonical example differs byte-for-byte from source: ${rel}`);
  const inspected = await inspectPackage(publishedPath);
  canonicalEntries.push({
    title:canonicalDisplayTitles[rel] ?? inspected.title,
    category:rel.startsWith('external/') ? 'canonical-external' : rel.startsWith('aulap2p-reader/') ? 'canonical-reader' : 'canonical',
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

const generatedEntries = await buildDocExamples({outputRoot:examplesOutput});
const requiredExecutableExamples = ['scorm12-browser-demo.p2lrn','qti3-interactive-demo.p2lrn'];
for (const name of requiredExecutableExamples) {
  const demoPath = join(examplesOutput,'generated',name);
  if (!(await exists(demoPath))) throw new Error('Executable documentation example is missing: ' + name);
  await inspectPackage(demoPath);
}
const verifiedDefaultViewerExample=canonicalEntries.find((example)=>example.url==='/examples/canonical/creator-course.p2lrn');
if(!verifiedDefaultViewerExample)throw new Error('The public viewer default must be a verified local playable package.');
// Preserve the documented quickstart download without editing its documentation page.
const quickstartPath=join(examplesOutput,'quickstart.p2lrn');
const quickstartSource=join(canonicalSource,'creator-course.p2lrn');
await copyFile(quickstartSource,quickstartPath);
const [quickstartBytes,quickstartOriginal]=await Promise.all([readFile(quickstartPath),readFile(quickstartSource)]);
if(!quickstartBytes.equals(quickstartOriginal))throw new Error('Quickstart compatibility example differs from verified course');
await inspectPackage(quickstartPath);
const catalog = {
  defaultExample:verifiedDefaultViewerExample.url,
  schema:'https://p2lrn.org/schema/docs-example-catalog/1',
  version:'1',
  examples:[...canonicalEntries,...generatedEntries],
};
await writeFile(join(examplesOutput,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');

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
  return /^player\/(?:current|[^/]+)\/source\//u.test(rel);
}
// CDN release files are immutable distribution artifacts, not public website
// pages. Adding brand HTML to them after release.json is generated invalidates
// their byte counts and SHA-256 digests, breaking offline exports.
function isImmutableDistributionHtml(path) {
  const rel=relative(outputRoot,path).replaceAll('\\','/');
  return /^(?:player|studio|analytics)\/(?:current|[^/]+)\/dist\//u.test(rel);
}
const allHtmlFiles = (await walk(outputRoot)).filter((path)=>path.endsWith('.html'));
// Google Search Console HTML ownership tokens must be served byte-for-byte from the root,
// not rewritten as normal public HTML pages.
const htmlFiles = allHtmlFiles.filter((path)=>!isCorrespondingSourcePath(path)
  && !isImmutableDistributionHtml(path)
  && !/^google[0-9a-f]+\.html$/i.test(relative(outputRoot,path).replaceAll('\\','/')));
const bilingualSite=htmlFiles.some(path=>relative(outputRoot,path).replaceAll('\\','/').startsWith('en/'));

const productionPublicVersion = JSON.parse(await readFile(join(root,'packages','player','package.json'),'utf8')).version;
const brandHeadFor=(locale='es')=>[
  '<link rel="icon" type="image/png" sizes="96x96" href="/favicon.png?v=p2lrn-brand-20261027-v3">',
  '<link rel="shortcut icon" type="image/png" href="/favicon.png?v=p2lrn-brand-20261027-v3">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=p2lrn-brand-20261027-v3">',
  '<link rel="manifest" href="'+(locale==='en'?'/en/site.webmanifest':'/site.webmanifest')+'">',
  '<meta property="og:image" content="https://p2lrn.netlify.app/p2lrn-mark.png?v=p2lrn-brand-20261027-v3">',
  '<meta name="twitter:image" content="https://p2lrn.netlify.app/p2lrn-mark.png?v=p2lrn-brand-20261027-v3">'
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
  if (!html.includes('/favicon.png?v=p2lrn-brand-20261027-v3')) {
    html = html.replace(/<\/head>/i,brandHeadFor(pageLocale) + '</head>');
  }
  await writeFile(htmlPath,html);
}
// Only mutate outputRoot. Keep all 57 authored documentation pages unchanged.
const seoAudit=await normalizeSeoAndAccessibility(outputRoot,{sourceRoot:siteRoot});
console.log('P2LRN_BUILD_SEO='+JSON.stringify(seoAudit));

const englishRouteFor=(route)=>route==='/'?'/en/':'/en'+route;
const spanishRouteFor=(route)=>route==='/en/'?'/':route.replace(/^\/en/,'')||'/';
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
      '<a href="'+esRoute+'" lang="es" hreflang="es"'+(english?'':' aria-current="page"')+'>ES</a>'+
      '<a href="'+enRoute+'" lang="en" hreflang="en"'+(english?' aria-current="page"':'')+'>EN</a>'+
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
if(bilingualSite&&!(await exists(join(outputRoot,'en','site.webmanifest')))
  throw new Error('Missing English web app manifest: /en/site.webmanifest');
for (const htmlPath of htmlFiles) {
  const rel=relative(outputRoot,htmlPath).replaceAll('\\','/');
  const html=await readFile(htmlPath,'utf8');
  const manifest=rel.startsWith('en/')?'/en/site.webmanifest':'/site.webmanifest';
  for (const required of ['/favicon.png?v=p2lrn-brand-20261027-v3','/apple-touch-icon.png?v=p2lrn-brand-20261027-v3',manifest]) {
    if (!html.includes(required)) throw new Error('Missing brand metadata in ' + rel + ': ' + required);
  }
  if (html.includes('/p2lrn.css') && !html.includes('/p2lrn.css?v=p2lrn-brand-20261027-v3')) {
    throw new Error('Unversioned brand stylesheet in ' + relative(outputRoot,htmlPath));
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

// Normalize every documentation sidebar in the generated site. Source articles
// may contain historical fallback links, but published HTML must have one empty
// placeholder so p2lrn.js is the sole navigation authority.
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
  const label=english?'Documentation navigation':'Navegación de documentación';
  html = html.replace(/<aside\s+class=["']doc-sidebar["'][^>]*>[\s\S]*?<\/aside>/i,'<aside class="doc-sidebar" aria-label="'+label+'"></aside>');
  await writeFile(htmlPath,html);
}
for (const htmlPath of docsHtmlFilesForSidebar) {
  const html = await readFile(htmlPath,'utf8');
  const sidebar = /<aside\s+class=["']doc-sidebar["'][^>]*>([\s\S]*?)<\/aside>/i.exec(html);
  const rel=relative(outputRoot,htmlPath).replaceAll('\\','/');
  if (!sidebar) {
    sidebarProblems.push(rel + ': sidebar missing after normalization');
  } else if (/<a\b|<span\b|P2LRN_EXTRA_DOC_LINKS/i.test(sidebar[1])) {
    sidebarProblems.push(rel + ': legacy sidebar content survived normalization');
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
  ['aviso-legal','Aviso legal | P2LRN'],
  ['terminos','Términos y condiciones | P2LRN'],
  ['cookies','Política de cookies | P2LRN'],
  ['privacidad','Política de privacidad | P2LRN'],
  ['licencia','Licencia | P2LRN'],
];
const legalProblems = [];
const forbiddenLegalPlaceholders = /(?:\[PENDIENTE(?:[^\]]*)?\]|TODO\s*[:\[-]\s*(?:LEGAL|REPLACE|CONFIRM|FILL)|FIXME\s*[:\[-]\s*(?:LEGAL|REPLACE|CONFIRM|FILL)|YOUR COMPANY|COMPANY NAME|example@example\.com)/i;
for (const [slug,expectedTitle] of requiredLegalRoutes) {
  const path = join(outputRoot,slug,'index.html');
  if (!(await exists(path))) { legalProblems.push('/' + slug + '/ missing'); continue; }
  const html = await readFile(path,'utf8');
  if (!html.includes('<title>' + expectedTitle + '</title>')) legalProblems.push('/' + slug + '/ title');
  if (!/<meta\s+name="description"\s+content="[^"]+"/i.test(html)) legalProblems.push('/' + slug + '/ description');
  if (!html.includes('<link rel="canonical" href="https://p2lrn.netlify.app/' + slug + '/">')) legalProblems.push('/' + slug + '/ canonical');
  if (!/<meta\s+name="robots"\s+content="index,follow"/i.test(html)) legalProblems.push('/' + slug + '/ robots');
  if (!html.includes('property="og:title"') || !html.includes('property="og:description"')) legalProblems.push('/' + slug + '/ OpenGraph');
  if (forbiddenLegalPlaceholders.test(html)) legalProblems.push('/' + slug + '/ placeholder');
}
if(bilingualSite){
  for(const [slug] of requiredLegalRoutes){
    const path=join(outputRoot,'en',slug,'index.html');
    if(!(await exists(path))){legalProblems.push('/en/'+slug+'/ missing');continue;}
    const html=await readFile(path,'utf8');
    if(!/<html\b[^>]*\blang=["']en["']/i.test(html))legalProblems.push('/en/'+slug+'/ lang');
    if(!/<title>[^<]+<\/title>/i.test(html))legalProblems.push('/en/'+slug+'/ title');
    if(!/<meta\s+name="description"\s+content="[^"]+"/i.test(html))legalProblems.push('/en/'+slug+'/ description');
    if(!html.includes('<link rel="canonical" href="https://p2lrn.netlify.app/en/'+slug+'/">'))legalProblems.push('/en/'+slug+'/ canonical');
    if(!/<meta\s+name="robots"\s+content="index,follow"/i.test(html))legalProblems.push('/en/'+slug+'/ robots');
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
for (const required of ['P2LRN-NCSL 1.0','versión 1.0','href="/LICENSE"','/player/current/source/']) {
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
    if (rel === 'contacto/index.html'||rel === 'en/contacto/index.html') continue;
    // Studio's offline assignment form is local-only and has no network action.
    if ((rel === 'studio/index.html'||rel === 'en/studio/index.html') && /\bdata-offline-form(?:\s|>)/i.test(match[0]) && !/\baction\s*=/i.test(match[0])) continue;
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
  ['lti', ['OIDC', 'JWKS', 'Deep Linking', 'AGS', 'NRPS no incluido', 'Comprobación antes del despliegue', 'instalación y versión']],
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
  if(!connectorSitemap.includes('https://p2lrn.netlify.app'+route))
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
  if(connectorSitemap.includes('https://p2lrn.netlify.app'+route))
    throw new Error('Obsolete guide must not remain in sitemap: '+route);
  if(connectorNavigation.includes("['"+route+"','"))
    throw new Error('Obsolete guide must not be shown as its own sidebar item: '+route);
  if(!connectorAiPage.includes('id="'+section+'"'))
    throw new Error('Obsolete guide redirect target missing from canonical AI guide: '+section);
}
for(const section of ['para-que','crear-cursos','chatgpt','claude','gemini','grok','conectar-ordenador','servicios-web','comprobar'])
  if(!connectorAiPage.includes('id="'+section+'"') ||
     !connectorNavigation.includes("['"+section+"','"))
    throw new Error('AI topic must exist in content and sidebar: '+section);
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
