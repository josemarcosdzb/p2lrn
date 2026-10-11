import {P2LRNStudioDocument} from './authoring-document.js';

const encoder=new TextEncoder();
const ZERO_DIGEST='sha256:'+'0'.repeat(64);
const FORMAT_VERSION='0.4.0';
const COURSE_PROFILE='https://p2lrn.org/profile/course';
const GRAPH_SCHEMA='https://p2lrn.org/schema/graph/0.4.0';

function id(){return 'urn:uuid:'+crypto.randomUUID();}
function safeLanguage(value){const text=String(value??'es').trim().toLowerCase();return /^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(text)?text:'es';}
function slug(value){const text=String(value??'curso').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');return text||'curso';}
function fileDescriptor(path,mediaType){return{path,mediaType,size:0,byteDigest:ZERO_DIGEST,contentDigest:ZERO_DIGEST};}
function lessonHtml(title,language){
  const escaped=String(title).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  return `<!doctype html>\n<html lang="${language}">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaped}</title></head>\n<body><h1>${escaped}</h1><p>Empieza a escribir aquí.</p></body>\n</html>\n`;
}

export function createP2LRNStudioDocument({title='Curso nuevo',language='es',description=''}={}){
  const lang=safeLanguage(language),courseId=id(),unitId=id(),resourceId=id(),activityId=id(),representationId=id();
  const path='content/lesson-1.html';
  const payloads=new Map([[path,encoder.encode(lessonHtml('Primera lección',lang))]]);
  const course={id:courseId,type:'course',revision:0,title:{[lang]:String(title||'Curso nuevo')},languages:[lang],children:[unitId]};
  if(String(description||'').trim())course.description={[lang]:String(description).trim()};
  const graph={graphVersion:FORMAT_VERSION,entities:[
    course,
    {id:unitId,type:'unit',role:'module',title:{[lang]:'Unidad 1'},children:[activityId]},
    {id:resourceId,type:'resource',title:{[lang]:'Primera lección'},representations:[{id:representationId,role:'primary',location:{type:'embedded',path},originalName:'lesson-1.html',mediaType:'text/html'}]},
    {id:activityId,type:'activity',activityType:'https://p2lrn.org/type/resource',title:{[lang]:'Primera lección'},resource:resourceId},
  ],relations:[]};
  const manifest={format:'P2LRN',formatVersion:FORMAT_VERSION,packageId:id(),entrypoints:[{id:courseId,type:'course',role:'primary'}],graph:{path:'content/graph.json',schema:GRAPH_SCHEMA,mediaType:'application/json',size:0,byteDigest:ZERO_DIGEST,contentDigest:ZERO_DIGEST},profiles:[{id:COURSE_PROFILE,version:FORMAT_VERSION,requirement:'required'}],files:[fileDescriptor(path,'text/html')],integrity:{algorithm:'sha256',contentRoot:ZERO_DIGEST}};
  const zip={read:async(path)=>{const bytes=payloads.get(String(path));if(!bytes)throw new Error('New Studio payload not found: '+path);return bytes;}};
  const pkg={manifest,graph,entities:new Map(graph.entities.map((entity)=>[entity.id,entity])),zip,payload:(path)=>({read:()=>zip.read(path)})};
  const document=new P2LRNStudioDocument(pkg,{sourceName:slug(title)+'.p2lrn',sourceUrl:null,createdFromScratch:true});
  document.changeCount=1;
  return document;
}
