#!/usr/bin/env node
// P2LRN official adapter. No automatic installs, network requests or executable package content.
import {readFile,stat,access,mkdtemp,rm} from 'node:fs/promises';
import {basename,dirname,extname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const operations=new Set(['setCourseRights','setCourseMetadata','setEntityText','setChildren','setProgression','addUnit','addFile','addUrl','addWebContent','addQuestionnaire','addComponent','addComposite']);
const exists=p=>access(p).then(()=>true,()=>false);
function fail(s){throw Error(s)}
const path=p=>{if(!p||typeof p!=='string')fail('Ruta requerida');return resolve(p)};
async function matrix(){const j=JSON.parse(await readFile(join(dir,'../references/official-packages.json'),'utf8'));if(j.apiVersion!==1)fail('Authoring API incompatible');return j}
function parse(argv){const opts={},pos=[];for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--root'||a==='--workspace'){if(opts[a])fail('Opción duplicada: '+a);opts[a]=argv[++i];if(!opts[a])fail('Falta valor de '+a)}else if(a.startsWith('--'))fail('Opción desconocida: '+a);else pos.push(a)}return {opts,pos}}
async function capabilities(root=process.cwd()){
 root=path(root);const m=await matrix(),packages={};
 for(const name of ['toolkit','studio','player','analytics']){
  let found=null;for(const base of [join(root,'node_modules','@p2lrn',name),join(root,'packages',name)]){
   try{const j=JSON.parse(await readFile(join(base,'package.json'),'utf8'));if(j.name==='@p2lrn/'+name){found={installed:true,version:j.version,exact:j.version===m.packages[name],root:base};break}}catch{}
  }
  packages[name]=found??{installed:false,exact:false,version:null};
 }
 return {node:process.versions.node,compatibleNode:Number(process.versions.node.split('.')[0])>=22,format:m.format,expected:m.packages,packages,
  studio:'navegador y/o Host',player:'navegador y prueba visual',analytics:'Host autorizado',mcp:'conexión y permisos independientes',lms:'LTI/credenciales autorizadas'};
}
async function official(root,part){
 const info=await capabilities(root);if(!info.compatibleNode)fail('Toolkit requiere Node 22+');
 const tool=info.packages.toolkit;if(!tool.installed)fail('Toolkit no instalado. La Skill NO instala dependencias automáticamente');
 if(!tool.exact)fail('Versión Toolkit no probada: '+tool.version+'; esperado '+info.expected.toolkit);
 const target=join(tool.root,'dist',part,'index.js');if(!await exists(target))fail('Toolkit no compilado: '+target);
 return import(pathToFileURL(target).href);
}
async function jsonFile(p){
 const s=await stat(path(p));if(!s.isFile()||s.size>2*1024*1024)fail('Plan JSON inválido o mayor que 2 MB');
 const j=JSON.parse(await readFile(path(p),'utf8'));if(!j||Array.isArray(j)||typeof j!=='object')fail('Se requiere un objeto JSON');
 return j;
}
function fields(o,allow){for(const k of Object.keys(o))if(!allow.includes(k))fail('Campo no autorizado: '+k)}
function opCheck(a){
 if(!a||Array.isArray(a)||typeof a!=='object')fail('Operación inválida');
 fields(a,['method','options','key','children']);if(!operations.has(a.method))fail('Método no autorizado: '+a.method);
 if(a.method==='setChildren'){if(typeof a.key!=='string'||!Array.isArray(a.children))fail('setChildren requiere key y children');return}
 if(['setEntityText','setProgression'].includes(a.method)&&typeof a.key!=='string')fail('Falta key');
 if(!['setProgression'].includes(a.method)&&(!a.options||typeof a.options!=='object'||Array.isArray(a.options)))fail('options requeridas');
 if(a.options?.force)fail('force no permitido');
}
function apply(w,a){opCheck(a);if(a.method==='setChildren')return w.setChildren(a.key,a.children);
 if(['setEntityText','setProgression'].includes(a.method))return w[a.method](a.key,a.options??null);
 return w[a.method](a.options)}
async function notExists(p){if(await exists(p))fail('No sobrescribir original: '+p)}
async function run(argv=process.argv.slice(2)){
 const {opts,pos}=parse(argv),[cmd,...p]=pos,root=path(opts['--root']??process.cwd());
 if(!cmd||cmd==='help')return {usage:'<capabilities|create|verify|inspect|open|edit|build|read-document> ... [--root install-or-repo]'};
 if(cmd==='capabilities')return capabilities(root);
 if(!['create','verify','inspect','open','edit','build','read-document'].includes(cmd))fail('Comando desconocido '+cmd);
 const part=cmd==='verify'?'core':cmd==='inspect'?'reader':cmd==='read-document'?'document-reader':'authoring';
 const toolkit=await official(root,part);
 if(cmd==='verify'){
  if(p.length!==1||extname(p[0]).toLowerCase()!=='.p2lrn')fail('Uso: verify curso.p2lrn');
  const v=toolkit.validatePackageFile(path(p[0]),{strictProfiles:true,validateProfilePayloads:true});
  return {valid:true,summary:v.summary,contentRoot:v.manifest?.integrity?.contentRoot};
 }
 if(cmd==='inspect'){
  if(p.length!==1)fail('Uso: inspect curso.p2lrn');
  return {summary:toolkit.openReaderFile(path(p[0]),{strictProfiles:true,validateProfilePayloads:true}).summary()};
 }
 if(cmd==='read-document'){
  if(p.length!==1)fail('Uso: read-document documento');
  const filename=path(p[0]),size=await stat(filename);if(!size.isFile()||size.size>50*1024*1024)fail('Límite de 50 MiB');
  return {document:await toolkit.readDocument({name:basename(filename),data:new Uint8Array(await readFile(filename))})};
 }
 if(cmd==='create'){
  if(p.length!==2||extname(p[1]).toLowerCase()!=='.p2lrn')fail('Uso: create plan.json nuevo.p2lrn');
  const plan=await jsonFile(p[0]),output=path(p[1]);await notExists(output);
  fields(plan,['title','language','description','rights','units','operations']);
  if(typeof plan.title!=='string'||!plan.title.trim())fail('title obligatorio');
  if((plan.units!==undefined&&!Array.isArray(plan.units))||(plan.operations!==undefined&&!Array.isArray(plan.operations)))fail('units y operations deben ser listas');
  if((plan.units?.length??0)>150||(plan.operations?.length??0)>250)fail('Plan demasiado extenso');
  const temporary=!opts['--workspace'],workspace=temporary?await mkdtemp(join(tmpdir(),'p2lrn-official-')):path(opts['--workspace']);
  if(!temporary)await notExists(workspace);
  try{
   const w=toolkit.createAuthoringWorkspace(workspace,{title:plan.title,language:plan.language??'es',description:plan.description});
   if(plan.rights){fields(plan.rights,['author','createdAt','license','copyrightHolder']);w.setCourseRights(plan.rights)}
   for(const u of plan.units??[]){fields(u,['key','title','parent','language','role']);w.addUnit(u)}
   for(const a of plan.operations??[])apply(w,a);
   const result=w.build(output,{strictProfiles:true});const core=await official(root,'core');
   const verified=core.validatePackageFile(output,{strictProfiles:true,validateProfilePayloads:true});
   return {created:true,output,contentRoot:result.contentRoot,summary:verified.summary,workspace:temporary?null:workspace};
  }catch(e){if(await exists(output))await rm(output,{force:true}).catch(()=>{});throw e}
  finally{if(temporary)await rm(workspace,{recursive:true,force:true}).catch(()=>{})}
 }
 if(cmd==='open'){
  if(p.length!==2||extname(p[0]).toLowerCase()!=='.p2lrn')fail('Uso: open original.p2lrn directorio');
  const workspace=path(p[1]);await notExists(workspace);
  return {opened:true,summary:toolkit.openAuthoringWorkspace(path(p[0]),workspace).summary()};
 }
 if(cmd==='edit'){
  if(p.length!==2)fail('Uso: edit directorio cambios.json');
  const spec=await jsonFile(p[1]);fields(spec,['operations']);
  if(!Array.isArray(spec.operations)||spec.operations.length>250)fail('operations requerido');
  const w=toolkit.loadAuthoringWorkspace(path(p[0]));for(const a of spec.operations)apply(w,a);
  return {edited:true,summary:w.summary()};
 }
 if(cmd==='build'){
  if(p.length!==2||extname(p[1]).toLowerCase()!=='.p2lrn')fail('Uso: build directorio nuevo.p2lrn');
  const output=path(p[1]);await notExists(output);
  const w=toolkit.loadAuthoringWorkspace(path(p[0])),v=w.build(output,{strictProfiles:true});
  const core=await official(root,'core');
  return {built:true,output,contentRoot:v.contentRoot,summary:core.validatePackageFile(output,{strictProfiles:true,validateProfilePayloads:true}).summary};
 }
}
const direct=process.argv[1]&&path(process.argv[1])===fileURLToPath(import.meta.url);
if(direct)run().then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(JSON.stringify({valid:false,error:String(e.message||e)}));process.exitCode=1});
export {run,capabilities};
