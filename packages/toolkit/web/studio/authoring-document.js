const decoder=new TextDecoder('utf-8',{fatal:true});
const encoder=new TextEncoder();
const WEB_CONTENT_PROFILE='https://p2lrn.org/profile/web-content';

function clone(value){return structuredClone(value);}
function localized(entity,language='es'){
  const title=entity?.title??{};
  return title[language]??title.es??title.en??title.und??Object.values(title)[0]??entity?.id??'P2LRN';
}
function baseMedia(value){return String(value??'').split(';',1)[0].trim().toLowerCase();}

export class P2LRNStudioDocument{
  constructor(pkg,{sourceName='curso.p2lrn',sourceUrl=null}={}){
    if(!pkg?.manifest||!pkg?.graph||!pkg?.entities||!pkg?.zip)throw new TypeError('Studio requires an opened P2LRN package.');
    if(pkg.manifest.format!=='P2LRN')throw new Error('Studio 1 only edits P2LRN packages. Convert legacy P2RLN first.');
    this.package=pkg;
    this.manifest=clone(pkg.manifest);
    this.graph=clone(pkg.graph);
    this.entities=new Map(this.graph.entities.map((entity)=>[entity.id,entity]));
    this.sourceName=String(sourceName||'curso.p2lrn');
    this.sourceUrl=sourceUrl?String(sourceUrl):null;
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
