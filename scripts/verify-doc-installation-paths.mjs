import {readFile,readdir,stat} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';

const root=resolve(process.cwd());
const site=join(root,'deploy','netlify','site');
const docs=join(site,'docs');
const read=(path)=>readFile(join(root,path),'utf8');

const [studioPackage,playerPackage,studioSource,studioLoader,studioCli,css,npmDoc,cdnDoc,studioDoc,startDoc,studioReadme]=await Promise.all([
  read('packages/studio/package.json').then(JSON.parse),
  read('packages/player/package.json').then(JSON.parse),
  read('packages/studio/src/p2lrn-studio.js'),
  read('packages/studio/src/p2lrn-studio.loader.js'),
  read('packages/studio/bin/p2lrn-studio.mjs'),
  read('deploy/netlify/site/p2lrn.css'),
  read('deploy/netlify/site/docs/npm/index.html'),
  read('deploy/netlify/site/docs/cdn/index.html'),
  read('deploy/netlify/site/docs/studio/index.html'),
  read('deploy/netlify/site/docs/empezar/index.html'),
  read('packages/studio/README.md'),
]);

const failures=[];
try{
  await stat(join(root,'.github','workflows','p2lrn-local-serve.yml'));
  failures.push('repository must not contain the retired p2lrn-local-serve.yml workflow');
}catch{}
const must=(label,text,needle)=>{if(!text.includes(needle))failures.push(label+': missing '+needle)};
const forbid=(label,text,needle)=>{if(text.includes(needle))failures.push(label+': forbidden '+needle)};
const version=studioPackage.version;

if(playerPackage.version!==version)failures.push('player/studio version mismatch');

for(const [label,text] of [['npm docs',npmDoc],['studio docs',studioDoc]]){
  must(label,text,'npm install @p2lrn/studio@'+version+' @p2lrn/player@'+version);
  must(label,text,"import '@p2lrn/studio'");
  must(label,text,'&lt;p2lrn-studio');
}
must('studio README',studioReadme,'npm install @p2lrn/studio@'+version+' @p2lrn/player@'+version);
must('studio README',studioReadme,"import '@p2lrn/studio'");
must('studio README',studioReadme,'<p2lrn-studio');
for(const [label,text] of [['cdn docs',cdnDoc],['studio docs',studioDoc],['studio README',studioReadme]]){
  must(label,text,'/studio/current/dist/p2lrn-studio.js');
  must(label,text,'/studio/'+version+'/dist/p2lrn-studio.js');
}
must('studio loader',studioLoader,"../../../player/'+channel+'/dist/p2lrn.js");
must('studio loader',studioLoader,'import(moduleUrl)');
must('studio source',studioSource,"observedAttributes(){return['src','save-endpoint','reader-endpoint','import-endpoint','course-path']");
for(const attr of ['src','save-endpoint','reader-endpoint','import-endpoint','course-path'])must('studio docs',studioDoc,'<code>'+attr+'</code>');
for(const eventName of ['p2lrn-studio-create','p2lrn-studio-open','p2lrn-studio-download','p2lrn-studio-save'])must('studio docs',studioDoc,'<code>'+eventName+'</code>');
must('npm docs',npmDoc,'handleP2LRNStudioSave');
must('npm docs',npmDoc,'handleP2LRNStudioReader');
must('npm docs',npmDoc,'handleP2LRNStudioExternalImport');
must('studio docs',studioDoc,'Actualmente Next.js');
must('studio README',studioReadme,'The current `next` target generates all three routes');
must('studio cli',studioCli,'generatedEndpoints:{save:true,reader:materialized.generatedReader,import:materialized.generatedImport}');

if(startDoc.includes('npm install @p2lrn/player')&&startDoc.includes('p2lrn.netlify.app/player/'))failures.push('start docs mix Player NPM and CDN in one path');
forbid('css',css,'.doc-content .example-actions .button{color:inherit;text-decoration:none}');
must('css',css,'.doc-content .example-actions .button.primary{color:#fff}');
must('css',css,'grid-template-columns:repeat(2,minmax(0,1fr))');
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
  for(const match of html.matchAll(/<a\b[^>]*class=["'][^"']*\bbutton\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const label=match[1].replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim();
    if(!label)failures.push(rel+': button link has no visible label');
  }
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
console.log(JSON.stringify({
  ok:true,
  version,
  docsPages:htmlFiles.length,
  studioChannels:['npm','cdn'],
  studioAttributes:['src','save-endpoint','reader-endpoint','import-endpoint','course-path'],
  setup:{next:['save','reader','import'],otherTargets:['save']},
  buttonLabels:true,
  responsivePager:true,
},null,2));
