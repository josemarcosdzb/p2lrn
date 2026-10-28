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
  for(const rel of ['demo/viewer.js','studio/studio.js','studio/studio.css']){
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
      if((route==='/demo/*'||route==='/studio/*')&&/^\s+Content-Security-Policy:/.test(line)){
        if(!cspPattern.test(line))throw new Error('Import map CSP cannot be applied to '+route);
        headerRoutes.add(route);
        return line.replace(cspPattern,"script-src 'self' blob: 'wasm-unsafe-eval' '"+allowedImportMapHash+"'");
      }
      return line;
    }).join('\n');
    if(headerRoutes.size!==2)throw new Error('Missing Studio or Viewer CSP section for revision import map');
    if(updatedHeaders!==originalHeaders)await writeFile(headersPath,updatedHeaders,'utf8');
  }

  const sharedUiRevision={};
  for(const asset of ['p2lrn.js','p2lrn.css']){
    const path=join(siteRoot,asset);
    if(!await exists(path))continue;
    sharedUiRevision[asset]=createHash('sha256').update(await readFile(path)).digest('hex').slice(0,12);
  }
  const changes=[];
  for(const htmlPath of htmlFiles){
    let html=await readFile(htmlPath,'utf8');
    const previous=html;
    if(sharedUiRevision['p2lrn.js']){
      html=html.replace(/src=["']\/p2lrn\.js(?:\?[^"']*)?["']/gi,'src="/p2lrn.js?v='+sharedUiRevision['p2lrn.js']+'"');
    }
    if(sharedUiRevision['p2lrn.css']){
      html=html.replace(/href=["']\/p2lrn\.css(?:\?[^"']*)?["']/gi,'href="/p2lrn.css?v='+sharedUiRevision['p2lrn.css']+'"');
    }
    if(/(?:src|href)=["']\/(?:player\/current\/dist\/p2lrn\.js|studio\/studio\.(?:js|css)|demo\/viewer\.js)/iu.test(html)){
      html=html.replace(
        /\b(src|href)=(["'])(\/(?:player\/current\/dist\/p2lrn\.js|studio\/studio\.(?:js|css)|demo\/viewer\.js))(?:\?[^"']*)?\2/giu,
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
