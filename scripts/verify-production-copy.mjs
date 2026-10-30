import {readFile, readdir, stat} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';

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
  /\bmcp\b/iu,
  /\bpython\b/iu,
  /\bcli\b/iu,
  /sha-?256/iu,
  /\bnpm\b/iu,
  /\bcdn\b/iu,
  /\bfixture\b/iu,
  /\bcommit\b/iu,
  /\bbranch\b/iu,
  /\bmonorepo\b/iu,
  /\bstaged\b/iu,
  /\blocalhost\b/iu,
  /127\.0\.0\.1/iu,
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
  const builtPath=join(builtRoot,...rel.split('/'));
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
  const isDoc=rel.startsWith('docs/');
  if(!isDoc){
    publicPages++;
    for(const pattern of publicBanned){
      if(pattern.test(text))errors.push(rel+': public page exposes implementation jargon matching '+pattern);
    }
    const hasSiteHeader=/class=["'][^"']*site-header/iu.test(html);
    if(hasSiteHeader){
      if(!/href=["']\/contacto\//iu.test(html))errors.push(rel+': public navigation is missing Contacto');
      if(!/href=["']\/docs\//iu.test(html))errors.push(rel+': public navigation is missing Documentación');
    }
    const metaBlocks=[...html.matchAll(/<div class=["']header-meta["'][^>]*>([\s\S]*?)<\/div>/giu)];
    for(const block of metaBlocks){
      if(!block[1].includes('data-functional-status'))
        errors.push(rel+': non-functional build/version header metadata is still visible');
    }
  }
  if(rel==='index.html'){
    for(const pattern of homeBanned){
      if(pattern.test(text))errors.push('index.html: homepage exposes implementation jargon matching '+pattern);
    }
  }
}
if(checked!==sourcePages.length)errors.push('Only '+checked+' of '+sourcePages.length+' source pages were found in the production build.');
if(errors.length){
  console.error(JSON.stringify({ok:false,pages:sourcePages.length,checked,publicPages,errors},null,2));
  process.exit(1);
}
console.log(JSON.stringify({ok:true,pages:sourcePages.length,checked,publicPages,internalCopyLeaks:0},null,2));
