// Content-addressed allowlist for the P2LRN sandbox bootstrap scripts.
// about:srcdoc inherits the embedding page's CSP. A CSP placed *inside* the
// iframe cannot authorize code disallowed by its parent. Keep script-src
// restrictive by hashing only deterministic, first-party runtime bootstraps.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createOpaquePackageRuntimeDocument} from '../../packages/toolkit/web/renderers/package-runtime.js';
import {createScormSandboxShell} from '../../packages/toolkit/web/renderers/scorm-runtime.js';
import {createOpaqueH5PRuntimeDocument} from '../../packages/toolkit/web/h5p-auto-runtime.js';

const ROUTES=new Set(['/demo/*','/en/demo/*','/studio/*','/en/studio/*']);
function inlineBootstrap(html,label){
  const opening=html.indexOf('<script>');
  const closing=html.indexOf('</script>',opening);
  if(opening<0||closing<=opening)throw new Error('Missing deterministic inline bootstrap: '+label);
  if(html.indexOf('<script>',opening+1)!==-1)
    throw new Error('Multiple inline bootstraps require manual review: '+label);
  return html.slice(opening+'<script>'.length,closing);
}

export function runtimeBootstrapCspManifest(){
  const scripts={
    cmi5:inlineBootstrap(createOpaquePackageRuntimeDocument(),'cmi5'),
    scorm12:inlineBootstrap(createScormSandboxShell(null,'1.2'),'scorm12'),
    scorm2004:inlineBootstrap(createScormSandboxShell(null,'2004'),'scorm2004'),
    h5p:inlineBootstrap(createOpaqueH5PRuntimeDocument(),'h5p'),
  };
  const integrity=Object.fromEntries(Object.entries(scripts).map(([format,source])=>[
    format,'sha256-'+createHash('sha256').update(source,'utf8').digest('base64'),
  ]));
  if(new Set(Object.values(integrity)).size!==Object.keys(integrity).length)
    throw new Error('Unexpected runtime bootstrap digest collision');
  return Object.freeze({
    schema:'https://p2lrn.org/schema/runtime-bootstrap-csp/1',
    core:'0.4.0',
    hashes:integrity,
    routes:[...ROUTES],
  });
}

export async function authorizeOpaqueRuntimeBootstraps({outputRoot}){
  if(!outputRoot)throw new TypeError('outputRoot is required');
  const manifest=runtimeBootstrapCspManifest();
  const digestTokens=Object.values(manifest.hashes).map(x=>"'"+x+"'");
  const path=join(outputRoot,'_headers');
  const old=await readFile(path,'utf8');
  const seen=new Set();
  let route='';
  const updated=old.split('\n').map(line=>{
    if(line.startsWith('/')){route=line.trim();return line;}
    if(!ROUTES.has(route)||!/^\s+Content-Security-Policy:/.test(line))return line;
    if(seen.has(route))throw new Error('Duplicate runtime CSP route: '+route);
    seen.add(route);
    const match=/script-src ([^;]*);/.exec(line);
    if(!match||!match[1].includes("'self'")||!match[1].includes('blob:')||
       match[1].includes("'unsafe-inline'"))
      throw new Error('Refusing to loosen or patch unexpected CSP: '+route);
    return line.replace(match[0],'script-src '+match[1]+' '+digestTokens.join(' ')+';');
  }).join('\n');
  if(seen.size!==ROUTES.size)throw new Error('Missing runtime CSP route: '+[...ROUTES].filter(x=>!seen.has(x)).join(', '));
  await writeFile(path,updated,'utf8');
  await writeFile(join(outputRoot,'runtime-bootstrap-csp.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
  return manifest;
}
