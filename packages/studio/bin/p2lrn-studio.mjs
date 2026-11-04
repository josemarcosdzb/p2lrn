#!/usr/bin/env node
import {access,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

const here=dirname(fileURLToPath(import.meta.url));
const templateRoot=resolve(here,'..','templates');
const endpoint='/api/p2lrn/studio/save';
const readerEndpoint='/api/p2lrn/studio/read';
const importEndpoint='/api/p2lrn/studio/import';

const bridge=['studio-bridge.mjs','p2lrn-setup/p2lrn-studio-bridge.mjs'];
const specs={
  next:[['next-route.ts','app/api/p2lrn/studio/save/route.ts'],['next-reader-route.ts','app/api/p2lrn/studio/read/route.ts'],['next-import-route.ts','app/api/p2lrn/studio/import/route.ts']],
  sveltekit:[['sveltekit-route.ts','src/routes/api/p2lrn/studio/save/+server.ts'],['sveltekit-reader-route.ts','src/routes/api/p2lrn/studio/read/+server.ts'],['sveltekit-import-route.ts','src/routes/api/p2lrn/studio/import/+server.ts']],
  nuxt:[['nuxt-route.ts','server/api/p2lrn/studio/save.post.ts'],['nuxt-reader-route.ts','server/api/p2lrn/studio/read.post.ts'],['nuxt-import-route.ts','server/api/p2lrn/studio/import.post.ts']],
  astro:[['astro-route.ts','src/pages/api/p2lrn/studio/save.ts'],['astro-reader-route.ts','src/pages/api/p2lrn/studio/read.ts'],['astro-import-route.ts','src/pages/api/p2lrn/studio/import.ts']],
  remix:[['remix-route.ts','app/routes/api.p2lrn.studio.save.ts'],['remix-reader-route.ts','app/routes/api.p2lrn.studio.read.ts'],['remix-import-route.ts','app/routes/api.p2lrn.studio.import.ts']],
  'react-router':[['react-router-route.ts','app/routes/api.p2lrn.studio.save.ts'],['react-router-reader-route.ts','app/routes/api.p2lrn.studio.read.ts'],['react-router-import-route.ts','app/routes/api.p2lrn.studio.import.ts']],
  express:[['express-route.mjs','p2lrn-setup/express-route.mjs']],
  fastify:[['fastify-route.mjs','p2lrn-setup/fastify-route.mjs']],
  hono:[['hono-route.mjs','p2lrn-setup/hono-route.mjs']],
  nest:[['nest-controller.ts','src/p2lrn-studio.controller.ts']],
  node:[['node-handler.mjs','p2lrn-studio.server.mjs']],
  php:[['php-save.php','api/p2lrn/studio/save/index.php'],['php-reader.php','api/p2lrn/studio/read/index.php'],['php-import.php','api/p2lrn/studio/import/index.php'],['php-auth.php','p2lrn-setup/studio-auth.php'],['php-bridge.php','p2lrn-setup/studio-php-bridge.php'],bridge],
  laravel:[['laravel-controller.php','app/Http/Controllers/P2LRNStudioController.php'],['laravel-route.txt','p2lrn-setup/laravel-route.txt'],bridge],
  symfony:[['symfony-controller.php','src/Controller/P2LRNStudioController.php'],bridge],
  django:[['django-views.py','p2lrn_studio/views.py'],['django-urls.py','p2lrn_studio/urls.py'],bridge],
  fastapi:[['fastapi-router.py','p2lrn_studio.py'],bridge],
  flask:[['flask-blueprint.py','p2lrn_studio.py'],bridge],
  rails:[['rails-controller.rb','app/controllers/p2lrn_studio_controller.rb'],['rails-route.txt','p2lrn-setup/rails-route.txt'],bridge],
  aspnet:[['aspnet-endpoint.cs','P2LRNStudioEndpoint.cs'],bridge],
  spring:[['spring-controller.java','p2lrn-setup/P2LRNStudioController.java'],bridge],
  go:[['go-handler.go','p2lrn-setup/p2lrn_studio.go'],bridge],
  rust:[['rust-axum.rs','p2lrn-setup/p2lrn_studio_axum.rs'],bridge],
  generic:[['generic-contract.md','p2lrn-setup/GENERIC.md'],bridge]
};

const exists=async p=>{try{await access(p);return true}catch{return false}};
const json=async p=>{try{return JSON.parse(await readFile(p,'utf8'))}catch{return null}};

async function hasProjectMarker(cwd){
  if(await exists(join(cwd,'package.json')))return true;
  for(const marker of ['artisan','manage.py','Gemfile','pom.xml','build.gradle','build.gradle.kts','go.mod','Cargo.toml','requirements.txt','pyproject.toml','Pipfile']){
    if(await exists(join(cwd,...marker.split('/'))))return true;
  }
  if(await exists(join(cwd,'bin','console')))return true;
  const files=await readdir(cwd).catch(()=>[]);
  return files.some(x=>x.endsWith('.csproj')||x.endsWith('.sln'));
}
async function findProjectRoot(start){
  const original=resolve(start);
  let current=original;
  for(;;){
    if(await hasProjectMarker(current))return current;
    const parent=dirname(current);
    if(parent===current)return original;
    current=parent;
  }
}

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
  const out={target:'auto',cwd:process.cwd(),cwdExplicit:false,coursePath:'course',force:false,dryRun:false};
  const a=[...argv]; if(a[0]==='setup')a.shift();
  if(a[0]&&!a[0].startsWith('-'))out.target=a.shift().toLowerCase();
  for(let i=0;i<a.length;i++){
    if(a[i]==='--force')out.force=true;
    else if(a[i]==='--dry-run')out.dryRun=true;
    else if(a[i]==='--cwd'){out.cwd=resolve(a[++i]);out.cwdExplicit=true;}
    else if(a[i]==='--course-path')out.coursePath=a[++i]||'course';
    else if(a[i]==='--help'||a[i]==='-h')out.help=true;
    else throw new Error('Unknown option: '+a[i]);
  }
  return out;
}
function safePath(v){
  const p=String(v||'course').replaceAll('\\','/').replace(/^\/+|\/+$/g,'');
  const parts=p.split('/');
  // This slug is interpolated into JavaScript, HTML and server file paths by
  // the generator. Restrict it to safe portable segments; escaping only one
  // of these output formats would leave other targets injectable.
  if(!p||p.length>240||parts.length>16||parts.some(x=>
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x)||
      x==='.'||x==='..'||x.endsWith('.')||
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(x)))
    throw new Error('Unsafe course path');
  return p;
}
async function materialize(target,cwd,coursePath,force,dryRun){
  const list=specs[target]; if(!list)throw new Error('Unsupported target: '+target);
  const made=[];
  for(const [src,rel] of list){
    const dest=resolve(cwd,rel);
    if(dest!==resolve(cwd)&&!dest.startsWith(resolve(cwd)+sep))throw new Error('Unsafe output path: '+rel);
    if(await exists(dest)&&!force)throw new Error('File already exists: '+rel+'; use --force to replace it');
    let body=await readFile(join(templateRoot,src),'utf8');
    body=body.replaceAll('__COURSE_PATH__',coursePath).replaceAll('__ENDPOINT__',endpoint).replaceAll('__READER_ENDPOINT__',readerEndpoint).replaceAll('__IMPORT_ENDPOINT__',importEndpoint);
    if(!dryRun){await mkdir(dirname(dest),{recursive:true});await writeFile(dest,body)}
    made.push(rel);
  }
  if(!dryRun)await mkdir(resolve(cwd,...coursePath.split('/')),{recursive:true});
  const readme=resolve(cwd,'p2lrn-setup','README.md');
  const generatedReader=true;
  const generatedImport=true;
  if(!(await exists(readme))||force){
    const attrs=[
      '<p2lrn-studio',
      '  src="/'+coursePath+'/curso.p2lrn"',
      '  save-endpoint="'+endpoint+'"',
      ...(generatedReader?['  reader-endpoint="'+readerEndpoint+'"']:[]),
      ...(generatedImport?['  import-endpoint="'+importEndpoint+'"']:[]),
      '  course-path="'+coursePath+'">',
      '</p2lrn-studio>',
    ];
    const body=[
      '# P2LRN Studio setup','',
      'Target: '+target,
      'Save endpoint: '+endpoint+' (generated)',
      'Reader endpoint: '+(generatedReader?readerEndpoint+' (generated)':'not generated for this target'),
      'Import endpoint: '+(generatedImport?importEndpoint+' (generated)':'not generated for this target'),
      'Course directory: '+coursePath+'/','',
      'Embed:','',...attrs,'',
      'All three endpoints are generated by setup for this target. Override the attributes only when your application uses different routes.','',
      '## Seguridad obligatoria para produccion','',
      '**IMPORTANTE: este setup NO autentica usuarios ni autoriza operaciones.** El sitio web que integra P2LRN debe proteger las rutas Save, Reader e Import con su propia autenticacion y permisos de profesor/editor por curso o centro, comprobados en el servidor ANTES de llamar a @p2lrn/studio/server.','',
      'Si la sesion usa cookies, aplica proteccion CSRF y comprobacion de origen. Configura HTTPS, CORS restringido, limites de peticiones, tamanos de archivos y cuotas de almacenamiento. La ruta real de guardado debe estar fijada por el servidor, no por el navegador. Las peticiones no autorizadas deben devolver 401 o 403.','',
      'Una ruta generada no es segura por si sola para acceso publico. Consulta: https://p2lrn.netlify.app/docs/integracion/','',
    ].join('\n');
    if(!dryRun){await mkdir(dirname(readme),{recursive:true});await writeFile(readme,body)}
    made.push('p2lrn-setup/README.md');
  }
  return {made,generatedReader,generatedImport};
}
const o=args(process.argv.slice(2));
if(o.help){
  console.log('Usage: npx p2lrn-studio setup [auto|next|express|nest|fastify|hono|sveltekit|nuxt|astro|remix|react-router|node|php|laravel|symfony|django|fastapi|flask|rails|aspnet|spring|go|rust|generic] [--course-path course] [--force] [--dry-run]');
  process.exit(0);
}
const startCwd=resolve(o.cwd);
const cwd=o.cwdExplicit?startCwd:await findProjectRoot(startCwd);
const coursePath=safePath(o.coursePath);
const target=o.target==='auto'?await detect(cwd):o.target;
const materialized=await materialize(target,cwd,coursePath,o.force,o.dryRun);
console.log(JSON.stringify({
  ok:true,
  projectRoot:cwd,
  target,
  endpoint,
  readerEndpoint,
  importEndpoint,
  generatedEndpoints:{save:true,reader:materialized.generatedReader,import:materialized.generatedImport},
  coursePath,
  files:materialized.made,
  dryRun:o.dryRun,
},null,2));
