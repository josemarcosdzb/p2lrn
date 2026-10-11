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

  addUnit(parentId=this.rootId,{title='Nueva unidad',language='es'}={}){
    const parent=this.entity(parentId);
    if(!parent||!['course','unit'].includes(parent.type))throw new Error('Las unidades sólo se pueden añadir dentro de un curso o unidad.');
    const unit={id:'urn:uuid:'+crypto.randomUUID(),type:'unit',role:'module',title:{[language]:String(title||'Nueva unidad')},children:[]};
    this.graph.entities.push(unit);this.entities.set(unit.id,unit);parent.children??=[];parent.children.push(unit.id);this.changeCount+=1;return unit;
  }

  #ensureProfile(id,version='0.4.0',requirement='optional'){
    if(!id)return;
    this.manifest.profiles??=[];
    if(!this.manifest.profiles.some((profile)=>profile.id===id))this.manifest.profiles.push({id,version,requirement});
  }

  addEmbeddedResource(parentId=this.rootId,{title='Recurso',language='es',filename='resource.bin',mediaType='application/octet-stream',bytes=new Uint8Array(),profile=null,activityType='https://p2lrn.org/type/resource',renderer=null}={}){
    const parent=this.entity(parentId);
    if(!parent||!['course','unit'].includes(parent.type))throw new Error('El contenido sólo se puede añadir dentro de un curso o unidad.');
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    const token=crypto.randomUUID(),resourceId='urn:uuid:'+crypto.randomUUID(),activityId='urn:uuid:'+crypto.randomUUID(),representationId='urn:uuid:'+crypto.randomUUID();
    const ext=String(filename||'resource.bin').split('.').pop()?.replace(/[^A-Za-z0-9]/g,'').toLowerCase()||'bin';
    const path='content/resources/'+token+'.'+ext;
    const representation={id:representationId,role:'primary',location:{type:'embedded',path},originalName:String(filename||'resource.bin'),mediaType:String(mediaType||'application/octet-stream')};
    if(profile)representation.profile=String(profile);
    const resource={id:resourceId,type:'resource',title:{[language]:String(title||'Recurso')},representations:[representation]};
    const activity={id:activityId,type:'activity',activityType:String(activityType||'https://p2lrn.org/type/resource'),title:{[language]:String(title||'Recurso')},resource:resourceId};
    if(renderer)activity.extensions={'https://p2lrn.org/ext/renderer-preference/1':{preferred:String(renderer),required:false,version:'1'}};
    this.graph.entities.push(resource,activity);this.entities.set(resource.id,resource);this.entities.set(activity.id,activity);parent.children??=[];parent.children.push(activity.id);
    const zero='sha256:'+'0'.repeat(64);this.manifest.files.push({path,mediaType:representation.mediaType,size:data.byteLength,byteDigest:zero,contentDigest:zero});this.payloadOverrides.set(path,data);
    if(profile)this.#ensureProfile(String(profile));this.changeCount+=1;return activity;
  }

  addRemoteResource(parentId=this.rootId,{title='Enlace',language='es',url,mediaType='text/html',profile=null,activityType='https://p2lrn.org/type/resource',renderer=null}={}){
    const parent=this.entity(parentId);if(!parent||!['course','unit'].includes(parent.type))throw new Error('El contenido sólo se puede añadir dentro de un curso o unidad.');
    const href=new URL(String(url)).href,resourceId='urn:uuid:'+crypto.randomUUID(),activityId='urn:uuid:'+crypto.randomUUID(),representationId='urn:uuid:'+crypto.randomUUID();
    const representation={id:representationId,role:'primary',location:{type:'remote',href},mediaType:String(mediaType||'text/html')};if(profile)representation.profile=String(profile);
    const resource={id:resourceId,type:'resource',title:{[language]:String(title||'Enlace')},representations:[representation]};
    const activity={id:activityId,type:'activity',activityType:String(activityType||'https://p2lrn.org/type/resource'),title:{[language]:String(title||'Enlace')},resource:resourceId};
    if(renderer)activity.extensions={'https://p2lrn.org/ext/renderer-preference/1':{preferred:String(renderer),required:false,version:'1'}};
    this.graph.entities.push(resource,activity);this.entities.set(resource.id,resource);this.entities.set(activity.id,activity);parent.children??=[];parent.children.push(activity.id);if(profile)this.#ensureProfile(String(profile));this.changeCount+=1;return activity;
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
    this.payloadOverrides.set(target.path,encoder.encode(JSON.stringify(payload,null,2)+'\n'));this.changeCount+=1;return payload;
  }

  addQuestionnaire(parentId=this.rootId,{title='Cuestionario',language='es',renderer='https://p2lrn.org/renderer/questionnaire/standard',payload=null}={}){
    const data=payload??{schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title:String(title||'Cuestionario'),language,grading:{mode:'embedded-key'},presentation:{questionMode:'one-at-a-time',shuffleQuestions:false,showFeedback:'after-submit'},questions:[{id:'q1',type:'single-choice',prompt:'Escribe aquí la pregunta',points:1,choices:[{id:'a',text:'Respuesta correcta'},{id:'b',text:'Otra respuesta'}],solution:{choiceIds:['a']}}]};
    return this.addEmbeddedResource(parentId,{title,language,filename:'questionnaire.json',mediaType:'application/vnd.p2lrn.questionnaire+json',bytes:encoder.encode(JSON.stringify(data,null,2)+'\n'),profile:'https://p2lrn.org/profile/native-questionnaire',activityType:'https://p2lrn.org/type/assessment',renderer});
  }

  addGame(parentId=this.rootId,{kind='memory',title='Juego',language='es'}={}){
    const renderers={memory:'https://p2lrn.org/renderer/questionnaire/memory',matching:'https://p2lrn.org/renderer/questionnaire/matching',ordering:'https://p2lrn.org/renderer/questionnaire/ordering',classification:'https://p2lrn.org/renderer/questionnaire/classification','true-false':'https://p2lrn.org/renderer/questionnaire/true-false','word-search':'https://p2lrn.org/renderer/questionnaire/word-search',crossword:'https://p2lrn.org/renderer/questionnaire/crossword',rosco:'https://p2lrn.org/renderer/questionnaire/rosco','3d':'https://p2lrn.org/renderer/questionnaire/3d-order-match',standard:'https://p2lrn.org/renderer/questionnaire/standard'};
    const common={schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title:String(title||'Juego'),language,grading:{mode:'embedded-key'},presentation:{questionMode:'one-at-a-time',shuffleQuestions:false,showFeedback:'after-submit'}};
    let questions;
    if(kind==='ordering'||kind==='3d')questions=[{id:'q1',type:'ordering',prompt:'Ordena los elementos',points:1,items:[{id:'i1',text:'Primero'},{id:'i2',text:'Segundo'},{id:'i3',text:'Tercero'}],solution:{order:['i1','i2','i3']}}];
    else if(kind==='classification')questions=[{id:'q1',type:'classification',prompt:'Clasifica los elementos',points:1,items:[{id:'i1',text:'Elemento A'},{id:'i2',text:'Elemento B'}],categories:[{id:'c1',text:'Grupo 1'},{id:'c2',text:'Grupo 2'}],solution:{assignments:[{item:'i1',category:'c1'},{item:'i2',category:'c2'}]}}];
    else if(kind==='true-false')questions=[{id:'q1',type:'true-false',prompt:'La Tierra gira alrededor del Sol',points:1,choices:[{id:'t1',text:'Verdadero'},{id:'f1',text:'Falso'}],solution:{choiceIds:['t1']}},{id:'q2',type:'true-false',prompt:'El agua hierve a 20 °C al nivel del mar',points:1,choices:[{id:'t2',text:'Verdadero'},{id:'f2',text:'Falso'}],solution:{choiceIds:['f2']}}];
    else if(kind==='matching'||kind==='memory')questions=[{id:'q1',type:'matching',prompt:'Relaciona cada elemento',points:1,left:[{id:'l1',text:'España'},{id:'l2',text:'Francia'},{id:'l3',text:'Italia'}],right:[{id:'r1',text:'Madrid'},{id:'r2',text:'París'},{id:'r3',text:'Roma'}],solution:{pairs:[{left:'l1',right:'r1'},{left:'l2',right:'r2'},{left:'l3',right:'r3'}]}}];
    else questions=[{id:'q1',type:'text',prompt:'Empieza por A',points:1,solution:{acceptedAnswers:['Arbol']}},{id:'q2',type:'text',prompt:'Empieza por B',points:1,solution:{acceptedAnswers:['Barco']}},{id:'q3',type:'text',prompt:'Empieza por C',points:1,solution:{acceptedAnswers:['Casa']}},{id:'q4',type:'text',prompt:'Empieza por D',points:1,solution:{acceptedAnswers:['Dado']}}];
    return this.addQuestionnaire(parentId,{title,language,renderer:renderers[kind]??renderers.standard,payload:{...common,questions}});
  }

  addLesson(parentId=this.rootId,{title='Nueva lección',language='es'}={}){
    const parent=this.entity(parentId);
    if(!parent||!['course','unit'].includes(parent.type))throw new Error('Las lecciones sólo se pueden añadir dentro de un curso o unidad.');
    const token=crypto.randomUUID(),resourceId='urn:uuid:'+crypto.randomUUID(),activityId='urn:uuid:'+crypto.randomUUID(),representationId='urn:uuid:'+crypto.randomUUID();
    const path='content/lesson-'+token+'.html';
    const safe=String(title||'Nueva lección');
    const html='<!doctype html>\n<html lang="'+language+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+safe.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</title></head><body><h1>'+safe.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</h1><p>Empieza a escribir aquí.</p></body></html>\n';
    const resource={id:resourceId,type:'resource',title:{[language]:safe},representations:[{id:representationId,role:'primary',location:{type:'embedded',path},originalName:'lesson.html',mediaType:'text/html'}]};
    const activity={id:activityId,type:'activity',activityType:'https://p2lrn.org/type/resource',title:{[language]:safe},resource:resourceId};
    this.graph.entities.push(resource,activity);this.entities.set(resource.id,resource);this.entities.set(activity.id,activity);parent.children??=[];parent.children.push(activity.id);
    const zero='sha256:'+'0'.repeat(64);this.manifest.files.push({path,mediaType:'text/html',size:0,byteDigest:zero,contentDigest:zero});this.payloadOverrides.set(path,encoder.encode(html));this.changeCount+=1;return activity;
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
