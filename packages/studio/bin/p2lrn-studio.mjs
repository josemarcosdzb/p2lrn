#!/usr/bin/env node
import {access,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

const here=dirname(fileURLToPath(import.meta.url));
const templateRoot=resolve(here,'..','templates');
const endpoint='/api/p2lrn/studio/save';
const readerEndpoint='/api/p2lrn/studio/read';

const specs={
  next:[['next-route.ts','app/api/p2lrn/studio/save/route.ts'],['next-reader-route.ts','app/api/p2lrn/studio/read/route.ts']],
  sveltekit:[['sveltekit-route.ts','src/routes/api/p2lrn/studio/save/+server.ts']],
  nuxt:[['nuxt-route.ts','server/api/p2lrn/studio/save.post.ts']],
  astro:[['astro-route.ts','src/pages/api/p2lrn/studio/save.ts']],
  remix:[['remix-route.ts','app/routes/api.p2lrn.studio.save.ts']],
  'react-router':[['react-router-route.ts','app/routes/api.p2lrn.studio.save.ts']],
  express:[['express-route.mjs','p2lrn-setup/express-route.mjs']],
  fastify:[['fastify-route.mjs','p2lrn-setup/fastify-route.mjs']],
  hono:[['hono-route.mjs','p2lrn-setup/hono-route.mjs']],
  nest:[['nest-controller.ts','src/p2lrn-studio.controller.ts']],
  node:[['node-handler.mjs','p2lrn-studio.server.mjs']],
  php:[['php-save.php','p2lrn-studio-save.php']],
  laravel:[['laravel-controller.php','app/Http/Controllers/P2LRNStudioController.php'],['laravel-route.txt','p2lrn-setup/laravel-route.txt']],
  symfony:[['symfony-controller.php','src/Controller/P2LRNStudioController.php']],
  django:[['django-views.py','p2lrn_studio/views.py'],['django-urls.py','p2lrn_studio/urls.py']],
  fastapi:[['fastapi-router.py','p2lrn_studio.py']],
  flask:[['flask-blueprint.py','p2lrn_studio.py']],
  rails:[['rails-controller.rb','app/controllers/p2lrn_studio_controller.rb'],['rails-route.txt','p2lrn-setup/rails-route.txt']],
  aspnet:[['aspnet-endpoint.cs','P2LRNStudioEndpoint.cs']],
  spring:[['spring-controller.java','p2lrn-setup/P2LRNStudioController.java']],
  go:[['go-handler.go','p2lrn-setup/p2lrn_studio.go']],
  rust:[['rust-axum.rs','p2lrn-setup/p2lrn_studio_axum.rs']],
  generic:[['generic-contract.md','p2lrn-setup/GENERIC.md']]
};

const exists=async p=>{try{await access(p);return true}catch{return false}};
const json=async p=>{try{return JSON.parse(await readFile(p,'utf8'))}catch{return null}};

async function detect(cwd){
  const p=await json(join(cwd,'package.json'));
  const d={...(p?.dependencies||{}),...(p?.devDependencies||{})};
  if(d.next)return'next';
  if(d['@nestjs/core'])return'nest';
  if(d['@sveltejs/kit'])return'sveltekit';
  if(d.nuxt)return'nuxt';
  if(d.astro)return'astro';
  if(d['@remix-run/node']||d['@remix-run/react'])return'remix';
  if(d.fastify)return'fastify';
  if(d.hono)return'hono';
  if(d.express)return'express';
  if(await exists(join(cwd,'artisan')))return'laravel';
  if(await exists(join(cwd,'bin','console')))return'symfony';
  if(await exists(join(cwd,'manage.py')))return'django';
  const pyParts=[];
  for(const name of ['requirements.txt','pyproject.toml','Pipfile']){
    const p=join(cwd,name);
    if(await exists(p))pyParts.push(await readFile(p,'utf8'));
  }
  const py=pyParts.join('\n');
  if(/fastapi/i.test(py))return'fastapi';
  if(/flask/i.test(py))return'flask';
  if(await exists(join(cwd,'Gemfile'))){
    const g=await readFile(join(cwd,'Gemfile'),'utf8');
    if(/rails/i.test(g))return'rails';
  }
  const files=await readdir(cwd).catch(()=>[]);
  if(files.some(x=>x.endsWith('.csproj')||x.endsWith('.sln')))return'aspnet';
  if(await exists(join(cwd,'pom.xml'))||await exists(join(cwd,'build.gradle'))||await exists(join(cwd,'build.gradle.kts')))return'spring';
  if(await exists(join(cwd,'go.mod')))return'go';
  if(await exists(join(cwd,'Cargo.toml')))return'rust';
  if(p)return'node';
  if(files.some(x=>x.endsWith('.php')))return'php';
  return'generic';
}

function args(argv){
  const out={target:'auto',cwd:process.cwd(),coursePath:'course',force:false,dryRun:false};
  const a=[...argv]; if(a[0]==='setup')a.shift();
  if(a[0]&&!a[0].startsWith('-'))out.target=a.shift().toLowerCase();
  for(let i=0;i<a.length;i++){
    if(a[i]==='--force')out.force=true;
    else if(a[i]==='--dry-run')out.dryRun=true;
    else if(a[i]==='--cwd')out.cwd=resolve(a[++i]);
    else if(a[i]==='--course-path')out.coursePath=a[++i]||'course';
    else if(a[i]==='--help'||a[i]==='-h')out.help=true;
    else throw new Error('Unknown option: '+a[i]);
  }
  return out;
}
function safePath(v){
  const p=String(v||'course').replaceAll('\\','/').replace(/^\/+|\/+$/g,'');
  if(!p||p.split('/').some(x=>!x||x==='.'||x==='..'))throw new Error('Unsafe course path');
  return p;
}
async function materialize(target,cwd,coursePath,force,dryRun){
  const list=specs[target]; if(!list)throw new Error('Unsupported target: '+target);
  const made=[];
  for(const [src,rel] of list){
    const dest=resolve(cwd,rel);
    if(!dest.startsWith(resolve(cwd)))throw new Error('Unsafe output path: '+rel);
    if(await exists(dest)&&!force)throw new Error('File already exists: '+rel+'; use --force to replace it');
    let body=await readFile(join(templateRoot,src),'utf8');
    body=body.replaceAll('__COURSE_PATH__',coursePath).replaceAll('__ENDPOINT__',endpoint).replaceAll('__READER_ENDPOINT__',readerEndpoint);
    if(!dryRun){await mkdir(dirname(dest),{recursive:true});await writeFile(dest,body)}
    made.push(rel);
  }
  if(!dryRun)await mkdir(resolve(cwd,...coursePath.split('/')),{recursive:true});
  const readme=resolve(cwd,'p2lrn-setup','README.md');
  if(!(await exists(readme))||force){
    const body=['# P2LRN Studio setup','','Target: '+target,'Save endpoint: '+endpoint,'Reader endpoint: '+readerEndpoint,'Course directory: '+coursePath+'/','','Embed:','','<p2lrn-studio src="/'+coursePath+'/curso.p2lrn" save-endpoint="'+endpoint+'" reader-endpoint="'+readerEndpoint+'" course-path="'+coursePath+'"></p2lrn-studio>',''].join('\n');
    if(!dryRun){await mkdir(dirname(readme),{recursive:true});await writeFile(readme,body)}
    made.push('p2lrn-setup/README.md');
  }
  return made;
}
const o=args(process.argv.slice(2));
if(o.help){
  console.log('Usage: npx p2lrn-studio setup [auto|next|express|nest|fastify|hono|sveltekit|nuxt|astro|remix|react-router|node|php|laravel|symfony|django|fastapi|flask|rails|aspnet|spring|go|rust|generic] [--course-path course] [--force] [--dry-run]');
  process.exit(0);
}
const cwd=resolve(o.cwd),coursePath=safePath(o.coursePath);
const target=o.target==='auto'?await detect(cwd):o.target;
const files=await materialize(target,cwd,coursePath,o.force,o.dryRun);
console.log(JSON.stringify({ok:true,target,endpoint,readerEndpoint,coursePath,files,dryRun:o.dryRun},null,2));
