import {cp, copyFile, mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {dirname, join, relative, resolve} from 'node:path';
import {openP2LRNPackageBytes} from '../../packages/toolkit/web/p2lrn-player.js';
import {buildDocExamples} from './build-doc-examples.mjs';

const root = resolve(process.cwd());
await import('./build-cdn.mjs');

const siteRoot = join(root,'deploy','netlify','site');
const outputRoot = join(root,'.netlify-cdn');
await cp(siteRoot,outputRoot,{recursive:true,force:true});
await copyFile(join(outputRoot,'player','current','dist','p2lrn-sw.js'),join(outputRoot,'p2lrn-sw.js'));

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
const catalog = {
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
const htmlFiles = (await walk(outputRoot)).filter((path)=>path.endsWith('.html'));

// Documentation regression gates. These keep the portal aligned with the real
// package surface instead of relying on a second hand-maintained checklist.
const repeatedForms = [];
for (const htmlPath of htmlFiles) {
  const rel = relative(outputRoot,htmlPath).replaceAll('\\','/');
  const html = await readFile(htmlPath,'utf8');
  if (/<form\\b/i.test(html) && rel !== 'contacto/index.html') repeatedForms.push(rel);
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
const undocumentedBins = Object.keys(toolkitPackage.bin ?? {}).filter((name)=>!cliHtml.includes(name));
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

const docsFiles = htmlFiles.filter((path)=>relative(outputRoot,path).replaceAll('\\','/').startsWith('docs/'));
const searchIndex = [];
for (const path of docsFiles) {
  const html = await readFile(path,'utf8');
  const title = stripTags(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  const description = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html)?.[1] ?? '';
  const headings = [...html.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match)=>stripTags(match[2])).filter(Boolean);
  const code = [...html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/gi)].map((match)=>stripTags(match[1])).join(' ');
  searchIndex.push({
    title:title.replace(/\s*[—-]\s*P2LRN\s*$/i,'') || headings[0] || pageUrl(path),
    description,
    section:headings.slice(0,4).join(' · '),
    url:pageUrl(path),
    search:[title,description,headings.join(' '),code].join(' ').toLocaleLowerCase('es'),
  });
}
searchIndex.sort((a,b)=>a.title.localeCompare(b.title,'es'));
await writeFile(join(outputRoot,'search-index.json'),JSON.stringify(searchIndex,null,2)+'\n');

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
  searchableDocs:searchIndex.length,
  linksValidated:true,
  canonicalExamples:canonicalEntries.length,
  generatedExamples:generatedEntries.length,
  exampleCatalog:'/examples/catalog.json',
  questionnaireDocs:questionnaireSlugs.length,
  contactFormsCentralized:true,
  cliBinsDocumented:Object.keys(toolkitPackage.bin ?? {}).length,
  multipartParts:multipartMetadata.parts.length,
},null,2));
