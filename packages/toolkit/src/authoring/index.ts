import {existsSync, mkdirSync, readdirSync, rmSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {basename, dirname, resolve} from 'node:path';
import {ProjectError} from '../core/errors.js';
import {FORMAT_VERSION, PROFILE, canonicalIdentifier} from '../core/constants.js';
import {portableUrn, uuidNamespace} from '../core/uuid.js';
import {applyCourseRights, type CourseRightsChanges, type CourseRights} from '../core/course-rights.js';
import {buildProject, type BuildResult} from '../creator/builder.js';
import {openPackageAsProject, type OpenPackageProjectOptions} from '../creator/import-project.js';
import {readDocument, type DocumentReaderOptions, type ExtractedDocument} from '../document-reader/index.js';
import {
  addComponent as creatorAddComponent,
  addComposite as creatorAddComposite,
  addFile as creatorAddFile,
  addQuestionnaire as creatorAddQuestionnaire,
  addUnit as creatorAddUnit,
  addUrl as creatorAddUrl,
  addWebContent as creatorAddWebContent,
  appendChild,
  entityByKey,
  loadProject,
  newProject,
  projectPath,
  saveProject,
  upgradeProjectWorkspace,
  validateProject,
  type CreatorProject,
} from '../creator/project.js';

/** Stable public contract consumed by P2LRN Studio and other authoring hosts. */
export const AUTHORING_API_VERSION = '1' as const;
/** Current editable workspace schema written by the Node/TypeScript Creator. */
export const AUTHORING_PROJECT_VERSION = '0.3.0' as const;
export const AUTHORING_FORMAT_VERSION = FORMAT_VERSION;

export interface AuthoringCreateOptions { title:string; language?:string; description?:string; force?:boolean; }
export interface AuthoringBuildOptions { strictProfiles?:boolean; }
export interface AuthoringTextOptions { language?:string; title?:string; description?:string|null; }
export interface AuthoringCourseRightsResult {key:string; rights:CourseRights;}
export interface AuthoringCourseOptions extends AuthoringTextOptions { revision?:number; incrementRevision?:boolean; }
export interface AuthoringUnitOptions { key:string; title:string; language?:string; role?:string; parent?:string; }
export interface AuthoringFileOptions { source:string; key:string; title:string; language?:string; parent?:string; mediaType?:string; profile?:string; role?:string; activityType?:string; copyFile?:boolean; }
export interface AuthoringUrlOptions { url:string; key:string; title:string; language?:string; parent?:string; mediaType?:string; profile?:string; role?:string; activityType?:string; }
export interface AuthoringWebContentOptions { sourceDirectory:string; entrypoint?:string; key:string; title:string; language?:string; parent?:string; copyDirectory?:boolean; }
export interface AuthoringQuestionnaireOptions { source:string; key:string; title?:string; language?:string; parent?:string; copyFile?:boolean; renderer?:string; rendererVersion?:string; }
export interface AuthoringComponentOptions { source:string; key:string; title?:string; language?:string; parent?:string; copyFile?:boolean; }
export interface AuthoringCompositeOptions { key:string; title:string; children:string[]; language?:string; parent?:string; mode?:'sequence'|'free'; completion?:'all'|'any'; navigation?:'linear'|'open'; moveChildren?:boolean; }
export interface AuthoringUnitResult { unitKey:string; parentKey:string; }
export interface AuthoringResourceActivityResult { resourceKey:string; activityKey:string; parentKey:string; }
export interface AuthoringEntityTextResult { key:string; language:string; }
export interface AuthoringChildrenResult { parentKey:string; children:string[]; }
export type AuthoringProgressionRequirement = 'viewed'|'completed'|'passed';
export interface AuthoringProgressionCondition {
  entityKey:string;
  status?:AuthoringProgressionRequirement;
  minScore?:number;
}
export interface AuthoringProgressionUnlock {
  all?:AuthoringProgressionCondition[];
  any?:AuthoringProgressionCondition[];
}
export interface AuthoringProgressionOptions {
  required?:boolean;
  gateFollowing?:boolean;
  completionRequirement?:AuthoringProgressionRequirement;
  minScore?:number|null;
  unlockWhen?:AuthoringProgressionUnlock|null;
}
export interface AuthoringProgressionResult {
  key:string;
  rule:Record<string,unknown>|null;
  profileRequirement:'required'|'optional'|null;
}

export interface AuthoringWorkspaceSummary {
  apiVersion:typeof AUTHORING_API_VERSION;
  projectVersion:string;
  targetFormatVersion:string;
  projectId:string;
  projectFile:string;
  root:string;
  sourcePackage?:CreatorProject['sourcePackage'];
  counts:{units:number;resources:number;activities:number;objectives:number;relations:number;preservedFiles:number;};
}

function clone<T>(value:T):T{return structuredClone(value);}
function ensureReplaceableDirectory(root:string,force=false):void{
  if(!existsSync(root)){mkdirSync(root,{recursive:true});return;}
  if(readdirSync(root).length===0)return;
  if(!force)throw new ProjectError(`authoring workspace is not empty: ${root}; use force to replace it`);
  rmSync(root,{recursive:true,force:true});mkdirSync(root,{recursive:true});
}
function normalizedLanguage(language:string|undefined,project:CreatorProject):string{return language?.trim()||project.course?.languages?.[0]||'es';}
function setLocalizedText(entity:any,options:AuthoringTextOptions,language:string):void{
  if(options.title!==undefined){const value=options.title.trim();if(!value)throw new ProjectError('title must not be empty');entity.title??={};entity.title[language]=value;}
  if(options.description!==undefined){entity.description??={};if(options.description===null||!options.description.trim())delete entity.description[language];else entity.description[language]=options.description.trim();if(Object.keys(entity.description).length===0)delete entity.description;}
}
function authoringEntityKind(project:CreatorProject,key:string):'course'|'unit'|'activity'|'other'{
  if(project.course?.key===key)return'course';
  if(project.units?.some((item:any)=>item.key===key))return'unit';
  if(project.activities?.some((item:any)=>item.key===key))return'activity';
  return'other';
}
function authoringPortableId(project:CreatorProject,key:string):string{
  const entity=entityByKey(project,key),kind=authoringEntityKind(project,key);
  if(kind==='other')throw new ProjectError(`progression target must be course, unit or activity: ${key}`);
  return canonicalIdentifier(String(entity.portableId??portableUrn(uuidNamespace(project.projectId),kind,key)));
}
function progressionScore(value:number|undefined,label:string):number|undefined{
  if(value===undefined)return undefined;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw new ProjectError(`${label} must be a percentage from 0 to 100`);
  return value;
}
function syncProgressionProfile(project:CreatorProject):'required'|'optional'|null{
  const holders=[project.course,...project.units,...project.activities];
  const rules=holders.map((entity:any)=>entity.extensions?.[PROFILE.progression]).filter((value:any)=>value&&typeof value==='object'&&!Array.isArray(value));
  project.profiles=(project.profiles??[]).filter((profile:any)=>canonicalIdentifier(String(profile.id))!==PROFILE.progression);
  if(!rules.length)return null;
  const gating=rules.some((rule:any)=>rule.gateFollowing===true||rule.unlockWhen!=null);
  const resolved:'required'|'optional'=gating?'required':'optional';
  project.profiles.push({id:PROFILE.progression,version:FORMAT_VERSION,requirement:resolved});
  return resolved;
}

export class P2LRNAuthoringWorkspace {
  readonly root:string;
  readonly projectFile:string;
  #project:CreatorProject;

  private constructor(root:string,projectFile:string,project:CreatorProject){this.root=root;this.projectFile=projectFile;this.#project=clone(project);}

  static create(root:string,options:AuthoringCreateOptions):P2LRNAuthoringWorkspace{
    const target=resolve(root);ensureReplaceableDirectory(target,options.force);
    const project=newProject(options.title,options.language??'es',options.description);
    const file=projectPath(target);saveProject(file,project);
    return new P2LRNAuthoringWorkspace(target,file,project);
  }
  static open(packagePath:string,root:string,options:OpenPackageProjectOptions={}):P2LRNAuthoringWorkspace{openPackageAsProject(packagePath,root,options);return P2LRNAuthoringWorkspace.load(root);}
  static load(root:string):P2LRNAuthoringWorkspace{const loaded=loadProject(root);return new P2LRNAuthoringWorkspace(resolve(dirname(loaded.path)),loaded.path,loaded.project);}

  /** Detached project snapshot for inspection. Studio should edit through typed methods below. */
  get project():CreatorProject{return clone(this.#project);}
  summary():AuthoringWorkspaceSummary{const p=this.#project;return{apiVersion:AUTHORING_API_VERSION,projectVersion:p.projectVersion,targetFormatVersion:p.targetFormatVersion,projectId:p.projectId,projectFile:this.projectFile,root:this.root,...(p.sourcePackage?{sourcePackage:clone(p.sourcePackage)}:{}),counts:{units:p.units.length,resources:p.resources.length,activities:p.activities.length,objectives:p.objectives.length,relations:p.relations.length,preservedFiles:(p.preservedFiles??[]).length}};}
  reload():CreatorProject{const loaded=loadProject(this.projectFile);this.#project=clone(loaded.project);return this.project;}
  upgrade():CreatorProject{const result=upgradeProjectWorkspace(this.root);this.#project=clone(result.project);return this.project;}

  /** @deprecated Low-level escape hatch. Studio integrations should use the typed editing methods. */
  replace(project:CreatorProject):CreatorProject{const next=clone(project);validateProject(next);saveProject(this.projectFile,next);this.#project=next;return this.project;}
  /** @deprecated Low-level escape hatch. Studio integrations should use the typed editing methods. */
  update(mutator:(draft:CreatorProject)=>void):CreatorProject{const draft=this.project;mutator(draft);return this.replace(draft);}

  #edit<T>(operation:(draft:CreatorProject)=>T):T{const draft=clone(this.#project),result=operation(draft);validateProject(draft);saveProject(this.projectFile,draft);this.#project=draft;return result;}

  setCourseRights(changes:CourseRightsChanges):AuthoringCourseRightsResult{
    return this.#edit(draft=>({key:draft.course.key,rights:applyCourseRights(draft.course,changes)}));
  }

  setCourseMetadata(options:AuthoringCourseOptions):AuthoringEntityTextResult{
    return this.#edit((draft)=>{const language=normalizedLanguage(options.language,draft);setLocalizedText(draft.course,options,language);draft.course.languages=[...new Set([...(draft.course.languages??[]),language])];if(options.revision!==undefined&&options.incrementRevision)throw new ProjectError('revision and incrementRevision are mutually exclusive');if(options.revision!==undefined){if(!Number.isInteger(options.revision)||options.revision<0)throw new ProjectError('course revision must be a non-negative integer');draft.course.revision=options.revision;}else if(options.incrementRevision)draft.course.revision=(draft.course.revision??0)+1;return{key:draft.course.key,language};});
  }
  setEntityText(key:string,options:AuthoringTextOptions):AuthoringEntityTextResult{
    return this.#edit((draft)=>{const language=normalizedLanguage(options.language,draft),entity=entityByKey(draft,key);setLocalizedText(entity,options,language);return{key,language};});
  }
  setChildren(parentKey:string,children:string[]):AuthoringChildrenResult{
    return this.#edit((draft)=>{const unique=[...new Set(children)];if(unique.length!==children.length)throw new ProjectError('children must not contain duplicate keys');const parent=entityByKey(draft,parentKey);parent.children=[];for(const child of unique)appendChild(draft,parentKey,child);return{parentKey,children:[...unique]};});
  }
  setProgression(key:string,options:AuthoringProgressionOptions|null):AuthoringProgressionResult{
    return this.#edit((draft)=>{
      const entity=entityByKey(draft,key),kind=authoringEntityKind(draft,key);
      if(kind==='other')throw new ProjectError('progression can only be set on course, unit or activity entities');
      entity.extensions??={};
      if(options===null){
        delete entity.extensions[PROFILE.progression];
        if(Object.keys(entity.extensions).length===0)delete entity.extensions;
        const profileRequirement=syncProgressionProfile(draft);
        return{key,rule:null,profileRequirement};
      }
      const rule:any={};
      if(options.required!==undefined){if(typeof options.required!=='boolean')throw new ProjectError('progression required must be boolean');rule.required=options.required;}
      if(options.gateFollowing!==undefined){
        if(typeof options.gateFollowing!=='boolean')throw new ProjectError('progression gateFollowing must be boolean');
        if(kind==='course'&&options.gateFollowing)throw new ProjectError('progression gateFollowing is not valid on the root course');
        rule.gateFollowing=options.gateFollowing;
      }
      if(options.completionRequirement!==undefined){
        if(!['viewed','completed','passed'].includes(options.completionRequirement))throw new ProjectError('progression completionRequirement must be viewed, completed or passed');
        rule.completionRequirement=options.completionRequirement;
      }
      if(options.minScore!==undefined&&options.minScore!==null){
        if(kind!=='activity')throw new ProjectError('progression minScore is only valid on activities');
        rule.minScore=progressionScore(options.minScore,'progression minScore');
      }
      if(options.unlockWhen!==undefined&&options.unlockWhen!==null){
        const hasAll=Array.isArray(options.unlockWhen.all),hasAny=Array.isArray(options.unlockWhen.any);
        if(hasAll===hasAny)throw new ProjectError('progression unlockWhen must contain exactly one of all or any');
        const mode=hasAll?'all':'any';
        const list=(hasAll?options.unlockWhen.all:options.unlockWhen.any)??[];
        if(!list.length)throw new ProjectError('progression unlockWhen conditions must not be empty');
        rule.unlockWhen={[mode]:list.map((condition,index)=>{
          if(!condition||typeof condition.entityKey!=='string'||!condition.entityKey)throw new ProjectError(`progression condition ${index} requires entityKey`);
          const targetKind=authoringEntityKind(draft,condition.entityKey);
          if(!['unit','activity'].includes(targetKind))throw new ProjectError(`progression condition target must be a unit or activity: ${condition.entityKey}`);
          if(condition.entityKey===key)throw new ProjectError('progression condition cannot depend on the same entity');
          const out:any={entity:authoringPortableId(draft,condition.entityKey)};
          if(condition.status!==undefined){
            if(!['viewed','completed','passed'].includes(condition.status))throw new ProjectError(`invalid progression condition status: ${condition.status}`);
            out.status=condition.status;
          }
          const minScore=progressionScore(condition.minScore,`progression condition minScore ${index}`);
          if(minScore!==undefined)out.minScore=minScore;
          return out;
        })};
      }
      entity.extensions[PROFILE.progression]=rule;
      const profileRequirement=syncProgressionProfile(draft);
      return{key,rule:clone(rule),profileRequirement};
    });
  }
  addUnit(options:AuthoringUnitOptions):AuthoringUnitResult{
    return this.#edit((draft)=>{const parent=options.parent??'course';creatorAddUnit(draft,options.key,options.title,options.language??'es',options.role??'module',parent);return{unitKey:options.key,parentKey:parent};});
  }
  addFile(options:AuthoringFileOptions):AuthoringResourceActivityResult{
    return this.#edit((draft)=>{const parent=options.parent??'course';const [resource,activity]=creatorAddFile(this.root,draft,options.source,options.key,options.title,{language:options.language??'es',parent,mediaType:options.mediaType,profile:options.profile,role:options.role??'primary',activityType:options.activityType??'https://p2lrn.org/type/resource',copyFile:options.copyFile!==false});return{resourceKey:resource.key,activityKey:activity.key,parentKey:parent};});
  }
  addUrl(options:AuthoringUrlOptions):AuthoringResourceActivityResult{
    return this.#edit((draft)=>{const parent=options.parent??'course';const [resource,activity]=creatorAddUrl(draft,options.url,options.key,options.title,{language:options.language??'es',parent,mediaType:options.mediaType??'text/html',profile:options.profile,role:options.role??'primary',activityType:options.activityType??'https://p2lrn.org/type/resource'});return{resourceKey:resource.key,activityKey:activity.key,parentKey:parent};});
  }
  addWebContent(options:AuthoringWebContentOptions):AuthoringResourceActivityResult{
    return this.#edit((draft)=>{const parent=options.parent??'course';const [resource,activity]=creatorAddWebContent(this.root,draft,options.sourceDirectory,options.entrypoint??'index.html',options.key,options.title,{language:options.language??'es',parent,copyDirectory:options.copyDirectory!==false});return{resourceKey:resource.key,activityKey:activity.key,parentKey:parent};});
  }
  addQuestionnaire(options:AuthoringQuestionnaireOptions):AuthoringResourceActivityResult{
    return this.#edit((draft)=>{const parent=options.parent??'course';const [resource,activity]=creatorAddQuestionnaire(this.root,draft,options.source,options.key,options.title,{language:options.language??'es',parent,copyFile:options.copyFile!==false,renderer:options.renderer,rendererVersion:options.rendererVersion});return{resourceKey:resource.key,activityKey:activity.key,parentKey:parent};});
  }
  addComponent(options:AuthoringComponentOptions):AuthoringResourceActivityResult{
    return this.#edit((draft)=>{const parent=options.parent??'course';const [resource,activity]=creatorAddComponent(this.root,draft,options.source,options.key,options.title,{language:options.language??'es',parent,copyFile:options.copyFile!==false});return{resourceKey:resource.key,activityKey:activity.key,parentKey:parent};});
  }
  addComposite(options:AuthoringCompositeOptions):AuthoringResourceActivityResult{
    return this.#edit((draft)=>{const parent=options.parent??'course';const [resource,activity]=creatorAddComposite(this.root,draft,options.key,options.title,{language:options.language??'es',parent,mode:options.mode??'sequence',completion:options.completion??'all',navigation:options.navigation,children:options.children,moveChildren:options.moveChildren!==false});return{resourceKey:resource.key,activityKey:activity.key,parentKey:parent};});
  }

  /** Read and structurally extract a source document without mutating the authoring project.
   * Relative paths are resolved from the workspace root; absolute paths are accepted unchanged.
   */
  async reader(source:string,options:DocumentReaderOptions={}):Promise<ExtractedDocument>{
    if(typeof source!=='string'||!source.trim())throw new ProjectError('document reader source path must not be empty');
    const sourcePath=resolve(this.root,source);
    let data:Uint8Array;
    try{
      data=new Uint8Array(await readFile(sourcePath));
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      throw new ProjectError(`unable to read document source: ${sourcePath}: ${message}`);
    }
    return readDocument({name:basename(sourcePath),data},options);
  }

  save():void{saveProject(this.projectFile,this.#project);}
  build(output:string,options:AuthoringBuildOptions={}):BuildResult{return buildProject(this.root,output,options.strictProfiles??false);}
}

export function createAuthoringWorkspace(root:string,options:AuthoringCreateOptions):P2LRNAuthoringWorkspace{return P2LRNAuthoringWorkspace.create(root,options);}
export function openAuthoringWorkspace(packagePath:string,root:string,options:OpenPackageProjectOptions={}):P2LRNAuthoringWorkspace{return P2LRNAuthoringWorkspace.open(packagePath,root,options);}
export function loadAuthoringWorkspace(root:string):P2LRNAuthoringWorkspace{return P2LRNAuthoringWorkspace.load(root);}
