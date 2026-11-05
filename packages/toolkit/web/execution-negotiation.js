/**
 * P2LRN runtime execution negotiation v1. A Reading-System contract, NOT a
 * second package manifest and NOT a claim of complete SCORM/QTI/H5P support.
 *
 * Pure planning boundary: this module never imports/executes course JavaScript,
 * never downloads remote assets, and never invokes renderer load().
 * Actual renderer.load()/profile inspection re-check the security boundary.
 */
export const P2LRN_EXECUTION_PLAN_SCHEMA='https://p2lrn.org/schema/execution-plan/1';
export const P2LRN_EXECUTION_PLAN_VERSION='1';

const profileInfo=Object.freeze({
  'https://p2lrn.org/profile/h5p':{
    kind:'h5p',conformance:'runtime-validated',
    limitations:['H5P_LIBRARY_CLOSURE_CHECKED_AT_LAUNCH','H5P_EXECUTES_IN_ISOLATED_RUNTIME'],
  },
  'https://p2lrn.org/profile/scorm':{
    kind:'scorm',conformance:'bounded',
    limitations:['SCORM_SEQUENCING_NOT_FULLY_CERTIFIED','SCORM_SCO_SANDBOX_REQUIRED'],
  },
  'https://p2lrn.org/profile/qti':{
    kind:'qti',conformance:'subset',
    limitations:['QTI3_FULL_RESPONSE_PROCESSING_NOT_SUPPORTED'],
  },
  'https://p2lrn.org/profile/cmi5':{
    kind:'cmi5',conformance:'preview',
    limitations:['CMI5_PRODUCTION_LAUNCH_AND_LRS_REQUIRE_TRUSTED_HOST'],
  },
  'https://p2lrn.org/profile/common-cartridge':{
    kind:'common-cartridge',conformance:'preserved-projected',
    limitations:['COMMON_CARTRIDGE_SPECIALIZED_SEMANTICS_NOT_FULLY_EXECUTABLE'],
  },
  'https://p2lrn.org/profile/ims-content-package':{
    kind:'ims-content-package',conformance:'preserved-projected',
    limitations:['IMS_SPECIALIZED_ACTIVITIES_MAY_REQUIRE_EXTERNAL_RUNTIME'],
  },
});
const normal=(value)=>typeof value==='string'?value.trim():'';
const isRemote=(rep)=>rep?.location?.type==='remote';
function information(rep){
  return profileInfo[normal(rep?.profile)]??{
    kind:'native-or-passive',conformance:'renderer-defined',limitations:[],
  };
}
function failure(code,message,{rendererId=null,representationId=null}={}){
  return Object.freeze({
    code,message:String(message??code).slice(0,600),rendererId,representationId,
  });
}
function report({status,candidate=null,diagnostics=[],offline=false,requiredCapabilities=[]}){
  const info=information(candidate?.representation);
  const publicReport=Object.freeze({
    schema:P2LRN_EXECUTION_PLAN_SCHEMA,version:P2LRN_EXECUTION_PLAN_VERSION,
    status,offline:Boolean(offline),
    rendererId:candidate?.descriptor.id??null,
    rendererVersion:candidate?.descriptor.version??null,
    representationId:candidate?.representation?.id??null,
    profile:candidate?.representation?.profile??null,
    kind:candidate?info.kind:null,
    conformance:candidate?info.conformance:null,
    limitations:Object.freeze(candidate?[...info.limitations]:[]),
    dependencies:Object.freeze((candidate?.descriptor.dependencies??[]).map((entry)=>
      typeof entry==='string'?{id:entry,required:true}:{id:entry.id,required:entry.optional!==true,version:entry.version??null})),
    permissions:Object.freeze([...(candidate?.descriptor.permissions??[])]),
    requiredCapabilities:Object.freeze([...(requiredCapabilities??[])]),
    diagnostics:Object.freeze([...diagnostics]),
  });
  return Object.freeze({candidate,report:publicReport});
}
/** A stable diagnostic rather than silently dropping unsupported activities. */
export async function negotiateP2LRNExecution({
  registry,representations=[],entity=null,resource=null,requestedRenderer=null,
  roleRank=()=>0,excludeRendererIds=[],context={},offline=false,
  requiredCapabilities=[],isCapabilityAvailable=null,
}={}){
  if(!registry||typeof registry.select!=='function')
    throw new TypeError('A trusted P2LRN RendererRegistry is required.');
  if(!Array.isArray(representations)||representations.length>128)
    throw new TypeError('Invalid or excessive execution representations.');
  const diagnostics=[];
  // The host controls the offline switch; a package cannot assert its own
  // offline readiness or authorize network resources.
  const allowed=offline?representations.filter(r=>!isRemote(r)):representations;
  if(offline&&allowed.length!==representations.length)
    diagnostics.push(failure('P2LRN_OFFLINE_REMOTE_UNAVAILABLE',
      'Remote resources are not guaranteed offline without a verified local copy.'));
  const requested=normal(requestedRenderer);
  const excluded=new Set((excludeRendererIds??[]).map(String));
  const strictRequested=Boolean(requested);
  const caps=Array.isArray(requiredCapabilities)?requiredCapabilities:[];
  if(caps.length>128)throw new TypeError('Too many required host capabilities.');
  for(const id of caps){
    const name=normal(id);
    if(!name||name.length>128)throw new TypeError('Invalid required capability id.');
    let available=false;
    if(typeof isCapabilityAvailable==='function'){
      try{available=Boolean(await isCapabilityAvailable(name,context));}catch{available=false;}
    }
    if(!available)diagnostics.push(failure('P2LRN_REQUIRED_CAPABILITY_UNAVAILABLE',
      'Required host capability is not available: '+name));
  }
  if(diagnostics.some(x=>x.code==='P2LRN_REQUIRED_CAPABILITY_UNAVAILABLE'))
    return report({status:'blocked',diagnostics,offline,requiredCapabilities:caps});
  if(allowed.length===0){
    diagnostics.push(failure('P2LRN_NO_COMPATIBLE_REPRESENTATION',
      'No local representation can be rendered by this host.'));
    return report({status:'blocked',diagnostics,offline,requiredCapabilities:caps});
  }

  // Selection uses the EXACT registry priority/hint/version semantics used by
  // Player. Inspecting dependencies never invokes a load()/network fallback.
  const bound=Math.min(registry.list?.().length??128,128)+1;
  for(let tries=0;tries<bound;tries++){
    let candidate=null;
    try{
      candidate=await registry.select({
        representations:allowed,entity,resource,
        requestedRenderer:requested,roleRank,
        excludeRendererIds:[...excluded],
      });
    }catch(error){
      diagnostics.push(failure(error?.code??'P2LRN_RENDERER_SELECTION_FAILED',
        error?.message??'Renderer selection failed.'));
      return report({status:'blocked',diagnostics,offline,requiredCapabilities:caps});
    }
    if(!candidate){
      diagnostics.push(failure('P2LRN_NO_COMPATIBLE_RENDERER',
        'No installed renderer can faithfully deliver the selected representation.'));
      return report({status:'blocked',diagnostics,offline,requiredCapabilities:caps});
    }
    const rendererId=candidate.descriptor.id;
    const representationId=candidate.representation?.id??null;
    const origin={rendererId,representationId};
    let denied=null;
    if(registry.dependencies){
      if(typeof registry.dependencies.inspect==='function'){
        const dependencies=await registry.dependencies.inspect(candidate.descriptor.dependencies,{
          ...context,candidate,
        });
        if(!dependencies.ok)
          denied=failure('P2LRN_DEPENDENCY_UNAVAILABLE',
            'Missing required runtime dependencies: '+dependencies.missing.map(x=>x.id+(x.version?'@'+x.version:'')).join(', '),origin);
        else if(dependencies.pending.some(x=>x.required))
          diagnostics.push(failure('P2LRN_DEPENDENCIES_AWAIT_LAZY_RESOLUTION',
            'Dependencies must still be loaded and verified before execution.',origin));
      }else{
        diagnostics.push(failure('P2LRN_DEPENDENCY_PREFLIGHT_NOT_SUPPORTED',
          'This runtime does not expose side-effect-free dependency inspection.',origin));
      }
    }
    if(!denied){
      for(const permission of candidate.descriptor.permissions){
        let authorized=false;
        try{authorized=Boolean(await registry.permissionPolicy(permission,{...context,candidate}));}catch{}
        if(!authorized){
          denied=failure('P2LRN_PERMISSION_DENIED',
            'Trusted host denied runtime permission: '+permission,origin);
          break;
        }
      }
    }
    if(denied){
      diagnostics.push(denied);
      // Required renderer choices never silently fall back.
      if(strictRequested||candidate.selection?.required===true)
        return report({status:'blocked',diagnostics,offline,requiredCapabilities:caps});
      excluded.add(rendererId);
      continue;
    }
    const info=information(candidate.representation);
    const runtimeValidation=info.conformance!=='renderer-defined'||
      diagnostics.some(x=>x.code==='P2LRN_DEPENDENCIES_AWAIT_LAZY_RESOLUTION');
    return report({
      status:runtimeValidation?'conditional':'ready',
      candidate,diagnostics,offline,requiredCapabilities:caps,
    });
  }
  diagnostics.push(failure('P2LRN_RUNTIME_NEGOTIATION_LIMIT',
    'Renderer negotiation exceeded its bounded attempts.'));
  return report({status:'blocked',diagnostics,offline,requiredCapabilities:caps});
}

