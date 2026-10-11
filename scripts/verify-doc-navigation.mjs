import {readFile,readdir} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';

const root=resolve(process.cwd());
const docsRoot=join(root,'deploy','netlify','site','docs');
const portalScript=join(root,'deploy','netlify','site','p2lrn.js');

async function walk(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory()) out.push(...await walk(full));
    else if(entry.isFile()&&entry.name==='index.html') out.push(full);
  }
  return out;
}

const pages=(await walk(docsRoot)).sort();
if(!pages.length) throw new Error('No documentation pages found.');

const failures=[];
for(const path of pages){
  const html=await readFile(path,'utf8');
  const rel=relative(root,path).replaceAll('\\','/');
  const sidebars=[...html.matchAll(/<aside\s+class=["']doc-sidebar["'][^>]*>([\s\S]*?)<\/aside>/gi)];
  if(sidebars.length!==1){
    failures.push(rel+': expected exactly one .doc-sidebar, found '+sidebars.length);
    continue;
  }
  if(sidebars[0][1].trim()!=='') failures.push(rel+': legacy sidebar HTML is not empty');
  if(!/<script[^>]+src=["']\/p2lrn\.js["']/i.test(html)) failures.push(rel+': missing shared /p2lrn.js');
}

const js=await readFile(portalScript,'utf8');
for(const marker of [
  'const GLOBAL_SIDEBAR = [',
  "['EMPEZAR', [",
  "['CREAR', [",
  "['REPRODUCIR', [",
  "['INTEGRAR', [",
  "['REFERENCIA', [",
  "['RECURSOS', [",
  'sidebar.replaceChildren(fragment)',
]){
  if(!js.includes(marker)) failures.push('p2lrn.js: missing '+marker);
}
for(const forbidden of ['P2LRN_EXTRA_DOC_LINKS','sidebar.append(']){
  if(js.includes(forbidden)) failures.push('p2lrn.js: legacy logic remains: '+forbidden);
}

if(failures.length) throw new Error('Global documentation navigation gate failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,pages:pages.length,sidebarAuthority:'/p2lrn.js',legacySidebarHtml:false,sections:['EMPEZAR','CREAR','REPRODUCIR','INTEGRAR','REFERENCIA','RECURSOS']},null,2));
