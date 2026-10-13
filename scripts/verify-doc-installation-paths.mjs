import {readFile,readdir,stat} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';

const root=resolve(process.cwd());
const site=join(root,'deploy','netlify','site');
const docs=join(site,'docs');
const read=(path)=>readFile(join(root,path),'utf8');
const [
  studioPackage,playerPackage,studioSource,studioLoader,studioCli,css,
  npmDoc,npmStudioDoc,cdnDoc,cdnStudioDoc,studioDoc,startDoc,studioReadme
]=await Promise.all([
  read('packages/studio/package.json').then(JSON.parse),
  read('packages/player/package.json').then(JSON.parse),
  read('packages/studio/src/p2lrn-studio.js'),
  read('packages/studio/src/p2lrn-studio.loader.js'),
  read('packages/studio/bin/p2lrn-studio.mjs'),
  read('deploy/netlify/site/p2lrn.css'),
  read('deploy/netlify/site/docs/npm/index.html'),
  read('deploy/netlify/site/docs/npm/studio/index.html'),
  read('deploy/netlify/site/docs/cdn/index.html'),
  read('deploy/netlify/site/docs/cdn/studio/index.html'),
  read('deploy/netlify/site/docs/studio/index.html'),
  read('deploy/netlify/site/docs/empezar/index.html'),
  read('packages/studio/README.md'),
]);

const failures=[];
const must=(label,text,needle)=>{if(!text.includes(needle))failures.push(label+': missing '+needle)};
const forbid=(label,text,needle)=>{if(text.includes(needle))failures.push(label+': forbidden '+needle)};
const article=(html)=>/<article class="doc-content">([\s\S]*?)<\/article>/i.exec(html)?.[1]??html;
const version=studioPackage.version;

if(playerPackage.version!==version)failures.push('player/studio version mismatch');

must('npm docs',npmDoc,'npm install @p2lrn/player@'+version);
must('npm docs',npmDoc,'npm install @p2lrn/studio@'+version+' @p2lrn/player@'+version);
must('npm docs',npmDoc,'npm install @p2lrn/toolkit@'+version);
must('npm docs',npmDoc,'/docs/npm/studio/');
forbid('npm docs article',article(npmDoc),'CDN');
forbid('npm docs article',article(npmDoc),'p2lrn.netlify.app');

must('npm studio docs',npmStudioDoc,'npm install @p2lrn/studio@'+version+' @p2lrn/player@'+version);
must('npm studio docs',npmStudioDoc,"import '@p2lrn/studio'");
must('npm studio docs',npmStudioDoc,'npx p2lrn-studio setup');
must('npm studio docs',npmStudioDoc,'handleP2LRNStudioSave');
must('npm studio docs',npmStudioDoc,'handleP2LRNStudioReader');
must('npm studio docs',npmStudioDoc,'handleP2LRNStudioExternalImport');
for(const attr of ['src','save-endpoint','reader-endpoint','import-endpoint','course-path'])must('npm studio docs',npmStudioDoc,'<code>'+attr+'</code>');
for(const eventName of ['p2lrn-studio-create','p2lrn-studio-open','p2lrn-studio-download','p2lrn-studio-save'])must('npm studio docs',npmStudioDoc,'<code>'+eventName+'</code>');
forbid('npm studio article',article(npmStudioDoc),'CDN');
forbid('npm studio article',article(npmStudioDoc),'p2lrn.netlify.app');

must('cdn docs',cdnDoc,'/player/current/dist/p2lrn.js');
must('cdn docs',cdnDoc,'/player/'+version+'/dist/p2lrn.js');
must('cdn docs',cdnDoc,'/docs/cdn/studio/');
for(const token of ['npm install','npx ','@p2lrn/'])forbid('cdn docs article',article(cdnDoc),token);

must('cdn studio docs',cdnStudioDoc,'/studio/current/dist/p2lrn-studio.js');
must('cdn studio docs',cdnStudioDoc,'/studio/'+version+'/dist/p2lrn-studio.js');
for(const attr of ['src','save-endpoint','reader-endpoint','import-endpoint','course-path'])must('cdn studio docs',cdnStudioDoc,'<code>'+attr+'</code>');
for(const token of ['npm install','npx ','@p2lrn/'])forbid('cdn studio article',article(cdnStudioDoc),token);

for(const token of ['NPM','CDN','npm install','p2lrn.netlify.app'])forbid('visual studio article',article(studioDoc),token);
for(const text of ['Añadir contenido','Vista alumno','Descargar .p2lrn'])must('visual studio docs',studioDoc,text);

must('studio loader',studioLoader,"../../../player/'+channel+'/dist/p2lrn.js");
must('studio loader',studioLoader,'import(moduleUrl)');
must('studio source',studioSource,"observedAttributes(){return['src','save-endpoint','reader-endpoint','import-endpoint','course-path']");
must('studio cli',studioCli,'generatedEndpoints:{save:true,reader:materialized.generatedReader,import:materialized.generatedImport}');
must('studio README',studioReadme,'npm install @p2lrn/studio@'+version+' @p2lrn/player@'+version);
if(startDoc.includes('npm install')||startDoc.includes('p2lrn.netlify.app'))failures.push('start docs must choose routes without embedding installation code');

forbid('css',css,'.doc-content .example-actions .button{color:inherit;text-decoration:none}');
must('css',css,'.doc-content .example-actions .button.primary{color:#fff}');
must('css',css,'.doc-content{min-width:0;width:100%;max-width:900px}');

async function walk(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await walk(full));
    else if(entry.isFile()&&entry.name.endsWith('.html'))out.push(full);
  }
  return out;
}
const htmlFiles=await walk(docs);
for(const file of htmlFiles){
  const html=await readFile(file,'utf8');
  const rel=relative(root,file).replaceAll('\\','/');
  for(const match of html.matchAll(/href=["'](\/docs\/[^"'?#]*|\/studio\/|\/demo\/|\/contacto\/)["']/gi)){
    const href=match[1];
    let target;
    if(href==='/studio/')target=join(site,'studio','index.html');
    else if(href==='/demo/')target=join(site,'demo','index.html');
    else if(href==='/contacto/')target=join(site,'contacto','index.html');
    else target=join(site,...href.slice(1).split('/'),'index.html');
    try{if(!(await stat(target)).isFile())failures.push(rel+': missing static route '+href)}catch{failures.push(rel+': missing static route '+href)}
  }
}
if(failures.length)throw new Error('Documentation installation audit failed:\n'+failures.join('\n'));
console.log(JSON.stringify({ok:true,version,docsPages:htmlFiles.length,studioGuides:{visual:'/docs/studio/',npm:'/docs/npm/studio/',cdn:'/docs/cdn/studio/'},strictChannelSeparation:true,buttonLabels:true},null,2));