/**
 * Host/Studio audit without opening, decrypting or executing package payloads.
 * This is a static availability preflight, not a content-execution certificate.
 */
export async function inspectP2LRNPackageExecution(pkg,{registry,offline=false,
  isCapabilityAvailable=null}={}){
  if(!pkg?.entities || typeof pkg.entities.values!=='function')
    throw new TypeError('An opened, verified P2LRN package is required.');
  const items=[];
  for(const entity of pkg.entities.values()){
    if(entity?.type!=='activity')continue;
    const resource=pkg.entities.get(entity.resource);
    const reps=Array.isArray(resource?.representations)?resource.representations:[];
    const outcome=await negotiateP2LRNExecution({
      registry,representations:reps,entity,resource,offline,
      isCapabilityAvailable,
    });
    items.push(Object.freeze({
      activityId:entity.id,resourceId:resource?.id??null,...outcome.report,
    }));
  }
  return Object.freeze({
    schema:P2LRN_EXECUTION_PLAN_SCHEMA,version:P2LRN_EXECUTION_PLAN_VERSION,
    packageId:pkg.manifest?.packageId??null,
    contentRoot:pkg.manifest?.integrity?.contentRoot??null,
    offline:Boolean(offline),
    activities:Object.freeze(items),
    total:items.length,
    ready:items.filter(x=>x.status==='ready').length,
    conditional:items.filter(x=>x.status==='conditional').length,
    blocked:items.filter(x=>x.status==='blocked').length,
  });
}
