export const ACCESSIBILITY_PROFILE='https://p2lrn.org/profile/accessibility' as const;
export const ACCESSIBILITY_PROFILE_VERSION='0.4.0' as const;
export const ACCESSIBILITY_METADATA_VERSION='1' as const;

export interface AccessibilityMetadataInput {
  accessMode?:string[];
  accessModeSufficient?:string[][];
  accessibilityFeature?:string[];
  accessibilityHazard?:string[];
  accessibilityControl?:string[];
  accessibilityAPI?:string[];
  accessibilitySummary?:string;
}
export interface P2LRNAccessibilityMetadata {
  version:typeof ACCESSIBILITY_METADATA_VERSION;
  accessMode?:readonly string[];
  accessModeSufficient?:readonly (readonly string[])[];
  accessibilityFeature?:readonly string[];
  accessibilityHazard?:readonly string[];
  accessibilityControl?:readonly string[];
  accessibilityAPI?:readonly string[];
  accessibilitySummary?:string;
}

function token(value:unknown,label:string):string{
  const text=String(value??'').trim();
  if(!text)throw new TypeError(`${label} must not be empty.`);
  if(text.length>200)throw new TypeError(`${label} exceeds 200 characters.`);
  if(/[\u0000-\u001f\u007f]/.test(text))throw new TypeError(`${label} contains control characters.`);
  return text;
}
function list(value:unknown,label:string):readonly string[]|undefined{
  if(value==null)return undefined;
  if(!Array.isArray(value))throw new TypeError(`${label} must be an array.`);
  const out=[...new Set(value.map((item,index)=>token(item,`${label}[${index}]`)))];
  return out.length?Object.freeze(out):undefined;
}
function sufficient(value:unknown):readonly (readonly string[])[]|undefined{
  if(value==null)return undefined;
  if(!Array.isArray(value))throw new TypeError('accessModeSufficient must be an array of arrays.');
  const groups=value.map((group,index)=>{
    const normalized=list(group,`accessModeSufficient[${index}]`);
    if(!normalized?.length)throw new TypeError(`accessModeSufficient[${index}] must not be empty.`);
    return normalized;
  });
  const unique=[],seen=new Set<string>();
  for(const group of groups){const key=[...group].sort().join('|');if(!seen.has(key)){seen.add(key);unique.push(group);}}
  return unique.length?Object.freeze(unique):undefined;
}
export function createAccessibilityMetadata(input:AccessibilityMetadataInput):P2LRNAccessibilityMetadata{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Accessibility metadata must be an object.');
  const result:P2LRNAccessibilityMetadata={version:ACCESSIBILITY_METADATA_VERSION};
  for(const key of ['accessMode','accessibilityFeature','accessibilityHazard','accessibilityControl','accessibilityAPI'] as const){
    const normalized=list(input[key],key);if(normalized)(result as any)[key]=normalized;
  }
  const modes=sufficient(input.accessModeSufficient);if(modes)result.accessModeSufficient=modes;
  if(input.accessibilitySummary!=null){
    const summary=String(input.accessibilitySummary).trim();
    if(!summary)throw new TypeError('accessibilitySummary must not be empty.');
    if(summary.length>10000)throw new TypeError('accessibilitySummary exceeds 10000 characters.');
    result.accessibilitySummary=summary;
  }
  if(Object.keys(result).length===1)throw new TypeError('At least one accessibility metadata field is required.');
  return Object.freeze(result);
}
export function validateAccessibilityMetadata(value:unknown):P2LRNAccessibilityMetadata{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Accessibility metadata must be an object.');
  const input=value as Record<string,unknown>;
  if(input.version!==ACCESSIBILITY_METADATA_VERSION)throw new TypeError(`Accessibility metadata version must be ${ACCESSIBILITY_METADATA_VERSION}.`);
  return createAccessibilityMetadata({
    accessMode:input.accessMode as string[]|undefined,
    accessModeSufficient:input.accessModeSufficient as string[][]|undefined,
    accessibilityFeature:input.accessibilityFeature as string[]|undefined,
    accessibilityHazard:input.accessibilityHazard as string[]|undefined,
    accessibilityControl:input.accessibilityControl as string[]|undefined,
    accessibilityAPI:input.accessibilityAPI as string[]|undefined,
    accessibilitySummary:input.accessibilitySummary==null?undefined:String(input.accessibilitySummary),
  });
}
