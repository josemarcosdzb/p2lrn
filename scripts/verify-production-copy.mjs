import {readFile, readdir, stat} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';
import {canonicalRoute,englishRouteFor} from '../deploy/netlify/site-routes.mjs';

const root=resolve(process.cwd());
const sourceRoot=join(root,'deploy','netlify','site');
const builtRoot=join(root,'.netlify-cdn');

async function walkHtml(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await walkHtml(full));
    else if(entry.isFile()&&entry.name.endsWith('.html'))out.push(full);
  }
  return out;
}
async function exists(path){
  try{return (await stat(path)).isFile();}
  catch{return false;}
}
function visibleText(html){
  return html
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<script\b[\s\S]*?<\/script>/giu,' ')
    .replace(/<style\b[\s\S]*?<\/style>/giu,' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/giu,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/giu,' ')
    .replace(/&amp;/giu,'&')
    .replace(/&quot;/giu,'"')
    .replace(/&#39;|&apos;/giu,"'")
    .replace(/\s+/g,' ')
    .trim();
}

const bannedEverywhere=[
  /documento no definitivo/iu,
  /web auditad[ao]/iu,
  /c[oó]digo auditad[ao]/iu,
  /repositorio auditad[ao]/iu,
  /gate de release/iu,
  /gates separados/iu,
  /\bstaged\b/iu,
  /\bmonorepo\b/iu,
  /sha candidato/iu,
  /github actions/iu,
  /\brunner\b/iu,
  /estado de desarrollo/iu,
  /durante el build del portal/iu,
  /build auditado/iu,
  /pruebas realizadas con el exe/iu,
  /cmd anterior/iu,
  /cmd heredado/iu,
  /el anterior\s+\.cmd/iu,
  /para distribuir exe oficiales en producci[oó]n/iu,
  /publicaci[oó]n oficial de ejecutables windows/iu,
  /signtool\s+verify/iu,
  /requiere firma authenticode posterior/iu,
  /\bpendiente(?:s)?\b/iu,
  /todav[ií]a\s+no/iu,
  /\broadmap\b/iu,
  /\bcommit\s+[0-9a-f]{7,40}\b/iu,
  /\bcommit\s+(?:en|de)\s+(?:main|la\s+rama)\b/iu,
  /\bbranch\b/iu,
  /\brepositorio\b/iu,
  /\bproducci[oó]n\b/iu,
];

const publicBanned=[
  /first-party/iu,
  /\bcheckout\b/iu,
  /\bcors\b/iu,
  /service worker/iu,
  /\bpython\b/iu,
  /\bcli\b/iu,
  /sha-?256/iu,
  /\bnpm\b/iu,
  /\bfixture\b/iu,
  /\bcommit\b/iu,
  /\bbranch\b/iu,
  /\bmonorepo\b/iu,
  /\bstaged\b/iu,
  /\blocalhost\b/iu,
  /127\.0\.0\.1/iu,
];

// Essential product terms are allowed only on the pages that actually explain them.
// The same terms remain prohibited as unexplained jargon on other public pages.
const contextualPublicBanned=[
  {pattern:/\bmcp\b/iu,allowed:new Set(['skills/index.html','en/skills/index.html'])},
  {pattern:/\bcdn\b/iu,allowed:new Set(['index.html','en/index.html'])},
];

const homeBanned=[
  /\bcontentroot\b/iu,
  /web component/iu,
  /service worker/iu,
  /sha-?256/iu,
  /toolkit node\/typescript/iu,
  /index\.json/iu,
  /\bfixture\b/iu,
  /\bgate\b/iu,
];

const sourcePages=await walkHtml(sourceRoot);
const errors=[];
let checked=0;
let publicPages=0;
for(const sourcePath of sourcePages){
  const rel=relative(sourceRoot,sourcePath).replaceAll('\\','/');
  // Validate canonical publication paths, rather than redirected legacy English URLs.
  const sourceRoute='/'+rel.replace(/index\.html$/,'');
  const publishedRoute=canonicalRoute(sourceRoute);
  const builtPath=join(builtRoot,...publishedRoute.slice(1).split('/').filter(Boolean),'index.html');
  if(!await exists(builtPath)){
    errors.push(rel+': missing from production build');
    continue;
  }
  checked++;
  const html=await readFile(builtPath,'utf8');
  const text=visibleText(html);
  for(const pattern of bannedEverywhere){
    if(pattern.test(text))errors.push(rel+': internal/development wording matches '+pattern);
  }
  const english=rel.startsWith('en/');
  const isDoc=rel.startsWith('docs/')||rel.startsWith('en/docs/');
  if(!isDoc){
    publicPages++;
    for(const pattern of publicBanned){
      if(pattern.test(text))errors.push(rel+': public page exposes implementation jargon matching '+pattern);
    }
    for(const {pattern,allowed} of contextualPublicBanned){
      if(!allowed.has(rel)&&pattern.test(text))errors.push(rel+': misplaced public implementation jargon matching '+pattern);
    }
    const hasSiteHeader=/class=["'][^"']*site-header/iu.test(html);
    if(hasSiteHeader){
      const contactHref=english?englishRouteFor('/contacto/'):'/contacto/';
      const docsHref=english?'/en/docs/':'/docs/';
      if(!html.includes('href="'+contactHref+'"')&&!html.includes("href='"+contactHref+"'"))
        errors.push(rel+': public navigation is missing '+(english?'Contact':'Contacto'));
      if(!html.includes('href="'+docsHref+'"')&&!html.includes("href='"+docsHref+"'"))
        errors.push(rel+': public navigation is missing '+(english?'Documentation':'Documentación'));
    }
    const metaBlocks=[...html.matchAll(/<div class=["']header-meta["'][^>]*>([\s\S]*?)<\/div>/giu)];
    for(const block of metaBlocks){
      if(!block[1].includes('data-functional-status'))
        errors.push(rel+': non-functional build/version header metadata is still visible');
    }
  }
  if(rel==='index.html'||rel==='en/index.html'){
    for(const pattern of homeBanned){
      if(pattern.test(text))errors.push(rel+': homepage exposes implementation jargon matching '+pattern);
    }
  }
}
if(checked!==sourcePages.length)errors.push('Only '+checked+' of '+sourcePages.length+' source pages were found in the production build.');
if(errors.length){
  console.error(JSON.stringify({ok:false,pages:sourcePages.length,checked,publicPages,errors},null,2));
  process.exit(1);
}
console.log(JSON.stringify({ok:true,pages:sourcePages.length,checked,publicPages,internalCopyLeaks:0},null,2));
