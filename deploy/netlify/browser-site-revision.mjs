import {createHash} from 'node:crypto';
import {readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {join, relative} from 'node:path';

// Reused by the distribution build and the installed localhost site.
// Neither a second Player nor a separate renderer is created.
async function filesUnder(root) {
  const output=[];
  const entries=await readdir(root,{withFileTypes:true});
  for(const entry of entries){
    const path=join(root,entry.name);
    if(entry.isDirectory())output.push(...await filesUnder(path));
    else if(entry.isFile())output.push(path);
  }
  return output;
}

async function exists(path){
  try{return (await stat(path)).isFile();}
  catch{return false;}
}

function generatedImportMap(html){
  return [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/giu)]
    .find(match=>{
      try{
        const imports=JSON.parse(match[1])?.imports ?? {};
        return Object.keys(imports).some(path=>
          path.startsWith('/player/current/dist/') ||
          path.startsWith('/studio/current/dist/') ||
          path.startsWith('/studio/runtime/'));
      }catch{return false;}
    })?.[0] ?? null;
}

export async function reviseSiteBrowserAssets({siteRoot, htmlFiles}){
  if(!siteRoot || !Array.isArray(htmlFiles))throw new TypeError('A site root and HTML files are required');
  const mutableRoots=[
    join(siteRoot,'player','current','dist'),
    join(siteRoot,'studio','current','dist'),
    join(siteRoot,'studio','runtime'),
  ];
  const mutablePaths=[];
  for(const dir of mutableRoots){
    let files;
    try{files=await filesUnder(dir);}
    catch(error){
      if(error?.code==='ENOENT')continue;
      throw error;
    }
    for(const path of files){
      const rel=relative(siteRoot,path).replaceAll('\\','/');
      if(!/\.(?:js|mjs|css)$/iu.test(rel))continue;
      if(rel.includes('/runtime-host/') || rel.includes('/vendor/'))continue;
      mutablePaths.push(path);
    }
  }
  for(const rel of [
    'demo/viewer.js','studio/studio.js','studio/studio.css',
    'en/demo/viewer.js','en/studio/studio.js',
  ]){
    const path=join(siteRoot,...rel.split('/'));
    if(await exists(path))mutablePaths.push(path);
  }
  mutablePaths.sort();
  if(!mutablePaths.some(path=>relative(siteRoot,path).replaceAll('\\','/')==='player/current/dist/renderers/questionnaire-rosco.js')){
    throw new Error('Cannot revise the Player: questionnaire-rosco.js is missing');
  }
  const digest=createHash('sha256');
  for(const path of mutablePaths){
    const bytes=await readFile(path);
    digest.update(relative(siteRoot,path).replaceAll('\\','/'));
    digest.update(createHash('sha256').update(bytes).digest());
  }
  const runtimeRevision=digest.digest('hex').slice(0,16);
  const revisionImports={};
  for(const path of mutablePaths){
    const rel=relative(siteRoot,path).replaceAll('\\','/');
    if(!/\.(?:js|mjs)$/iu.test(rel))continue;
    const uri='/'+rel;
    revisionImports[uri]=uri+'?v='+runtimeRevision;
  }
  const importMapPayload=JSON.stringify({imports:revisionImports}).replaceAll('<','\\u003c');
  const revisionImportMap='<script type="importmap">'+importMapPayload+'</script>';
  // CSP stays restrictive: authorize only this generated, content-addressed import map.
  const allowedImportMapHash='sha256-'+createHash('sha256').update(importMapPayload,'utf8').digest('base64');
  const headersPath=join(siteRoot,'_headers');
  if(await exists(headersPath)){
    const originalHeaders=await readFile(headersPath,'utf8');
    let route='';
    const headerRoutes=new Set();
    const cspPattern=/script-src 'self' blob: 'wasm-unsafe-eval'(?: 'sha256-[A-Za-z0-9+/=]+')*/;
    const updatedHeaders=originalHeaders.split('\n').map(line=>{
      if(line.startsWith('/')){route=line.trim();return line;}
      if((route==='/demo/*'||route==='/studio/*'||route==='/en/demo/*'||route==='/en/studio/*')&&/^\s+Content-Security-Policy:/.test(line)){
        if(!cspPattern.test(line))throw new Error('Import map CSP cannot be applied to '+route);
        headerRoutes.add(route);
        return line.replace(cspPattern,"script-src 'self' blob: 'wasm-unsafe-eval' '"+allowedImportMapHash+"'");
      }
      return line;
    }).join('\n');
    if(headerRoutes.size!==4)throw new Error('Missing Spanish or English Studio/Viewer CSP section for revision import map');
    if(updatedHeaders!==originalHeaders)await writeFile(headersPath,updatedHeaders,'utf8');
  }

  const sharedUiRevision={};
  for(const asset of ['p2lrn.js','p2lrn.css','en/p2lrn.js','analytics/demo.js','en/analytics/demo.js']){
    const path=join(siteRoot,asset);
    if(!await exists(path))continue;
    sharedUiRevision[asset]=createHash('sha256').update(await readFile(path)).digest('hex').slice(0,12);
  }
  const changes=[];
  for(const htmlPath of htmlFiles){
    let html=await readFile(htmlPath,'utf8');
    const previous=html;
    html=html.replace(/<div class="header-meta">([\s\S]*?)<\/div>/giu,(block,inner)=>
      inner.includes('data-functional-status')?block:'');
    const pageRelative=relative(siteRoot,htmlPath).replaceAll('\\','/');
    const englishPage=pageRelative.startsWith('en/');
    const docsPage=pageRelative.startsWith('docs/')||pageRelative.startsWith('en/docs/');
    if(!docsPage){
      const prefix=englishPage?'/en':'';
      const publicFallbackNav=englishPage
        ?'<nav class="nav" id="nav" aria-label="Main navigation">'+
          '<a href="/en/studio/">Studio</a>'+
          '<a href="/en/crear-cursos-interactivos/">Create courses</a>'+
          '<a href="/en/juegos-educativos-3d/">3D games</a>'+
          '<a href="/en/cursos-offline/">Offline courses</a>'+
          '<a href="/en/analytics/">Analytics</a>'+
          '<a href="/en/skills/">AI Skills</a>'+
          '<a href="/en/docs/">Documentation</a>'+
          '<a href="/en/contacto/">Contact</a>'+
        '</nav>'
        :'<nav class="nav" id="nav" aria-label="Navegación principal">'+
          '<a href="/studio/">Studio</a>'+
          '<a href="/crear-cursos-interactivos/">Crear cursos</a>'+
          '<a href="/juegos-educativos-3d/">Juegos 3D</a>'+
          '<a href="/cursos-offline/">Cursos offline</a>'+
          '<a href="/analytics/">Analytics</a>'+
          '<a href="/skills/">Skills para IA</a>'+
          '<a href="/docs/">Documentación</a>'+
          '<a href="/contacto/">Contacto</a>'+
        '</nav>';
      html=html.replace(/<nav class="nav" id="nav"(?:\s[^>]*)?>[\s\S]*?<\/nav>/iu,publicFallbackNav);
    }
    if(englishPage&&sharedUiRevision['en/p2lrn.js']){
      html=html.replace(/src=["']\/en\/p2lrn\.js(?:\?[^"']*)?["']/gi,'src="/en/p2lrn.js?v='+sharedUiRevision['en/p2lrn.js']+'"');
    }else if(sharedUiRevision['p2lrn.js']){
      html=html.replace(/src=["']\/p2lrn\.js(?:\?[^"']*)?["']/gi,'src="/p2lrn.js?v='+sharedUiRevision['p2lrn.js']+'"');
    }
    if(sharedUiRevision['p2lrn.css']){
      html=html.replace(/href=["']\/p2lrn\.css(?:\?[^"']*)?["']/gi,'href="/p2lrn.css?v='+sharedUiRevision['p2lrn.css']+'"');
    }
    if(sharedUiRevision['analytics/demo.js']){
      html=html.replace(/src=["']\/analytics\/demo\.js(?:\?[^"']*)?["']/gi,'src="/analytics/demo.js?v='+sharedUiRevision['analytics/demo.js']+'"');
    }
    if(sharedUiRevision['en/analytics/demo.js']){
      html=html.replace(/src=["']\/en\/analytics\/demo\.js(?:\?[^"']*)?["']/gi,'src="/en/analytics/demo.js?v='+sharedUiRevision['en/analytics/demo.js']+'"');
    }
    if(/(?:src|href)=["']\/(?:player\/current\/dist\/p2lrn\.js|studio\/studio\.(?:js|css)|demo\/viewer\.js|en\/(?:studio\/studio\.js|demo\/viewer\.js))/iu.test(html)){
      html=html.replace(
        /\b(src|href)=(["'])(\/(?:player\/current\/dist\/p2lrn\.js|studio\/studio\.(?:js|css)|demo\/viewer\.js|en\/(?:studio\/studio\.js|demo\/viewer\.js)))(?:\?[^"']*)?\2/giu,
        (_,kind,quote,asset)=>kind+'='+quote+asset+'?v='+runtimeRevision+quote,
      );
      const oldMap=generatedImportMap(html);
      if(oldMap)html=html.replace(oldMap,revisionImportMap);
      else html=html.replace(/<head(?:\s[^>]*)?>/iu,tag=>tag+revisionImportMap);
    }
    if(html!==previous){
      await writeFile(htmlPath,html);
      changes.push(relative(siteRoot,htmlPath).replaceAll('\\','/'));
    }
  }
  return {runtimeRevision,revisionImports,sharedUiRevision,changes};
}
