import {PROFILE, canonicalIdentifier} from './constants.js';
import {ValidationError} from './errors.js';
import type {GraphDocument, GraphEntity, Manifest} from './types.js';

export const PROGRESSION_REQUIREMENTS = Object.freeze(['viewed','completed','passed'] as const);
type Requirement = typeof PROGRESSION_REQUIREMENTS[number];

function record(value:unknown,label:string):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(`${label} must be an object`);
  return value as Record<string,unknown>;
}
function extension(entity:GraphEntity):Record<string,unknown>|null{
  for(const [key,value] of Object.entries(entity.extensions??{})){
    if(canonicalIdentifier(key)===PROFILE.progression){
      if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError(`progression extension on ${entity.id} must be an object`);
      return value as Record<string,unknown>;
    }
  }
  return null;
}
function score(value:unknown,label:string):number{
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw new ValidationError(`${label} must be a finite percentage from 0 to 100`);
  return value;
}
function requirement(value:unknown,label:string):Requirement{
  if(typeof value!=='string'||!(PROGRESSION_REQUIREMENTS as readonly string[]).includes(value))throw new ValidationError(`${label} must be viewed, completed or passed`);
  return value as Requirement;
}
function allowedKeys(obj:Record<string,unknown>,allowed:string[],label:string):void{
  for(const key of Object.keys(obj))if(!allowed.includes(key))throw new ValidationError(`unsupported ${label} property: ${key}`);
}
function validateCondition(value:unknown,label:string,ids:Map<string,GraphEntity>):{entity:string;status:Requirement;minScore:number|null}{
  const item=record(value,label);
  allowedKeys(item,['entity','status','minScore'],label);
  if(typeof item.entity!=='string'||!item.entity)throw new ValidationError(`${label}.entity must be a graph entity id`);
  const target=ids.get(item.entity);
  if(!target||!['activity','unit'].includes(target.type))throw new ValidationError(`${label}.entity must resolve to an activity or unit: ${item.entity}`);
  const status=item.status===undefined?'completed':requirement(item.status,`${label}.status`);
  const minScore=item.minScore===undefined?null:score(item.minScore,`${label}.minScore`);
  return{entity:item.entity,status,minScore};
}

export function progressionExtension(entity:GraphEntity):Record<string,unknown>|null{return extension(entity);}

export function validateProgression(graph:GraphDocument,manifest:Manifest):void{
  const declaration=manifest.profiles.find((item)=>canonicalIdentifier(item.id)===PROFILE.progression);
  const ids=new Map(graph.entities.map((entity)=>[entity.id,entity]));
  const dependencies=new Map<string,Set<string>>();
  const addDependency=(from:string,to:string)=>{if(!dependencies.has(from))dependencies.set(from,new Set());dependencies.get(from)!.add(to);};
  let used=false;
  let hasNavigationSemantics=false;

  for(const entity of graph.entities){
    const rule=extension(entity);
    if(!rule)continue;
    used=true;
    if(!['course','unit','activity'].includes(entity.type))throw new ValidationError(`progression extension is only valid on course, unit or activity entities: ${entity.id}`);
    allowedKeys(rule,['required','gateFollowing','completionRequirement','minScore','unlockWhen'],`progression ${entity.id}`);

    if(rule.required!==undefined&&typeof rule.required!=='boolean')throw new ValidationError(`progression.required must be boolean: ${entity.id}`);
    if(rule.gateFollowing!==undefined&&typeof rule.gateFollowing!=='boolean')throw new ValidationError(`progression.gateFollowing must be boolean: ${entity.id}`);
    if(rule.completionRequirement!==undefined)requirement(rule.completionRequirement,`progression.completionRequirement ${entity.id}`);
    if(rule.minScore!==undefined){
      if(entity.type!=='activity')throw new ValidationError(`progression.minScore is only valid on activities: ${entity.id}`);
      score(rule.minScore,`progression.minScore ${entity.id}`);
    }
    if(entity.type==='course'&&rule.gateFollowing===true)throw new ValidationError('progression.gateFollowing is not valid on the root course entity');

    if(rule.unlockWhen!==undefined){
      hasNavigationSemantics=true;
      const unlock=record(rule.unlockWhen,`progression.unlockWhen ${entity.id}`);
      allowedKeys(unlock,['all','any'],`progression.unlockWhen ${entity.id}`);
      const hasAll=unlock.all!==undefined,hasAny=unlock.any!==undefined;
      if(hasAll===hasAny)throw new ValidationError(`progression.unlockWhen must contain exactly one of all or any: ${entity.id}`);
      const list=(hasAll?unlock.all:unlock.any);
      if(!Array.isArray(list)||list.length<1)throw new ValidationError(`progression.unlockWhen conditions must be a non-empty array: ${entity.id}`);
      for(let i=0;i<list.length;i++){
        const condition=validateCondition(list[i],`progression.unlockWhen ${entity.id}[${i}]`,ids);
        addDependency(entity.id,condition.entity);
      }
    }
    if(rule.gateFollowing===true)hasNavigationSemantics=true;
  }

  if(used&&!declaration)throw new ValidationError('progression extensions require the progression profile to be declared in the manifest');
  if(hasNavigationSemantics&&declaration?.requirement==='optional'){
    throw new ValidationError('progression navigation rules (gateFollowing/unlockWhen) require manifest requirement "required" so unaware players cannot silently ignore gating');
  }

  for(const parent of graph.entities){
    const children=parent.children??[];
    for(let i=0;i<children.length;i++){
      const source=ids.get(children[i]);
      if(extension(source as GraphEntity)?.gateFollowing!==true)continue;
      for(let j=i+1;j<children.length;j++)addDependency(children[j],children[i]);
    }
  }

  const state=new Map<string,number>();
  const visit=(id:string,trail:string[])=>{
    const current=state.get(id)??0;
    if(current===1)throw new ValidationError(`progression dependency cycle: ${[...trail,id].join(' -> ')}`);
    if(current===2)return;
    state.set(id,1);
    for(const dependency of dependencies.get(id)??[])visit(dependency,[...trail,id]);
    state.set(id,2);
  };
  for(const id of dependencies.keys())visit(id,[]);
}
