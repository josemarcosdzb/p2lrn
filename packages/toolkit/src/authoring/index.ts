import {existsSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {ProjectError} from '../core/errors.js';
import {FORMAT_VERSION, canonicalIdentifier} from '../core/constants.js';
import {createCaseAlignment, type CaseAlignmentInput} from '../core/case.js';
import {XAPI_PROFILE,createXapiActivityDeclaration,type XapiActivityDeclarationInput} from '../core/xapi.js';
import {buildProject, type BuildResult} from '../creator/builder.js';
import {openPackageAsProject, type OpenPackageProjectOptions} from '../creator/import-project.js';
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
  KEY_RE,
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
export interface AuthoringCourseOptions extends AuthoringTextOptions { revision?:number; incrementRevision?:boolean; }
export interface AuthoringUnitOptions { key:string; title:string; language?:string; role?:string; parent?:string; }
export interface AuthoringFileOptions { source:string; key:string; title:string; language?:string; parent?:string; mediaType?:string; profile?:string; role?:string; activityType?:string; copyFile?:boolean; }
export interface AuthoringUrlOptions { url:string; key:string; title:string; language?:string; parent?:string; mediaType?:string; profile?:string; role?:string; activityType?:string; }
export interface AuthoringWebContentOptions { sourceDirectory:string; entrypoint?:string; key:string; title:string; language?:string; parent?:string; copyDirectory?:boolean; }
export interface AuthoringQuestionnaireOptions { source:string; key:string; title?:string; language?:string; parent?:string; copyFile?:boolean; renderer?:string; rendererVersion?:string; }
export interface AuthoringQuestionnaireDataOptions { data:unknown; key:string; title?:string; language?:string; parent?:string; renderer?:string; rendererVersion?:string; }
export interface AuthoringComponentOptions { source:string; key:string; title?:string; language?:string; parent?:string; copyFile?:boolean; }
export interface AuthoringCompositeOptions { key:string; title:string; children:string[]; language?:string; parent?:string; mode?:'sequence'|'free'; completion?:'all'|'any'; navigation?:'linear'|'open'; moveChildren?:boolean; }
export interface AuthoringMoveOptions { key:string; parent:string; index?:number; }
export interface AuthoringObjectiveOptions { key:string; title:string; language?:string; description?:string; alignments?:Record<string,unknown>[]; }
export interface AuthoringRelationOptions { source:string; predicate:string; target:string; extensions?:Record<string,unknown>; }
export interface AuthoringActivityOptions { activityType?:string; resource?:string|null; resources?:string[]|null; objectives?:string[]|null; }
export interface AuthoringRendererOptions { renderer:string|null; rendererVersion?:string|null; required?:boolean; }
export interface AuthoringDuplicateOptions { key:string; newKey:string; parent?:string; title?:string; language?:string; }
export interface AuthoringRemoveOptions { key:string; cascadeOwnedResource?:boolean; }
export interface AuthoringUnitResult { unitKey:string; parentKey:string; }
export interface AuthoringResourceActivityResult { resourceKey:string; activityKey:string; parentKey:string; }
export interface AuthoringEntityTextResult { key:string; language:string; }
export interface AuthoringChildrenResult { parentKey:string; children:string[]; }
export interface AuthoringMoveResult { key:string; parentKey:string; index:number; }
export interface AuthoringObjectiveResult { objectiveKey:string; }
export interface AuthoringCaseAlignmentResult { objectiveKey:string; alignment:ReturnType<typeof createCaseAlignment>; }
export interface AuthoringRelationResult { source:string; predicate:string; target:string; }
export interface AuthoringActivityResult { activityKey:string; }
export interface AuthoringXapiActivityResult { activityKey:string; declaration:ReturnType<typeof createXapiActivityDeclaration>; }
export interface AuthoringDuplicateResult { sourceKey:string; newKey:string; kind:'unit'|'resource'|'activity'|'objective'; }
export interface AuthoringRemoveResult { removed:string[]; }

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
const RENDERER_HINT_EXTENSION='https://p2lrn.org/ext/renderer-preference/1';
function entityExists(project:CreatorProject,key:string):boolean{try{entityByKey(project,key);return true;}catch{return false;}}
function assertNewKey(project:CreatorProject,key:string):void{if(!KEY_RE.test(key))throw new ProjectError(`invalid key: ${JSON.stringify(key)}`);if(entityExists(project,key))throw new ProjectError(`project key already exists: ${key}`);}
function hierarchyParents(project:CreatorProject):any[]{return[project.course,...project.units,...project.activities];}
function removeChildReferences(project:CreatorProject,key:string):void{for(const parent of hierarchyParents(project)){if(!Array.isArray(parent.children))continue;parent.children=parent.children.filter((child:string)=>child!==key);}}
function uniqueKeys(values:string[]|null|undefined,label:string):string[]|undefined{if(values==null)return undefined;const out=[...new Set(values.map(String))];if(out.length!==values.length)throw new ProjectError(`${label} must not contain duplicate keys`);return out;}

function setLocalizedText(entity:any,options:AuthoringTextOptions,language:string):void{
  if(options.title!==undefined){const value=options.title.trim();if(!value)throw new ProjectError('title must not be empty');entity.title??={};entity.title[language]=value;}
  if(options.description!==undefined){entity.description??={};if(options.description===null||!options.description.trim())delete entity.description[language];else entity.description[language]=options.description.trim();if(Object.keys(entity.description).length===0)delete entity.description;}
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

  setCourseMetadata(options:AuthoringCourseOptions):AuthoringEntityTextResult{
    return this.#edit((draft)=>{const language=normalizedLanguage(options.language,draft);setLocalizedText(draft.course,options,language);draft.course.languages=[...new Set([...(draft.course.languages??[]),language])];if(options.revision!==undefined&&options.incrementRevision)throw new ProjectError('revision and incrementRevision are mutually exclusive');if(options.revision!==undefined){if(!Number.isInteger(options.revision)||options.revision<0)throw new ProjectError('course revision must be a non-negative integer');draft.course.revision=options.revision;}else if(options.incrementRevision)draft.course.revision=(draft.course.revision??0)+1;return{key:draft.course.key,language};});
  }
  setEntityText(key:string,options:AuthoringTextOptions):AuthoringEntityTextResult{
    return this.#edit((draft)=>{const language=normalizedLanguage(options.language,draft),entity=entityByKey(draft,key);setLocalizedText(entity,options,language);return{key,language};});
  }
  setChildren(parentKey:string,children:string[]):AuthoringChildrenResult{
    return this.#edit((draft)=>{const unique=[...new Set(children)];if(unique.length!==children.length)throw new ProjectError('children must not contain duplicate keys');const parent=entityByKey(draft,parentKey);parent.children=[];for(const child of unique)appendChild(draft,parentKey,child);return{parentKey,children:[...unique]};});
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
  addQuestionnaireData(options:AuthoringQuestionnaireDataOptions):AuthoringResourceActivityResult{
    if(!KEY_RE.test(options.key))throw new ProjectError(`invalid key: ${JSON.stringify(options.key)}`);
    const tempDir=join(this.root,'.p2lrn-authoring-tmp');
    const tempFile=join(tempDir,`${options.key}.questionnaire.json`);
    mkdirSync(tempDir,{recursive:true});
    writeFileSync(tempFile,JSON.stringify(options.data,null,2)+'\n');
    try{
      return this.addQuestionnaire({source:tempFile,key:options.key,title:options.title,language:options.language,parent:options.parent,copyFile:true,renderer:options.renderer,rendererVersion:options.rendererVersion});
    }finally{
      rmSync(tempFile,{force:true});
      try{if(readdirSync(tempDir).length===0)rmSync(tempDir,{recursive:true,force:true});}catch{}
    }
  }

  addComponent(options:AuthoringComponentOptions):AuthoringResourceActivityResult{
    return this.#edit((draft)=>{const parent=options.parent??'course';const [resource,activity]=creatorAddComponent(this.root,draft,options.source,options.key,options.title,{language:options.language??'es',parent,copyFile:options.copyFile!==false});return{resourceKey:resource.key,activityKey:activity.key,parentKey:parent};});
  }
  addComposite(options:AuthoringCompositeOptions):AuthoringResourceActivityResult{
    return this.#edit((draft)=>{const parent=options.parent??'course';const [resource,activity]=creatorAddComposite(this.root,draft,options.key,options.title,{language:options.language??'es',parent,mode:options.mode??'sequence',completion:options.completion??'all',navigation:options.navigation,children:options.children,moveChildren:options.moveChildren!==false});return{resourceKey:resource.key,activityKey:activity.key,parentKey:parent};});
  }

  moveEntity(options:AuthoringMoveOptions):AuthoringMoveResult{
    return this.#edit((draft)=>{
      const entity=entityByKey(draft,options.key);
      if(entity===draft.course)throw new ProjectError('course cannot be moved');
      if(draft.resources.includes(entity)||draft.objectives.includes(entity))throw new ProjectError('only units and activities can be placed in the course hierarchy');
      entityByKey(draft,options.parent);
      removeChildReferences(draft,options.key);
      appendChild(draft,options.parent,options.key);
      const parent=entityByKey(draft,options.parent),children=parent.children??[];
      const current=children.indexOf(options.key);
      if(current<0)throw new ProjectError('moved entity was not attached to target parent');
      const requested=options.index??current;
      if(!Number.isInteger(requested)||requested<0)throw new ProjectError('move index must be a non-negative integer');
      children.splice(current,1);
      const index=Math.min(requested,children.length);
      children.splice(index,0,options.key);
      parent.children=children;
      return{key:options.key,parentKey:options.parent,index};
    });
  }

  addObjective(options:AuthoringObjectiveOptions):AuthoringObjectiveResult{
    return this.#edit((draft)=>{
      assertNewKey(draft,options.key);
      const language=normalizedLanguage(options.language,draft);
      const objective:any={key:options.key,title:{[language]:options.title.trim()||options.key}};
      if(options.description?.trim())objective.description={[language]:options.description.trim()};
      if(options.alignments!==undefined)objective.alignments=clone(options.alignments);
      draft.objectives.push(objective);
      return{objectiveKey:options.key};
    });
  }

  setObjective(key:string,options:Omit<AuthoringObjectiveOptions,'key'|'title'> & AuthoringTextOptions):AuthoringObjectiveResult{
    return this.#edit((draft)=>{
      const objective=entityByKey(draft,key);
      if(!draft.objectives.includes(objective))throw new ProjectError(`entity is not an objective: ${key}`);
      const language=normalizedLanguage(options.language,draft);
      setLocalizedText(objective,options,language);
      if(options.alignments!==undefined)objective.alignments=clone(options.alignments);
      return{objectiveKey:key};
    });
  }

  addCaseAlignment(objectiveKey:string,input:CaseAlignmentInput):AuthoringCaseAlignmentResult{
    return this.#edit((draft)=>{
      const objective=entityByKey(draft,objectiveKey);
      if(!draft.objectives.includes(objective))throw new ProjectError(`entity is not an objective: ${objectiveKey}`);
      const alignment=createCaseAlignment(input);
      objective.alignments??=[];
      if(objective.alignments.some((item:any)=>item?.type==='Alignment'&&item?.targetType===alignment.targetType&&item?.targetUrl===alignment.targetUrl)){
        throw new ProjectError(`CASE alignment already exists on objective ${objectiveKey}: ${alignment.targetUrl}`);
      }
      objective.alignments.push(clone(alignment));
      return{objectiveKey,alignment};
    });
  }

  setActivity(key:string,options:AuthoringActivityOptions):AuthoringActivityResult{
    return this.#edit((draft)=>{
      const activity=entityByKey(draft,key);
      if(!draft.activities.includes(activity))throw new ProjectError(`entity is not an activity: ${key}`);
      if(options.activityType!==undefined)activity.activityType=canonicalIdentifier(options.activityType);
      if(options.resource!==undefined){if(options.resource===null)delete activity.resource;else activity.resource=options.resource;}
      if(options.resources!==undefined){const value=uniqueKeys(options.resources,'resources');if(value===undefined||value.length===0)delete activity.resources;else activity.resources=value;}
      if(options.objectives!==undefined){const value=uniqueKeys(options.objectives,'objectives');if(value===undefined||value.length===0)delete activity.objectives;else activity.objectives=value;}
      return{activityKey:key};
    });
  }

  setXapiActivity(activityKey:string,input:XapiActivityDeclarationInput|null):AuthoringXapiActivityResult|AuthoringActivityResult{
    return this.#edit((draft)=>{
      const activity=entityByKey(draft,activityKey);
      if(!draft.activities.includes(activity))throw new ProjectError(`entity is not an activity: ${activityKey}`);
      activity.extensions??={};
      if(input===null){
        delete activity.extensions[XAPI_PROFILE];
        if(Object.keys(activity.extensions).length===0)delete activity.extensions;
        return{activityKey};
      }
      const declaration=createXapiActivityDeclaration(input);
      activity.extensions[XAPI_PROFILE]=clone(declaration);
      return{activityKey,declaration};
    });
  }

  setRendererPreference(activityKey:string,options:AuthoringRendererOptions):AuthoringActivityResult{
    return this.#edit((draft)=>{
      const activity=entityByKey(draft,activityKey);
      if(!draft.activities.includes(activity))throw new ProjectError(`entity is not an activity: ${activityKey}`);
      activity.extensions??={};
      if(options.renderer===null){
        delete activity.extensions[RENDERER_HINT_EXTENSION];
        if(Object.keys(activity.extensions).length===0)delete activity.extensions;
        return{activityKey};
      }
      const renderer=canonicalIdentifier(options.renderer);
      const hint:any={preferred:renderer,required:options.required===true};
      if(options.rendererVersion!=null){
        const version=String(options.rendererVersion).trim();
        if(!version||version.length>64)throw new ProjectError('rendererVersion must be a non-empty value up to 64 characters');
        hint.version=version;
      }
      activity.extensions[RENDERER_HINT_EXTENSION]=hint;
      return{activityKey};
    });
  }

  duplicateEntity(options:AuthoringDuplicateOptions):AuthoringDuplicateResult{
    return this.#edit((draft)=>{
      const source=entityByKey(draft,options.key);
      if(source===draft.course)throw new ProjectError('course cannot be duplicated as a child entity');
      assertNewKey(draft,options.newKey);
      const copy=clone(source);
      delete copy.portableId;
      copy.key=options.newKey;
      const language=normalizedLanguage(options.language,draft);
      if(options.title!==undefined){
        const value=options.title.trim();
        if(!value)throw new ProjectError('duplicate title must not be empty');
        copy.title={...(copy.title??{}),[language]:value};
      }
      let kind:AuthoringDuplicateResult['kind'];
      if(draft.units.includes(source)){
        kind='unit';copy.children=[];
        draft.units.push(copy);
        appendChild(draft,options.parent??'course',copy.key);
      }else if(draft.resources.includes(source)){
        kind='resource';
        copy.representations=(copy.representations??[]).map((rep:any)=>{const next=clone(rep);delete next.portableId;return next;});
        draft.resources.push(copy);
      }else if(draft.activities.includes(source)){
        kind='activity';
        if(Array.isArray(copy.children))copy.children=[];
        draft.activities.push(copy);
        appendChild(draft,options.parent??'course',copy.key);
      }else if(draft.objectives.includes(source)){
        kind='objective';
        draft.objectives.push(copy);
      }else throw new ProjectError(`unsupported entity kind for duplicate: ${options.key}`);
      if(Array.isArray(draft.entityOrder)){
        const index=draft.entityOrder.indexOf(options.key);
        draft.entityOrder.splice(index<0?draft.entityOrder.length:index+1,0,options.newKey);
      }
      return{sourceKey:options.key,newKey:options.newKey,kind};
    });
  }

  removeEntity(options:AuthoringRemoveOptions):AuthoringRemoveResult{
    return this.#edit((draft)=>{
      const entity=entityByKey(draft,options.key);
      if(entity===draft.course)throw new ProjectError('course cannot be removed');
      const refs:string[]=[];
      for(const parent of hierarchyParents(draft))if((parent.children??[]).includes(options.key))refs.push(`child of ${parent.key}`);
      for(const activity of draft.activities){
        if(activity===entity)continue;
        if(activity.resource===options.key||(activity.resources??[]).includes(options.key))refs.push(`resource of ${activity.key}`);
        if((activity.objectives??[]).includes(options.key))refs.push(`objective of ${activity.key}`);
      }
      for(const relation of draft.relations)if(relation.source===options.key||relation.target===options.key)refs.push('relation endpoint');
      if(refs.length&&!(draft.units.includes(entity)||draft.activities.includes(entity)))throw new ProjectError(`entity is still referenced: ${options.key} (${[...new Set(refs)].join(', ')})`);

      const removed=[options.key];
      removeChildReferences(draft,options.key);
      draft.relations=draft.relations.filter((r:any)=>r.source!==options.key&&r.target!==options.key);
      for(const activity of draft.activities){
        if(activity.resource===options.key)delete activity.resource;
        if(Array.isArray(activity.resources)){activity.resources=activity.resources.filter((k:string)=>k!==options.key);if(!activity.resources.length)delete activity.resources;}
        if(Array.isArray(activity.objectives)){activity.objectives=activity.objectives.filter((k:string)=>k!==options.key);if(!activity.objectives.length)delete activity.objectives;}
      }

      if(draft.units.includes(entity)){
        if((entity.children??[]).length)throw new ProjectError(`unit must be empty before removal: ${options.key}`);
        draft.units=draft.units.filter((x:any)=>x!==entity);
      }else if(draft.activities.includes(entity)){
        if((entity.children??[]).length)throw new ProjectError(`activity must be empty before removal: ${options.key}`);
        const ownedResource=entity.resource&&draft.resources.find((r:any)=>r.key===entity.resource);
        draft.activities=draft.activities.filter((x:any)=>x!==entity);
        if(options.cascadeOwnedResource&&ownedResource){
          const used=draft.activities.some((a:any)=>a.resource===ownedResource.key||(a.resources??[]).includes(ownedResource.key));
          if(!used){draft.resources=draft.resources.filter((r:any)=>r!==ownedResource);removed.push(ownedResource.key);}
        }
      }else if(draft.resources.includes(entity)){
        draft.resources=draft.resources.filter((x:any)=>x!==entity);
      }else if(draft.objectives.includes(entity)){
        draft.objectives=draft.objectives.filter((x:any)=>x!==entity);
      }
      if(Array.isArray(draft.entityOrder))draft.entityOrder=draft.entityOrder.filter((k:string)=>!removed.includes(k));
      return{removed};
    });
  }

  addRelation(options:AuthoringRelationOptions):AuthoringRelationResult{
    return this.#edit((draft)=>{
      entityByKey(draft,options.source);entityByKey(draft,options.target);
      const predicate=canonicalIdentifier(options.predicate);
      if(draft.relations.some((r:any)=>r.source===options.source&&canonicalIdentifier(r.predicate)===predicate&&r.target===options.target))throw new ProjectError('relation already exists');
      const relation:any={source:options.source,predicate,target:options.target};
      if(options.extensions)relation.extensions=clone(options.extensions);
      draft.relations.push(relation);
      return{source:options.source,predicate,target:options.target};
    });
  }

  removeRelation(options:Pick<AuthoringRelationOptions,'source'|'predicate'|'target'>):AuthoringRelationResult{
    return this.#edit((draft)=>{
      const predicate=canonicalIdentifier(options.predicate),index=draft.relations.findIndex((r:any)=>r.source===options.source&&canonicalIdentifier(r.predicate)===predicate&&r.target===options.target);
      if(index<0)throw new ProjectError('relation does not exist');
      draft.relations.splice(index,1);
      return{source:options.source,predicate,target:options.target};
    });
  }

  save():void{saveProject(this.projectFile,this.#project);}
  build(output:string,options:AuthoringBuildOptions={}):BuildResult{return buildProject(this.root,output,options.strictProfiles??false);}
}

export function createAuthoringWorkspace(root:string,options:AuthoringCreateOptions):P2LRNAuthoringWorkspace{return P2LRNAuthoringWorkspace.create(root,options);}
export function openAuthoringWorkspace(packagePath:string,root:string,options:OpenPackageProjectOptions={}):P2LRNAuthoringWorkspace{return P2LRNAuthoringWorkspace.open(packagePath,root,options);}
export function loadAuthoringWorkspace(root:string):P2LRNAuthoringWorkspace{return P2LRNAuthoringWorkspace.load(root);}
