import {existsSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve, sep} from 'node:path';
import {safeZipPath} from '../core/zip.js';
import {randomUUID} from 'node:crypto';
import {ProjectError} from '../core/errors.js';
import {newUrnUuid} from '../core/uuid.js';
import {P2LRNReader} from '../reader/index.js';
import {repackPackage} from '../tools/repack.js';
import {PROJECT_FILE, saveProject, validateProject, type CreatorProject} from './project.js';

export interface OpenPackageProjectOptions { force?: boolean; }
export interface OpenPackageProjectResult {
  package: string;
  project: string;
  sourceFormat: string;
  sourcePackageId: string;
  sourceContentRoot: string;
  entities: number;
  files: number;
  preservedFiles: number;
  canonicalMigration: boolean;
}

function emptyDirectory(path:string):boolean{return !existsSync(path)||readdirSync(path).length===0;}
function workspacePath(packagePath:string):string{
  // ZIP names are virtual paths; Windows disk extraction must ALSO reject
  // ADS, reserved device names, trailing spaces/dots and ambiguous aliases.
  const safe=safeZipPath(packagePath),parts=safe.split('/');
  for(const part of parts){
    if(!part||/[<>:"|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||
       /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(part))
      throw new ProjectError('unsafe import filesystem member: '+packagePath);
  }
  return ['package-files',...parts].join('/');
}
function diskPath(root:string,rel:string):string{
  const base=resolve(root),out=resolve(base,...rel.split('/'));
  if(out!==base&&!out.startsWith(base+sep))
    throw new ProjectError('import member escapes project root: '+rel);
  return out;
}
function copyFields(source:any,target:any,names:string[]):void{for(const name of names)if(Object.prototype.hasOwnProperty.call(source,name))target[name]=structuredClone(source[name]);}
function creatorProjectId(graph:any):string|undefined{const ext=graph?.extensions?.['org.p2lrn.creator'];return ext&&typeof ext==='object'&&typeof ext.projectId==='string'&&ext.projectId?ext.projectId:undefined;}
function nextKey(type:string,counters:Map<string,number>):string{if(type==='course')return'course';const n=(counters.get(type)??0)+1;counters.set(type,n);return`${type}-${String(n).padStart(3,'0')}`;}

export function openPackageAsProject(packagePath:string,projectRoot:string,options:OpenPackageProjectOptions={}):OpenPackageProjectResult{
  const pkg=resolve(packagePath),root=resolve(projectRoot);
  if(existsSync(root)&&!emptyDirectory(root)){if(!options.force)throw new ProjectError(`project directory is not empty: ${root}; use force to replace it`);rmSync(root,{recursive:true,force:true});}
  mkdirSync(root,{recursive:true});
  const reader=new P2LRNReader(pkg,{strictProfiles:false,validateProfilePayloads:false});
  const {manifest,graph,archive}=reader.package;
  if(manifest.format!=='P2LRN'){
    const temp=join(dirname(root),`.p2lrn-authoring-canonicalize-${randomUUID()}`);mkdirSync(temp,{recursive:true});
    try{
      const canonical=join(temp,'canonical.p2lrn');
      repackPackage(pkg,canonical,false,true);
      const result=openPackageAsProject(canonical,root,options);
      return{...result,package:pkg,sourceFormat:manifest.format,sourcePackageId:manifest.packageId,sourceContentRoot:manifest.integrity.contentRoot,canonicalMigration:true};
    }finally{rmSync(temp,{recursive:true,force:true});}
  }
  const primary=manifest.entrypoints.filter((e:any)=>e.type==='course'&&e.role==='primary');
  if(primary.length!==1)throw new ProjectError('editable Creator import requires exactly one primary course entrypoint');
  const courses=graph.entities.filter((e:any)=>e.type==='course');
  if(courses.length!==1||courses[0]!.id!==primary[0]!.id)throw new ProjectError('editable Creator import currently requires exactly one course entity matching the primary entrypoint');

  const counters=new Map<string,number>(),idToKey=new Map<string,string>(),entityOrder:string[]=[];
  for(const entity of graph.entities){const key=nextKey(entity.type,counters);if(idToKey.has(entity.id))throw new ProjectError(`duplicate entity id while importing: ${entity.id}`);idToKey.set(entity.id,key);entityOrder.push(key);}
  const keyFor=(id:string,context:string)=>{const key=idToKey.get(id);if(!key)throw new ProjectError(`broken ${context} reference while importing: ${id}`);return key;};
  const descriptorByPath=new Map(manifest.files.map((f:any)=>[f.path,f]));
  const written=new Set<string>(),diskAliases=new Set<string>(),representedPackagePaths=new Set<string>();
  const materialize=(packageMemberPath:string):string=>{
    const rel=workspacePath(packageMemberPath);
    if(!written.has(packageMemberPath)){
      const diskKey=rel.toLowerCase();
      if(diskAliases.has(diskKey))throw new ProjectError('case-insensitive import path collision: '+rel);
      const out=diskPath(root,rel);
      mkdirSync(dirname(out),{recursive:true});
      writeFileSync(out,archive.read(packageMemberPath),{flag:'wx',mode:0o600});
      diskAliases.add(diskKey);
      written.add(packageMemberPath);
    }
    return rel;
  };
  const sourceFor=(rep:any):any=>{
    const loc=rep.location??{};
    if(loc.type==='remote')return{type:'remote',href:loc.href,...(loc.expectedDigest?{expectedDigest:loc.expectedDigest}:{})};
    if(loc.type!=='embedded'&&loc.type!=='package-member')throw new ProjectError(`unsupported representation location while importing: ${rep.id}`);
    const packagePathValue=loc.type==='embedded'?String(loc.path):String(loc.package),desc=descriptorByPath.get(packagePathValue) as any;
    if(!desc)throw new ProjectError(`representation payload is not inventoried while importing: ${packagePathValue}`);
    representedPackagePaths.add(packagePathValue);
    const source:any={type:loc.type==='embedded'?'package-file':'package-member',path:materialize(packagePathValue),packagePath:packagePathValue,packageMediaType:desc.mediaType,method:archive.entries.get(packagePathValue)?.method};
    if(desc.schema)source.schema=desc.schema;
    if(loc.type==='package-member')source.member=loc.member;
    return source;
  };
  const portable=(e:any)=>({portableId:e.id});
  const courseEntity=courses[0]!;
  const course:any={key:keyFor(courseEntity.id,'course'),...portable(courseEntity),revision:courseEntity.revision,title:structuredClone(courseEntity.title),children:(courseEntity.children??[]).map((id:string)=>keyFor(id,'child'))};
  copyFields(courseEntity,course,['description','languages','extensions']);
  const units:any[]=[],resources:any[]=[],activities:any[]=[],objectives:any[]=[];
  for(const entity of graph.entities){const key=keyFor(entity.id,'entity');if(entity.type==='course')continue;
    if(entity.type==='unit'){const out:any={key,...portable(entity),role:entity.role,title:structuredClone(entity.title),children:(entity.children??[]).map((id:string)=>keyFor(id,'child'))};copyFields(entity,out,['description','extensions']);units.push(out);continue;}
    if(entity.type==='resource'){const out:any={key,...portable(entity),representations:[]};copyFields(entity,out,['title','description','extensions']);let i=0;for(const rep of entity.representations??[]){i++;const rout:any={key:`rep-${String(i).padStart(3,'0')}`,portableId:rep.id,role:rep.role,mediaType:rep.mediaType,source:sourceFor(rep)};copyFields(rep,rout,['profile','language','originalName','accessibility','extensions']);out.representations.push(rout);}resources.push(out);continue;}
    if(entity.type==='activity'){const out:any={key,...portable(entity),activityType:entity.activityType,title:structuredClone(entity.title)};copyFields(entity,out,['description','extensions']);if(entity.resource)out.resource=keyFor(entity.resource,'resource');if(entity.resources)out.resources=entity.resources.map((id:string)=>keyFor(id,'resource'));if(entity.objectives)out.objectives=entity.objectives.map((id:string)=>keyFor(id,'objective'));if(entity.children)out.children=entity.children.map((id:string)=>keyFor(id,'child'));activities.push(out);continue;}
    if(entity.type==='objective'){const out:any={key,...portable(entity),title:structuredClone(entity.title)};copyFields(entity,out,['description','alignments','extensions']);objectives.push(out);continue;}
    throw new ProjectError(`unsupported graph entity type for editable import: ${entity.type}`);
  }
  const preservedFiles:any[]=[];
  for(const desc of manifest.files){if(representedPackagePaths.has(desc.path))continue;const item:any={path:materialize(desc.path),packagePath:desc.path,mediaType:desc.mediaType,method:archive.entries.get(desc.path)?.method};if(desc.schema)item.schema=desc.schema;preservedFiles.push(item);}
  const entrypoints=manifest.entrypoints.map((e:any)=>({key:keyFor(e.id,'entrypoint'),type:e.type,role:e.role}));
  const relations=graph.relations.map((r:any)=>({source:keyFor(r.source,'relation source'),predicate:r.predicate,target:keyFor(r.target,'relation target'),...(r.extensions?{extensions:structuredClone(r.extensions)}:{})}));
  const project:CreatorProject={projectVersion:'0.3.0',targetFormatVersion:manifest.formatVersion,projectId:creatorProjectId(graph)??newUrnUuid(),profilePolicy:'preserve',graphPolicy:'preserve',sourcePackage:{format:manifest.format,formatVersion:manifest.formatVersion,packageId:manifest.packageId,contentRoot:manifest.integrity.contentRoot},course,units,resources,activities,objectives,relations,profiles:structuredClone(manifest.profiles),entrypoints,entityOrder,...(Object.prototype.hasOwnProperty.call(graph,'extensions')?{graphExtensions:structuredClone(graph.extensions)}:{}),preservedFiles};
  validateProject(project);const projectFile=join(root,PROJECT_FILE);saveProject(projectFile,project);
  return{package:pkg,project:projectFile,sourceFormat:manifest.format,sourcePackageId:manifest.packageId,sourceContentRoot:manifest.integrity.contentRoot,entities:graph.entities.length,files:manifest.files.length,preservedFiles:preservedFiles.length,canonicalMigration:manifest.format!=='P2LRN'};
}
