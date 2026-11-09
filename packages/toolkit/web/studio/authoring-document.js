import {getCourseRights,setCourseRights} from '../course-rights.js';
import {questionnaireForLearner} from './questionnaire-grading.js';
import {defaultAssembly,inspectAssemblyGLB} from '../assembly-3d-core.js';
import {createDefaultComponentRegistry, CAPABILITY_ACTION_COMPONENT, COLLABORATION_COMPONENT} from '../component-registry.js';
import {validateNativeComposite} from '../native-composite-core.js';
import {HOST_CAPABILITY_EXTENSION, HOST_CAPABILITY_CONTRACT_VERSION, capabilityRequirements} from '../capability-broker.js';

const decoder=new TextDecoder('utf-8',{fatal:true});
const encoder=new TextEncoder();
const WEB_CONTENT_PROFILE='https://p2lrn.org/profile/web-content';
const COMPONENT_PROFILE='https://p2lrn.org/profile/native-component';
const COMPONENT_MEDIA_TYPE='application/vnd.p2lrn.component+json';
const COMPONENT_ACTIVITY_TYPE='https://p2lrn.org/type/component';
const COMPOSITE_PROFILE='https://p2lrn.org/profile/native-composite';
const COMPOSITE_MEDIA_TYPE='application/vnd.p2lrn.composite+json';
const COMPOSITE_ACTIVITY_TYPE='https://p2lrn.org/type/composite';
const DEFAULT_COMPONENT_REGISTRY=createDefaultComponentRegistry();

function clone(value){return structuredClone(value);}
function localized(entity,language='es'){
  const title=entity?.title??{};
  return title[language]??title.es??title.en??title.und??Object.values(title)[0]??entity?.id??'P2LRN';
}
function baseMedia(value){return String(value??'').split(';',1)[0].trim().toLowerCase();}

export class P2LRNStudioDocument{
  constructor(pkg,{sourceName='curso.p2lrn',sourceUrl=null,createdFromScratch=false}={}){
    if(!pkg?.manifest||!pkg?.graph||!pkg?.entities||!pkg?.zip)throw new TypeError('Studio requires an opened P2LRN package.');
    if(pkg.manifest.format!=='P2LRN')throw new Error('Studio 1 only edits P2LRN packages. Convert legacy P2RLN first.');
    this.package=pkg;
    this.manifest=clone(pkg.manifest);
    this.graph=clone(pkg.graph);
    this.entities=new Map(this.graph.entities.map((entity)=>[entity.id,entity]));
    this.sourceName=String(sourceName||'curso.p2lrn');
    this.sourceUrl=sourceUrl?String(sourceUrl):null;
    this.createdFromScratch=Boolean(createdFromScratch);
    this.payloadOverrides=new Map();
    this.changeCount=0;
  }

  get dirty(){return this.changeCount>0;}
  get rootId(){
    return (this.manifest.entrypoints.find((item)=>item.role==='primary'&&item.type==='course')
      ??this.manifest.entrypoints.find((item)=>item.type==='course')
      ??this.manifest.entrypoints[0])?.id??null;
  }
  entity(id){return this.entities.get(String(id))??null;}
  title(id,language='es'){return localized(this.entity(id),language);}
  children(id){return (this.entity(id)?.children??[]).map((child)=>this.entity(child)).filter(Boolean);}

  componentCatalog(){
    return DEFAULT_COMPONENT_REGISTRY.list().filter((descriptor)=>descriptor.authoring).map((descriptor)=>({
      id:descriptor.id,
      componentVersion:descriptor.componentVersion,
      runtimeContractVersion:descriptor.runtimeContractVersion,
      dataVersion:descriptor.authoringDataVersion??descriptor.targetDataVersion,
      dataSchema:descriptor.dataSchemas?.[descriptor.authoringDataVersion??descriptor.targetDataVersion]??null,
      editorSchema:descriptor.editorSchemas?.[descriptor.authoringDataVersion??descriptor.targetDataVersion]??null,
      authoring:clone(descriptor.authoring),
    }));
  }

  getCourseRights(){return {...(getCourseRights(this.entity(this.rootId))??{})};}

  setCourseRights(changes){
    const course=this.entity(this.rootId);
    if(!course || course.type!=='course')throw new Error('No hay un curso abierto.');
    const previous=JSON.stringify(getCourseRights(course)??{});
    const result=setCourseRights(course,changes);
    if(JSON.stringify(result)!==previous)this.changeCount+=1;
    return {...result};
  }

  setTitle(id,value,language='es'){
    const entity=this.entity(id);
    if(!entity)throw new Error('Unknown Studio entity: '+id);
    const text=String(value??'').trim();
    if(!text)throw new Error('El título no puede estar vacío.');
    entity.title??={};
    entity.title[language]=text;
    this.changeCount+=1;
    return entity;
  }

  setDescription(id,value,language='es'){
    const entity=this.entity(id);
    if(!entity)throw new Error('Unknown Studio entity: '+id);
    const text=String(value??'').trim();
    entity.description??={};
    if(text)entity.description[language]=text;
    else delete entity.description[language];
    if(Object.keys(entity.description).length===0)delete entity.description;
    this.changeCount+=1;
    return entity;
  }

  representationForActivity(activityId){
    const activity=this.entity(activityId);
    if(!activity||activity.type!=='activity'||!activity.resource)return null;
    const resource=this.entity(activity.resource);
    if(!resource||resource.type!=='resource')return null;
    const candidates=(resource.representations??[]).filter((rep)=>['embedded','package-member'].includes(rep.location?.type));
    const representation=candidates.find((rep)=>rep.role==='primary')??candidates[0]??null;
    return representation?{activity,resource,representation}:null;
  }

  editableTextForActivity(activityId){
    const resolved=this.representationForActivity(activityId);
    if(!resolved)return null;
    const rep=resolved.representation;
    const mediaType=baseMedia(rep.mediaType);
    if(!['text/plain','text/html'].includes(mediaType))return null;
    if(rep.profile===WEB_CONTENT_PROFILE)return null;
    if(rep.location?.type!=='embedded'||!rep.location.path)return null;
    return {...resolved,path:rep.location.path,mediaType};
  }

