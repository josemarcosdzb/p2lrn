import {ValidationError} from './errors.js';
import {SCHEMA_REGISTRY} from './schema-registry.js';
import {CREATOR_PROJECT_SCHEMA_030} from './creator-project-schema.js';

const DEFAULT_SCHEMA_REGISTRY: Readonly<Record<string, any>> = Object.freeze({...SCHEMA_REGISTRY, [CREATOR_PROJECT_SCHEMA_030.$id]: CREATOR_PROJECT_SCHEMA_030});

export interface SchemaIssue {path:string; message:string;}
function typeOk(v:any,t:string):boolean{switch(t){case'null':return v===null;case'object':return !!v&&typeof v==='object'&&!Array.isArray(v);case'array':return Array.isArray(v);case'string':return typeof v==='string';case'number':return typeof v==='number'&&Number.isFinite(v);case'integer':return Number.isSafeInteger(v);case'boolean':return typeof v==='boolean';default:return true;}}
function equal(a:any,b:any):boolean{return JSON.stringify(a)===JSON.stringify(b);}
function pointer(root:any,ref:string):any{if(!ref.startsWith('#/'))throw new Error(`unsupported local JSON pointer: ${ref}`);let x=root;for(const raw of ref.slice(2).split('/')){const k=raw.replace(/~1/g,'/').replace(/~0/g,'~');x=x?.[k];}return x;}
function resolveRef(ref:string,root:any,registry:Record<string,any>):{schema:any;root:any}{if(ref.startsWith('#'))return{schema:ref==='#'?root:pointer(root,ref),root};const hash=ref.indexOf('#');const id=hash<0?ref:ref.slice(0,hash),base=registry[id];if(!base)throw new Error(`JSON Schema reference is not installed: ${id}`);return{schema:hash<0?base:pointer(base,'#'+ref.slice(hash+1)),root:base};}
function validFormat(v:string,fmt:string):boolean{if(fmt==='uri'){try{new URL(v);return true;}catch{return false;}}if(fmt==='date-time'){const d=Date.parse(v);return Number.isFinite(d)&&/[Tt]/.test(v);}return true;}
function issue(path:string,msg:string):SchemaIssue{return{path:path||'$',message:msg};}
function run(schema:any,value:any,path:string,root:any,registry:Record<string,any>,issues:SchemaIssue[],silent=false):boolean{
  const local:SchemaIssue[]=[];const push=(m:string)=>local.push(issue(path,m));
  if(schema===true)return true;if(schema===false){push('schema is false');if(!silent)issues.push(...local);return false;}if(!schema||typeof schema!=='object')return true;
  if(schema.$ref){try{const r=resolveRef(schema.$ref,root,registry);const ok=run(r.schema,value,path,r.root,registry,local);if(!ok&&!silent)issues.push(...local);return ok;}catch(e){push(e instanceof Error?e.message:String(e));if(!silent)issues.push(...local);return false;}}
  let ok=true;
  const fail=(m:string)=>{ok=false;push(m);};
  if(schema.type!==undefined){const types=Array.isArray(schema.type)?schema.type:[schema.type];if(!types.some((t:string)=>typeOk(value,t)))fail(`must be of type ${types.join(' | ')}`);}
  if(schema.const!==undefined&&!equal(value,schema.const))fail(`must equal ${JSON.stringify(schema.const)}`);
  if(Array.isArray(schema.enum)&&!schema.enum.some((x:any)=>equal(x,value)))fail(`must be one of ${schema.enum.map((x:any)=>JSON.stringify(x)).join(', ')}`);
  if(Array.isArray(schema.allOf))for(const x of schema.allOf)if(!run(x,value,path,root,registry,local))ok=false;
  if(Array.isArray(schema.oneOf)){let count=0;for(const x of schema.oneOf)if(run(x,value,path,root,registry,[],true))count++;if(count!==1)fail(`must match exactly one schema (matched ${count})`);}
  if(Array.isArray(schema.anyOf)){let count=0;for(const x of schema.anyOf)if(run(x,value,path,root,registry,[],true))count++;if(count===0)fail('must match at least one schema');}
  if(schema.not!==undefined&&run(schema.not,value,path,root,registry,[],true))fail('must not match prohibited schema');
  if(schema.if!==undefined){const cond=run(schema.if,value,path,root,registry,[],true);if(cond&&schema.then!==undefined&&!run(schema.then,value,path,root,registry,local))ok=false;if(!cond&&schema.else!==undefined&&!run(schema.else,value,path,root,registry,local))ok=false;}
  if(typeof value==='string'){
    if(schema.minLength!==undefined&&[...value].length<schema.minLength)fail(`length must be >= ${schema.minLength}`);if(schema.maxLength!==undefined&&[...value].length>schema.maxLength)fail(`length must be <= ${schema.maxLength}`);if(schema.pattern!==undefined){try{if(!(new RegExp(schema.pattern)).test(value))fail(`must match pattern ${schema.pattern}`);}catch{fail(`invalid schema pattern ${schema.pattern}`);}}if(schema.format&&!validFormat(value,schema.format))fail(`must match format ${schema.format}`);
  }
  if(typeof value==='number'&&Number.isFinite(value)){if(schema.minimum!==undefined&&value<schema.minimum)fail(`must be >= ${schema.minimum}`);if(schema.maximum!==undefined&&value>schema.maximum)fail(`must be <= ${schema.maximum}`);}
  if(Array.isArray(value)){
    if(schema.minItems!==undefined&&value.length<schema.minItems)fail(`must contain at least ${schema.minItems} item(s)`);if(schema.maxItems!==undefined&&value.length>schema.maxItems)fail(`must contain at most ${schema.maxItems} item(s)`);if(schema.uniqueItems){const seen=new Set<string>();for(const x of value){const k=JSON.stringify(x);if(seen.has(k)){fail('must contain unique items');break;}seen.add(k);}}if(schema.items!==undefined)for(let i=0;i<value.length;i++)if(!run(schema.items,value[i],`${path}/${i}`,root,registry,local))ok=false;
  }
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    const keys=Object.keys(value);if(schema.minProperties!==undefined&&keys.length<schema.minProperties)fail(`must have at least ${schema.minProperties} properties`);if(schema.maxProperties!==undefined&&keys.length>schema.maxProperties)fail(`must have at most ${schema.maxProperties} properties`);if(Array.isArray(schema.required))for(const k of schema.required)if(!Object.prototype.hasOwnProperty.call(value,k))fail(`missing required property ${k}`);const props=schema.properties??{};for(const [k,sub] of Object.entries(props))if(Object.prototype.hasOwnProperty.call(value,k)&&!run(sub,value[k],`${path}/${k}`,root,registry,local))ok=false;if(schema.propertyNames!==undefined)for(const k of keys)if(!run(schema.propertyNames,k,`${path}/${k}`,root,registry,local))ok=false;const extras=keys.filter((k)=>!Object.prototype.hasOwnProperty.call(props,k));if(schema.additionalProperties===false&&extras.length){for(const k of extras)fail(`unsupported property ${k}`);}else if(schema.additionalProperties&&typeof schema.additionalProperties==='object')for(const k of extras)if(!run(schema.additionalProperties,value[k],`${path}/${k}`,root,registry,local))ok=false;
  }
  if(!silent)issues.push(...local);return ok;
}
export function schemaIssues(schemaOrId:any,value:any,registry:Record<string,any>={...DEFAULT_SCHEMA_REGISTRY}):SchemaIssue[]{const root=typeof schemaOrId==='string'?registry[schemaOrId]:schemaOrId;if(!root)return[issue('$',`JSON Schema is not installed: ${schemaOrId}`)];const out:SchemaIssue[]=[];run(root,value,'$',root,registry,out);return out;}
export function validateSchema(schemaOrId:any,value:any,label='document'):any{const errors=schemaIssues(schemaOrId,value);if(errors.length)throw new ValidationError(`invalid ${label}:\n${errors.slice(0,20).map((e)=>`${e.path}: ${e.message}`).join('\n')}`);return value;}
export function schemaById(id:string):any{const s=(DEFAULT_SCHEMA_REGISTRY as Record<string,any>)[id];if(!s)throw new ValidationError(`reference document is not installed: ${id}`);return structuredClone(s);}
