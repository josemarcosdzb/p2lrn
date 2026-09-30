import {cp, copyFile, mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {dirname, join, relative, resolve} from 'node:path';

const root = resolve(process.cwd());
await import('./build-cdn.mjs');

const siteRoot = join(root, 'deploy', 'netlify', 'site');
const outputRoot = join(root, '.netlify-cdn');

await cp(siteRoot, outputRoot, {
  recursive: true,
  force: true,
});

// The static virtual-resource bridge expects its Service Worker at the
// application origin with the canonical /__p2lrn__/ scope.
await copyFile(
  join(outputRoot, 'player', 'current', 'dist', 'p2lrn-sw.js'),
  join(outputRoot, 'p2lrn-sw.js'),
);

const examplesOutput = join(outputRoot, 'examples');
await mkdir(examplesOutput, {recursive:true});

for (const file of [
  'creator-course.p2lrn',
  'web-bundle-course.p2lrn',
  'native-questionnaire-course.p2lrn',
]) {
  await copyFile(
    join(root, 'examples', 'canonical', file),
    join(examplesOutput, file),
  );
}

await cp(
  join(root, 'examples', 'developer-course'),
  join(examplesOutput, 'developer-course'),
  {recursive:true, force:true},
);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function stripTags(value) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function pageUrl(path) {
  const rel = relative(outputRoot, path).replaceAll('\\','/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel;
}

const htmlFiles = (await walk(outputRoot)).filter((path) => path.endsWith('.html'));
const docsFiles = htmlFiles.filter((path) => relative(outputRoot, path).replaceAll('\\','/').startsWith('docs/'));
const searchIndex = [];
for (const path of docsFiles) {
  const html = await readFile(path, 'utf8');
  const title = stripTags(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  const description = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html)?.[1] ?? '';
  const headings = [...html.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => stripTags(match[2])).filter(Boolean);
  const code = [...html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/gi)].map((match) => stripTags(match[1])).join(' ');
  const url = pageUrl(path);
  searchIndex.push({
    title: title.replace(/\s*[—-]\s*P2LRN\s*$/i, '') || headings[0] || url,
    description,
    section: headings.slice(0, 4).join(' · '),
    url,
    search: [title, description, headings.join(' '), code].join(' ').toLocaleLowerCase('es'),
  });
}
searchIndex.sort((a,b) => a.title.localeCompare(b.title, 'es'));
await writeFile(join(outputRoot, 'search-index.json'), JSON.stringify(searchIndex, null, 2) + '\n');

async function exists(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

const broken = [];
const refPattern = /\b(?:href|src)=["']([^"']+)["']/gi;
for (const path of htmlFiles) {
  const html = await readFile(path, 'utf8');
  for (const match of html.matchAll(refPattern)) {
    const raw = match[1];
    if (!raw || raw.startsWith('#') || /^(?:https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(raw)) continue;
    const clean = raw.split('#',1)[0].split('?',1)[0];
    if (!clean) continue;
    let target;
    if (clean.startsWith('/')) {
      const rel = clean.slice(1);
      target = join(outputRoot, ...rel.split('/'));
    } else {
      target = resolve(dirname(path), clean);
    }
    if (clean.endsWith('/')) target = join(target, 'index.html');
    else if (!(await exists(target))) {
      try {
        if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
      } catch {}
    }
    if (!(await exists(target))) broken.push(`${relative(outputRoot,path).replaceAll('\\','/')} -> ${raw}`);
  }
}
if (broken.length) {
  throw new Error('Documentation contains broken local links/assets:\n' + broken.slice(0, 100).join('\n'));
}

console.log(JSON.stringify({
  ok:true,
  site:'P2LRN documentation portal',
  pages:htmlFiles.length,
  searchableDocs:searchIndex.length,
  linksValidated:true,
  viewerExamples:[
    '/examples/creator-course.p2lrn',
    '/examples/web-bundle-course.p2lrn',
    '/examples/native-questionnaire-course.p2lrn',
  ],
}, null, 2));