  async readEditableText(activityId){
    const target=this.editableTextForActivity(activityId);
    if(!target)return null;
    if(this.payloadOverrides.has(target.path))return {...target,text:decoder.decode(this.payloadOverrides.get(target.path))};
    const bytes=await this.package.payload(target.path).read();
    return {...target,text:decoder.decode(bytes)};
  }

  setPayloadText(path,value){
    const key=String(path??'');
    if(!key)throw new Error('Editable payload path is required.');
    if(!this.manifest.files.some((file)=>file.path===key))throw new Error('Payload is not declared by the package: '+key);
    this.payloadOverrides.set(key,encoder.encode(String(value??'')));
    this.changeCount+=1;
  }

  parentId(id){
    const key=String(id??'');
    for(const entity of this.entities.values())if((entity.children??[]).includes(key))return entity.id;
    return null;
  }

  isCompositeActivity(id){
    const target=this.structuredJsonForActivity(id);
    return target?.mediaType===COMPOSITE_MEDIA_TYPE && target.representation.profile===COMPOSITE_PROFILE;
  }

  #activityParent(parentId){
    const parent=this.entity(parentId);
    if(parent&&(['course','unit'].includes(parent.type)||this.isCompositeActivity(parent.id)))return parent;
    throw new Error('Las actividades sólo se pueden añadir dentro de un curso, unidad o grupo compuesto.');
  }

  #appendActivity(parent,activityId){
    parent.children??=[];
    if(parent.children.includes(activityId))throw new Error('La actividad ya pertenece a este contenedor.');
    parent.children.push(activityId);
    // A newly created composite is a draft. Once it has a child, its graph
    // identity must match the native composite contract enforced by Player.
    if(this.isCompositeActivity(parent.id))parent.activityType=COMPOSITE_ACTIVITY_TYPE;
  }

  #containsDescendant(ancestorId,id){
    const stack=[String(ancestorId)],visited=new Set();
    while(stack.length){
      const current=stack.pop();
      if(current===String(id))return true;
      if(visited.has(current))continue;
      visited.add(current);
      stack.push(...(this.entity(current)?.children??[]));
    }
    return false;
  }

  movableActivitiesForComposite(compositeId){
    if(!this.isCompositeActivity(compositeId))return [];
    return this.graph.entities.filter((activity)=>{
      if(activity.type!=='activity'||activity.id===compositeId)return false;
      const parent=this.entity(this.parentId(activity.id));
      return ['course','unit'].includes(parent?.type)
        && !this.#containsDescendant(activity.id,compositeId);
    });
  }

  moveActivityToComposite(activityId,compositeId){
    if(!this.isCompositeActivity(compositeId))throw new Error('El destino no es un grupo compuesto.');
    const activity=this.entity(activityId);
    if(!activity||activity.type!=='activity')throw new Error('Sólo se pueden agrupar actividades.');
    if(!this.movableActivitiesForComposite(compositeId).some((item)=>item.id===activity.id)){
      throw new Error('No se puede mover esta actividad al compuesto (contenedor o relación no permitidos).');
    }
    const previous=this.entity(this.parentId(activity.id));
    const originalIndex=previous.children.indexOf(activity.id);
    if(originalIndex<0)throw new Error('No se ha encontrado el contenedor original de la actividad.');
    // Only change the graph after verifying the move; keep the existing
    // resource, asset paths and activity ID unchanged.
    previous.children.splice(originalIndex,1);
    this.#appendActivity(this.entity(compositeId),activity.id);
    this.changeCount+=1;
    return activity;
  }

  addUnit(parentId=this.rootId,{title='Nueva unidad',language='es'}={}){
    const parent=this.entity(parentId);
    if(!parent||!['course','unit'].includes(parent.type))throw new Error('Las unidades sólo se pueden añadir dentro de un curso o unidad.');
    const unit={id:'urn:uuid:'+crypto.randomUUID(),type:'unit',role:'module',title:{[language]:String(title||'Nueva unidad')},children:[]};
    this.graph.entities.push(unit);this.entities.set(unit.id,unit);parent.children??=[];parent.children.push(unit.id);this.changeCount+=1;return unit;
  }

  #ensureProfile(id,version='0.4.0',requirement='optional'){
    if(!id)return;
    this.manifest.profiles??=[];
    const existing=this.manifest.profiles.find((profile)=>profile.id===id);
    if(!existing){this.manifest.profiles.push({id,version,requirement});return;}
    if(requirement==='required')existing.requirement='required';
  }

  addEmbeddedResource(parentId=this.rootId,{title='Recurso',language='es',filename='resource.bin',mediaType='application/octet-stream',bytes=new Uint8Array(),profile=null,activityType='https://p2lrn.org/type/resource',renderer=null}={}){
    const parent=this.#activityParent(parentId);
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    const token=crypto.randomUUID(),resourceId='urn:uuid:'+crypto.randomUUID(),activityId='urn:uuid:'+crypto.randomUUID(),representationId='urn:uuid:'+crypto.randomUUID();
    const ext=String(filename||'resource.bin').split('.').pop()?.replace(/[^A-Za-z0-9]/g,'').toLowerCase()||'bin';
    const path='content/resources/'+token+'.'+ext;
    const representation={id:representationId,role:'primary',location:{type:'embedded',path},originalName:String(filename||'resource.bin'),mediaType:String(mediaType||'application/octet-stream')};
    if(profile)representation.profile=String(profile);
    const resource={id:resourceId,type:'resource',title:{[language]:String(title||'Recurso')},representations:[representation]};
    const activity={id:activityId,type:'activity',activityType:String(activityType||'https://p2lrn.org/type/resource'),title:{[language]:String(title||'Recurso')},resource:resourceId};
    if(renderer)activity.extensions={'https://p2lrn.org/ext/renderer-preference/1':{preferred:String(renderer),required:false,version:'1'}};
    this.graph.entities.push(resource,activity);this.entities.set(resource.id,resource);this.entities.set(activity.id,activity);this.#appendActivity(parent,activity.id);
    const zero='sha256:'+'0'.repeat(64);this.manifest.files.push({path,mediaType:representation.mediaType,size:data.byteLength,byteDigest:zero,contentDigest:zero});this.payloadOverrides.set(path,data);
    if(profile)this.#ensureProfile(String(profile));this.changeCount+=1;return activity;
  }

  addRemoteResource(parentId=this.rootId,{title='Enlace',language='es',url,mediaType='text/html',profile=null,activityType='https://p2lrn.org/type/resource',renderer=null,expectedDigest=null}={}){
    const parent=this.#activityParent(parentId);
    const href=new URL(String(url)).href,resourceId='urn:uuid:'+crypto.randomUUID(),activityId='urn:uuid:'+crypto.randomUUID(),representationId='urn:uuid:'+crypto.randomUUID();
    const location={type:'remote',href};if(expectedDigest!=null){const digest=String(expectedDigest).trim().toLowerCase();if(!/^sha256:[0-9a-f]{64}$/.test(digest))throw new Error('expectedDigest debe ser sha256: seguido de 64 caracteres hexadecimales.');location.expectedDigest=digest;}const representation={id:representationId,role:'primary',location,mediaType:String(mediaType||'text/html')};if(profile)representation.profile=String(profile);
    const resource={id:resourceId,type:'resource',title:{[language]:String(title||'Enlace')},representations:[representation]};
    const activity={id:activityId,type:'activity',activityType:String(activityType||'https://p2lrn.org/type/resource'),title:{[language]:String(title||'Enlace')},resource:resourceId};
    if(renderer)activity.extensions={'https://p2lrn.org/ext/renderer-preference/1':{preferred:String(renderer),required:false,version:'1'}};
    this.graph.entities.push(resource,activity);this.entities.set(resource.id,resource);this.entities.set(activity.id,activity);this.#appendActivity(parent,activity.id);if(profile)this.#ensureProfile(String(profile));this.changeCount+=1;return activity;
  }

  addSharedResource(parentId=this.rootId,{title='Recurso compartido',language='es',href,digest,mediaType='application/octet-stream',profile=null,activityType='https://p2lrn.org/type/resource',renderer=null}={}){
    if(!href)throw new Error('El recurso compartido necesita una URL de origen para conservar la referencia portable.');
    return this.addRemoteResource(parentId,{title,language,url:href,mediaType,profile,activityType,renderer,expectedDigest:digest});
  }

  materializeSharedResource(activityId,{bytes,filename='resource.bin',mediaType=null,role='fallback'}={}){
    const activity=this.entity(activityId);if(!activity||activity.type!=='activity'||!activity.resource)throw new Error('Actividad con recurso no encontrada.');
    const resource=this.entity(activity.resource);if(!resource||resource.type!=='resource')throw new Error('Recurso no encontrado.');
    const primary=resource.representations?.find((rep)=>rep.location?.type==='remote'&&rep.location?.expectedDigest);
    if(!primary)throw new Error('El recurso no tiene una representación remota fijada por digest.');
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes??[]);
    const token=crypto.randomUUID(),representationId='urn:uuid:'+crypto.randomUUID();
    const ext=String(filename||'resource.bin').split('.').pop()?.replace(/[^A-Za-z0-9]/g,'').toLowerCase()||'bin';
    const path='content/resources/'+token+'.'+ext;
    const representation={id:representationId,role:String(role||'fallback'),location:{type:'embedded',path},originalName:String(filename||'resource.bin'),mediaType:String(mediaType||primary.mediaType||'application/octet-stream')};
    if(primary.profile)representation.profile=primary.profile;
    resource.representations.push(representation);
    const zero='sha256:'+'0'.repeat(64);this.manifest.files.push({path,mediaType:representation.mediaType,size:data.byteLength,byteDigest:zero,contentDigest:zero});
    this.payloadOverrides.set(path,data);this.changeCount+=1;return representation;
  }

  questionnaireForActivity(activityId){
    const resolved=this.representationForActivity(activityId);if(!resolved)return null;
    const rep=resolved.representation;if(baseMedia(rep.mediaType)!=='application/vnd.p2lrn.questionnaire+json'||rep.location?.type!=='embedded')return null;
    return {...resolved,path:rep.location.path};
  }

  async readQuestionnaire(activityId){
    const target=this.questionnaireForActivity(activityId);if(!target)return null;
    const bytes=this.payloadOverrides.has(target.path)?this.payloadOverrides.get(target.path):await this.package.payload(target.path).read();
    return {...target,payload:JSON.parse(decoder.decode(bytes))};
  }

  setQuestionnaire(activityId,payload){
    const target=this.questionnaireForActivity(activityId);if(!target)throw new Error('La actividad no es un cuestionario nativo.');
    const learnerPayload=questionnaireForLearner(payload);
    this.payloadOverrides.set(target.path,encoder.encode(JSON.stringify(learnerPayload,null,2)+'\n'));this.changeCount+=1;return learnerPayload;
  }

  hostCapabilitiesForEntity(entityId){
    const entity=this.entity(entityId);
    if(!entity)return [];
    return capabilityRequirements(entity).map((request)=>clone(request));
  }

  setHostCapabilities(entityId,requests=[]){
    const entity=this.entity(entityId);
    if(!entity)throw new Error('La entidad P2LRN no existe.');
    if(!['course','activity','resource'].includes(entity.type))throw new Error('Las capacidades del host sólo se pueden declarar en curso, actividad o recurso.');
    const list=Array.isArray(requests)?clone(requests):null;
    if(!list)throw new TypeError('Las capacidades del host deben ser una lista.');
    entity.extensions??={};
    if(!list.length){
      delete entity.extensions[HOST_CAPABILITY_EXTENSION];
      if(Object.keys(entity.extensions).length===0)delete entity.extensions;
      this.changeCount+=1;
      return [];
    }
    const declaration={version:HOST_CAPABILITY_CONTRACT_VERSION,requests:list};
    const probe={extensions:{[HOST_CAPABILITY_EXTENSION]:declaration}};
    capabilityRequirements(probe);
    entity.extensions[HOST_CAPABILITY_EXTENSION]=declaration;
    this.changeCount+=1;
    return this.hostCapabilitiesForEntity(entityId);
  }

  progressionForActivity(activityId){
    const activity=this.entity(activityId);
    if(!activity||activity.type!=='activity')return null;
    return activity.extensions?.['https://p2lrn.org/profile/progression']??null;
  }

  setActivityProgression(activityId,{mode='none',minScore=80}={}){
    const activity=this.entity(activityId);
    if(!activity||activity.type!=='activity')throw new Error('La progresión sólo se puede configurar en actividades.');
    activity.extensions??={};
    const key='https://p2lrn.org/profile/progression';
    if(mode==='none'){
      delete activity.extensions[key];
      if(Object.keys(activity.extensions).length===0)delete activity.extensions;
      this.changeCount+=1;return null;
    }
    const rule={required:true,gateFollowing:true,completionRequirement:mode==='passed'?'passed':'completed'};
    if(mode==='passed')rule.minScore=Math.max(0,Math.min(100,Number(minScore)||0));
    activity.extensions[key]=rule;
    this.#ensureProfile(key,'0.4.0','required');
    this.changeCount+=1;return rule;
  }

  structuredJsonForActivity(activityId){
    const resolved=this.representationForActivity(activityId);if(!resolved)return null;
    const rep=resolved.representation,mediaType=baseMedia(rep.mediaType);
    if(!['application/vnd.p2lrn.component+json','application/vnd.p2lrn.composite+json'].includes(mediaType)||rep.location?.type!=='embedded')return null;
    return {...resolved,path:rep.location.path,mediaType};
  }

  async readStructuredJson(activityId){
    const target=this.structuredJsonForActivity(activityId);if(!target)return null;
    const bytes=this.payloadOverrides.has(target.path)?this.payloadOverrides.get(target.path):await this.package.payload(target.path).read();
    return {...target,payload:JSON.parse(decoder.decode(bytes))};
  }

  setStructuredJson(activityId,payload){
    const target=this.structuredJsonForActivity(activityId);if(!target)throw new Error('La actividad no es contenido estructurado editable.');
    this.payloadOverrides.set(target.path,encoder.encode(JSON.stringify(payload,null,2)+'\n'));this.changeCount+=1;return payload;
  }

  setStructuredTitle(activityId,value,payload,language='es'){
    const target=this.structuredJsonForActivity(activityId);if(!target)throw new Error('La actividad no es contenido estructurado editable.');
    const text=String(value??'').trim();if(!text)throw new Error('El título no puede estar vacío.');
    target.activity.title??={};target.activity.title[language]=text;
    target.resource.title??={};target.resource.title[language]=text;
    const next=clone(payload??{});next.title=text;
    this.payloadOverrides.set(target.path,encoder.encode(JSON.stringify(next,null,2)+'\n'));this.changeCount+=1;return next;
  }

  addNativeComponent(parentId=this.rootId,{componentId=null,componentVersion=null,title=null,language='es'}={}){
    const catalog=DEFAULT_COMPONENT_REGISTRY.list().filter((descriptor)=>descriptor.authoring);
    const descriptor=(componentId?catalog.find((entry)=>entry.id===String(componentId)&&(componentVersion==null||entry.componentVersion===String(componentVersion))):catalog[0])??null;
    if(!descriptor)throw new Error('El componente seleccionado no está registrado para autoría.');
    const dataVersion=descriptor.authoringDataVersion??descriptor.targetDataVersion;
    const componentTitle=String(title||descriptor.authoring.label||'Componente');
    const schemas={};
    if(descriptor.dataSchemas?.[dataVersion])schemas.data=descriptor.dataSchemas[dataVersion];
    if(descriptor.editorSchemas?.[dataVersion])schemas.editor=descriptor.editorSchemas[dataVersion];
    const payload={schema:'https://p2lrn.org/schema/native-component/0.1',version:'0.1',component:{id:descriptor.id,componentVersion:descriptor.componentVersion,dataVersion,runtimeContractVersion:descriptor.runtimeContractVersion},data:clone(descriptor.authoring.initialData),title:componentTitle,language};
    if(Object.keys(schemas).length)payload.schemas=schemas;
    const activity=this.addEmbeddedResource(parentId,{title:componentTitle,language,filename:'component.json',mediaType:COMPONENT_MEDIA_TYPE,bytes:encoder.encode(JSON.stringify(payload,null,2)+'\n'),profile:COMPONENT_PROFILE,activityType:COMPONENT_ACTIVITY_TYPE});
    if(descriptor.id===CAPABILITY_ACTION_COMPONENT){
      this.setHostCapabilities(activity.id,[{id:payload.data.capability,required:payload.data.required===true,operations:[payload.data.operation],context:['component.input'],description:'Operación solicitada por un componente conectado.'}]);
    }else if(descriptor.id===COLLABORATION_COMPONENT){
      this.setHostCapabilities(activity.id,[{id:'collaboration.room',required:payload.data.required===true,operations:['join','send','listen','snapshot','leave'],context:['component.input'],description:'Sala colaborativa resuelta por el host.',fallback:'individual'}]);
    }
    return activity;
  }

  addCollaborationActivity(parentId=this.rootId,{mode='poll',title=null,language='es'}={}){
    const normalized=['poll','board','peer-review'].includes(mode)?mode:'poll';
    const names={poll:'Votación en directo',board:'Pizarra compartida','peer-review':'Revisión entre pares'};
    const activity=this.addNativeComponent(parentId,{componentId:COLLABORATION_COMPONENT,title:title||names[normalized],language});
    const target=this.structuredJsonForActivity(activity.id);
    if(!target)return activity;
    const base={mode:normalized,room:'main',heading:title||names[normalized],fallbackText:'La colaboración no está disponible. Puedes continuar de forma individual.',required:false};
    if(normalized==='poll')Object.assign(base,{prompt:'Elige una opción',options:[{id:'a',label:'Opción A'},{id:'b',label:'Opción B'}],allowChange:true,showResults:true});
    if(normalized==='board')base.prompt='Comparte una idea con el grupo.';
    if(normalized==='peer-review')base.prompt='Comparte tu aportación y comenta la de otros participantes.';
    const payload=JSON.parse(decoder.decode(this.payloadOverrides.get(target.path)));
    payload.data=base;payload.title=title||names[normalized];
    this.setStructuredJson(activity.id,payload);
    this.setHostCapabilities(activity.id,[{id:'collaboration.room',required:false,operations:['join','send','listen','snapshot','leave'],context:['component.input'],description:'Sala colaborativa resuelta por el host.',fallback:'individual'}]);
    return activity;
  }

  addNativeComposite(parentId=this.rootId,{title='Grupo de actividades',language='es',mode='free',completion='all'}={}){
    return this.addComposite(parentId,{title,language,mode,completion});
  }

  addComposite(parentId=this.rootId,{title='Compuesto',language='es',mode='sequence',completion='all',presentation=null}={}){
    const name=String(title||'Compuesto');
    const normalizedMode=mode==='free'?'free':'sequence';
    const normalizedCompletion=completion==='any'?'any':'all';
    const payload={
      schema:'https://p2lrn.org/schema/native-composite/0.1',
      version:'0.1',
      mode:normalizedMode,
      completion:normalizedCompletion,
      navigation:normalizedMode==='free'?'open':'linear',
      title:name,
    };
    if(presentation==='stack'){
      if(normalizedMode!=='free')throw new Error('Las actividades en la misma p?gina deben permitir navegaci?n libre.');
      payload.presentation='stack';
    }
    // An empty group is an editable draft. #appendActivity makes it a native
    // composite once at least one activity has been added to its children.
    return this.addEmbeddedResource(parentId,{
      title:name,language,
      filename:'composite.json',
      mediaType:COMPOSITE_MEDIA_TYPE,
      bytes:encoder.encode(JSON.stringify(payload,null,2)+'\n'),
      profile:COMPOSITE_PROFILE,
    });
  }

  pageInsertionParent(activityId){
    let selected=this.entity(activityId);
    if(!selected)return this.rootId;
    if(['course','unit'].includes(selected.type))return selected.id;
    let parent=this.parentId(selected.id);
    while(parent&&this.isCompositeActivity(parent))parent=this.parentId(parent);
    const result=this.entity(parent);
    if(!result||!['course','unit'].includes(result.type))throw new Error('No se encuentra la unidad del contenido.');
    return result.id;
  }

  async samePageInsertionParent(activityId){
    const current=this.entity(activityId);
    if(!current||current.type!=='activity')throw new Error('Selecciona primero una lecci?n o actividad para a?adir contenido en la misma p?gina.');
    const currentParent=this.parentId(current.id);
    if(this.isCompositeActivity(currentParent)){
      const existing=await this.readStructuredJson(currentParent);
      if(existing?.payload?.presentation==='stack')return currentParent;
    }
    const parent=this.pageInsertionParent(current.id);
    const original=this.entity(parent)?.children?.indexOf(currentParent===parent?current.id:currentParent)??-1;
    const group=this.addComposite(parent,{title:this.title(current.id),language:'es',mode:'free',completion:'all',presentation:'stack'});
    if(original>=0)this.reorderChild(parent,group.id,original);
    this.moveActivity(currentParent===parent?current.id:currentParent,group.id,0);
    return group.id;
  }

  moveActivity(activityId,newParentId,index=null){
    const activity=this.entity(activityId);if(!activity||activity.type!=='activity')throw new Error('Sólo se pueden mover actividades.');
    const parent=this.#activityParent(newParentId);if(parent.id===activity.id)throw new Error('Una actividad no puede contenerse a sí misma.');
    if(this.#containsDescendant(activity.id,parent.id))throw new Error('El movimiento crearía un ciclo en la estructura.');
    const previousId=this.parentId(activity.id),previous=this.entity(previousId);
    if(!previous||!Array.isArray(previous.children))throw new Error('No se ha encontrado el contenedor original de la actividad.');
    if(previous.id===parent.id){
      if(index==null)return activity;
      return this.reorderChild(parent.id,activity.id,index);
    }
    previous.children=previous.children.filter((id)=>id!==activity.id);
    parent.children??=[];
    const target=index==null?parent.children.length:Math.max(0,Math.min(Number(index)||0,parent.children.length));
    parent.children.splice(target,0,activity.id);
    if(this.isCompositeActivity(parent.id))parent.activityType=COMPOSITE_ACTIVITY_TYPE;
    if(this.isCompositeActivity(previous.id)&&(previous.children?.length??0)===0)previous.activityType='https://p2lrn.org/type/resource';
    this.changeCount+=1;return activity;
  }

  async setCompositePolicy(activityId,{mode='free',completion='all'}={}){
    if(!this.isCompositeActivity(activityId))throw new Error('La actividad no es un grupo de actividades.');
    const target=await this.readStructuredJson(activityId);
    const next=clone(target.payload);
    next.mode=mode==='sequence'?'sequence':'free';
    next.completion=completion==='any'?'any':'all';
    next.navigation=next.mode==='sequence'?'linear':'open';
    validateNativeComposite(next);
    this.setStructuredJson(activityId,next);
    return next;
  }

  reorderChild(parentId,childId,toIndex){
    const parent=this.entity(parentId);if(!parent||!Array.isArray(parent.children))throw new Error('El contenedor no tiene elementos reordenables.');
    const from=parent.children.indexOf(String(childId));if(from<0)throw new Error('La actividad no pertenece a este contenedor.');
    const target=Math.max(0,Math.min(Number(toIndex)||0,parent.children.length-1));if(from===target)return this.entity(childId);
    const [id]=parent.children.splice(from,1);parent.children.splice(target,0,id);this.changeCount+=1;return this.entity(id);
  }

  removeActivityFromComposite(compositeId,activityId){
    const composite=this.entity(compositeId);if(!composite||!this.isCompositeActivity(composite.id))throw new Error('El destino no es un grupo de actividades.');
    if(!(composite.children??[]).includes(String(activityId)))throw new Error('La actividad no pertenece a este grupo.');
    const outerId=this.parentId(composite.id),outer=this.entity(outerId);if(!outer)throw new Error('El grupo no tiene un contenedor exterior válido.');
    composite.children=composite.children.filter((id)=>id!==String(activityId));
    outer.children??=[];outer.children=outer.children.filter((id)=>id!==String(activityId));
    const at=outer.children.indexOf(composite.id);outer.children.splice(at<0?outer.children.length:at+1,0,String(activityId));
    if(composite.children.length===0)composite.activityType='https://p2lrn.org/type/resource';
    this.changeCount+=1;return this.entity(activityId);
  }

  removeActivity(activityId){
    const root=this.entity(activityId);if(!root||root.type!=='activity')throw new Error('Sólo se pueden eliminar actividades.');
    const activities=[],stack=[root.id],seen=new Set();
    while(stack.length){const id=stack.pop();if(seen.has(id))continue;seen.add(id);const entity=this.entity(id);if(!entity||entity.type!=='activity')continue;activities.push(entity);for(const child of entity.children??[])stack.push(child);}
    const activityIds=new Set(activities.map((entry)=>entry.id));
    for(const entity of this.entities.values())if(Array.isArray(entity.children))entity.children=entity.children.filter((id)=>!activityIds.has(id));
    const resourceIds=new Set(activities.map((entry)=>entry.resource).filter(Boolean));
    for(const activity of activities){this.entities.delete(activity.id);this.graph.entities=this.graph.entities.filter((entity)=>entity.id!==activity.id);}
    for(const resourceId of resourceIds){
      const stillUsed=this.graph.entities.some((entity)=>entity.type==='activity'&&entity.resource===resourceId);if(stillUsed)continue;
      const resource=this.entity(resourceId);
      for(const rep of resource?.representations??[]){const filePath=rep.location?.type==='embedded'?rep.location.path:null;if(filePath){this.manifest.files=this.manifest.files.filter((file)=>file.path!==filePath);this.payloadOverrides.delete(filePath);}}
      this.entities.delete(resourceId);this.graph.entities=this.graph.entities.filter((entity)=>entity.id!==resourceId);
    }
    this.changeCount+=1;return true;
  }

  async validateForExport(){
    for(const entity of this.entities.values()){
      if(entity.type!=='activity')continue;
      const target=this.structuredJsonForActivity(entity.id);if(!target)continue;
      const {payload}=await this.readStructuredJson(entity.id);
      if(target.mediaType===COMPONENT_MEDIA_TYPE){await DEFAULT_COMPONENT_REGISTRY.prepare(payload,{activityId:entity.id});continue;}
      if(target.mediaType===COMPOSITE_MEDIA_TYPE){
        validateNativeComposite(payload);
        const children=entity.children??[];
        if(!children.length)throw new Error('El grupo de actividades "'+this.title(entity.id)+'" está vacío. Añade al menos una actividad antes de exportar.');
        const unique=new Set();
        for(const childId of children){
          if(unique.has(childId))throw new Error('El grupo de actividades contiene una actividad duplicada.');
          unique.add(childId);
          const child=this.entity(childId);if(!child||child.type!=='activity')throw new Error('El grupo de actividades contiene un elemento que no es una actividad.');
        }
      }
    }
    return true;
  }

  addQuestionnaire(parentId=this.rootId,{title='Cuestionario',language='es',renderer='https://p2lrn.org/renderer/questionnaire/standard',payload=null}={}){
    const data=questionnaireForLearner(payload??{schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title:String(title||'Cuestionario'),language,grading:{mode:'embedded-key'},presentation:{questionMode:'one-at-a-time',shuffleQuestions:false,showFeedback:'never'},questions:[{id:'q1',type:'single-choice',prompt:'Escribe aquí la pregunta',points:1,choices:[{id:'a',text:'Respuesta correcta'},{id:'b',text:'Otra respuesta'}],solution:{choiceIds:['a']}}]});
    return this.addEmbeddedResource(parentId,{title,language,filename:'questionnaire.json',mediaType:'application/vnd.p2lrn.questionnaire+json',bytes:encoder.encode(JSON.stringify(data,null,2)+'\n'),profile:'https://p2lrn.org/profile/native-questionnaire',activityType:'https://p2lrn.org/type/assessment',renderer});
  }

  async readAssemblyAsset(path){
    const entry=this.manifest.files.find(file=>file.path===String(path)&&file.mediaType==='model/gltf-binary');
    if(!entry)throw new Error('Modelo GLB no incluido en este curso');
    const bytes=this.payloadOverrides.has(path)?this.payloadOverrides.get(path):await this.package?.zip.read(path);
    if(!bytes)throw new Error('El modelo GLB no está disponible');
    const result=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    inspectAssemblyGLB(result);
    return result;
  }

  async addAssemblyAsset({bytes,filename='modelo.glb'}={}){
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes??[]);
    const inspected=inspectAssemblyGLB(data);
    const digest='sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');
    for(const existing of this.manifest.files.filter(entry=>entry.path.endsWith('.glb'))){
      const current=existing.byteDigest!=='sha256:'+'0'.repeat(64)?existing.byteDigest:null;
      let actual=current;
      if(!actual&&this.payloadOverrides.has(existing.path)){
        const previous=this.payloadOverrides.get(existing.path);
        actual='sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',previous)),n=>n.toString(16).padStart(2,'0')).join('');
      }
      if(actual!==digest)continue;
      const resource=this.graph.entities.find(entity=>entity.type==='resource'&&entity.representations?.some(rep=>rep.location?.path===existing.path));
      if(resource)return{id:resource.id,path:existing.path,size:data.byteLength,name:String(filename),digest,inspected};
    }
    const id='urn:uuid:'+crypto.randomUUID(),token=crypto.randomUUID(),path='content/resources/'+token+'.glb';
    const resource={id,type:'resource',title:{es:String(filename)},representations:[{id:'urn:uuid:'+crypto.randomUUID(),role:'primary',location:{type:'embedded',path},originalName:String(filename),mediaType:'model/gltf-binary'}]};
    this.graph.entities.push(resource);this.entities.set(id,resource);
    const zero='sha256:'+'0'.repeat(64);
    this.manifest.files.push({path,mediaType:'model/gltf-binary',size:data.byteLength,byteDigest:zero,contentDigest:zero});
    this.payloadOverrides.set(path,data);
    this.changeCount+=1;
    return{id,path,size:data.byteLength,name:String(filename),digest,inspected};
  }

  addGame(parentId=this.rootId,{kind='memory',title='Juego',language='es'}={}){
    const threeDKind={'3d':'ordering','3d-matching':'matching','3d-classification':'classification','assembly-3d':'assembly'}[kind]??null;
    const questionKind=threeDKind??kind;
    const renderers={memory:'https://p2lrn.org/renderer/questionnaire/memory',matching:'https://p2lrn.org/renderer/questionnaire/matching',ordering:'https://p2lrn.org/renderer/questionnaire/ordering',classification:'https://p2lrn.org/renderer/questionnaire/classification','true-false':'https://p2lrn.org/renderer/questionnaire/true-false','fill-blanks':'https://p2lrn.org/renderer/questionnaire/fill-blanks','word-search':'https://p2lrn.org/renderer/questionnaire/word-search',crossword:'https://p2lrn.org/renderer/questionnaire/crossword',rosco:'https://p2lrn.org/renderer/questionnaire/rosco','3d':'https://p2lrn.org/renderer/questionnaire/3d-order-match',standard:'https://p2lrn.org/renderer/questionnaire/standard'};
    const common={schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title:String(title||'Juego'),language,grading:{mode:'embedded-key'},presentation:{questionMode:'one-at-a-time',shuffleQuestions:false,showFeedback:'never'}};
    let questions;
    if(questionKind==='assembly'){
      const scene=defaultAssembly();
      questions=[{id:'q1',type:'classification',prompt:'Coloca las piezas en su posición y orientación',points:scene.pieces.length,items:scene.pieces.map(p=>({id:p.id,text:p.text})),categories:scene.targets.map(t=>({id:t.id,text:t.text})),solution:{assignments:scene.links.map(l=>({item:l.pieceId,category:l.targetId}))},assembly3d:scene}];
    }
    else if(questionKind==='ordering')questions=[{id:'q1',type:'ordering',prompt:'Ordena los elementos',points:1,items:[{id:'i1',text:'Primero'},{id:'i2',text:'Segundo'},{id:'i3',text:'Tercero'}],solution:{order:['i1','i2','i3']}}];
    else if(questionKind==='classification')questions=[{id:'q1',type:'classification',prompt:'Clasifica los elementos',points:1,items:[{id:'i1',text:'Elemento A'},{id:'i2',text:'Elemento B'}],categories:[{id:'c1',text:'Grupo 1'},{id:'c2',text:'Grupo 2'}],solution:{assignments:[{item:'i1',category:'c1'},{item:'i2',category:'c2'}]}}];
    else if(questionKind==='true-false')questions=[{id:'q1',type:'true-false',prompt:'La Tierra gira alrededor del Sol',points:1,choices:[{id:'t1',text:'Verdadero'},{id:'f1',text:'Falso'}],solution:{choiceIds:['t1']}},{id:'q2',type:'true-false',prompt:'El agua hierve a 20 °C al nivel del mar',points:1,choices:[{id:'t2',text:'Verdadero'},{id:'f2',text:'Falso'}],solution:{choiceIds:['f2']}}];
    else if(questionKind==='fill-blanks')questions=[{id:'q1',type:'fill-blanks',prompt:'Completa los huecos',body:'Escribe aquí una frase con {{b1}}.',inputMode:'text',points:1,blanks:[{id:'b1',label:'Hueco 1'}],solution:{answers:{b1:['Respuesta']}}}];
    else if(questionKind==='matching'||questionKind==='memory')questions=[{id:'q1',type:'matching',prompt:'Relaciona cada elemento',points:1,left:[{id:'l1',text:'España'},{id:'l2',text:'Francia'},{id:'l3',text:'Italia'}],right:[{id:'r1',text:'Madrid'},{id:'r2',text:'París'},{id:'r3',text:'Roma'}],solution:{pairs:[{left:'l1',right:'r1'},{left:'l2',right:'r2'},{left:'l3',right:'r3'}]}}];
    else questions=[{id:'q1',type:'text',prompt:'Empieza por A',points:1,solution:{acceptedAnswers:['Arbol']}},{id:'q2',type:'text',prompt:'Empieza por B',points:1,solution:{acceptedAnswers:['Barco']}},{id:'q3',type:'text',prompt:'Empieza por C',points:1,solution:{acceptedAnswers:['Casa']}},{id:'q4',type:'text',prompt:'Empieza por D',points:1,solution:{acceptedAnswers:['Dado']}}];
    return this.addQuestionnaire(parentId,{title,language,renderer:threeDKind?renderers['3d']:(renderers[kind]??renderers.standard),payload:{...common,questions}});
  }

  addLesson(parentId=this.rootId,{title='Nueva lección',language='es'}={}){
    const parent=this.#activityParent(parentId);
    const token=crypto.randomUUID(),resourceId='urn:uuid:'+crypto.randomUUID(),activityId='urn:uuid:'+crypto.randomUUID(),representationId='urn:uuid:'+crypto.randomUUID();
    const path='content/lesson-'+token+'.html';
    const safe=String(title||'Nueva lección');
    const html='<!doctype html>\n<html lang="'+language+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+safe.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</title></head><body><h1>'+safe.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</h1><p>Empieza a escribir aquí.</p></body></html>\n';
    const resource={id:resourceId,type:'resource',title:{[language]:safe},representations:[{id:representationId,role:'primary',location:{type:'embedded',path},originalName:'lesson.html',mediaType:'text/html'}]};
    const activity={id:activityId,type:'activity',activityType:'https://p2lrn.org/type/resource',title:{[language]:safe},resource:resourceId};
    this.graph.entities.push(resource,activity);this.entities.set(resource.id,resource);this.entities.set(activity.id,activity);this.#appendActivity(parent,activity.id);
    const zero='sha256:'+'0'.repeat(64);this.manifest.files.push({path,mediaType:'text/html',size:0,byteDigest:zero,contentDigest:zero});this.payloadOverrides.set(path,encoder.encode(html));this.changeCount+=1;return activity;
  }

  async importPackage(pkg,parentId=this.rootId,{title=null,language='es'}={}){
    const parent=this.entity(parentId);
    if(!parent||!['course','unit'].includes(parent.type))throw new Error('El paquete importado sólo se puede añadir dentro de un curso o unidad.');
    if(!pkg?.manifest||!pkg?.graph||!pkg?.entities||!pkg?.zip)throw new TypeError('El paquete importado no es P2LRN.');
    const sourceRoot=(pkg.manifest.entrypoints?.find((item)=>item.role==='primary'&&item.type==='course')??pkg.manifest.entrypoints?.find((item)=>item.type==='course')??pkg.manifest.entrypoints?.[0])?.id;
    const sourceCourse=sourceRoot?pkg.entities.get(sourceRoot):null;
    if(!sourceCourse)throw new Error('El paquete importado no tiene un curso raíz.');

    const importedEntities=(pkg.graph.entities??[]).filter((entity)=>entity.id!==sourceRoot);
    const wrapperId='urn:uuid:'+crypto.randomUUID();
    const usedIds=new Set();
    for(const entity of this.graph.entities??[]){
      if(entity?.id)usedIds.add(String(entity.id));
      for(const representation of entity?.representations??[])if(representation?.id)usedIds.add(String(representation.id));
    }
    for(const relation of this.graph.relations??[])if(relation?.id)usedIds.add(String(relation.id));
    usedIds.add(wrapperId);
    const idMap=new Map([[String(sourceRoot),wrapperId]]);
    const registerId=(value)=>{
      if(value==null)return;
      const sourceId=String(value);if(!sourceId||idMap.has(sourceId))return;
      const target=usedIds.has(sourceId)?'urn:uuid:'+crypto.randomUUID():sourceId;
      idMap.set(sourceId,target);usedIds.add(target);
    };
    for(const entity of importedEntities){
      registerId(entity.id);
      for(const representation of entity.representations??[])registerId(representation.id);
    }
    for(const relation of pkg.graph.relations??[])registerId(relation?.id);
    const importToken=crypto.randomUUID();
    const currentFiles=new Map((this.manifest.files??[]).map((file)=>[file.path,file]));
    const pathMap=new Map();
    for(const file of pkg.manifest.files??[]){
      const sourcePath=String(file.path);let targetPath=sourcePath;const existing=currentFiles.get(sourcePath);
      if(existing&&existing.byteDigest!==file.byteDigest){const base=sourcePath.split('/').at(-1)||'payload.bin';targetPath='content/imports/'+importToken+'/'+base;}
      pathMap.set(sourcePath,targetPath);
      if(!currentFiles.has(targetPath)){
        const bytes=await pkg.payload(sourcePath).read();
        this.manifest.files.push({...clone(file),path:targetPath});this.payloadOverrides.set(targetPath,new Uint8Array(bytes));currentFiles.set(targetPath,this.manifest.files.at(-1));
      }
    }
    const rewrite=(value,key='')=>{
      if(typeof value==='string'){
        if(idMap.has(value))return idMap.get(value);
        if(pathMap.has(value)&&['path','package'].includes(key))return pathMap.get(value);
        return value;
      }
      if(Array.isArray(value))return value.map((item)=>rewrite(item,key));
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v,k)]));
      return value;
    };
    for(const source of importedEntities){const entity=rewrite(clone(source));entity.id=idMap.get(String(source.id));this.graph.entities.push(entity);this.entities.set(entity.id,entity);}
    for(const relation of pkg.graph.relations??[])this.graph.relations.push(rewrite(clone(relation)));
    for(const profile of pkg.manifest.profiles??[])if(profile.id!=='https://p2lrn.org/profile/course')this.#ensureProfile(profile.id,profile.version??'0.4.0',profile.requirement??'optional');

    const wrapper={id:wrapperId,type:'unit',role:'module',title:{[language]:String(title||localized(sourceCourse,language)||'Paquete importado')},children:(sourceCourse.children??[]).map((id)=>idMap.get(String(id))??String(id))};
    this.graph.entities.push(wrapper);this.entities.set(wrapper.id,wrapper);parent.children??=[];parent.children.push(wrapper.id);this.changeCount+=1;return wrapper;
  }

  exportState(){
    return {
      schema:'https://p2lrn.org/schema/studio-state/1',
      version:'1',
      source:{packageId:this.manifest.packageId,contentRoot:this.manifest.integrity?.contentRoot??null,name:this.sourceName},
      graph:clone(this.graph),
      changedPayloadPaths:[...this.payloadOverrides.keys()].sort(),
      changeCount:this.changeCount,
    };
  }
}
